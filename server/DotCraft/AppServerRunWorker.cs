using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Oratorio.Server.Api;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;
using Oratorio.Server.GitHub;
using Oratorio.Server.Realtime;
using Oratorio.Server.Services;

namespace Oratorio.Server.DotCraft;

public sealed class AppServerRunWorker(
    IServiceScopeFactory scopeFactory,
    IClock clock,
    IDotCraftAppServerProcessManager processManager,
    IDotCraftAppServerClientFactory clientFactory,
    IDotCraftWorkspaceResolver workspaceResolver,
    IWorktreeManager worktreeManager,
    IOptionsMonitor<DotCraftOptions> options,
    IOptionsMonitor<OratorioAutomationOptions> automationOptions,
    DrawerStateService drawerState,
    BoardEventHub boardEvents,
    IAppServerRunCoordinator runCoordinator,
    ILogger<AppServerRunWorker> logger) : BackgroundService
{
    private static readonly RunStatus[] ActiveWorkerStatuses = [RunStatus.Dispatching, RunStatus.Running];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
    private readonly SemaphoreSlim _schedulerLock = new(1, 1);
    private readonly Dictionary<string, Task> _activeTasks = [];
    private readonly object _activeTasksGate = new();
    private readonly string _leaseOwner = $"{Environment.MachineName}:{Guid.NewGuid():n}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RecoverInterruptedRunsAsync(stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(500));
        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            if (!await _schedulerLock.WaitAsync(0, stoppingToken))
            {
                continue;
            }

            try
            {
                RemoveCompletedTasks();
                await ReconcileStalledRunsAsync(stoppingToken);
                await ScheduleRunnableRunsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "AppServer run scheduler tick failed.");
            }
            finally
            {
                _schedulerLock.Release();
            }
        }
    }

    private async Task RecoverInterruptedRunsAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var activeRuns = await db.Runs
            .Include(x => x.Item)
            .Include(x => x.Round)
            .Where(x => x.RunnerKind == "appServer" && ActiveWorkerStatuses.Contains(x.Status))
            .ToListAsync(ct);
        if (activeRuns.Count == 0)
        {
            return;
        }

        var now = clock.UtcNow;
        foreach (var run in activeRuns)
        {
            FailRun(run, now, RunStatus.Failed, "appServerRunnerInterrupted", "The DotCraft AppServer runner was interrupted before it completed.", allowRetry: true);
        }

        await RecordFailedReviewGatesAsync(scope, activeRuns, ct);
        await db.SaveChangesAsync(ct);
    }

    private async Task ReconcileStalledRunsAsync(CancellationToken ct)
    {
        var value = options.CurrentValue;
        var staleBefore = clock.UtcNow - value.StallTimeout;
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var stalledRuns = await db.Runs
            .Include(x => x.Item)
            .Include(x => x.Round)
            .Where(x =>
                x.RunnerKind == "appServer" &&
                ActiveWorkerStatuses.Contains(x.Status) &&
                x.LastHeartbeatAt != null &&
                x.LastHeartbeatAt < staleBefore)
            .ToListAsync(ct);

        var now = clock.UtcNow;
        foreach (var run in stalledRuns)
        {
            FailRun(run, now, RunStatus.TimedOut, "appServerStalled", "DotCraft AppServer run heartbeat stalled.", allowRetry: true);
        }

        if (stalledRuns.Count > 0)
        {
            await RecordFailedReviewGatesAsync(scope, stalledRuns, ct);
            await db.SaveChangesAsync(ct);
        }
    }

    private async Task ScheduleRunnableRunsAsync(CancellationToken ct)
    {
        var value = options.CurrentValue;
        var now = clock.UtcNow;
        var runIdsToStart = new List<string>();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
            var activeRuns = await db.Runs.AsNoTracking()
                .Include(x => x.Item)
                .Where(x => x.RunnerKind == "appServer" && ActiveWorkerStatuses.Contains(x.Status))
                .ToListAsync(ct);
            var activeTotal = activeRuns.Count;
            var activeByRepository = activeRuns
                .GroupBy(x => RepositoryKey(x.Item?.Repository))
                .ToDictionary(x => x.Key, x => x.Count(), StringComparer.OrdinalIgnoreCase);
            var activeBySource = activeRuns
                .GroupBy(x => SourceKey(x.Item?.Source))
                .ToDictionary(x => x.Key, x => x.Count(), StringComparer.OrdinalIgnoreCase);

            var candidates = await db.Runs
                .Include(x => x.Item)
                .Where(x =>
                    x.RunnerKind == "appServer" &&
                    x.Status == RunStatus.Queued &&
                    (x.NextRetryAt == null || x.NextRetryAt <= now))
                .OrderBy(x => x.StartedAt)
                .Take(value.EffectiveGlobalMaxActiveRuns * 4)
                .ToListAsync(ct);

            foreach (var run in candidates)
            {
                if (activeTotal >= value.EffectiveGlobalMaxActiveRuns || run.Item is null)
                {
                    break;
                }

                var repositoryKey = RepositoryKey(run.Item.Repository);
                var sourceKey = SourceKey(run.Item.Source);
                if (activeByRepository.GetValueOrDefault(repositoryKey) >= value.EffectiveMaxActiveRunsPerRepository ||
                    activeBySource.GetValueOrDefault(sourceKey) >= value.EffectiveMaxActiveRunsPerSource)
                {
                    continue;
                }

                run.Status = RunStatus.Dispatching;
                run.LeaseOwner = _leaseOwner;
                run.LeaseAcquiredAt = now;
                run.ProgressPercent = Math.Max(run.ProgressPercent, 5);
                run.StatusMessage = "AppServer runner lease acquired.";
                run.LastHeartbeatAt = now;
                run.Item.State = ItemState.Dispatching;
                run.Item.CheckState = CheckState.Pending;
                run.Item.UpdatedAt = now;
                runIdsToStart.Add(run.RunId);

                activeTotal++;
                activeByRepository[repositoryKey] = activeByRepository.GetValueOrDefault(repositoryKey) + 1;
                activeBySource[sourceKey] = activeBySource.GetValueOrDefault(sourceKey) + 1;
            }

            if (runIdsToStart.Count > 0)
            {
                await db.SaveChangesAsync(ct);
            }
        }

        foreach (var runId in runIdsToStart)
        {
            StartRunTask(runId, ct);
        }
    }

    private void StartRunTask(string runId, CancellationToken ct)
    {
        lock (_activeTasksGate)
        {
            if (_activeTasks.ContainsKey(runId))
            {
                return;
            }

            _activeTasks[runId] = Task.Run(async () =>
            {
                try
                {
                    await RunAppServerTurnAsync(runId, ct);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Unhandled AppServer run task failure for {RunId}.", runId);
                    await FailRunAsync(runId, RunStatus.Failed, "appServerFailed", ex.Message, allowRetry: true, CancellationToken.None);
                }
            }, ct);
        }
    }

    private void RemoveCompletedTasks()
    {
        lock (_activeTasksGate)
        {
            foreach (var runId in _activeTasks.Where(x => x.Value.IsCompleted).Select(x => x.Key).ToArray())
            {
                _activeTasks.Remove(runId);
            }
        }
    }

    private async Task RunAppServerTurnAsync(string runId, CancellationToken ct)
    {
        var value = options.CurrentValue;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(value.RunTimeout);
        var registered = false;

        try
        {
            var baseWorkspacePath = await ResolveBaseWorkspacePathAsync(runId, timeout.Token);
            var executionWorkspacePath = await PrepareExecutionWorkspaceAsync(runId, baseWorkspacePath, timeout.Token);
            var endpoint = await processManager.EnsureAvailableAsync(baseWorkspacePath, timeout.Token);
            await MarkDispatchingAsync(runId, endpoint.Url, timeout.Token);

            await using var client = await clientFactory.ConnectAsync(endpoint.Url, timeout.Token, endpoint.Token);
            await client.InitializeAsync(timeout.Token);
            if (!client.SupportsRuntimeAdditionalContext)
            {
                await FailRunAsync(
                    runId,
                    RunStatus.Failed,
                    "runtimeAdditionalContextUnsupported",
                    "The DotCraft AppServer does not support runtime additional context required by Oratorio.",
                    allowRetry: false,
                    CancellationToken.None);
                return;
            }

            var dynamicTools = await BuildDynamicToolsAsync(runId, timeout.Token);
            var requiredDynamicTools = AppServerDynamicToolCatalog.DynamicToolIds(dynamicTools);
            var reusableThread = await FindCompatibleThreadAsync(runId, executionWorkspacePath, requiredDynamicTools, timeout.Token);
            var threadCreationReason = "No compatible compact AppServer thread was found.";
            if (reusableThread is not null && requiredDynamicTools.Count > 0 && !client.SupportsDynamicToolRebind)
            {
                reusableThread = null;
                threadCreationReason = "A compatible compact AppServer thread was found, but the AppServer does not support dynamic tool rebind.";
            }
            var prompt = await BuildPromptAsync(runId, executionWorkspacePath, requiredDynamicTools, reusableThread is not null, timeout.Token);

            string? boundThreadId = null;
            client.SetDynamicToolHandler(async (call, handlerCt) => await HandleDynamicToolCallAsync(runId, boundThreadId, call, handlerCt));
            string threadId;
            if (reusableThread is null)
            {
                threadId = await client.StartThreadAsync(new AppServerThreadStartRequest(
                    DisplayName: prompt.DisplayName,
                    WorkspacePath: executionWorkspacePath,
                    ApprovalPolicy: string.IsNullOrWhiteSpace(value.ApprovalPolicy) ? "interrupt" : value.ApprovalPolicy,
                    AgentInstructions: "You are connected through Oratorio. Follow the prompt exactly and use Oratorio dynamic tools when instructed.",
                    DynamicTools: dynamicTools,
                    RuntimeAdditionalContext: prompt.RuntimeAdditionalContext), timeout.Token);
                await MarkThreadCreatedAsync(runId, threadId, prompt.ContextJson, endpoint.Url, threadCreationReason, timeout.Token);
            }
            else
            {
                threadId = reusableThread.ThreadId;
                boundThreadId = threadId;
                await client.ResumeThreadAsync(threadId, dynamicTools, prompt.RuntimeAdditionalContext, timeout.Token);

                await MarkThreadReusedAsync(runId, reusableThread, prompt.ContextJson, endpoint.Url, timeout.Token);
            }

            boundThreadId = threadId;

            await client.SubscribeThreadAsync(threadId, timeout.Token);
            runCoordinator.RegisterRun(runId, client, threadId, null);
            registered = true;
            var turnId = await client.StartTurnAsync(threadId, prompt.Prompt, timeout.Token);
            runCoordinator.UpdateRunStatus(runId, turnId, "running");
            await MarkRunningAsync(runId, threadId, turnId, timeout.Token);

            await ConsumeNotificationsAsync(runId, client, threadId, timeout.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            await FailRunAsync(runId, RunStatus.TimedOut, "appServerTimedOut", "DotCraft AppServer run timed out.", allowRetry: true, CancellationToken.None);
        }
        catch (WorktreeException ex)
        {
            await FailRunAsync(runId, RunStatus.Failed, ex.Code, ex.Message, allowRetry: IsTransientPreparationError(ex.Code), CancellationToken.None);
        }
        catch (DotCraftWorkspaceResolutionException ex)
        {
            await FailRunAsync(runId, RunStatus.Failed, ex.Code, ex.Message, allowRetry: false, CancellationToken.None);
        }
        catch (Exception ex)
        {
            await FailRunAsync(runId, RunStatus.Failed, "appServerFailed", ex.Message, allowRetry: true, CancellationToken.None);
        }
        finally
        {
            if (registered)
            {
                runCoordinator.UnregisterRun(runId);
            }

            drawerState.ScheduleEviction(runId, TimeSpan.FromMinutes(5));
        }
    }

    private async Task<string> PrepareExecutionWorkspaceAsync(string runId, string baseWorkspacePath, CancellationToken ct)
    {
        if (!options.CurrentValue.ManagedWorktreesEnabled)
        {
            await MarkWorktreeNotRequiredAsync(runId, baseWorkspacePath, ct);
            return baseWorkspacePath;
        }

        WorktreePrepareRequest request;
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
            var run = await LoadRunAsync(db, runId, ct);
            var now = clock.UtcNow;
            run.BaseWorkspacePath = baseWorkspacePath;
            run.WorktreeStatus = WorktreeStatus.Preparing;
            run.WorktreeErrorCode = null;
            run.WorktreeErrorMessage = null;
            run.ProgressPercent = Math.Max(run.ProgressPercent, 8);
            run.StatusMessage = "Preparing managed Git worktree.";
            run.LastHeartbeatAt = now;
            run.Item!.UpdatedAt = now;
            await db.SaveChangesAsync(ct);

            var item = run.Item;
            string? stackOntoBranch = null;
            string? stackOntoSha = null;
            if (run.Purpose == RunPurpose.Implementation && run.DispatchTrigger == RunDispatchTrigger.AutoFollowUp)
            {
                var generatedPr = await db.Items.AsNoTracking()
                    .Where(x =>
                        x.ParentItemId == item.ItemId &&
                        x.Kind == ItemKind.PullRequest &&
                        (x.Source == "github" || x.Source == "gitlab") &&
                        x.SourceState == SourceState.Open)
                    .OrderByDescending(x => x.CreatedAt)
                    .FirstOrDefaultAsync(ct);
                if (generatedPr is not null)
                {
                    stackOntoBranch = generatedPr.Branch;
                    stackOntoSha = generatedPr.HeadSha;
                }
            }

            request = new WorktreePrepareRequest(
                run.RunId,
                item.ItemId,
                item.Source,
                item.ExternalId,
                item.Repository,
                item.Branch,
                item.HeadSha,
                baseWorkspacePath,
                stackOntoBranch,
                stackOntoSha,
                ResolveReviewTargetFetchRef(run));
        }

        try
        {
            var result = await worktreeManager.PrepareAsync(request, ct);
            await MarkWorktreeReadyAsync(runId, result, ct);
            return result.WorktreePath;
        }
        catch (WorktreeException ex)
        {
            await MarkWorktreeFailedAsync(runId, baseWorkspacePath, ex.Code, ex.Message, ct);
            throw;
        }
    }

    private async Task<IReadOnlyList<AppServerDynamicToolSpec>> BuildDynamicToolsAsync(string runId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await db.Runs.AsNoTracking().Include(x => x.Item).FirstAsync(x => x.RunId == runId, ct);
        if (run.Item is null)
        {
            return [];
        }

        var dynamicTools = new List<AppServerDynamicToolSpec>
        {
            AppServerDynamicToolCatalog.SubmitDiscussionReply(JsonOptions),
            AppServerDynamicToolCatalog.ResolveReviewFinding(JsonOptions)
        };
        if (run.Purpose == RunPurpose.Implementation && run.Item.Kind is ItemKind.Issue or ItemKind.LocalTask && (run.Item.Kind == ItemKind.LocalTask || run.Item.Source is "github" or "gitlab"))
        {
            dynamicTools.Add(new AppServerDynamicToolSpec(
                Namespace: "oratorio",
                Name: "SubmitImplementationDraft",
                Description: "Submit a structured implementation draft after modifying the Oratorio-managed worktree. Oratorio stores the draft and performs commit, push, and review target creation when policy allows.",
                InputSchema: JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        summary = new { type = "string" },
                        tests = new { type = "array", items = new { type = "string" } },
                        risks = new { type = "array", items = new { type = "string" } },
                        changedFiles = new { type = "array", items = new { type = "string" } },
                        proposedCommitMessage = new { type = "string" },
                        proposedPrTitle = new { type = "string" },
                        proposedPrBody = new { type = "string" }
                    },
                    required = new[] { "summary", "proposedCommitMessage", "proposedPrTitle", "proposedPrBody" }
                }, JsonOptions)));
        }

        if (run.Item.Source is "github" or "gitlab" && run.Item.Kind == ItemKind.PullRequest)
        {
            dynamicTools.Add(new AppServerDynamicToolSpec(
                Namespace: "oratorio",
                Name: "SubmitReviewDraft",
                Description: "Submit a structured review draft with one summary and optional inline comments. Oratorio stores the draft for operator review.",
                InputSchema: JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        summary = new
                        {
                            type = "object",
                            properties = new
                            {
                                majorCount = new { type = "integer" },
                                minorCount = new { type = "integer" },
                                suggestionCount = new { type = "integer", description = "Accepted concrete code suggestions only. Oratorio derives the persisted value from accepted comments with suggestion.oldText/newText." },
                                body = new { type = "string" }
                            },
                            required = new[] { "body" }
                        },
                        comments = new
                        {
                            type = "array",
                            items = new
                            {
                                type = "object",
                                properties = new
                                {
                                    severity = new { type = "string" },
                                    title = new { type = "string" },
                                    body = new { type = "string" },
                                    path = new { type = "string", description = "Repository-relative path from the PR/MR diff." },
                                    suggestion = new
                                    {
                                        type = "object",
                                        description = "Exact replace-based code suggestion. Oratorio finds oldText in the PR/MR right-side diff and derives the source review anchor.",
                                        properties = new
                                        {
                                            oldText = new { type = "string", description = "Exact current right-side diff text to replace. Include enough contiguous lines to be unique." },
                                            newText = new { type = "string", description = "Exact replacement text to publish inside the native suggestion block." }
                                        },
                                        required = new[] { "oldText", "newText" }
                                    },
                                    commentOnly = new
                                    {
                                        type = "object",
                                        description = "Explicit anchor and reason for prose-only findings that cannot be safely published as an applicable code suggestion.",
                                        properties = new
                                        {
                                            line = new { type = "integer", description = "Commentable changed/context line in the PR/MR diff, not an arbitrary full-file line." },
                                            side = new { type = "string", description = "RIGHT for new-side anchors or LEFT for deletions/old-side anchors." },
                                            startLine = new { type = "integer", description = "Optional start of a same-side commentable range in the PR/MR diff." },
                                            startSide = new { type = "string", description = "Optional start side for ranged comments; must match a commentable diff side." },
                                            reason = new
                                            {
                                                type = "string",
                                                @enum = new[] { "needsHumanDecision", "requiresLargerChange", "cannotAnchorSafely", "investigateOnly", "leftSideOrDeletion" },
                                                description = "Explains why the finding is prose-only and cannot be published as an applicable code suggestion."
                                            }
                                        },
                                        required = new[] { "line", "reason" }
                                    }
                                },
                                required = new[] { "title", "body", "path" },
                                oneOf = new object[]
                                {
                                    new { required = new[] { "suggestion" } },
                                    new { required = new[] { "commentOnly" } }
                                }
                            }
                        }
                    },
                    required = new[] { "summary" }
                }, JsonOptions)));
        }

        dynamicTools.Add(new AppServerDynamicToolSpec(
            Namespace: "oratorio",
            Name: "SubmitFollowUpDraft",
            Description: "Submit draft follow-up work proposals. Oratorio stores them for operator review and can turn them into local tasks.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    proposals = new
                    {
                        type = "array",
                        items = new
                        {
                            type = "object",
                            properties = new
                            {
                                title = new { type = "string" },
                                body = new { type = "string" },
                                rationale = new { type = "string" },
                                repository = new { type = "string" },
                                assignee = new { type = "string" },
                                branch = new { type = "string" },
                                labels = new { type = "array", items = new { type = "string" } }
                            },
                            required = new[] { "title", "body" }
                        }
                    }
                },
                required = new[] { "proposals" }
            }, JsonOptions)));

        return dynamicTools;
    }

    private async Task<AppServerDynamicToolResult> HandleDynamicToolCallAsync(
        string runId,
        string? threadId,
        AppServerDynamicToolCall call,
        CancellationToken ct)
    {
        if (call.Namespace != "oratorio" || call.Tool is not ("SubmitReviewDraft" or "SubmitImplementationDraft" or "SubmitFollowUpDraft" or "SubmitDiscussionReply" or "ResolveReviewFinding"))
        {
            return new AppServerDynamicToolResult(false, ErrorCode: "UnsupportedTool", ErrorMessage: "Only Oratorio runtime dynamic tools exposed for this run are supported.");
        }

        if (!string.IsNullOrWhiteSpace(threadId) && call.ThreadId != threadId)
        {
            return new AppServerDynamicToolResult(false, ErrorCode: "InvalidRunBinding", ErrorMessage: "The tool call is not bound to this Oratorio run thread.");
        }

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
            var status = await db.Runs
                .AsNoTracking()
                .Where(x => x.RunId == runId)
                .Select(x => (RunStatus?)x.Status)
                .FirstOrDefaultAsync(ct);
            if (status is null || IsTerminal(status.Value))
            {
                return new AppServerDynamicToolResult(false, ErrorCode: "RunNotActive", ErrorMessage: "The Oratorio run is no longer active.");
            }

            if (call.Tool == "SubmitReviewDraft")
            {
                var drafts = scope.ServiceProvider.GetRequiredService<ReviewDraftService>();
                var request = call.Arguments.Deserialize<SubmitReviewDraftRequest>(JsonOptions)
                    ?? throw new InvalidOperationException("SubmitReviewDraft arguments were empty.");
                var response = await drafts.SubmitForRunAsync(runId, request, ct);
                return new AppServerDynamicToolResult(
                    true,
                    [new AppServerToolContentItem("text", $"Review draft {response.DraftId} recorded with {response.AcceptedCount} accepted inline comment(s) and {response.WarningCount} warning(s).")],
                    response);
            }
            else if (call.Tool == "SubmitImplementationDraft")
            {
                var drafts = scope.ServiceProvider.GetRequiredService<ImplementationDraftService>();
                var request = call.Arguments.Deserialize<SubmitImplementationDraftRequest>(JsonOptions)
                    ?? throw new InvalidOperationException("SubmitImplementationDraft arguments were empty.");
                var response = await drafts.SubmitForRunAsync(runId, request, ct);
                return new AppServerDynamicToolResult(
                    true,
                    [new AppServerToolContentItem("text", $"Implementation draft {response.DraftId} recorded with {response.DeliveryPolicy} delivery policy.")],
                    response);
            }
            else if (call.Tool == "SubmitFollowUpDraft")
            {
                var drafts = scope.ServiceProvider.GetRequiredService<FollowUpDraftService>();
                var request = call.Arguments.Deserialize<SubmitFollowUpDraftRequest>(JsonOptions)
                    ?? throw new InvalidOperationException("SubmitFollowUpDraft arguments were empty.");
                var response = await drafts.SubmitForRunAsync(runId, request, ct);
                return new AppServerDynamicToolResult(
                    true,
                    [new AppServerToolContentItem("text", $"{response.AcceptedCount} follow-up draft proposal(s) recorded.")],
                    response);
            }
            else if (call.Tool == "ResolveReviewFinding")
            {
                var resolution = scope.ServiceProvider.GetRequiredService<ReviewFindingResolutionService>();
                var request = call.Arguments.Deserialize<ResolveReviewFindingRequest>(JsonOptions)
                    ?? throw new InvalidOperationException("ResolveReviewFinding arguments were empty.");
                var response = await resolution.ResolveForRunAsync(runId, request, ct);
                return new AppServerDynamicToolResult(
                    true,
                    [new AppServerToolContentItem("text", $"Review finding {response.FindingId} resolved ({response.ResolutionKind}).")],
                    response);
            }
            else
            {
                var discussionTurns = scope.ServiceProvider.GetRequiredService<DiscussionTurnService>();
                return await discussionTurns.SubmitReplyForToolAsync(null, call, ct);
            }
        }
        catch (OratorioApiException ex)
        {
            var structuredResult = new
            {
                error = new
                {
                    code = ex.Code,
                    message = ex.Message,
                    details = ex.Details
                }
            };
            var content = ex.Details is null
                ? ex.Message
                : $"{ex.Message}\nDetails: {JsonSerializer.Serialize(ex.Details, JsonOptions)}";
            return new AppServerDynamicToolResult(
                false,
                [new AppServerToolContentItem("text", content)],
                structuredResult,
                ErrorCode: ex.Code,
                ErrorMessage: ex.Message);
        }
        catch (HttpRequestException)
        {
            return new AppServerDynamicToolResult(
                false,
                ErrorCode: "upstreamSourceRequestFailed",
                ErrorMessage: "A source provider request failed while handling this Oratorio tool call. Retry after source connectivity and permissions are healthy.");
        }
        catch (Exception ex) when (ex is InvalidOperationException or JsonException)
        {
            return new AppServerDynamicToolResult(false, ErrorCode: "InvalidArguments", ErrorMessage: ex.Message);
        }
    }

    private async Task<string> ResolveBaseWorkspacePathAsync(string runId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var repository = await db.Runs.AsNoTracking()
            .Where(x => x.RunId == runId)
            .Select(x => x.Item!.Repository)
            .FirstOrDefaultAsync(ct);
        return workspaceResolver.ResolveWorkspacePath(repository);
    }

    private async Task<(string DisplayName, string ContextJson, string Prompt, IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry> RuntimeAdditionalContext)> BuildPromptAsync(
        string runId,
        string workspacePath,
        IReadOnlyList<string> requiredDynamicTools,
        bool incremental,
        CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var builder = scope.ServiceProvider.GetRequiredService<AppServerPromptBuilder>();
        var run = await db.Runs.AsNoTracking()
            .Include(x => x.Item)
            .FirstAsync(x => x.RunId == runId, ct);
        var latestQueueEvent = await db.TimelineEvents.AsNoTracking()
            .Where(x => x.RunId == runId && x.Kind == TimelineEventKind.RunQueued)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);
        var prompt = await builder.BuildAsync(run, latestQueueEvent?.Body, workspacePath, requiredDynamicTools, incremental, ct);
        return (run.Item?.Title ?? "Oratorio run", prompt.ContextJson, prompt.Prompt, prompt.RuntimeAdditionalContext);
    }

    private async Task<AppServerThreadReuseCandidate?> FindCompatibleThreadAsync(
        string runId,
        string workspacePath,
        IReadOnlyList<string> requiredDynamicTools,
        CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await db.Runs.AsNoTracking().FirstAsync(x => x.RunId == runId, ct);
        var candidates = await db.Runs.AsNoTracking()
            .Where(x =>
                x.ItemId == run.ItemId &&
                x.RunId != runId &&
                x.RunnerKind == "appServer" &&
                x.Status == RunStatus.Succeeded &&
                x.ThreadId != null &&
                x.PromptContextJson != null)
            .OrderByDescending(x => x.CompletedAt ?? x.StartedAt ?? DateTimeOffset.MinValue)
            .Take(10)
            .ToListAsync(ct);

        foreach (var candidate in candidates)
        {
            if (IsCompatiblePromptContext(candidate.PromptContextJson!, workspacePath, requiredDynamicTools))
            {
                return new AppServerThreadReuseCandidate(candidate.ThreadId!, candidate.RunId);
            }
        }

        return null;
    }

    private static bool IsCompatiblePromptContext(string contextJson, string workspacePath, IReadOnlyList<string> requiredDynamicTools)
    {
        try
        {
            using var document = JsonDocument.Parse(contextJson);
            var root = document.RootElement;
            if (!TryGetProperty(root, "promptMode", "PromptMode", out var promptMode) ||
                !string.Equals(promptMode.GetString(), "compact", StringComparison.Ordinal))
            {
                return false;
            }

            if (!TryGetProperty(root, "runtimeContextVersion", "RuntimeContextVersion", out var runtimeContextVersion) ||
                runtimeContextVersion.ValueKind != JsonValueKind.String ||
                !string.Equals(runtimeContextVersion.GetString(), AppServerPromptBuilder.RuntimeContextVersion, StringComparison.Ordinal))
            {
                return false;
            }

            var path = ExtractNestedString(root, "workspace", "path")
                ?? ExtractNestedString(root, "Workspace", "Path");
            if (!SamePath(path, workspacePath))
            {
                return false;
            }

            var previousTools = TryGetProperty(root, "requiredDynamicTools", "RequiredDynamicTools", out var toolsElement) && toolsElement.ValueKind == JsonValueKind.Array
                ? toolsElement.EnumerateArray().Select(x => x.GetString()).Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!).Order(StringComparer.Ordinal).ToArray()
                : [];
            var currentTools = requiredDynamicTools.Order(StringComparer.Ordinal).ToArray();
            return previousTools.SequenceEqual(currentTools, StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private async Task MarkWorktreeNotRequiredAsync(string runId, string baseWorkspacePath, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        run.BaseWorkspacePath = baseWorkspacePath;
        run.WorktreeStatus = WorktreeStatus.NotRequired;
        run.LastHeartbeatAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkWorktreeReadyAsync(string runId, WorktreePrepareResult result, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.BaseWorkspacePath = result.BaseWorkspacePath;
        run.WorktreePath = result.WorktreePath;
        run.WorktreeBranch = result.WorktreeBranch;
        run.BaseRef = result.BaseRef;
        run.BaseSha = result.BaseSha;
        run.WorktreeStatus = WorktreeStatus.Ready;
        run.WorktreeErrorCode = null;
        run.WorktreeErrorMessage = null;
        run.ProgressPercent = Math.Max(run.ProgressPercent, 15);
        run.StatusMessage = "Managed Git worktree is ready.";
        run.LastHeartbeatAt = now;
        run.Item!.UpdatedAt = now;
        AddTimeline(run, TimelineEventKind.RunStarted, ActorKind.System, "oratorio/worktree", "Managed worktree ready", result.WorktreePath, now);
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkWorktreeFailedAsync(string runId, string baseWorkspacePath, string code, string message, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.BaseWorkspacePath = baseWorkspacePath;
        run.WorktreeStatus = WorktreeStatus.Failed;
        run.WorktreeErrorCode = code;
        run.WorktreeErrorMessage = message;
        run.ProgressPercent = 100;
        run.StatusMessage = message;
        run.LastHeartbeatAt = now;
        run.Item!.UpdatedAt = now;
        AddTimeline(run, TimelineEventKind.RunFailed, ActorKind.System, "oratorio/worktree", "Managed worktree preparation failed", message, now);
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkDispatchingAsync(string runId, string endpoint, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.Status = RunStatus.Dispatching;
        run.ProgressPercent = Math.Max(run.ProgressPercent, 20);
        run.StatusMessage = "Connecting to DotCraft AppServer.";
        run.LastHeartbeatAt = now;
        run.Item!.State = ItemState.Dispatching;
        run.Item.CheckState = CheckState.Pending;
        run.Item.UpdatedAt = now;
        AddTimeline(run, TimelineEventKind.RunStarted, ActorKind.Agent, "DotCraft", "Connecting to DotCraft AppServer", endpoint, now);
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkThreadCreatedAsync(string runId, string threadId, string contextJson, string endpoint, string? reason, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.ThreadId = threadId;
        run.AppServerEndpoint = endpoint;
        run.PromptContextJson = contextJson;
        run.Round!.PromptContextJson = contextJson;
        run.ProgressPercent = Math.Max(run.ProgressPercent, 30);
        run.StatusMessage = "DotCraft thread created.";
        run.LastHeartbeatAt = now;
        var body = string.IsNullOrWhiteSpace(reason) ? ShortId(threadId) : $"{threadId} ({reason})";
        AddTimeline(run, TimelineEventKind.RunStarted, ActorKind.Agent, "DotCraft", "DotCraft thread created", body, now);
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkThreadReusedAsync(string runId, AppServerThreadReuseCandidate candidate, string contextJson, string endpoint, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.ThreadId = candidate.ThreadId;
        run.AppServerEndpoint = endpoint;
        run.PromptContextJson = contextJson;
        run.Round!.PromptContextJson = contextJson;
        run.ProgressPercent = Math.Max(run.ProgressPercent, 30);
        run.StatusMessage = "DotCraft thread reused.";
        run.LastHeartbeatAt = now;
        AddTimeline(run, TimelineEventKind.RunStarted, ActorKind.Agent, "DotCraft", "DotCraft thread reused", $"{candidate.ThreadId} reused from run {ShortId(candidate.RunId)} with matching workspace and dynamic tools.", now);
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkRunningAsync(string runId, string threadId, string? turnId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.Status = RunStatus.Running;
        run.ThreadId = threadId;
        run.TurnId = turnId;
        run.ProgressPercent = Math.Max(run.ProgressPercent, 40);
        run.StatusMessage = "DotCraft turn is running.";
        run.LastHeartbeatAt = now;
        run.Item!.State = ItemState.Running;
        run.Item.UpdatedAt = now;
        AddTimeline(run, TimelineEventKind.RunStarted, ActorKind.Agent, "DotCraft", "Turn started", ShortId(turnId), now);
        await db.SaveChangesAsync(ct);
    }

    private async Task UpdateRunHeartbeatAsync(string runId, int progress, string message, string? turnId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await db.Runs.Include(x => x.Item).FirstOrDefaultAsync(x => x.RunId == runId, ct);
        if (run is null || !ActiveWorkerStatuses.Contains(run.Status))
        {
            return;
        }

        var now = clock.UtcNow;
        run.ProgressPercent = Math.Max(run.ProgressPercent, progress);
        run.StatusMessage = message;
        run.LastHeartbeatAt = now;
        if (!string.IsNullOrWhiteSpace(turnId))
        {
            run.TurnId = turnId;
        }

        if (run.Item is not null)
        {
            run.Item.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SucceedRunAsync(string runId, string summary, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        if (run.Purpose == RunPurpose.Implementation)
        {
            var drafts = scope.ServiceProvider.GetRequiredService<ImplementationDraftService>();
            try
            {
                summary = await drafts.CompleteRunDeliveryAsync(runId, summary, ct);
            }
            catch (OratorioApiException ex)
            {
                FailRun(run, clock.UtcNow, RunStatus.Failed, ex.Code, ex.Message, allowRetry: false);
                await RecordFailedReviewGateAsync(scope, run, ct);
                await db.SaveChangesAsync(ct);
                return;
            }
        }

        if (RequiresReviewDraft(run))
        {
            var drafts = scope.ServiceProvider.GetRequiredService<ReviewDraftService>();
            if (!await drafts.RunHasDraftAsync(runId, ct))
            {
                FailRun(
                    run,
                    clock.UtcNow,
                    RunStatus.Failed,
                    "reviewDraftRequired",
                    "Source review runs must submit oratorio.SubmitReviewDraft before completing.",
                    allowRetry: false);
                await RecordFailedReviewGateAsync(scope, run, ct);
                await db.SaveChangesAsync(ct);
                return;
            }
        }

        var now = clock.UtcNow;

        run.Status = RunStatus.Succeeded;
        run.CompletedAt = now;
        run.Summary = summary;
        run.ProgressPercent = 100;
        run.StatusMessage = run.Purpose == RunPurpose.Implementation ? "Implementation handoff is ready." : "DotCraft analysis is ready.";
        run.LastHeartbeatAt = now;
        run.LeaseOwner = null;
        run.LeaseAcquiredAt = null;
        if (run.WorktreeStatus == WorktreeStatus.Ready)
        {
            run.WorktreeStatus = WorktreeStatus.CleanupPending;
            run.WorktreeCleanupAfterAt = now + options.CurrentValue.SucceededWorktreeRetention;
        }

        run.Round!.Status = RoundStatus.AwaitingReview;
        run.Round.Summary = summary;
        run.Round.CompletedAt = now;

        run.Item!.State = ItemState.AwaitingReview;
        run.Item.CurrentRunId = null;
        run.Item.LatestSummary = summary;
        run.Item.CheckState = CheckState.Attention;
        run.Item.UpdatedAt = now;

        AddTimeline(run, TimelineEventKind.RunCompleted, ActorKind.Agent, "DotCraft", run.Purpose == RunPurpose.Implementation ? "Implementation handoff captured" : "Agent summary captured", summary, now);
        AddTimeline(run, TimelineEventKind.CheckUpdated, ActorKind.System, "oratorio/review", "Check waiting on review", "The DotCraft run completed and needs operator review.", now);
        await RecordCompletedReviewGateAsync(scope, run, ct);
        await db.SaveChangesAsync(ct);

        if (run.Purpose == RunPurpose.ReviewAnalysis)
        {
            var drafts = scope.ServiceProvider.GetRequiredService<ReviewDraftService>();
            await drafts.AutoPublishRunDraftsAsync(runId, ct);
        }
    }

    private async Task FailRunAsync(string runId, RunStatus status, string errorCode, string errorMessage, bool allowRetry, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await LoadRunAsync(db, runId, ct);
        if (IsTerminal(run.Status))
        {
            return;
        }

        FailRun(run, clock.UtcNow, status, errorCode, errorMessage, allowRetry);
        await RecordFailedReviewGateAsync(scope, run, ct);
        await db.SaveChangesAsync(ct);
    }

    private void FailRun(OratorioRun run, DateTimeOffset now, RunStatus status, string errorCode, string errorMessage, bool allowRetry)
    {
        var shouldRetry = allowRetry && ShouldRetry(run, status, errorCode);
        run.Status = status;
        run.CompletedAt = now;
        run.ErrorCode = errorCode;
        run.ErrorMessage = errorMessage;
        run.Summary = errorMessage;
        run.ProgressPercent = 100;
        run.StatusMessage = shouldRetry ? $"{errorMessage} Retrying after backoff." : errorMessage;
        run.LastHeartbeatAt = now;
        run.LeaseOwner = null;
        run.LeaseAcquiredAt = null;
        if (run.WorktreeStatus is WorktreeStatus.Ready or WorktreeStatus.Preparing)
        {
            run.WorktreeStatus = run.WorktreePath is null ? WorktreeStatus.Failed : WorktreeStatus.CleanupPending;
            run.WorktreeCleanupAfterAt = now + options.CurrentValue.FailedWorktreeRetention;
        }

        AddTimeline(run, TimelineEventKind.RunFailed, ActorKind.Agent, "DotCraft", status == RunStatus.TimedOut ? "AppServer timed out" : "AppServer failed", errorMessage, now);

        if (shouldRetry)
        {
            var retryRun = CreateRetryRun(run, now);
            run.Item!.Runs.Add(retryRun);
            run.Round!.Status = RoundStatus.Running;
            run.Item.State = ItemState.Dispatching;
            run.Item.CurrentRunId = retryRun.RunId;
            run.Item.CheckState = CheckState.Pending;
            run.Item.UpdatedAt = now;
            run.Item.TimelineEvents.Add(new OratorioTimelineEvent
            {
                ItemId = retryRun.ItemId,
                RoundId = retryRun.RoundId,
                RunId = retryRun.RunId,
                Kind = TimelineEventKind.RunQueued,
                ActorKind = ActorKind.System,
                ActorName = "oratorio/retry",
                Title = "Retry scheduled",
                Body = $"Attempt {retryRun.Attempt} will start after {retryRun.NextRetryAt:O}.",
                CreatedAt = now
            });
            return;
        }

        run.Round!.Status = RoundStatus.Failed;
        run.Round.Summary = errorMessage;
        run.Round.CompletedAt = now;

        run.Item!.State = ItemState.Failed;
        run.Item.CurrentRunId = null;
        run.Item.LatestSummary = errorMessage;
        run.Item.CheckState = CheckState.Failing;
        run.Item.UpdatedAt = now;

        AddTimeline(run, TimelineEventKind.CheckUpdated, ActorKind.System, "oratorio/review", "Check failed", errorMessage, now);
    }

    private OratorioRun CreateRetryRun(OratorioRun failedRun, DateTimeOffset now)
    {
        var retryCount = failedRun.RetryCount + 1;
        var delaySeconds = Math.Min(
            options.CurrentValue.MaxRetryBackoff.TotalSeconds,
            options.CurrentValue.RetryBackoff.TotalSeconds * Math.Pow(2, Math.Max(0, retryCount - 1)));
        return new OratorioRun
        {
            ItemId = failedRun.ItemId,
            RoundId = failedRun.RoundId,
            Attempt = failedRun.Attempt + 1,
            Status = RunStatus.Queued,
            RunnerKind = "appServer",
            StartedAt = now,
            ProgressPercent = 0,
            StatusMessage = "Retry queued after transient AppServer failure.",
            RetryCount = retryCount,
            NextRetryAt = now + TimeSpan.FromSeconds(delaySeconds),
            WorktreeStatus = WorktreeStatus.NotRequired,
            Purpose = failedRun.Purpose,
            DispatchTrigger = failedRun.DispatchTrigger,
            TargetHeadSha = failedRun.TargetHeadSha,
            DeliveryPolicy = failedRun.DeliveryPolicy,
            ImplementationTurnCount = failedRun.ImplementationTurnCount
        };
    }

    private static async Task RecordFailedReviewGatesAsync(IServiceScope scope, IEnumerable<OratorioRun> runs, CancellationToken ct)
    {
        var writes = scope.ServiceProvider.GetRequiredService<GitHubWriteService>();
        foreach (var run in runs)
        {
            await writes.RecordReviewGateRunFailedAsync(run, ct);
        }
    }

    private static async Task RecordFailedReviewGateAsync(IServiceScope scope, OratorioRun run, CancellationToken ct)
    {
        if (run.Item?.State != ItemState.Failed)
        {
            return;
        }

        var writes = scope.ServiceProvider.GetRequiredService<GitHubWriteService>();
        await writes.RecordReviewGateRunFailedAsync(run, ct);
    }

    private static async Task RecordCompletedReviewGateAsync(IServiceScope scope, OratorioRun run, CancellationToken ct)
    {
        if (run.Item?.State != ItemState.AwaitingReview)
        {
            return;
        }

        var writes = scope.ServiceProvider.GetRequiredService<GitHubWriteService>();
        await writes.RecordReviewGateRunCompletedAsync(run, ct);
    }

    private static bool RequiresReviewDraft(OratorioRun run) =>
        run.Purpose == RunPurpose.ReviewAnalysis &&
        run.Item?.Source is "github" or "gitlab" &&
        run.Item.Kind == ItemKind.PullRequest &&
        run.RunnerKind == "appServer";

    private bool ShouldRetry(OratorioRun run, RunStatus status, string errorCode)
    {
        if (run.Attempt >= options.CurrentValue.EffectiveMaxRunAttempts)
        {
            return false;
        }

        return status == RunStatus.TimedOut ||
            errorCode is "appServerDisconnected" or "appServerFailed" or "appServerTimedOut" or "appServerStalled" or "gitCommandFailed";
    }

    private static bool IsTransientPreparationError(string code) =>
        code is "gitCommandFailed";

    private async Task ConsumeNotificationsAsync(string runId, IDotCraftAppServerClient client, string threadId, CancellationToken ct)
    {
        var summary = new StringBuilder();
        await foreach (var notification in client.ReadNotificationsAsync(ct))
        {
            if (notification.Method is "initialized" or "thread/started")
            {
                continue;
            }

            if (notification.Method == "turn/started")
            {
                var turnId = ExtractString(notification.Params, "turnId")
                    ?? ExtractNestedString(notification.Params, "turn", "id");
                runCoordinator.UpdateRunStatus(runId, turnId, "running");
                PublishRunStatus(runId, "running", turnId, null, null, 45, "DotCraft turn started.");
                await UpdateRunHeartbeatAsync(runId, 45, "DotCraft turn started.", turnId, ct);
                continue;
            }

            if (notification.Method == "item/started")
            {
                PublishItemSnapshot(runId, DrawerEvent.ItemStartedType, notification.Params, streaming: true);
                await UpdateRunHeartbeatAsync(runId, 55, "DotCraft item started.", null, ct);
                continue;
            }

            if (notification.Method.EndsWith("/delta", StringComparison.OrdinalIgnoreCase) ||
                notification.Method.EndsWith("Delta", StringComparison.OrdinalIgnoreCase))
            {
                var delta = ExtractDelta(notification.Params);
                if (!string.IsNullOrWhiteSpace(delta) && notification.Method.Contains("agentMessage", StringComparison.OrdinalIgnoreCase))
                {
                    summary.Append(delta);
                }

                if (!string.IsNullOrEmpty(delta))
                {
                    PublishItemDelta(runId, notification.Method, notification.Params, delta);
                }

                await UpdateRunHeartbeatAsync(runId, 65, "DotCraft agent is producing output.", null, ct);
                continue;
            }

            if (notification.Method == "item/completed")
            {
                PublishItemSnapshot(runId, DrawerEvent.ItemCompletedType, notification.Params, streaming: false);
                var text = ExtractText(notification.Params);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    summary.AppendLine(text);
                }

                await UpdateRunHeartbeatAsync(runId, 82, "DotCraft item completed.", null, ct);
                continue;
            }

            if (notification.Method == "turn/completed")
            {
                runCoordinator.UpdateRunStatus(runId, null, "completed");
                PublishRunStatus(runId, "completed", null, null, null, 100, "DotCraft turn completed.");
                var text = summary.ToString().Trim();
                if (string.IsNullOrWhiteSpace(text))
                {
                    text = ExtractText(notification.Params);
                }

                if (await TryContinueImplementationRunAsync(runId, client, threadId, ct))
                {
                    summary.Clear();
                    continue;
                }

                await SucceedRunAsync(runId, string.IsNullOrWhiteSpace(text) ? "DotCraft analysis completed." : text.Trim(), ct);
                return;
            }

            if (notification.Method == "turn/failed")
            {
                runCoordinator.UpdateRunStatus(runId, null, "failed");
                PublishRunStatus(runId, "failed", null, "appServerTurnFailed", ExtractText(notification.Params), 100, "DotCraft turn failed.");
                await FailRunAsync(runId, RunStatus.Failed, "appServerTurnFailed", ExtractText(notification.Params) ?? "DotCraft turn failed.", allowRetry: false, ct);
                return;
            }

            if (notification.Method == "turn/cancelled")
            {
                runCoordinator.UpdateRunStatus(runId, null, "cancelled");
                PublishRunStatus(runId, "cancelled", null, "appServerTurnCancelled", "DotCraft turn was cancelled.", 100, "DotCraft turn was cancelled.");
                await FailRunAsync(runId, RunStatus.Failed, "appServerTurnCancelled", "DotCraft turn was cancelled.", allowRetry: false, ct);
                return;
            }

            if (notification.Method == "plan/updated")
            {
                PublishPlan(runId, notification.Params);
                continue;
            }
        }

        await FailRunAsync(runId, RunStatus.Failed, "appServerDisconnected", "DotCraft AppServer disconnected before the run completed.", allowRetry: true, ct);
    }

    private void PublishItemSnapshot(string runId, string eventType, JsonElement parameters, bool streaming)
    {
        try
        {
            var item = parameters.TryGetProperty("item", out var itemElement) ? itemElement : parameters;
            var itemId = ExtractString(item, "id") ?? ExtractString(item, "itemId");
            if (string.IsNullOrWhiteSpace(itemId))
            {
                return;
            }

            var itemType = ExtractString(item, "type") ?? "unknown";
            var rawPayload = item.TryGetProperty("payload", out var payloadElement)
                ? payloadElement
                : item;
            var payload = DrawerPayloadSanitizer.SafeClonePayload(itemType, rawPayload, out var payloadError);
            if (payloadError is not null)
            {
                logger.LogWarning(
                    payloadError,
                    "AppServer drawer item payload could not be cloned for run {RunId}, item {ItemId}, type {ItemType}; using placeholder payload.",
                    runId,
                    itemId,
                    itemType);
            }

            var snapshot = new ConversationItemDto(
                itemId,
                ExtractString(item, "turnId") ?? ExtractString(parameters, "turnId"),
                itemType,
                ExtractString(item, "status") ?? (streaming ? "started" : "completed"),
                payload,
                ExtractDateTimeOffset(item, "createdAt"),
                ExtractDateTimeOffset(item, "completedAt"),
                streaming);
            var timestamp = snapshot.CompletedAt ?? snapshot.CreatedAt ?? clock.UtcNow;
            var updated = drawerState.UpsertItem(runId, snapshot, timestamp);
            boardEvents.PublishDrawer(runId, new DrawerEvent(
                eventType,
                runId,
                null,
                null,
                SerializeDrawerItemPayload(runId, itemId, updated),
                timestamp));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "AppServer drawer item snapshot publish failed for run {RunId}; continuing the AppServer run.", runId);
        }
    }

    private void PublishItemDelta(string runId, string method, JsonElement parameters, string delta)
    {
        try
        {
            var itemId = ExtractString(parameters, "itemId");
            if (string.IsNullOrWhiteSpace(itemId))
            {
                return;
            }

            var itemType = method.Contains("agentMessage", StringComparison.OrdinalIgnoreCase)
                ? "agentMessage"
                : method.Contains("reasoning", StringComparison.OrdinalIgnoreCase)
                    ? "reasoningContent"
                    : method.Contains("commandExecution", StringComparison.OrdinalIgnoreCase)
                        ? "commandExecution"
                        : method.Contains("toolCall", StringComparison.OrdinalIgnoreCase)
                            ? "toolCall"
                            : "unknown";
            var deltaKind = ExtractString(parameters, "deltaKind") ?? itemType;
            var timestamp = clock.UtcNow;
            var updated = drawerState.AppendDelta(
                runId,
                itemId,
                ExtractString(parameters, "turnId"),
                itemType,
                deltaKind,
                delta,
                timestamp);
            boardEvents.PublishDrawer(runId, new DrawerEvent(
                DrawerEvent.ItemDeltaType,
                runId,
                null,
                null,
                SerializeDrawerItemPayload(runId, itemId, updated),
                timestamp));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "AppServer drawer item delta publish failed for run {RunId}; continuing the AppServer run.", runId);
        }
    }

    private JsonElement SerializeDrawerItemPayload(string runId, string itemId, ConversationItemDto item)
    {
        try
        {
            return JsonSerializer.SerializeToElement(item, JsonOptions);
        }
        catch (Exception ex) when (DrawerPayloadSanitizer.IsPayloadException(ex))
        {
            logger.LogWarning(
                ex,
                "AppServer drawer item payload could not be serialized for run {RunId}, item {ItemId}, type {ItemType}; using placeholder payload.",
                runId,
                itemId,
                item.Type);
            var fallback = item with { Payload = DrawerPayloadSanitizer.CreateUnavailablePayload(item.Type) };
            return JsonSerializer.SerializeToElement(fallback, JsonOptions);
        }
    }

    private void PublishPlan(string runId, JsonElement parameters)
    {
        var todos = new List<PlanTodoDto>();
        if (parameters.TryGetProperty("todos", out var todosElement) && todosElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var todo in todosElement.EnumerateArray())
            {
                todos.Add(new PlanTodoDto(
                    ExtractString(todo, "id") ?? Guid.NewGuid().ToString("n"),
                    ExtractString(todo, "content") ?? "",
                    ExtractString(todo, "priority") ?? "medium",
                    ExtractString(todo, "status") ?? "pending"));
            }
        }

        var plan = new PlanSnapshotDto(
            ExtractString(parameters, "title"),
            ExtractString(parameters, "overview"),
            ExtractString(parameters, "content"),
            todos);
        var timestamp = clock.UtcNow;
        drawerState.ReplacePlan(runId, plan, timestamp);
        boardEvents.PublishDrawer(runId, new DrawerEvent(
            DrawerEvent.PlanUpdatedType,
            runId,
            null,
            null,
            JsonSerializer.SerializeToElement(plan, JsonOptions),
            timestamp));
    }

    private void PublishRunStatus(
        string runId,
        string turnStatus,
        string? turnId,
        string? errorCode,
        string? errorMessage,
        int progress,
        string statusMessage)
    {
        var timestamp = clock.UtcNow;
        var summary = new RunSummaryDto(
            runId,
            turnStatus == "running" ? RunStatus.Running.ToString() : turnStatus,
            null,
            turnId,
            turnStatus,
            errorCode,
            errorMessage,
            progress,
            statusMessage,
            timestamp);
        drawerState.UpdateRunStatus(runId, summary, timestamp);
        boardEvents.PublishDrawer(runId, new DrawerEvent(
            DrawerEvent.RunStatusType,
            runId,
            null,
            null,
            JsonSerializer.SerializeToElement(summary, JsonOptions),
            timestamp));
    }

    private async Task<bool> TryContinueImplementationRunAsync(string runId, IDotCraftAppServerClient client, string threadId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OratorioDbContext>();
        var run = await db.Runs.FirstOrDefaultAsync(x => x.RunId == runId, ct);
        if (run is null || run.Purpose != RunPurpose.Implementation || IsTerminal(run.Status))
        {
            return false;
        }

        var drafts = scope.ServiceProvider.GetRequiredService<ImplementationDraftService>();
        if (await drafts.RunHasDraftAsync(runId, ct))
        {
            return false;
        }

        var maxTurns = automationOptions.CurrentValue.EffectiveMaxImplementationTurns;
        run.ImplementationTurnCount++;
        if (run.ImplementationTurnCount >= maxTurns)
        {
            await db.SaveChangesAsync(ct);
            return false;
        }

        var now = clock.UtcNow;
        run.StatusMessage = $"No implementation draft submitted. Continuing turn {run.ImplementationTurnCount + 1} of {maxTurns}.";
        run.LastHeartbeatAt = now;
        await db.SaveChangesAsync(ct);

        var prompt = "Continue the implementation round using the Oratorio implementation runtime context. If you are blocked, record the blocker in the implementation draft risks.";
        var nextTurnId = await client.StartTurnAsync(threadId, prompt, ct);
        runCoordinator.UpdateRunStatus(runId, nextTurnId, "running");
        await MarkRunningAsync(runId, threadId, nextTurnId, ct);
        return true;
    }

    private static async Task<OratorioRun> LoadRunAsync(OratorioDbContext db, string runId, CancellationToken ct) =>
        await db.Runs
            .Include(x => x.Item)
            .ThenInclude(x => x!.Runs)
            .Include(x => x.Item)
            .ThenInclude(x => x!.TimelineEvents)
            .Include(x => x.Round)
            .FirstAsync(x => x.RunId == runId, ct);

    private static void AddTimeline(OratorioRun run, TimelineEventKind kind, ActorKind actorKind, string actorName, string title, string? body, DateTimeOffset createdAt)
    {
        run.Item!.TimelineEvents.Add(new OratorioTimelineEvent
        {
            ItemId = run.ItemId,
            RoundId = run.RoundId,
            RunId = run.RunId,
            Kind = kind,
            ActorKind = actorKind,
            ActorName = actorName,
            Title = title,
            Body = body,
            CreatedAt = createdAt
        });
    }

    private static string RepositoryKey(string? repository) =>
        string.IsNullOrWhiteSpace(repository) ? "(none)" : repository;

    private static string SourceKey(string? source) =>
        string.IsNullOrWhiteSpace(source) ? "(none)" : source;

    private static bool IsTerminal(RunStatus status) =>
        status is RunStatus.Succeeded or RunStatus.Failed or RunStatus.Cancelled or RunStatus.TimedOut;

    private static string? ResolveReviewTargetFetchRef(OratorioRun run)
    {
        var item = run.Item;
        if (run.Purpose != RunPurpose.ReviewAnalysis ||
            item is null ||
            item.Kind != ItemKind.PullRequest ||
            string.IsNullOrWhiteSpace(item.HeadSha))
        {
            return null;
        }

        if (item.Source == "github" && TryParseSourceNumber(item.ExternalId, '#', out var pullRequestNumber))
        {
            return $"refs/pull/{pullRequestNumber}/head";
        }

        if (item.Source == "gitlab" && TryParseSourceNumber(item.ExternalId, '!', out var mergeRequestIid))
        {
            return $"refs/merge-requests/{mergeRequestIid}/head";
        }

        return null;
    }

    private static bool TryParseSourceNumber(string externalId, char marker, out int number)
    {
        number = 0;
        var index = externalId.LastIndexOf(marker);
        return index >= 0 && int.TryParse(externalId[(index + 1)..], out number);
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

    private static bool TryGetProperty(JsonElement element, string camelName, string pascalName, out JsonElement property)
    {
        if (element.TryGetProperty(camelName, out property))
        {
            return true;
        }

        return element.TryGetProperty(pascalName, out property);
    }

    private static string? ExtractString(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
    }

    private static string? ExtractNestedString(JsonElement element, string container, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(container, out var nested))
        {
            return null;
        }

        return ExtractString(nested, propertyName);
    }

    private static string? ExtractDelta(JsonElement element) =>
        ExtractString(element, "delta")
        ?? ExtractString(element, "textDelta")
        ?? ExtractNestedString(element, "delta", "text")
        ?? ExtractNestedString(element, "content", "text");

    private static string? ExtractText(JsonElement element) =>
        ExtractString(element, "message")
        ?? ExtractString(element, "text")
        ?? ExtractString(element, "summary")
        ?? ExtractNestedString(element, "error", "message")
        ?? ExtractNestedString(element, "turn", "summary")
        ?? ExtractNestedString(element, "item", "text");

    private static DateTimeOffset? ExtractDateTimeOffset(JsonElement element, string propertyName)
    {
        var value = ExtractString(element, propertyName);
        return DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;
    }

    private static string? ShortId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= 12 ? value : value[..12];
    }
}

internal sealed record AppServerThreadReuseCandidate(string ThreadId, string RunId);
