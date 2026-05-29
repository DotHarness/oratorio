using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Oratorio.Server.Api;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;
using Oratorio.Server.Services;

namespace Oratorio.Server.Tests;

public sealed class ReviewFindingResolutionTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    [Fact]
    public async Task OperatorResolve_ThenReopen_UpdatesFindingState()
    {
        await using var app = new TestOratorioApp();
        var client = app.CreateClient();
        var (draftId, commentId, _, _) = await SeedPublishedFindingAsync(app, client, "task:resolve-operator");

        var resolved = await PostAsync<ItemDetailResponse>(
            client,
            $"/api/v1/review-drafts/{draftId}/comments/{commentId}/resolve",
            new ResolveReviewFindingOperatorRequest("fixed", "Addressed in follow-up commit."));

        var draftDto = Assert.Single(resolved.ReviewDrafts);
        var commentDto = Assert.Single(draftDto.Comments);
        Assert.Equal(ReviewFindingResolutionState.Resolved, commentDto.ResolutionState);
        Assert.Equal(ReviewFindingResolutionKind.Fixed, commentDto.ResolutionKind);
        Assert.Equal(AuthorKind.Operator, commentDto.ResolvedByKind);
        Assert.Equal("Addressed in follow-up commit.", commentDto.ResolutionNote);
        Assert.NotNull(commentDto.ResolvedAt);
        Assert.Equal(1, draftDto.ResolvedCount);

        var reopened = await PostAsync<ItemDetailResponse>(
            client,
            $"/api/v1/review-drafts/{draftId}/comments/{commentId}/reopen",
            new { });

        var reopenedComment = Assert.Single(Assert.Single(reopened.ReviewDrafts).Comments);
        Assert.Equal(ReviewFindingResolutionState.Open, reopenedComment.ResolutionState);
        Assert.Null(reopenedComment.ResolutionKind);
        Assert.Null(reopenedComment.ResolvedByKind);
        Assert.Null(reopenedComment.ResolvedAt);
        Assert.Equal(0, Assert.Single(reopened.ReviewDrafts).ResolvedCount);
    }

    [Fact]
    public async Task AgentToolResolve_RecordsRunProvenance()
    {
        await using var app = new TestOratorioApp();
        var client = app.CreateClient();
        var (_, commentId, _, runId) = await SeedPublishedFindingAsync(app, client, "task:resolve-tool");

        using var scope = app.Services.CreateScope();
        var resolution = scope.ServiceProvider.GetRequiredService<ReviewFindingResolutionService>();
        var response = await resolution.ResolveForRunAsync(
            runId,
            new ResolveReviewFindingRequest(commentId, "dismissed", "Agreed non-issue."),
            CancellationToken.None);

        Assert.Equal("Resolved", response.ResolutionState);
        Assert.Equal("Dismissed", response.ResolutionKind);

        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var stored = await db.ReviewDraftComments.AsNoTracking().FirstAsync(x => x.DraftCommentId == commentId);
        Assert.Equal(ReviewFindingResolutionState.Resolved, stored.ResolutionState);
        Assert.Equal(ReviewFindingResolutionKind.Dismissed, stored.ResolutionKind);
        Assert.Equal(AuthorKind.Agent, stored.ResolvedByKind);
        Assert.Equal(runId, stored.ResolvedInRunId);
    }

    [Fact]
    public async Task Resolve_UnknownFinding_Returns409NotFound()
    {
        await using var app = new TestOratorioApp();
        var client = app.CreateClient();
        var (draftId, _, _, _) = await SeedPublishedFindingAsync(app, client, "task:resolve-missing");

        var response = await client.PostAsJsonAsync(
            $"/api/v1/review-drafts/{draftId}/comments/does-not-exist/resolve",
            new ResolveReviewFindingOperatorRequest("fixed", null),
            JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("reviewFindingNotFound", await ReadErrorCodeAsync(response));
    }

    [Fact]
    public async Task Resolve_UnpublishedDraftFinding_Returns409NotResolvable()
    {
        await using var app = new TestOratorioApp();
        var client = app.CreateClient();
        var (draftId, commentId) = await SeedDraftFindingAsync(app, client, "task:resolve-unpublished");

        var response = await client.PostAsJsonAsync(
            $"/api/v1/review-drafts/{draftId}/comments/{commentId}/resolve",
            new ResolveReviewFindingOperatorRequest("fixed", null),
            JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("reviewFindingNotResolvable", await ReadErrorCodeAsync(response));
    }

    private static async Task<(string DraftId, string CommentId, string ItemId, string RunId)> SeedPublishedFindingAsync(
        TestOratorioApp app,
        HttpClient client,
        string externalId) =>
        await SeedFindingAsync(app, client, externalId, ReviewDraftStatus.Published);

    private static async Task<(string DraftId, string CommentId)> SeedDraftFindingAsync(
        TestOratorioApp app,
        HttpClient client,
        string externalId)
    {
        var (draftId, commentId, _, _) = await SeedFindingAsync(app, client, externalId, ReviewDraftStatus.Draft);
        return (draftId, commentId);
    }

    private static async Task<(string DraftId, string CommentId, string ItemId, string RunId)> SeedFindingAsync(
        TestOratorioApp app,
        HttpClient client,
        string externalId,
        ReviewDraftStatus draftStatus)
    {
        await CreateItemAsync(client, externalId);
        await PostAsync<ItemDetailResponse>(
            client,
            $"/api/v1/items/local/{externalId}/dispatch",
            new DispatchRequest("mock", "Seed run", MockOutcome.Success, 1));
        await WaitForItemAsync(client, externalId, x => x.Item.State == ItemState.AwaitingReview);

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var item = await db.Items.FirstAsync(x => x.Source == "local" && x.ExternalId == externalId);
        var run = await db.Runs.Where(x => x.ItemId == item.ItemId).OrderByDescending(x => x.Attempt).FirstAsync();
        var now = DateTimeOffset.UtcNow;
        var draft = new OratorioReviewDraft
        {
            ItemId = item.ItemId,
            RoundId = run.RoundId,
            RunId = run.RunId,
            Status = draftStatus,
            SummaryBody = "Reviewed: base...head\nOutcome: 1 actionable finding",
            MajorCount = 0,
            MinorCount = 1,
            SuggestionCount = 0,
            WarningsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
            PublishedAt = draftStatus == ReviewDraftStatus.Published ? now : null
        };
        var comment = new OratorioReviewDraftComment
        {
            DraftId = draft.DraftId,
            Severity = "YELLOW",
            Title = "Preserve the removed workspace sample redirect",
            Body = "Why this matters: ...",
            Path = "docs/.vitepress/config.mts",
            Line = 241,
            Side = "RIGHT",
            CommentOnlyReason = "investigateOnly",
            Status = ReviewDraftCommentStatus.Accepted
        };
        db.ReviewDrafts.Add(draft);
        db.ReviewDraftComments.Add(comment);
        await db.SaveChangesAsync();
        return (draft.DraftId, comment.DraftCommentId, item.ItemId, run.RunId);
    }

    private static async Task CreateItemAsync(HttpClient client, string externalId)
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/items",
            new CreateItemRequest(
                "local",
                externalId,
                ItemKind.PullRequest,
                "Resolution test item",
                "A test item.",
                "example-owner/oratorio",
                "operator",
                "test/oratorio"),
            JsonOptions);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<ItemDetailResponse> WaitForItemAsync(HttpClient client, string externalId, Func<ItemDetailResponse, bool> predicate)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(10);
        while (DateTimeOffset.UtcNow < deadline)
        {
            var detail = await GetAsync<ItemDetailResponse>(client, $"/api/v1/items/local/{externalId}");
            if (predicate(detail))
            {
                return detail;
            }

            await Task.Delay(100);
        }

        throw new TimeoutException($"Timed out waiting for item {externalId}.");
    }

    private static async Task<T> GetAsync<T>(HttpClient client, string path)
    {
        var response = await client.GetAsync(path);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }

    private static async Task<T> PostAsync<T>(HttpClient client, string path, object request)
    {
        var response = await client.PostAsJsonAsync(path, request, JsonOptions);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"POST {path} failed with {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        }

        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }

    private static async Task<string?> ReadErrorCodeAsync(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("error").GetProperty("code").GetString();
    }
}
