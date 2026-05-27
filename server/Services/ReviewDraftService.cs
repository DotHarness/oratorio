using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Oratorio.Server.Api;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;
using Oratorio.Server.GitLab;
using Oratorio.Server.GitHub;
using Oratorio.Server.Sources;

namespace Oratorio.Server.Services;

public sealed class ReviewDraftService(
    OratorioDbContext db,
    IReviewDiffProvider reviewDiffs,
    GitHubWriteService gitHubWrites,
    GitLabWriteService gitLabWrites,
    IGitLabApiClient gitLab,
    IOptionsMonitor<OratorioAutomationOptions> automationOptions,
    IClock clock)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> CommentOnlyReasons = new(StringComparer.Ordinal)
    {
        "needsHumanDecision",
        "requiresLargerChange",
        "cannotAnchorSafely",
        "investigateOnly",
        "leftSideOrDeletion"
    };

    public async Task<bool> RunHasDraftAsync(string runId, CancellationToken ct) =>
        await db.ReviewDrafts.AnyAsync(x => x.RunId == runId, ct);

    public async Task<SubmitReviewDraftResponse> SubmitForRunAsync(
        string runId,
        SubmitReviewDraftRequest request,
        CancellationToken ct)
    {
        var run = await db.Runs.Include(x => x.Item).Include(x => x.Round).FirstOrDefaultAsync(x => x.RunId == runId, ct)
            ?? throw OratorioApiException.RunNotFound(runId);
        if (run.Item is null || run.Round is null || run.Item.Source is not ("github" or "gitlab") || run.Item.Kind != ItemKind.PullRequest)
        {
            throw OratorioApiException.Conflict("reviewDraftUnsupportedItem", "Review drafts are only supported for GitHub pull request and GitLab merge request runs.");
        }

        ValidateSummary(request.Summary);

        var normalized = NormalizeComments(request.Comments ?? []);
        var requestedPaths = normalized.Select(x => x.Path).Distinct(StringComparer.Ordinal).ToArray();
        var anchorMap = normalized.Count == 0
            ? EmptyAnchorMap()
            : await BuildAnchorMapForRunAsync(run, requestedPaths, ct);
        var validation = ValidateAnchors(normalized, anchorMap);
        var now = clock.UtcNow;
        var warnings = validation.Comments
            .Where(x => x.Warning is not null)
            .Select(x => x.Warning!)
            .Concat(anchorMap.Diagnostics)
            .ToList();
        var derivedSuggestionCount = validation.Comments.Count(IsAcceptedCodeSuggestion);
        if (Math.Max(0, request.Summary.SuggestionCount) != derivedSuggestionCount)
        {
            warnings.Add($"reviewDraftSuggestionCountMismatch: submitted suggestionCount {Math.Max(0, request.Summary.SuggestionCount)} was replaced with derived accepted code suggestion count {derivedSuggestionCount}.");
        }

        var draft = new OratorioReviewDraft
        {
            ItemId = run.ItemId,
            RoundId = run.RoundId,
            RunId = run.RunId,
            Status = ReviewDraftStatus.Draft,
            SummaryBody = request.Summary.Body!.Trim(),
            MajorCount = Math.Max(0, request.Summary.MajorCount),
            MinorCount = Math.Max(0, request.Summary.MinorCount),
            SuggestionCount = derivedSuggestionCount,
            WarningsJson = JsonSerializer.Serialize(warnings, JsonOptions),
            CreatedAt = now,
            UpdatedAt = now,
            Comments = validation.Comments.ToList()
        };
        db.ReviewDrafts.Add(draft);
        AddTimeline(run.Item, run.Round, run, TimelineEventKind.CommentAdded, "Review draft submitted", $"{validation.AcceptedCount} inline comment(s) accepted; {warnings.Count} warning(s).", now);
        await db.SaveChangesAsync(ct);

        return new SubmitReviewDraftResponse(draft.DraftId, validation.AcceptedCount, warnings.Count, warnings);
    }

    public async Task<ItemDetailResponse> UpdateAsync(string draftId, ReviewDraftUpdateRequest request, OratorioService items, CancellationToken ct)
    {
        var draft = await db.ReviewDrafts.Include(x => x.Comments).FirstOrDefaultAsync(x => x.DraftId == draftId, ct)
            ?? throw OratorioApiException.Conflict("reviewDraftNotFound", "The requested review draft does not exist.", new Dictionary<string, object?> { ["draftId"] = draftId });
        EnsureDraftStatus(draft);

        if (!string.IsNullOrWhiteSpace(request.SummaryBody))
        {
            draft.SummaryBody = request.SummaryBody.Trim();
        }

        var updates = (request.Comments ?? []).ToDictionary(x => x.DraftCommentId, StringComparer.Ordinal);
        foreach (var comment in draft.Comments)
        {
            if (!updates.TryGetValue(comment.DraftCommentId, out var update))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(update.Body))
            {
                comment.Body = update.Body.Trim();
            }

            if (!string.IsNullOrWhiteSpace(update.SuggestionReplacement))
            {
                comment.SuggestionReplacement = update.SuggestionReplacement.TrimEnd();
                comment.CommentOnlyReason = null;
            }
            else if (!string.IsNullOrWhiteSpace(update.CommentOnlyReason))
            {
                comment.SuggestionReplacement = null;
                comment.CommentOnlyReason = NormalizeCommentOnlyReason(update.CommentOnlyReason);
            }
        }

        EnsureDraftCommentsHaveSuggestionOrReason(draft.Comments);
        draft.SuggestionCount = draft.Comments.Count(IsAcceptedCodeSuggestion);
        draft.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return await items.GetItemDetailByIdAsync(draft.ItemId, ct);
    }

    public async Task<ItemDetailResponse> DiscardAsync(string draftId, OratorioService items, CancellationToken ct)
    {
        var draft = await db.ReviewDrafts.FirstOrDefaultAsync(x => x.DraftId == draftId, ct)
            ?? throw OratorioApiException.Conflict("reviewDraftNotFound", "The requested review draft does not exist.", new Dictionary<string, object?> { ["draftId"] = draftId });
        EnsureDraftStatus(draft);
        draft.Status = ReviewDraftStatus.Discarded;
        draft.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return await items.GetItemDetailByIdAsync(draft.ItemId, ct);
    }

    public async Task<ItemDetailResponse> PublishAsync(string draftId, OratorioService items, CancellationToken ct)
    {
        var draft = await db.ReviewDrafts
            .Include(x => x.Item)
            .Include(x => x.Round)
            .Include(x => x.Run)
            .Include(x => x.Comments)
            .FirstOrDefaultAsync(x => x.DraftId == draftId, ct)
            ?? throw OratorioApiException.Conflict("reviewDraftNotFound", "The requested review draft does not exist.", new Dictionary<string, object?> { ["draftId"] = draftId });

        await PublishLoadedDraftAsync(draft, enforceAutoPublishGates: false, ct);
        await db.SaveChangesAsync(ct);
        return await items.GetItemDetailByIdAsync(draft.ItemId, ct);
    }

    public async Task<int> AutoPublishRunDraftsAsync(string runId, CancellationToken ct)
    {
        var run = await db.Runs
            .Include(x => x.Item)
            .Include(x => x.Round)
            .FirstOrDefaultAsync(x => x.RunId == runId, ct);
        if (run?.Item is null ||
            run.Round is null ||
            run.Purpose != RunPurpose.ReviewAnalysis ||
            run.Item.Source is not ("github" or "gitlab") ||
            run.Item.Kind != ItemKind.PullRequest ||
            !automationOptions.CurrentValue.CanAutoPublishReviewForRepository(run.Item.Repository))
        {
            return 0;
        }

        var drafts = await db.ReviewDrafts
            .Include(x => x.Item)
            .Include(x => x.Round)
            .Include(x => x.Run)
            .Include(x => x.Comments)
            .Where(x => x.RunId == runId && x.Status == ReviewDraftStatus.Draft)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);

        foreach (var draft in drafts)
        {
            await PublishLoadedDraftAsync(draft, enforceAutoPublishGates: true, ct);
        }

        await db.SaveChangesAsync(ct);
        return drafts.Count;
    }

    private async Task PublishLoadedDraftAsync(OratorioReviewDraft draft, bool enforceAutoPublishGates, CancellationToken ct)
    {
        EnsureDraftStatus(draft);
        if (draft.Item is null || draft.Round is null)
        {
            throw OratorioApiException.Conflict("invalidReviewDraftBinding", "The review draft does not have a valid source target.");
        }

        var now = clock.UtcNow;
        var write = await CreatePublishWriteAsync(draft, now, ct);
        var sourceActor = SourceActor(draft.Item.Source);
        db.SourceWriteLogs.Add(write);
        draft.SourceWrite = write;
        draft.SourceWriteId = write.WriteId;
        draft.UpdatedAt = now;
        AddTimeline(draft.Item, draft.Round, null, TimelineEventKind.SourceWriteQueued, $"{sourceActor} review draft publish queued", null, now);

        var blocked = enforceAutoPublishGates ? AutoPublishBlockReason(draft) : null;
        if (blocked is not null)
        {
            MarkPublishFailed(draft, write, blocked.Value.Code, blocked.Value.Message);
            return;
        }

        if (draft.Item.Source == "gitlab")
        {
            await gitLabWrites.ExecuteAsync(write, ct);
        }
        else
        {
            await gitHubWrites.ExecuteAsync(write, ct);
        }

        ApplyWriteResultToDraft(draft, write);
    }

    private async Task<OratorioSourceWriteLog> CreatePublishWriteAsync(OratorioReviewDraft draft, DateTimeOffset now, CancellationToken ct)
    {
        if (draft.Item!.Source == "gitlab")
        {
            return await CreateGitLabPublishWriteAsync(draft, now, ct);
        }

        if (!TryResolveGitHubTarget(draft.Item, out var repository, out var number))
        {
            throw OratorioApiException.Conflict("invalidGitHubTarget", "The review draft does not have a valid GitHub pull request target.");
        }

        return CreateGitHubPublishWrite(draft, repository, number, now);
    }

    private static OratorioSourceWriteLog CreateGitHubPublishWrite(OratorioReviewDraft draft, GitHubRepositoryRef repository, int number, DateTimeOffset now)
    {
        var accepted = draft.Comments
            .Where(x => x.Status == ReviewDraftCommentStatus.Accepted)
            .Select(x => new GitHubPullRequestReviewCommentWrite(
                x.Path,
                BuildInlineCommentBody(x),
                x.Line,
                x.Side,
                x.StartLine,
                x.StartSide))
            .ToList();

        return new OratorioSourceWriteLog
        {
            ItemId = draft.ItemId,
            RoundId = draft.RoundId,
            Source = "github",
            Kind = SourceWriteKind.PullRequestReview,
            Intent = "reviewDraftPublish",
            Status = SourceWriteStatus.Pending,
            Repository = repository.FullName,
            Number = number,
            HeadSha = draft.Item!.HeadSha,
            RequestJson = JsonSerializer.Serialize(new { @event = "COMMENT", body = draft.SummaryBody, commitId = draft.Item.HeadSha, comments = accepted }, JsonOptions),
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    private async Task<OratorioSourceWriteLog> CreateGitLabPublishWriteAsync(OratorioReviewDraft draft, DateTimeOffset now, CancellationToken ct)
    {
        var item = draft.Item!;
        if (!TryResolveGitLabTarget(item, out var project, out var iid))
        {
            throw OratorioApiException.Conflict("invalidGitLabTarget", "The review draft does not have a valid GitLab merge request target.");
        }

        var acceptedComments = draft.Comments
            .Where(x => x.Status == ReviewDraftCommentStatus.Accepted)
            .ToList();
        if (acceptedComments.Count == 0)
        {
            return new OratorioSourceWriteLog
            {
                ItemId = draft.ItemId,
                RoundId = draft.RoundId,
                Source = "gitlab",
                Kind = SourceWriteKind.MergeRequestNote,
                Intent = "reviewDraftPublish",
                Status = SourceWriteStatus.Pending,
                Repository = project.ProjectPath,
                Number = iid,
                HeadSha = item.HeadSha,
                RequestJson = JsonSerializer.Serialize(new { body = draft.SummaryBody, comments = Array.Empty<object>() }, JsonOptions),
                CreatedAt = now,
                UpdatedAt = now
            };
        }

        var mergeRequest = await gitLab.GetMergeRequestAsync(project, iid, ct);
        var baseSha = mergeRequest.DiffRefs?.BaseSha;
        var headSha = mergeRequest.DiffRefs?.HeadSha ?? mergeRequest.Sha ?? item.HeadSha;
        var startSha = mergeRequest.DiffRefs?.StartSha ?? baseSha;
        if (string.IsNullOrWhiteSpace(baseSha) || string.IsNullOrWhiteSpace(headSha) || string.IsNullOrWhiteSpace(startSha))
        {
            throw OratorioApiException.Conflict("gitlabDiffRefsRequired", "GitLab review draft publication requires merge request diff refs.");
        }

        var diffs = await gitLab.ListMergeRequestDiffsAsync(project, iid, ct);
        var comments = new List<object>();
        foreach (var comment in acceptedComments)
        {
            var diff = FindGitLabDiff(diffs, comment.Path)
                ?? throw OratorioApiException.Conflict("gitlabDiffAnchorMissing", $"GitLab diff no longer contains {comment.Path}.");
            comments.Add(new
            {
                body = BuildInlineCommentBody(comment, gitLab: true),
                position = new
                {
                    baseSha,
                    headSha,
                    startSha,
                    oldPath = diff.OldPath,
                    newPath = diff.NewPath,
                    oldLine = comment.Side == "LEFT" ? comment.Line : (int?)null,
                    newLine = comment.Side == "RIGHT" ? comment.Line : (int?)null
                }
            });
        }

        return new OratorioSourceWriteLog
        {
            ItemId = draft.ItemId,
            RoundId = draft.RoundId,
            Source = "gitlab",
            Kind = comments.Count == 0 ? SourceWriteKind.MergeRequestNote : SourceWriteKind.MergeRequestDiscussion,
            Intent = "reviewDraftPublish",
            Status = SourceWriteStatus.Pending,
            Repository = project.ProjectPath,
            Number = iid,
            HeadSha = headSha,
            RequestJson = JsonSerializer.Serialize(new { body = draft.SummaryBody, comments }, JsonOptions),
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    private static (string Code, string Message)? AutoPublishBlockReason(OratorioReviewDraft draft)
    {
        var warnings = ReadWarnings(draft.WarningsJson);
        if (warnings.Count > 0 ||
            draft.Comments.Any(x => x.Status == ReviewDraftCommentStatus.Skipped || !string.IsNullOrWhiteSpace(x.Warning)))
        {
            return ("reviewDraftWarnings", "Automatic review publication is blocked because the draft contains warnings or skipped inline comments.");
        }

        var runBaseSha = draft.Run?.BaseSha;
        var currentHeadSha = draft.Item?.HeadSha;
        if (string.IsNullOrWhiteSpace(currentHeadSha))
        {
            return (draft.Item?.Source == "gitlab" ? "gitlabHeadShaRequired" : "githubHeadShaRequired", "Automatic review publication requires the current review target head SHA.");
        }

        if (!string.IsNullOrWhiteSpace(runBaseSha) &&
            !string.Equals(runBaseSha, currentHeadSha, StringComparison.OrdinalIgnoreCase))
        {
            return ("stalePullRequestHead", $"Automatic review publication is blocked because the run analyzed {runBaseSha}, but the current review target head is {currentHeadSha}.");
        }

        return null;
    }

    private void ApplyWriteResultToDraft(OratorioReviewDraft draft, OratorioSourceWriteLog write)
    {
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

    private void MarkPublishFailed(OratorioReviewDraft draft, OratorioSourceWriteLog write, string code, string message)
    {
        var now = clock.UtcNow;
        write.Status = SourceWriteStatus.Failed;
        write.ErrorCode = code;
        write.ErrorMessage = message;
        write.CompletedAt = now;
        write.UpdatedAt = now;
        draft.Status = ReviewDraftStatus.PublishFailed;
        draft.UpdatedAt = now;
        AddTimeline(draft.Item!, draft.Round, null, TimelineEventKind.SourceWriteFailed, $"{SourceActor(draft.Item!.Source)} review draft publish failed", message, now);
    }

    private static void EnsureDraftStatus(OratorioReviewDraft draft)
    {
        if (draft.Status != ReviewDraftStatus.Draft)
        {
            throw OratorioApiException.Conflict("invalidReviewDraftState", "Only draft review drafts can be changed.", new Dictionary<string, object?> { ["status"] = draft.Status });
        }
    }

    private static void ValidateSummary(ReviewDraftSummaryRequest summary)
    {
        if (summary is null || string.IsNullOrWhiteSpace(summary.Body))
        {
            throw OratorioApiException.Validation("summary.body is required.", new Dictionary<string, object?> { ["field"] = "summary.body" });
        }
    }

    private static IReadOnlyList<string> ReadWarnings(string warningsJson)
    {
        try
        {
            return JsonSerializer.Deserialize<IReadOnlyList<string>>(warningsJson, JsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyList<OratorioReviewDraftComment> NormalizeComments(IReadOnlyList<ReviewDraftCommentRequest> comments) =>
        comments.Select(input =>
        {
            if (string.IsNullOrWhiteSpace(input.Title))
            {
                throw OratorioApiException.Validation("Each inline comment must include a title.", new Dictionary<string, object?> { ["field"] = "comments.title" });
            }
            if (string.IsNullOrWhiteSpace(input.Body))
            {
                throw OratorioApiException.Validation("Each inline comment must include a body.", new Dictionary<string, object?> { ["field"] = "comments.body" });
            }
            if (string.IsNullOrWhiteSpace(input.Path))
            {
                throw OratorioApiException.Validation("Each inline comment must include a path.", new Dictionary<string, object?> { ["field"] = "comments.path" });
            }
            if (input.Line <= 0 || (input.StartLine.HasValue && (input.StartLine.Value <= 0 || input.StartLine.Value > input.Line)))
            {
                throw OratorioApiException.Validation("Inline comment line anchors must be positive and startLine must be <= line.", new Dictionary<string, object?> { ["field"] = "comments.line" });
            }

            var path = NormalizePath(input.Path);
            var side = NormalizeSide(input.Side ?? "RIGHT");
            var startLine = input.StartLine == input.Line ? null : input.StartLine;
            var startSide = startLine.HasValue ? NormalizeSide(input.StartSide ?? side) : null;
            if (startSide is not null && startSide != side)
            {
                throw OratorioApiException.Validation("Multi-line inline comments must stay on a single diff side.", new Dictionary<string, object?> { ["field"] = "comments.startSide" });
            }

            var suggestionReplacement = string.IsNullOrWhiteSpace(input.SuggestionReplacement) ? null : input.SuggestionReplacement.TrimEnd();
            var commentOnlyReason = string.IsNullOrWhiteSpace(input.CommentOnlyReason) ? null : NormalizeCommentOnlyReason(input.CommentOnlyReason);
            if (string.IsNullOrWhiteSpace(suggestionReplacement) && string.IsNullOrWhiteSpace(commentOnlyReason))
            {
                throw new OratorioApiException(
                    StatusCodes.Status400BadRequest,
                    "reviewDraftSuggestionRequired",
                    "Each inline comment must include suggestionReplacement for concrete code suggestions or commentOnlyReason for comment-only findings.",
                    new Dictionary<string, object?> { ["field"] = "comments.commentOnlyReason" });
            }

            if (!string.IsNullOrWhiteSpace(suggestionReplacement) && !string.IsNullOrWhiteSpace(commentOnlyReason))
            {
                throw new OratorioApiException(
                    StatusCodes.Status400BadRequest,
                    "reviewDraftSuggestionRequired",
                    "Inline comments must include either suggestionReplacement or commentOnlyReason, not both.",
                    new Dictionary<string, object?> { ["field"] = "comments.suggestionReplacement" });
            }

            return new OratorioReviewDraftComment
            {
                Severity = string.Equals(input.Severity, "RED", StringComparison.OrdinalIgnoreCase) ? "RED" : "YELLOW",
                Title = input.Title.Trim(),
                Body = input.Body.Trim(),
                Path = path,
                Line = input.Line,
                Side = side,
                StartLine = startLine,
                StartSide = startSide,
                SuggestionReplacement = suggestionReplacement,
                CommentOnlyReason = commentOnlyReason
            };
        }).ToList();

    private static string NormalizePath(string path)
    {
        var normalized = path.Trim().Replace('\\', '/');
        while (normalized.StartsWith("./", StringComparison.Ordinal))
        {
            normalized = normalized[2..];
        }

        if (string.IsNullOrWhiteSpace(normalized) ||
            Path.IsPathRooted(normalized) ||
            normalized.StartsWith("/", StringComparison.Ordinal) ||
            normalized.StartsWith("../", StringComparison.Ordinal) ||
            normalized.Contains("/../", StringComparison.Ordinal) ||
            normalized.EndsWith("/..", StringComparison.Ordinal) ||
            normalized.Contains("/./", StringComparison.Ordinal))
        {
            throw OratorioApiException.Validation("Inline comment path must be repository-relative and must not contain path traversal segments.", new Dictionary<string, object?> { ["field"] = "comments.path" });
        }

        return normalized;
    }

    private static string NormalizeSide(string side) =>
        side.Trim().ToUpperInvariant() switch
        {
            "LEFT" => "LEFT",
            "RIGHT" => "RIGHT",
            _ => throw OratorioApiException.Validation("Inline comment side must be RIGHT or LEFT.", new Dictionary<string, object?> { ["field"] = "comments.side" })
        };

    private static AnchorValidation ValidateAnchors(
        IReadOnlyList<OratorioReviewDraftComment> comments,
        ReviewDiffAnchorMap anchorMap)
    {
        var acceptedCount = 0;
        var anchorFailures = new List<AnchorFailure>();
        foreach (var comment in comments)
        {
            string? warning = null;
            if (anchorMap.Diagnostics.Any(IsDiffUnavailableDiagnostic))
            {
                warning = $"Skipped inline comment for {comment.Path}:{comment.Line} because diff validation is unavailable.";
            }
            else if (!anchorMap.ContainsChangedPath(comment.Path))
            {
                anchorFailures.Add(BuildAnchorFailure(
                    comment,
                    "fileNotInDiff",
                    "The file is not part of the PR/MR diff.",
                    null));
                continue;
            }
            else if (anchorMap.IsPatchUnavailable(comment.Path))
            {
                warning = $"Skipped inline comment for {comment.Path}:{comment.Line} because provider diff patch data is unavailable for that file.";
            }
            else if (!anchorMap.TryGetAnchors(comment.Path, out var fileAnchors) || !fileAnchors.Has(comment.Side, comment.Line))
            {
                anchorFailures.Add(BuildAnchorFailure(
                    comment,
                    "lineNotCommentable",
                    $"The line is not commentable on the {comment.Side} side.",
                    fileAnchors));
                continue;
            }
            else if (comment.StartLine.HasValue && !fileAnchors.Has(comment.StartSide ?? comment.Side, comment.StartLine.Value))
            {
                anchorFailures.Add(BuildAnchorFailure(
                    comment,
                    "rangeNotCommentable",
                    "The requested range is not commentable.",
                    fileAnchors));
                continue;
            }
            else if (!string.IsNullOrWhiteSpace(comment.SuggestionReplacement) && comment.Side != "RIGHT")
            {
                anchorFailures.Add(BuildAnchorFailure(
                    comment,
                    "suggestionRequiresRightSide",
                    "suggestionReplacement can only target RIGHT-side diff anchors.",
                    fileAnchors));
                continue;
            }
            else if (!string.IsNullOrWhiteSpace(comment.SuggestionReplacement) &&
                fileAnchors.TryGetRightTextRange(comment.StartLine ?? comment.Line, comment.Line, out var currentText) &&
                SameSuggestionText(currentText, comment.SuggestionReplacement))
            {
                warning = $"reviewDraftNoOpSuggestion: Skipped inline suggestion for {comment.Path}:{comment.Line} because suggestionReplacement matches the current diff text.";
            }

            if (warning is null)
            {
                acceptedCount++;
                comment.Status = ReviewDraftCommentStatus.Accepted;
            }
            else
            {
                comment.Status = ReviewDraftCommentStatus.Skipped;
                comment.Warning = warning;
            }
        }

        if (anchorFailures.Count > 0)
        {
            ThrowAnchorFailure(anchorFailures);
        }

        return new AnchorValidation(comments, acceptedCount);
    }

    private static AnchorFailure BuildAnchorFailure(
        OratorioReviewDraftComment comment,
        string reason,
        string message,
        ReviewDiffFileAnchors? anchors)
    {
        var rightRanges = anchors is null ? "" : FormatLineRanges(anchors.Right);
        var leftRanges = anchors is null ? "" : FormatLineRanges(anchors.Left);
        return new AnchorFailure(
            comment.Title,
            comment.Path,
            comment.Line,
            comment.Side,
            comment.StartLine,
            comment.StartSide,
            reason,
            message,
            rightRanges,
            leftRanges);
    }

    private static void ThrowAnchorFailure(IReadOnlyList<AnchorFailure> failures)
    {
        var details = new Dictionary<string, object?>
        {
            ["instruction"] = "Choose a changed/context line from the returned commentable ranges and call SubmitReviewDraft again. Do not finish the turn until the review draft is accepted.",
            ["invalidComments"] = failures.Select(f => new Dictionary<string, object?>
            {
                ["title"] = f.Title,
                ["path"] = f.Path,
                ["line"] = f.Line,
                ["side"] = f.Side,
                ["startLine"] = f.StartLine,
                ["startSide"] = f.StartSide,
                ["reason"] = f.Reason,
                ["message"] = f.Message,
                ["rightCommentableRanges"] = f.RightCommentableRanges,
                ["leftCommentableRanges"] = f.LeftCommentableRanges
            }).ToArray()
        };

        throw new OratorioApiException(
            StatusCodes.Status400BadRequest,
            "reviewDraftAnchorNotCommentable",
            "One or more inline review comments target non-commentable diff anchors. Choose a line from the returned commentable ranges and resubmit SubmitReviewDraft.",
            details);
    }

    private static string FormatLineRanges(IReadOnlySet<int> lines)
    {
        if (lines.Count == 0)
        {
            return "";
        }

        var ranges = new List<string>();
        int? start = null;
        var previous = 0;
        foreach (var line in lines.Order())
        {
            if (start is null)
            {
                start = line;
                previous = line;
                continue;
            }

            if (line == previous + 1)
            {
                previous = line;
                continue;
            }

            ranges.Add(FormatRange(start.Value, previous));
            start = line;
            previous = line;
        }

        if (start is not null)
        {
            ranges.Add(FormatRange(start.Value, previous));
        }

        return string.Join(", ", ranges);
    }

    private static string FormatRange(int start, int end) =>
        start == end ? start.ToString(System.Globalization.CultureInfo.InvariantCulture) : $"{start}-{end}";

    private async Task<ReviewDiffAnchorMap> BuildAnchorMapForRunAsync(OratorioRun run, IReadOnlyList<string> requestedPaths, CancellationToken ct)
    {
        if (run.Item!.Source == "github")
        {
            if (!TryResolveGitHubTarget(run.Item, out var repository, out var number))
            {
                throw OratorioApiException.Conflict("invalidGitHubTarget", "The source item is not a valid GitHub pull request target.");
            }

            return await reviewDiffs.BuildAnchorMapAsync(run, repository, number, requestedPaths, ct);
        }

        if (run.Item.Source == "gitlab")
        {
            if (!TryResolveGitLabTarget(run.Item, out var project, out var iid))
            {
                throw OratorioApiException.Conflict("invalidGitLabTarget", "The source item is not a valid GitLab merge request target.");
            }

            return await BuildGitLabAnchorMapAsync(project, iid, ct);
        }

        throw OratorioApiException.Conflict("reviewDraftUnsupportedItem", "Review drafts are only supported for GitHub pull request and GitLab merge request runs.");
    }

    private async Task<ReviewDiffAnchorMap> BuildGitLabAnchorMapAsync(GitLabProjectRef project, int iid, CancellationToken ct)
    {
        IReadOnlyList<GitLabMergeRequestDiff> diffs;
        try
        {
            diffs = await gitLab.ListMergeRequestDiffsAsync(project, iid, ct);
        }
        catch (HttpRequestException)
        {
            return new ReviewDiffAnchorMap(
                [],
                new Dictionary<string, ReviewDiffFileAnchors>(StringComparer.Ordinal),
                ["reviewDiffUnavailable: GitLab merge request diff validation is unavailable; inline comments were preserved but skipped."]);
        }

        var changedPaths = new HashSet<string>(StringComparer.Ordinal);
        var files = new Dictionary<string, ReviewDiffFileAnchors>(StringComparer.Ordinal);
        var diagnostics = new List<string>();
        var patchUnavailablePaths = new HashSet<string>(StringComparer.Ordinal);

        foreach (var diff in diffs)
        {
            var oldPath = NormalizeGitLabDiffPath(diff.OldPath);
            var newPath = NormalizeGitLabDiffPath(diff.NewPath);
            if (!string.IsNullOrWhiteSpace(oldPath))
            {
                changedPaths.Add(oldPath);
            }

            if (!string.IsNullOrWhiteSpace(newPath))
            {
                changedPaths.Add(newPath);
            }

            if (string.IsNullOrWhiteSpace(diff.Diff))
            {
                var path = FirstNonEmpty(newPath, oldPath);
                diagnostics.Add($"reviewDiffMissingPatch: GitLab did not return a patch for {path}; inline comments for that file will be skipped unless another diff source can resolve them.");
                if (!string.IsNullOrWhiteSpace(newPath))
                {
                    patchUnavailablePaths.Add(newPath);
                }

                if (!string.IsNullOrWhiteSpace(oldPath))
                {
                    patchUnavailablePaths.Add(oldPath);
                }

                continue;
            }

            var anchors = ReviewDiffProvider.BuildAnchorsFromPatch(diff.Diff);
            if (!string.IsNullOrWhiteSpace(newPath))
            {
                files[newPath] = anchors;
            }

            if (!string.IsNullOrWhiteSpace(oldPath))
            {
                files[oldPath] = anchors;
            }
        }

        return new ReviewDiffAnchorMap(changedPaths, files, diagnostics, patchUnavailablePaths);
    }

    private static ReviewDiffAnchorMap EmptyAnchorMap() =>
        new([], new Dictionary<string, ReviewDiffFileAnchors>(StringComparer.Ordinal), []);

    private static bool IsDiffUnavailableDiagnostic(string diagnostic) =>
        diagnostic.StartsWith("reviewDiffUnavailable:", StringComparison.Ordinal);

    private static string BuildInlineCommentBody(OratorioReviewDraftComment comment, bool gitLab = false)
    {
        var sections = new List<string>
        {
            $"**{comment.Title.Trim()}**",
            comment.Body.Trim()
        };
        if (!string.IsNullOrWhiteSpace(comment.SuggestionReplacement))
        {
            sections.Add(string.Join("\n", SuggestionFenceStart(comment, gitLab), comment.SuggestionReplacement.TrimEnd(), "```"));
        }

        return string.Join("\n\n", sections.Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private static string SuggestionFenceStart(OratorioReviewDraftComment comment, bool gitLab)
    {
        if (!gitLab || !comment.StartLine.HasValue || comment.StartLine.Value >= comment.Line)
        {
            return "```suggestion";
        }

        return $"```suggestion:-{comment.Line - comment.StartLine.Value}+0";
    }

    private static string NormalizeCommentOnlyReason(string reason)
    {
        var normalized = reason.Trim();
        if (!CommentOnlyReasons.Contains(normalized))
        {
            throw OratorioApiException.Validation(
                "commentOnlyReason must be one of needsHumanDecision, requiresLargerChange, cannotAnchorSafely, investigateOnly, or leftSideOrDeletion.",
                new Dictionary<string, object?> { ["field"] = "comments.commentOnlyReason" });
        }

        return normalized;
    }

    private static void EnsureDraftCommentsHaveSuggestionOrReason(IEnumerable<OratorioReviewDraftComment> comments)
    {
        foreach (var comment in comments)
        {
            if (string.IsNullOrWhiteSpace(comment.SuggestionReplacement) && string.IsNullOrWhiteSpace(comment.CommentOnlyReason))
            {
                throw new OratorioApiException(
                    StatusCodes.Status400BadRequest,
                    "reviewDraftSuggestionRequired",
                    "Each inline comment must include suggestionReplacement for concrete code suggestions or commentOnlyReason for comment-only findings.",
                    new Dictionary<string, object?> { ["draftCommentId"] = comment.DraftCommentId });
            }
        }
    }

    private static bool IsAcceptedCodeSuggestion(OratorioReviewDraftComment comment) =>
        comment.Status == ReviewDraftCommentStatus.Accepted && !string.IsNullOrWhiteSpace(comment.SuggestionReplacement);

    private static bool SameSuggestionText(string currentText, string suggestionReplacement) =>
        NormalizeSuggestionText(currentText) == NormalizeSuggestionText(suggestionReplacement);

    private static string NormalizeSuggestionText(string value) =>
        value.Replace("\r\n", "\n").Replace('\r', '\n').TrimEnd();

    private static GitLabMergeRequestDiff? FindGitLabDiff(IEnumerable<GitLabMergeRequestDiff> diffs, string path) =>
        diffs.FirstOrDefault(diff =>
            string.Equals(NormalizeGitLabDiffPath(diff.NewPath), path, StringComparison.Ordinal) ||
            string.Equals(NormalizeGitLabDiffPath(diff.OldPath), path, StringComparison.Ordinal));

    private static bool TryResolveGitLabTarget(OratorioItem item, out GitLabProjectRef project, out int iid)
    {
        project = new GitLabProjectRef("");
        iid = 0;
        if (SourceProjectKey.TryParse(item.Repository, out var key) &&
            string.Equals(key.Provider, "gitlab", StringComparison.OrdinalIgnoreCase))
        {
            project = new GitLabProjectRef(key.ProjectPath);
        }
        else if (!GitLabProjectRef.TryParse(item.Repository, out project))
        {
            return false;
        }

        var separator = item.Kind == ItemKind.PullRequest ? '!' : '#';
        var index = item.ExternalId.LastIndexOf(separator);
        return index >= 0 && int.TryParse(item.ExternalId[(index + 1)..], out iid);
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

    private static string NormalizeGitLabDiffPath(string path) =>
        path.Replace('\\', '/').Trim();

    private static string SourceActor(string source) =>
        source == "gitlab" ? "GitLab" : "GitHub";

    private static string FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)) ?? "file";

    private void AddTimeline(OratorioItem item, OratorioRound? round, OratorioRun? run, TimelineEventKind kind, string title, string? body, DateTimeOffset createdAt)
    {
        db.TimelineEvents.Add(new OratorioTimelineEvent
        {
            ItemId = item.ItemId,
            RoundId = round?.RoundId,
            RunId = run?.RunId,
            Kind = kind,
            ActorKind = kind is TimelineEventKind.SourceWriteQueued or TimelineEventKind.SourceWriteSucceeded or TimelineEventKind.SourceWriteFailed ? ActorKind.Source : ActorKind.Agent,
            ActorName = kind is TimelineEventKind.SourceWriteQueued or TimelineEventKind.SourceWriteSucceeded or TimelineEventKind.SourceWriteFailed ? SourceActor(item.Source) : "DotCraft",
            Title = title,
            Body = body,
            CreatedAt = createdAt
        });
    }

    private sealed record AnchorValidation(IReadOnlyList<OratorioReviewDraftComment> Comments, int AcceptedCount);

    private sealed record AnchorFailure(
        string Title,
        string Path,
        int Line,
        string Side,
        int? StartLine,
        string? StartSide,
        string Reason,
        string Message,
        string RightCommentableRanges,
        string LeftCommentableRanges);
}
