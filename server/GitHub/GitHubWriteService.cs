using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Oratorio.Server.Api;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;
using Oratorio.Server.Services;

namespace Oratorio.Server.GitHub;

public sealed class GitHubWriteService(
    OratorioDbContext db,
    IGitHubApiClient client,
    IOptionsMonitor<GitHubOptions> options,
    IGitHubCredentialResolver credentials,
    IClock clock)
{
    private const string CheckRunName = "oratorio/review";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task RecordDecisionWritesAsync(string decisionId, CancellationToken ct)
    {
        var decision = await db.Decisions
            .Include(x => x.Item)
            .Include(x => x.Round)
            .FirstOrDefaultAsync(x => x.DecisionId == decisionId, ct);
        if (decision?.Item is null || decision.Round is null || decision.Item.Source != "github")
        {
            return;
        }

        if (decision.Decision is not (DecisionType.Approve or DecisionType.RequestChanges or DecisionType.Reject))
        {
            return;
        }

        if (!TryResolveGitHubTarget(decision.Item, out var repository, out var number))
        {
            return;
        }

        var writes = CreateWriteLogs(decision, repository, number);
        foreach (var write in writes)
        {
            await TryExecuteAsync(write, ct);
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<string> RetryAsync(string writeId, CancellationToken ct)
    {
        var write = await db.SourceWriteLogs
            .Include(x => x.Item)
            .FirstOrDefaultAsync(x => x.WriteId == writeId, ct)
            ?? throw OratorioApiException.Conflict("sourceWriteNotFound", "The requested source write does not exist.", new Dictionary<string, object?> { ["writeId"] = writeId });
        if (write.Status != SourceWriteStatus.Failed)
        {
            throw OratorioApiException.Conflict("invalidTransition", "Only failed source writes can be retried.", new Dictionary<string, object?> { ["status"] = write.Status });
        }

        write.Status = SourceWriteStatus.Pending;
        write.ErrorCode = null;
        write.ErrorMessage = null;
        write.UpdatedAt = clock.UtcNow;
        AddTimeline(write, TimelineEventKind.SourceWriteQueued, "Retrying GitHub write", null);
        await TryExecuteAsync(write, ct);
        await ReconcileReviewDraftPublishAsync(write, ct);
        await db.SaveChangesAsync(ct);
        return write.ItemId;
    }

    public async Task ExecuteAsync(OratorioSourceWriteLog write, CancellationToken ct) =>
        await TryExecuteAsync(write, ct);

    private IReadOnlyList<OratorioSourceWriteLog> CreateWriteLogs(OratorioDecision decision, GitHubRepositoryRef repository, int number)
    {
        var item = decision.Item!;
        var round = decision.Round!;
        var now = clock.UtcNow;
        var intent = DecisionIntent(decision.Decision);
        var body = DecisionBody(decision);
        var logs = new List<OratorioSourceWriteLog>();

        if (item.Kind == ItemKind.PullRequest)
        {
            var reviewEvent = decision.Decision == DecisionType.Approve ? "APPROVE" : "REQUEST_CHANGES";
            logs.Add(CreateWriteLog(
                item,
                round,
                decision,
                SourceWriteKind.PullRequestReview,
                intent,
                repository,
                number,
                item.HeadSha,
                new Dictionary<string, object?>
                {
                    ["event"] = reviewEvent,
                    ["body"] = body,
                    ["commitId"] = item.HeadSha
                },
                now));

            var conclusion = decision.Decision switch
            {
                DecisionType.Approve => "success",
                DecisionType.RequestChanges => "action_required",
                DecisionType.Reject => "failure",
                _ => "neutral"
            };
            logs.Add(CreateWriteLog(
                item,
                round,
                decision,
                SourceWriteKind.CheckRun,
                intent,
                repository,
                number,
                item.HeadSha,
                new Dictionary<string, object?>
                {
                    ["name"] = CheckRunName,
                    ["conclusion"] = conclusion,
                    ["summary"] = body
                },
                now));
        }
        else if (item.Kind == ItemKind.Issue)
        {
            logs.Add(CreateWriteLog(
                item,
                round,
                decision,
                SourceWriteKind.IssueComment,
                intent,
                repository,
                number,
                null,
                new Dictionary<string, object?> { ["body"] = body },
                now));
        }

        foreach (var log in logs)
        {
            db.SourceWriteLogs.Add(log);
            AddTimeline(log, TimelineEventKind.SourceWriteQueued, "GitHub write queued", null);
        }

        return logs;
    }

    private static OratorioSourceWriteLog CreateWriteLog(
        OratorioItem item,
        OratorioRound round,
        OratorioDecision decision,
        SourceWriteKind kind,
        string intent,
        GitHubRepositoryRef repository,
        int number,
        string? headSha,
        object request,
        DateTimeOffset now) =>
        new()
        {
            ItemId = item.ItemId,
            RoundId = round.RoundId,
            DecisionId = decision.DecisionId,
            Source = "github",
            Kind = kind,
            Intent = intent,
            Status = SourceWriteStatus.Pending,
            Repository = repository.FullName,
            Number = number,
            HeadSha = headSha,
            RequestJson = JsonSerializer.Serialize(request, JsonOptions),
            CreatedAt = now,
            UpdatedAt = now
        };

    private async Task TryExecuteAsync(OratorioSourceWriteLog write, CancellationToken ct)
    {
        var current = options.CurrentValue;
        var status = credentials.Resolve(current);
        if (!current.WritesEnabled)
        {
            MarkFailed(write, "githubWritesDisabled", "GitHub writes are disabled.");
            return;
        }

        if (!status.HasAppAuthentication)
        {
            MarkFailed(write, "githubAppAuthRequired", "GitHub App authentication is required for writes.");
            return;
        }

        if (ImplementationDraftService.IsImplementationDeliveryIntent(write.Intent))
        {
            MarkFailed(write, "unsupportedSourceWriteRetry", "Implementation delivery writes must be retried through implementation delivery.");
            return;
        }

        if (!GitHubRepositoryRef.TryParse(write.Repository ?? "", out var repository) || write.Number is null)
        {
            MarkFailed(write, "invalidGitHubTarget", "The source write target is incomplete.");
            return;
        }

        if (write.Kind == SourceWriteKind.CheckRun && string.IsNullOrWhiteSpace(write.HeadSha))
        {
            MarkFailed(write, "githubHeadShaRequired", "A GitHub check run requires a head SHA.");
            return;
        }

        write.AttemptCount++;
        write.UpdatedAt = clock.UtcNow;
        try
        {
            var response = write.Kind switch
            {
                SourceWriteKind.IssueComment => await client.CreateIssueCommentAsync(repository, write.Number.Value, ReadString(write.RequestJson, "body"), ct),
                SourceWriteKind.PullRequestReview => await CreatePullRequestReviewAsync(repository, write, ct),
                SourceWriteKind.CheckRun => await client.CreateCheckRunAsync(repository, CheckRunName, write.HeadSha!, ReadString(write.RequestJson, "conclusion"), ReadString(write.RequestJson, "summary"), ct),
                SourceWriteKind.ResolveReviewThread => await client.ResolveReviewThreadAsync(repository, ReadString(write.RequestJson, "threadId"), ReadBool(write.RequestJson, "resolved"), ct),
                _ => throw new InvalidOperationException($"Unsupported source write kind: {write.Kind}")
            };

            write.Status = SourceWriteStatus.Succeeded;
            write.ExternalId = response.ExternalId;
            write.ExternalUrl = response.ExternalUrl;
            write.ResponseJson = response.ResponseJson;
            write.ErrorCode = null;
            write.ErrorMessage = null;
            write.CompletedAt = clock.UtcNow;
            write.UpdatedAt = write.CompletedAt.Value;
            AddTimeline(write, TimelineEventKind.SourceWriteSucceeded, "GitHub write succeeded", write.ExternalUrl);
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or JsonException)
        {
            MarkFailed(write, "githubWriteFailed", ex.Message);
        }

        if (write.Status == SourceWriteStatus.Succeeded)
        {
            await TryCaptureReviewThreadMappingAsync(write, repository, ct);
        }
    }

    private async Task TryCaptureReviewThreadMappingAsync(OratorioSourceWriteLog write, GitHubRepositoryRef repository, CancellationToken ct)
    {
        if (write.Intent != "reviewDraftPublish" || write.Kind != SourceWriteKind.PullRequestReview || write.Number is null)
        {
            return;
        }

        try
        {
            var draftId = db.ChangeTracker.Entries<OratorioReviewDraft>()
                .Select(entry => entry.Entity)
                .FirstOrDefault(draft => draft.SourceWriteId == write.WriteId)?.DraftId
                ?? await db.ReviewDrafts.Where(draft => draft.SourceWriteId == write.WriteId).Select(draft => draft.DraftId).FirstOrDefaultAsync(ct);
            if (string.IsNullOrWhiteSpace(draftId))
            {
                return;
            }

            var comments = await db.ReviewDraftComments
                .Where(c => c.DraftId == draftId && c.Status == ReviewDraftCommentStatus.Accepted)
                .ToListAsync(ct);
            if (comments.Count == 0)
            {
                return;
            }

            var threads = await client.ListPullRequestReviewThreadsAsync(repository, write.Number.Value, ct);
            foreach (var thread in threads)
            {
                foreach (var body in thread.CommentBodies)
                {
                    var findingId = ReviewFindingMarker.Extract(body);
                    if (findingId is null)
                    {
                        continue;
                    }

                    var match = comments.FirstOrDefault(c => c.DraftCommentId == findingId);
                    if (match is not null)
                    {
                        match.RemoteThreadId = thread.Id;
                    }
                }
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or JsonException)
        {
            // Mapping is best-effort; without it, resolution stays internal-only per spec §5.7.
        }
    }

    private async Task<GitHubWriteResponse> CreatePullRequestReviewAsync(GitHubRepositoryRef repository, OratorioSourceWriteLog write, CancellationToken ct)
    {
        var comments = ReadReviewComments(write.RequestJson);
        var @event = ReadString(write.RequestJson, "event");
        var body = ReadString(write.RequestJson, "body");
        var commitId = ReadOptionalString(write.RequestJson, "commitId");
        return comments.Count == 0
            ? await client.CreatePullRequestReviewAsync(repository, write.Number!.Value, @event, body, commitId, ct)
            : await client.CreatePullRequestReviewAsync(repository, write.Number!.Value, @event, body, commitId, comments, ct);
    }

    private async Task ReconcileReviewDraftPublishAsync(OratorioSourceWriteLog write, CancellationToken ct)
    {
        if (write.Intent != "reviewDraftPublish")
        {
            return;
        }

        var draft = await db.ReviewDrafts.FirstOrDefaultAsync(x => x.SourceWriteId == write.WriteId, ct);
        if (draft is null)
        {
            return;
        }

        var now = write.CompletedAt ?? clock.UtcNow;
        if (write.Status == SourceWriteStatus.Succeeded)
        {
            draft.Status = ReviewDraftStatus.Published;
            draft.PublishedAt = now;
        }
        else if (write.Status == SourceWriteStatus.Failed)
        {
            draft.Status = ReviewDraftStatus.PublishFailed;
        }

        draft.UpdatedAt = now;
    }

    private void MarkFailed(OratorioSourceWriteLog write, string code, string message)
    {
        write.Status = SourceWriteStatus.Failed;
        write.ErrorCode = code;
        write.ErrorMessage = message;
        write.CompletedAt = clock.UtcNow;
        write.UpdatedAt = write.CompletedAt.Value;
        AddTimeline(write, TimelineEventKind.SourceWriteFailed, "GitHub write failed", message);
    }

    private void AddTimeline(OratorioSourceWriteLog write, TimelineEventKind kind, string title, string? body)
    {
        db.TimelineEvents.Add(new OratorioTimelineEvent
        {
            ItemId = write.ItemId,
            RoundId = write.RoundId,
            Kind = kind,
            ActorKind = ActorKind.Source,
            ActorName = "GitHub",
            Title = title,
            Body = body,
            MetadataJson = JsonSerializer.Serialize(new { writeId = write.WriteId, write.Kind, write.Intent }, JsonOptions),
            CreatedAt = clock.UtcNow
        });
    }

    private static bool TryResolveGitHubTarget(OratorioItem item, out GitHubRepositoryRef repository, out int number)
    {
        repository = new GitHubRepositoryRef("", "");
        number = 0;
        if (!GitHubRepositoryRef.TryParse(item.Repository ?? "", out repository))
        {
            return false;
        }

        var hash = item.ExternalId.LastIndexOf('#');
        return hash >= 0 && int.TryParse(item.ExternalId[(hash + 1)..], out number);
    }

    private static string DecisionIntent(DecisionType decision) =>
        decision switch
        {
            DecisionType.Approve => "approve",
            DecisionType.RequestChanges => "requestChanges",
            DecisionType.Reject => "reject",
            _ => decision.ToString()
        };

    private static string DecisionBody(OratorioDecision decision)
    {
        var body = string.IsNullOrWhiteSpace(decision.Body) ? "No operator feedback was provided." : decision.Body.Trim();
        return decision.Decision switch
        {
            DecisionType.Approve => body,
            DecisionType.RequestChanges => $"Oratorio requested changes.\n\n{body}",
            DecisionType.Reject => $"Oratorio rejected this item.\n\n{body}",
            _ => body
        };
    }

    private static string ReadString(string json, string propertyName) =>
        ReadOptionalString(json, propertyName) ?? throw new JsonException($"Missing required property '{propertyName}'.");

    private static bool ReadBool(string json, string propertyName)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.TryGetProperty(propertyName, out var value) &&
            value.ValueKind is JsonValueKind.True or JsonValueKind.False && value.GetBoolean();
    }

    private static IReadOnlyList<GitHubPullRequestReviewCommentWrite> ReadReviewComments(string json)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("comments", out var commentsElement) ||
            commentsElement.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var comments = new List<GitHubPullRequestReviewCommentWrite>();
        foreach (var comment in commentsElement.EnumerateArray())
        {
            var path = ReadRequiredString(comment, "path");
            var body = ReadRequiredString(comment, "body");
            var side = ReadRequiredString(comment, "side");
            var line = ReadRequiredInt(comment, "line");
            comments.Add(new GitHubPullRequestReviewCommentWrite(
                path,
                body,
                line,
                side,
                ReadOptionalInt(comment, "startLine") ?? ReadOptionalInt(comment, "start_line"),
                ReadOptionalString(comment, "startSide") ?? ReadOptionalString(comment, "start_side")));
        }

        return comments;
    }

    private static string? ReadOptionalString(string json, string propertyName)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.TryGetProperty(propertyName, out var value) ? value.GetString() : null;
    }

    private static string ReadRequiredString(JsonElement element, string propertyName) =>
        ReadOptionalString(element, propertyName) ?? throw new JsonException($"Missing required property '{propertyName}'.");

    private static string? ReadOptionalString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.GetString()
            : null;

    private static int ReadRequiredInt(JsonElement element, string propertyName) =>
        ReadOptionalInt(element, propertyName) ?? throw new JsonException($"Missing required property '{propertyName}'.");

    private static int? ReadOptionalInt(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.GetInt32()
            : null;
}
