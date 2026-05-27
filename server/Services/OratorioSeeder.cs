using Microsoft.EntityFrameworkCore;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;

namespace Oratorio.Server.Services;

public sealed class OratorioSeeder(OratorioDbContext db, IClock clock)
{
    public async Task SeedIfEmptyAsync(CancellationToken ct = default)
    {
        if (await db.Items.AnyAsync(ct))
        {
            return;
        }

        var now = clock.UtcNow;
        var awaiting = AddItem(
            source: "local",
            externalId: "task:seed-auth-review",
            kind: ItemKind.PullRequest,
            title: "Add JWT middleware and refresh-token flow",
            repository: "dotcraft/server",
            assignee: "mika",
            branch: "feature/auth-refresh",
            state: ItemState.AwaitingReview,
            currentRound: 2,
            checkState: CheckState.Attention,
            summary: "The agent completed the middleware path and tests. Two review suggestions remain before Oratorio can pass the PR gate.",
            now.AddMinutes(-15));

        var round = AddRound(awaiting, 2, RoundStatus.AwaitingReview, now.AddMinutes(-14), "Implemented expired-token coverage and updated the middleware registration tests.");
        var run = AddRun(awaiting, round, 1, RunStatus.Succeeded, now.AddMinutes(-13), now.AddMinutes(-3), round.Summary);
        AddTimeline(awaiting, round, null, TimelineEventKind.SourceSynced, ActorKind.Source, "GitHub App", "PR synchronized", "Head SHA 9f31c2d imported with 12 changed files.", now.AddMinutes(-14));
        AddTimeline(awaiting, round, run, TimelineEventKind.RunCompleted, ActorKind.MockRunner, "Worker", "Agent run completed", round.Summary, now.AddMinutes(-3));
        AddTimeline(awaiting, round, null, TimelineEventKind.CommentAdded, ActorKind.System, "Oratorio", "Inline suggestion prepared", "Use a constant-time comparison helper for the refresh-token hash.", now.AddMinutes(-2));
        AddTimeline(awaiting, round, null, TimelineEventKind.CheckUpdated, ActorKind.System, "oratorio/review", "Check waiting on review", "The merge gate is blocked until suggestions are applied or dismissed.", now.AddMinutes(-1));

        var running = AddItem(
            "local",
            "task:seed-github-app",
            ItemKind.PullRequest,
            "Move GitHub tracker review flow into Oratorio",
            "dotcraft/oratorio",
            "kai",
            "oratorio/github-app",
            ItemState.Running,
            1,
            CheckState.Pending,
            "The backend is preparing a worktree and rendering the first review prompt.",
            now.AddMinutes(-23));
        var runningRound = AddRound(running, 1, RoundStatus.Running, now.AddMinutes(-20), null);
        var runningRun = AddRun(running, runningRound, 1, RunStatus.Running, now.AddMinutes(-19), null, null);
        AddTimeline(running, runningRound, runningRun, TimelineEventKind.RunStarted, ActorKind.MockRunner, "Dispatcher", "Run started", "Mock runner is holding this item in running state for validation.", now.AddMinutes(-19));

        var discovered = AddItem(
            "local",
            "task:seed-comment-sync",
            ItemKind.Issue,
            "Design comment sync cursor for imported tracker comments",
            "dotcraft/oratorio",
            "unassigned",
            "oratorio/comment-sync",
            ItemState.Discovered,
            0,
            CheckState.NotConfigured,
            "Ready to dispatch once the product policy for comment import is selected.",
            now.AddHours(-1));
        AddTimeline(discovered, null, null, TimelineEventKind.SourceSynced, ActorKind.Source, "GitHub App", "Issue discovered", "Labels match the active Oratorio source policy.", now.AddHours(-1));

        var approved = AddItem(
            "local",
            "task:seed-worktree-cleanup",
            ItemKind.PullRequest,
            "Tighten workspace cleanup before merging agent branches",
            "dotcraft/runtime",
            "ren",
            "runtime/worktree-cleanup",
            ItemState.Approved,
            3,
            CheckState.Passing,
            "Approved after round 3. Oratorio check is passing on the current head SHA.",
            now.AddHours(-2));
        var approvedRound = AddRound(approved, 3, RoundStatus.Approved, now.AddHours(-2), approved.LatestSummary);
        AddDecision(approved, approvedRound, DecisionType.Approve, "Cleanup behavior matches the workspace safety policy.", now.AddHours(-2).AddMinutes(5));
        AddTimeline(approved, approvedRound, null, TimelineEventKind.CheckUpdated, ActorKind.System, "oratorio/review", "Check passed", "Required review gate is satisfied.", now.AddHours(-2).AddMinutes(6));

        await db.SaveChangesAsync(ct);
    }

    private OratorioItem AddItem(
        string source,
        string externalId,
        ItemKind kind,
        string title,
        string? repository,
        string? assignee,
        string? branch,
        ItemState state,
        int currentRound,
        CheckState checkState,
        string? summary,
        DateTimeOffset updatedAt)
    {
        var item = new OratorioItem
        {
            Source = source,
            ExternalId = externalId,
            Kind = kind,
            Title = title,
            Repository = repository,
            Assignee = assignee,
            Branch = branch,
            State = state,
            CurrentRound = currentRound,
            CheckState = checkState,
            LatestSummary = summary,
            CreatedAt = updatedAt,
            UpdatedAt = updatedAt,
            LastSourceSyncAt = updatedAt
        };
        db.Items.Add(item);
        return item;
    }

    private OratorioRound AddRound(OratorioItem item, int roundNumber, RoundStatus status, DateTimeOffset createdAt, string? summary)
    {
        var round = new OratorioRound
        {
            Item = item,
            ItemId = item.ItemId,
            RoundNumber = roundNumber,
            Status = status,
            Summary = summary,
            CreatedAt = createdAt,
            CompletedAt = status is RoundStatus.AwaitingReview or RoundStatus.Approved ? createdAt : null
        };
        db.Rounds.Add(round);
        return round;
    }

    private OratorioRun AddRun(OratorioItem item, OratorioRound round, int attempt, RunStatus status, DateTimeOffset? startedAt, DateTimeOffset? completedAt, string? summary)
    {
        var run = new OratorioRun
        {
            Item = item,
            ItemId = item.ItemId,
            Round = round,
            RoundId = round.RoundId,
            Attempt = attempt,
            Status = status,
            RunnerKind = "mock",
            StartedAt = startedAt,
            CompletedAt = completedAt,
            Summary = summary,
            ProgressPercent = status == RunStatus.Succeeded ? 100 : 35,
            StatusMessage = status == RunStatus.Succeeded ? "Review output is ready." : "Mock runner is reviewing changes.",
            LastHeartbeatAt = completedAt ?? startedAt,
            MockOutcome = MockOutcome.Success,
            MockDurationSeconds = 8
        };
        db.Runs.Add(run);
        item.CurrentRunId = status is RunStatus.Running or RunStatus.Dispatching or RunStatus.Queued ? run.RunId : null;
        return run;
    }

    private void AddDecision(OratorioItem item, OratorioRound round, DecisionType decision, string body, DateTimeOffset createdAt)
    {
        db.Decisions.Add(new OratorioDecision
        {
            Item = item,
            ItemId = item.ItemId,
            Round = round,
            RoundId = round.RoundId,
            Decision = decision,
            Body = body,
            CreatedAt = createdAt
        });
        AddTimeline(item, round, null, TimelineEventKind.DecisionRecorded, ActorKind.Operator, "operator", "Approved", body, createdAt);
    }

    private void AddTimeline(
        OratorioItem item,
        OratorioRound? round,
        OratorioRun? run,
        TimelineEventKind kind,
        ActorKind actorKind,
        string actorName,
        string title,
        string? body,
        DateTimeOffset createdAt)
    {
        db.TimelineEvents.Add(new OratorioTimelineEvent
        {
            Item = item,
            ItemId = item.ItemId,
            Round = round,
            RoundId = round?.RoundId,
            Run = run,
            RunId = run?.RunId,
            Kind = kind,
            ActorKind = actorKind,
            ActorName = actorName,
            Title = title,
            Body = body,
            CreatedAt = createdAt
        });
    }
}
