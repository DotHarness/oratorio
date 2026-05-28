using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;

namespace Oratorio.Server.DotCraft;

public sealed class AppServerPromptBuilder(OratorioDbContext db)
{
    private const string ReviewDraftIntroInstructions = """
        - Always call the available oratorio.SubmitReviewDraft tool before your final response; it is required even when the PR/MR is clean.
        - If you find no actionable issues, submit a summary-only draft with majorCount 0, minorCount 0, suggestionCount 0, a concise body stating that the current head was reviewed and no required changes were found, and comments: [].
        - Write Review Draft text in restrained English engineering prose: no greetings, no filler, no raw JSON in final response, and no repeated machine-readable draft in the final answer.
        - Format summary.body with these labels: Reviewed: <base>...<head>; Outcome: <clean | N actionable findings | blocked>; Scope checked: <2-4 high-risk areas inspected>; Notes: <important caveats, skipped anchors, or non-blocking context>.
        - Clean reviews must use the summary-only format with Outcome: clean, state that the current head was reviewed and no required changes were found, set majorCount 0, minorCount 0, suggestionCount 0, and comments: [].
        - Prioritize actionable findings over FYI noise: submit inline comments only for bugs or flags that are useful for the operator or author to act on.
        - Treat RED inline findings as likely bugs affecting correctness, security, data loss, or a broken workflow; treat YELLOW as investigate flags, maintainability risks, or lower-confidence issues.
        - Write inline finding titles as concise imperative/problem statements, and write bodies with Why this matters, When it fails, and Suggested direction.
        - Keep informational explanations in summary.body or omit them; do not submit noisy FYI inline comments.
        """;

    private const string ReviewDraftDiffInstructions = """
        - Do not treat git show HEAD or HEAD^..HEAD as the complete PR/MR review range.
        - For large PRs/MRs, inspect local git diff shards such as file lists, stats, and focused per-path diffs instead of relying on a single full diff.
        - Prioritize high-risk changed files and submit only high-confidence inline findings with precise repository-relative paths and changed-line anchors.
        - Inline findings must anchor to a commentable changed/context line in the PR/MR diff, not an arbitrary full-file line number.
        - For each fixable RIGHT-side inline finding, include an exact suggestionReplacement that can be published as a native GitHub/GitLab suggested change.
        - For non-suggestion findings, omit suggestionReplacement and provide commentOnlyReason as one of: needsHumanDecision, requiresLargerChange, cannotAnchorSafely, investigateOnly, leftSideOrDeletion.
        - If oratorio.SubmitReviewDraft fails with reviewDraftAnchorNotCommentable, choose a valid line from the returned commentable ranges and call oratorio.SubmitReviewDraft again before your final response.
        - Count only accepted concrete code suggestions in suggestionCount; do not count prose-only findings or follow-up ideas as suggestions.
        - Do not place machine-readable review JSON in the final answer.
        """;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    public async Task<AppServerPrompt> BuildAsync(
        OratorioRun run,
        string? operatorNote,
        string workspacePath,
        IReadOnlyList<string> requiredDynamicTools,
        bool incremental,
        CancellationToken ct)
    {
        var item = await db.Items.AsNoTracking().FirstAsync(x => x.ItemId == run.ItemId, ct);
        var round = await db.Rounds.AsNoTracking().FirstAsync(x => x.RoundId == run.RoundId, ct);
        var comments = await db.Comments.AsNoTracking()
            .Where(x => x.ItemId == item.ItemId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var rounds = await db.Rounds.AsNoTracking()
            .Where(x => x.ItemId == item.ItemId)
            .OrderBy(x => x.RoundNumber)
            .ToListAsync(ct);
        var allRuns = await db.Runs.AsNoTracking()
            .Where(x => x.ItemId == item.ItemId)
            .OrderBy(x => x.StartedAt ?? x.CompletedAt ?? DateTimeOffset.MinValue)
            .ToListAsync(ct);
        var decisions = await db.Decisions.AsNoTracking()
            .Where(x => x.ItemId == item.ItemId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var priorRuns = await db.Runs.AsNoTracking()
            .Where(x => x.ItemId == item.ItemId && x.RunId != run.RunId && x.Summary != null)
            .OrderBy(x => x.StartedAt ?? x.CompletedAt)
            .Select(x => new
            {
                x.Attempt,
                x.RunnerKind,
                x.Status,
                x.Summary,
                x.ErrorCode,
                x.CompletedAt
            })
            .ToListAsync(ct);
        var sourceSnapshots = await db.SourceSnapshots.AsNoTracking()
            .Where(x => x.ItemId == item.ItemId)
            .OrderByDescending(x => x.SyncedAt)
            .Take(20)
            .ToListAsync(ct);
        var sourceSnapshot = sourceSnapshots.FirstOrDefault();
        var reviewDiff = ResolveReviewDiffTarget(item, sourceSnapshots);
        var decisionCommentIds = decisions
            .Select(x => x.CommentId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.Ordinal);
        var feedbackRoundNumber = round.RoundNumber == 1 ? 1 : round.RoundNumber - 1;
        var feedbackRoundId = rounds.FirstOrDefault(x => x.RoundNumber == feedbackRoundNumber)?.RoundId;
        var feedbackForThisRound = feedbackRoundId is null
            ? Array.Empty<PromptFeedback>()
            : decisions
                .Where(decision => decision.RoundId == feedbackRoundId && decision.Decision == DecisionType.RequestChanges && !string.IsNullOrWhiteSpace(decision.Body))
                .Select(decision => new PromptFeedback(
                    "requestChanges",
                    decision.DecisionId,
                    decision.CommentId,
                    decision.Body!,
                    decision.CreatedAt))
                .Concat(comments
                    .Where(comment =>
                        comment.RoundId == feedbackRoundId &&
                        IsOperatorComment(comment) &&
                        !decisionCommentIds.Contains(comment.CommentId))
                    .Select(comment => new PromptFeedback(
                        "operatorComment",
                        null,
                        comment.CommentId,
                        comment.Body,
                        comment.CreatedAt)))
                .ToArray();

        var context = new
        {
            promptMode = "compact",
            turnPromptMode = incremental ? "incremental" : "full",
            mode = run.Purpose == RunPurpose.Implementation ? "implementation" : "readOnlyReviewAnalysis",
            requiredDynamicTools,
            item = new
            {
                item.ItemId,
                item.Source,
                item.ExternalId,
                Kind = item.Kind.ToString(),
                item.Title,
                Body = item.Description,
                item.Repository,
                item.Assignee,
                item.Branch,
                item.ExternalUrl,
                Labels = ParseStringArray(item.LabelsJson),
                item.HeadSha,
                item.IsDraft,
                item.SourceUpdatedAt,
                item.LastSourceSyncAt
            },
            workspace = new
            {
                Path = workspacePath,
                BasePath = run.BaseWorkspacePath,
                WorktreePath = run.WorktreePath,
                run.WorktreeBranch,
                run.BaseRef,
                run.BaseSha,
                item.Repository,
                item.Branch,
                item.HeadSha
            },
            currentRound = new
            {
                round.RoundId,
                round.RoundNumber,
                round.Status,
                run.Attempt,
                run.Purpose,
                run.DispatchTrigger,
                run.TargetHeadSha,
                run.DeliveryPolicy,
                OperatorNote = operatorNote
            },
            roundHistory = rounds.Select(historyRound => new
            {
                historyRound.RoundId,
                historyRound.RoundNumber,
                historyRound.Status,
                historyRound.Summary,
                historyRound.CreatedAt,
                historyRound.CompletedAt,
                runs = allRuns
                    .Where(historyRun => historyRun.RoundId == historyRound.RoundId)
                    .Select(historyRun => new
                    {
                        historyRun.RunId,
                        historyRun.Attempt,
                        historyRun.RunnerKind,
                        historyRun.Status,
                        historyRun.Summary,
                        historyRun.ErrorCode,
                        historyRun.StartedAt,
                        historyRun.CompletedAt
                    }),
                decisions = decisions
                    .Where(decision => decision.RoundId == historyRound.RoundId)
                    .Select(decision => new
                    {
                        decision.DecisionId,
                        decision.Decision,
                        decision.Body,
                        decision.CommentId,
                        decision.CreatedAt
                    }),
                operatorComments = comments
                    .Where(comment => comment.RoundId == historyRound.RoundId && IsOperatorComment(comment))
                    .Select(comment => new
                    {
                        comment.CommentId,
                        comment.Body,
                        comment.CreatedAt
                    })
            }),
            feedbackForThisRound,
            importedComments = comments.Where(IsSourceComment).Select(x => new
            {
                x.AuthorKind,
                x.AuthorName,
                x.Body,
                x.Visibility,
                x.CreatedAt,
                x.Source,
                x.SourceCommentId,
                x.ExternalUrl,
                x.SourceUpdatedAt
            }),
            priorSummaries = priorRuns,
            sourceSnapshot = sourceSnapshot is null
                ? null
                : new
                {
                    sourceSnapshot.Source,
                    sourceSnapshot.ExternalId,
                    sourceSnapshot.Repository,
                    sourceSnapshot.HeadSha,
                    sourceSnapshot.SourceUpdatedAt,
                    sourceSnapshot.SyncedAt,
                    Payload = TryParseJson(sourceSnapshot.PayloadJson)
                }
        };

        var contextJson = JsonSerializer.Serialize(context, JsonOptions);
        var prompt = new StringBuilder();
        if (incremental)
        {
            prompt.AppendLine("You are continuing an existing Oratorio DotCraft thread with incremental context.");
        }
        else if (run.Purpose == RunPurpose.Implementation)
        {
            prompt.AppendLine("You are running an Oratorio implementation round through DotCraft AppServer.");
        }
        else
        {
            prompt.AppendLine("You are running an Oratorio read-only review analysis round through DotCraft AppServer.");
        }
        prompt.AppendLine();
        prompt.AppendLine(incremental ? "Review target reminder:" : "Review target:");
        prompt.AppendLine($"- Title: {item.Title}");
        prompt.AppendLine($"- Source: {item.Source} {item.ExternalId}");
        prompt.AppendLine($"- Kind: {item.Kind}");
        prompt.AppendLine($"- Repository: {item.Repository ?? "none"}");
        prompt.AppendLine($"- Branch: {item.Branch ?? "none"}");
        prompt.AppendLine($"- Head SHA: {item.HeadSha ?? "none"}");
        prompt.AppendLine($"- Target head SHA: {run.TargetHeadSha ?? item.HeadSha ?? "none"}");
        if (reviewDiff is not null)
        {
            prompt.AppendLine($"- Review diff base: {reviewDiff.BaseRef} / {reviewDiff.BaseSha}");
            prompt.AppendLine($"- Review diff head: {reviewDiff.HeadRef} / {reviewDiff.HeadSha}");
            prompt.AppendLine($"- Review diff range: {reviewDiff.BaseSha}...{reviewDiff.HeadSha}");
        }
        if (!incremental)
        {
            prompt.AppendLine($"- Review target head SHA: {item.HeadSha ?? run.BaseSha ?? "none"}");
            prompt.AppendLine($"- Head ref/SHA: {item.Branch ?? "none"} / {item.HeadSha ?? "none"}");
            prompt.AppendLine($"- Workspace checkout ref/SHA: {run.BaseRef ?? "none"} / {run.BaseSha ?? "none"}");
            prompt.AppendLine($"- URL: {item.ExternalUrl ?? "none"}");
            prompt.AppendLine($"- Workspace: {workspacePath}");
            if (!string.IsNullOrWhiteSpace(run.BaseWorkspacePath) && !SamePath(run.BaseWorkspacePath, workspacePath))
            {
                prompt.AppendLine($"- Base workspace: {run.BaseWorkspacePath}");
                prompt.AppendLine($"- Managed worktree branch: {run.WorktreeBranch ?? "none"}");
                prompt.AppendLine($"- Managed worktree checkout: {run.BaseSha ?? run.BaseRef ?? "none"}");
            }
        }
        if (!incremental && !string.IsNullOrWhiteSpace(item.Description))
        {
            prompt.AppendLine();
            prompt.AppendLine("Source description:");
            prompt.AppendLine(item.Description.Trim());
        }

        prompt.AppendLine();
        prompt.AppendLine(incremental ? "Incremental operator input:" : "New operator feedback:");
        if (!string.IsNullOrWhiteSpace(operatorNote))
        {
            prompt.AppendLine($"- Dispatch note: {operatorNote.Trim()}");
        }

        if (feedbackForThisRound.Length == 0)
        {
            prompt.AppendLine("- None.");
        }
        else
        {
            foreach (var feedback in feedbackForThisRound)
            {
                prompt.AppendLine($"- {feedback.Kind}: {feedback.Body.Trim()}");
            }
        }

        prompt.AppendLine();
        prompt.AppendLine("Current task:");
        if (run.Purpose == RunPurpose.Implementation)
        {
            prompt.AppendLine("- Implement the requested change in the Oratorio-managed worktree.");
            prompt.AppendLine("- Run focused validation when feasible and include observed results.");
            prompt.AppendLine("- When your implementation draft is ready, call oratorio.SubmitImplementationDraft with summary, tests, risks, changedFiles, proposedCommitMessage, proposedPrTitle, and proposedPrBody.");
            prompt.AppendLine("- Do not place machine-readable implementation JSON in the final answer.");
        }
        else
        {
            prompt.AppendLine("- Inspect the current source state in the workspace and produce a concise review summary for the Oratorio operator.");
            prompt.AppendLine("- Mention blockers, missing information, and suggested next operator actions.");
        }

        if (run.Purpose == RunPurpose.ReviewAnalysis && item.Source is "github" or "gitlab" && item.Kind == ItemKind.PullRequest)
        {
            prompt.AppendLine(ReviewDraftIntroInstructions);
            if (reviewDiff is not null)
            {
                prompt.AppendLine("- First inspect the Review diff range file list/stat and focused per-path diffs before concluding the PR/MR is clean.");
            }
            prompt.AppendLine(ReviewDraftDiffInstructions);
        }
        if (requiredDynamicTools.Contains("oratorio.SubmitFollowUpDraft", StringComparer.Ordinal))
        {
            prompt.AppendLine("- If you identify follow-up work that should be split from the current round, call oratorio.SubmitFollowUpDraft with proposals. Follow-up drafts are advisory and must not be treated as hidden requirements for this round.");
        }

        prompt.AppendLine();
        prompt.AppendLine("Constraints:");
        prompt.AppendLine("- Do not write to GitHub or GitLab.");
        prompt.AppendLine("- Do not create GitHub/GitLab issues or mutate external issue trackers; use oratorio.SubmitFollowUpDraft for proposed follow-up work.");
        prompt.AppendLine("- Do not merge, approve, reject, or request changes on GitHub/GitLab.");
        prompt.AppendLine("- Do not create branches, worktrees, commits, pull requests, or merge requests.");
        if (run.Purpose == RunPurpose.Implementation)
        {
            prompt.AppendLine("- Modify only files inside the Oratorio-managed execution worktree.");
            prompt.AppendLine("- Do not use local git credentials, push branches, or create PRs/MRs yourself. Oratorio performs delivery after your draft.");
        }
        else
        {
            prompt.AppendLine("- Do not modify files in the workspace unless a future Oratorio node explicitly enables execution.");
        }
        prompt.AppendLine();
        prompt.AppendLine("Available tools:");
        if (requiredDynamicTools.Count == 0)
        {
            prompt.AppendLine("- None.");
        }
        else
        {
            foreach (var tool in requiredDynamicTools)
            {
                prompt.AppendLine($"- {tool}");
            }
        }

        return new AppServerPrompt(contextJson, prompt.ToString());
    }

    private static bool IsOperatorComment(OratorioComment comment) =>
        comment.AuthorKind == AuthorKind.Operator &&
        comment.Purpose == CommentPurpose.Feedback &&
        string.IsNullOrWhiteSpace(comment.Source) &&
        string.IsNullOrWhiteSpace(comment.SourceCommentId) &&
        string.IsNullOrWhiteSpace(comment.ExternalUrl);

    private static bool IsSourceComment(OratorioComment comment) =>
        comment.Purpose == CommentPurpose.SourceContext ||
        comment.AuthorKind == AuthorKind.Source ||
        !string.IsNullOrWhiteSpace(comment.Source) ||
        !string.IsNullOrWhiteSpace(comment.SourceCommentId) ||
        !string.IsNullOrWhiteSpace(comment.ExternalUrl);

    private static ReviewDiffTarget? ResolveReviewDiffTarget(OratorioItem item, IReadOnlyList<OratorioSourceSnapshot> sourceSnapshots)
    {
        if (item.Kind != ItemKind.PullRequest ||
            string.IsNullOrWhiteSpace(item.HeadSha))
        {
            return null;
        }

        foreach (var snapshot in sourceSnapshots)
        {
            if (!string.Equals(snapshot.Source, item.Source, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var target = item.Source switch
            {
                "github" => TryReadGitHubReviewDiffTarget(snapshot.PayloadJson),
                "gitlab" => TryReadGitLabReviewDiffTarget(snapshot.PayloadJson),
                _ => null
            };
            if (target is not null && string.Equals(target.HeadSha, item.HeadSha, StringComparison.OrdinalIgnoreCase))
            {
                return target;
            }
        }

        return null;
    }

    private static ReviewDiffTarget? TryReadGitHubReviewDiffTarget(string payloadJson)
    {
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!TryGetObject(document.RootElement, out var pullRequest, "pull_request", "pullRequest") ||
                !TryGetObject(pullRequest, out var @base, "base", "Base") ||
                !TryGetObject(pullRequest, out var head, "head", "Head"))
            {
                return null;
            }

            var baseRef = TryGetString(@base, "ref", "Ref");
            var baseSha = TryGetString(@base, "sha", "Sha");
            var headRef = TryGetString(head, "ref", "Ref");
            var headSha = TryGetString(head, "sha", "Sha");
            return string.IsNullOrWhiteSpace(baseRef) ||
                string.IsNullOrWhiteSpace(baseSha) ||
                string.IsNullOrWhiteSpace(headRef) ||
                string.IsNullOrWhiteSpace(headSha)
                ? null
                : new ReviewDiffTarget(baseRef, baseSha, headRef, headSha);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static ReviewDiffTarget? TryReadGitLabReviewDiffTarget(string payloadJson)
    {
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!TryGetObject(document.RootElement, out var mergeRequest, "merge_request", "mergeRequest") ||
                !TryGetObject(mergeRequest, out var diffRefs, "diff_refs", "diffRefs"))
            {
                return null;
            }

            var baseRef = TryGetString(mergeRequest, "target_branch", "targetBranch");
            var baseSha = TryGetString(diffRefs, "base_sha", "baseSha");
            var headRef = TryGetString(mergeRequest, "source_branch", "sourceBranch");
            var headSha = TryGetString(diffRefs, "head_sha", "headSha");
            return string.IsNullOrWhiteSpace(baseRef) ||
                string.IsNullOrWhiteSpace(baseSha) ||
                string.IsNullOrWhiteSpace(headRef) ||
                string.IsNullOrWhiteSpace(headSha)
                ? null
                : new ReviewDiffTarget(baseRef, baseSha, headRef, headSha);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGetObject(JsonElement element, out JsonElement value, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out value) &&
                value.ValueKind == JsonValueKind.Object)
            {
                return true;
            }
        }

        value = default;
        return false;
    }

    private static string? TryGetString(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out var value) &&
                value.ValueKind == JsonValueKind.String)
            {
                return value.GetString();
            }
        }

        return null;
    }

    private static IReadOnlyList<string> ParseStringArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<IReadOnlyList<string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static JsonElement? TryParseJson(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool SamePath(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        try
        {
            left = Path.GetFullPath(left);
            right = Path.GetFullPath(right);
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return false;
        }

        return string.Equals(left.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar), right.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar), StringComparison.OrdinalIgnoreCase);
    }

    private sealed record PromptFeedback(string Kind, string? DecisionId, string? CommentId, string Body, DateTimeOffset CreatedAt);

    private sealed record ReviewDiffTarget(string BaseRef, string BaseSha, string HeadRef, string HeadSha);
}

public sealed record AppServerPrompt(string ContextJson, string Prompt);
