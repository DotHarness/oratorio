using System.Text.Json;
using DotCraft.Sdk.Wire;
using Oratorio.Server.Api;
using SdkClient = DotCraft.Sdk.AppServer.DotCraftClient;
using SdkClientOptions = DotCraft.Sdk.AppServer.DotCraftClientOptions;
using SdkDynamicToolCall = DotCraft.Sdk.AppServer.DynamicToolCall;
using SdkDynamicToolResult = DotCraft.Sdk.AppServer.DynamicToolResult;
using SdkDynamicToolSpec = DotCraft.Sdk.AppServer.DynamicToolSpec;
using SdkSessionIdentity = DotCraft.Sdk.AppServer.SessionIdentity;
using SdkThreadResumeRequest = DotCraft.Sdk.AppServer.DotCraftThreadResumeRequest;
using SdkThreadStartRequest = DotCraft.Sdk.AppServer.DotCraftThreadStartRequest;
using SdkToolApprovalDescriptor = DotCraft.Sdk.AppServer.ToolApprovalDescriptor;
using SdkToolContentItem = DotCraft.Sdk.AppServer.ToolContentItem;
using SdkTurnInputPart = DotCraft.Sdk.AppServer.TurnInputPart;
using SdkRuntimeAdditionalContextEntry = DotCraft.Sdk.AppServer.RuntimeAdditionalContextEntry;

namespace Oratorio.Server.DotCraft;

public interface IDotCraftAppServerClientFactory
{
    Task<IDotCraftAppServerClient> ConnectAsync(string appServerUrl, CancellationToken ct, string? token = null);
}

public interface IDotCraftAppServerClient : IAsyncDisposable
{
    bool SupportsDynamicToolRebind { get; }
    bool SupportsRuntimeAdditionalContext { get; }
    Task InitializeAsync(CancellationToken ct);
    void SetDynamicToolHandler(Func<AppServerDynamicToolCall, CancellationToken, Task<AppServerDynamicToolResult>> handler);
    Task<string> StartThreadAsync(AppServerThreadStartRequest request, CancellationToken ct);
    Task ResumeThreadAsync(
        string threadId,
        IReadOnlyList<AppServerDynamicToolSpec>? dynamicTools,
        IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry>? runtimeAdditionalContext,
        CancellationToken ct);
    Task SubscribeThreadAsync(string threadId, CancellationToken ct);
    Task<string?> StartTurnAsync(string threadId, string prompt, CancellationToken ct);
    Task<string?> StartTurnAsync(string threadId, IReadOnlyList<TurnInputPartDto> input, string? modelId, CancellationToken ct);
    Task<string?> EnqueueTurnAsync(string threadId, IReadOnlyList<TurnInputPartDto> input, CancellationToken ct);
    Task InterruptTurnAsync(string threadId, string turnId, CancellationToken ct);
    Task<AppServerThreadReadResult> ReadThreadAsync(string threadId, CancellationToken ct);
    Task<IReadOnlyList<ModelInfoDto>> ListModelsAsync(CancellationToken ct);
    Task<AppBindingConnectionRequestInfo> GetAppConnectionRequestAsync(AppBindingConnectionRequestGetRequest request, CancellationToken ct);
    Task<AppBindingConnectionStatus> GetAppConnectionStatusAsync(AppBindingConnectionStatusRequest request, CancellationToken ct);
    Task<AppBindingConnectionStatus> CompleteAppConnectionAsync(AppBindingConnectionConnectRequest request, CancellationToken ct);
    Task<AppBindingRequestInfo> GetAppBindingRequestAsync(AppBindingRequestGetRequest request, CancellationToken ct);
    Task<AppBindingAcceptResponse> AcceptAppBindingAsync(AppBindingAcceptRequest request, CancellationToken ct);
    Task<AppBindingAttachToolsResponse> AttachAppBindingToolsAsync(AppBindingAttachToolsRequest request, CancellationToken ct);
    Task<AppBindingContextBlockUpsertResponse> UpsertAppBindingContextBlockAsync(AppBindingContextBlockUpsertRequest request, CancellationToken ct);
    IAsyncEnumerable<AppServerNotification> ReadNotificationsAsync(CancellationToken ct);
}

public sealed record AppServerThreadStartRequest(
    string DisplayName,
    string WorkspacePath,
    string ApprovalPolicy,
    string AgentInstructions,
    IReadOnlyList<AppServerDynamicToolSpec>? DynamicTools = null,
    IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry>? RuntimeAdditionalContext = null);

public sealed record AppServerThreadResumeRequest(
    string ThreadId,
    IReadOnlyList<AppServerDynamicToolSpec>? DynamicTools = null,
    IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry>? RuntimeAdditionalContext = null);

public sealed record AppServerRuntimeAdditionalContextEntry(
    string Value,
    string Kind = "application");

public sealed record AppServerDynamicToolSpec(
    string? Namespace,
    string Name,
    string Description,
    JsonElement InputSchema,
    bool DeferLoading = false,
    AppServerToolApprovalDescriptor? Approval = null);

public sealed record AppServerToolApprovalDescriptor(
    string Kind,
    string TargetArgument,
    string? Operation = null,
    string? OperationArgument = null);

public sealed record AppServerDynamicToolCall(
    string ThreadId,
    string? TurnId,
    string? CallId,
    string? Namespace,
    string Tool,
    JsonElement Arguments);

public sealed record AppServerDynamicToolResult(
    bool Success,
    IReadOnlyList<AppServerToolContentItem>? ContentItems = null,
    object? StructuredResult = null,
    string? ErrorCode = null,
    string? ErrorMessage = null);

public sealed record AppServerToolContentItem(string Type, string Text);

public sealed record AppServerNotification(string Method, JsonElement Params);

public sealed record AppServerThreadReadResult(string ThreadId, IReadOnlyList<ConversationItemDto> Items);

public sealed record AppBindingConnectionRequestGetRequest(
    string AppId,
    string ConnectionRequestId,
    string RequestToken);

public sealed record AppBindingConnectionRequestInfo(
    string AppId,
    string ConnectionRequestId,
    string DisplayName,
    string DeveloperName,
    string WorkspaceLabel,
    string UserLabel,
    DateTimeOffset ExpiresAt);

public sealed record AppBindingConnectionConnectRequest(
    string ConnectionRequestId,
    string RequestToken,
    string AppId,
    string? AccountLabel = null,
    DateTimeOffset? ExpiresAt = null,
    object? ConnectionProof = null);

public sealed record AppBindingConnectionStatusRequest(string AppId);

public sealed record AppBindingConnectionStatus(
    string AppId,
    string State,
    DateTimeOffset? ConnectedAt = null,
    DateTimeOffset? ExpiresAt = null,
    string? AccountLabel = null,
    string? Diagnostic = null);

public sealed record AppBindingRequestGetRequest(
    string AppId,
    string BindingRequestId,
    string RequestToken);

public sealed record AppBindingRequestInfo(
    string AppId,
    string BindingRequestId,
    string ThreadId,
    string DisplayName,
    string DeveloperName,
    string Source,
    IReadOnlyList<string> RequestedScopes,
    IReadOnlyList<AppBindingScopeInfo> ScopeCatalog,
    IReadOnlyList<string> RequestedTools,
    IReadOnlyList<AppBindingToolInfo> ToolCatalog,
    DateTimeOffset ExpiresAt,
    string? ThreadTitle = null,
    string? Reason = null);

public sealed record AppBindingScopeInfo(
    string Id,
    string DisplayName,
    string Description,
    string Risk,
    bool? DefaultSelected = null);

public sealed record AppBindingToolInfo(
    string Name,
    string Scope,
    string Risk,
    string DefaultExposure,
    string? Description = null);

public sealed record AppBindingAcceptRequest(
    string BindingRequestId,
    string RequestToken,
    string GrantId,
    IReadOnlyList<string> GrantedScopes,
    DateTimeOffset? ExpiresAt = null,
    string ApprovalMode = "appAccepted",
    string? ApprovedBy = null,
    string? AuditRef = null);

public sealed record AppBindingAcceptResponse(AppBindingWire Binding);

public sealed record AppBindingAttachToolsRequest(
    string BindingId,
    string ThreadId,
    string AppId,
    string GrantId,
    IReadOnlyList<AppServerDynamicToolSpec> Tools,
    IReadOnlyList<string>? DirectToolNames = null,
    IReadOnlyList<string>? DeferredToolNames = null,
    object? GrantProof = null);

public sealed record AppBindingAttachToolsResponse(
    AppBindingWire Binding,
    int AcceptedToolCount,
    IReadOnlyList<string> Warnings);

public sealed record AppBindingContextBlockUpsertRequest(
    string BindingId,
    string AppId,
    string GrantId,
    string BlockId,
    string Kind,
    string Title,
    string Content,
    int Order,
    string Version,
    DateTimeOffset? ExpiresAt = null,
    string? Visibility = null);

public sealed record AppBindingContextBlockUpsertResponse(JsonElement Block);

public sealed record AppBindingWire(
    string BindingId,
    string ThreadId,
    string AppId,
    string State,
    string ConnectionState,
    IReadOnlyList<string> GrantedScopes,
    int AttachedToolCount,
    DateTimeOffset LastChangedAt,
    string? DisplayName = null,
    string? ToolNamespace = null,
    DateTimeOffset? ExpiresAt = null,
    string? ApprovalMode = null,
    string? AuditRef = null,
    string? Diagnostic = null);

public sealed class DotCraftAppServerClientFactory : IDotCraftAppServerClientFactory
{
    public async Task<IDotCraftAppServerClient> ConnectAsync(string appServerUrl, CancellationToken ct, string? token = null)
    {
        var client = await SdkClient.ConnectRemoteAsync(
            appServerUrl,
            token,
            new SdkClientOptions
            {
                ClientName = "oratorio",
                ClientVersion = "0.4",
                ApprovalSupport = true,
                StreamingSupport = true
            },
            ct);
        return new DotCraftAppServerClient(client);
    }
}

public sealed class DotCraftAppServerClient(SdkClient client) : IDotCraftAppServerClient
{
    private IDisposable? _dynamicToolRegistration;

    public bool SupportsDynamicToolRebind => client.Capabilities.DynamicToolRebind;

    public bool SupportsRuntimeAdditionalContext => client.Capabilities.RuntimeAdditionalContext;

    public Task InitializeAsync(CancellationToken ct) => Task.CompletedTask;

    public void SetDynamicToolHandler(Func<AppServerDynamicToolCall, CancellationToken, Task<AppServerDynamicToolResult>> handler)
    {
        _dynamicToolRegistration?.Dispose();
        _dynamicToolRegistration = client.RegisterDynamicToolHandler(async (call, handlerCt) =>
            ToSdkResult(await handler(ToOratorioCall(call), handlerCt)));
    }

    public async Task<string> StartThreadAsync(AppServerThreadStartRequest request, CancellationToken ct)
    {
        var thread = await client.Threads.StartAsync(new SdkThreadStartRequest(
            new SdkSessionIdentity(
                "oratorio",
                "operator",
                request.WorkspacePath,
                "oratorio:dotcraft-bridge"),
            request.DisplayName,
            "none",
            new
            {
                mode = "agent",
                workspaceOverride = request.WorkspacePath,
                approvalPolicy = request.ApprovalPolicy,
                requireApprovalOutsideWorkspace = true,
                agentInstructions = request.AgentInstructions
            },
            ToSdkTools(request.DynamicTools),
            ToSdkAdditionalContext(request.RuntimeAdditionalContext)),
            ct);
        return thread.Id;
    }

    public async Task ResumeThreadAsync(
        string threadId,
        IReadOnlyList<AppServerDynamicToolSpec>? dynamicTools,
        IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry>? runtimeAdditionalContext,
        CancellationToken ct)
    {
        await client.Threads.ResumeAsync(new SdkThreadResumeRequest(
            threadId,
            ToSdkTools(dynamicTools),
            ToSdkAdditionalContext(runtimeAdditionalContext)),
            ct);
    }

    public Task SubscribeThreadAsync(string threadId, CancellationToken ct) =>
        client.Threads.SubscribeAsync(threadId, cancellationToken: ct);

    public Task<string?> StartTurnAsync(string threadId, string prompt, CancellationToken ct) =>
        StartTurnAsync(
            threadId,
            [new TurnInputPartDto("text", prompt, null, null, null, null, null, null)],
            modelId: null,
            ct);

    public async Task<string?> StartTurnAsync(string threadId, IReadOnlyList<TurnInputPartDto> input, string? modelId, CancellationToken ct)
    {
        var result = await client.Turns.StartAsync(threadId, NormalizeInput(input), modelId: modelId, cancellationToken: ct);
        return result.TurnId;
    }

    public async Task<string?> EnqueueTurnAsync(string threadId, IReadOnlyList<TurnInputPartDto> input, CancellationToken ct)
    {
        var result = await client.Turns.EnqueueAsync(threadId, NormalizeInput(input), cancellationToken: ct);
        return result.QueuedInputId;
    }

    public Task InterruptTurnAsync(string threadId, string turnId, CancellationToken ct) =>
        client.Turns.InterruptAsync(threadId, turnId, ct);

    public async Task<AppServerThreadReadResult> ReadThreadAsync(string threadId, CancellationToken ct)
    {
        var read = await client.Threads.ReadAsync(threadId, includeTurns: true, cancellationToken: ct);
        var thread = read.Thread;
        var items = new List<ConversationItemDto>();
        if (thread.ValueKind == JsonValueKind.Object &&
            thread.TryGetProperty("turns", out var turnsElement) &&
            turnsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var turn in turnsElement.EnumerateArray())
            {
                var turnId = ExtractString(turn, "id") ?? ExtractString(turn, "turnId");
                if (!turn.TryGetProperty("items", out var turnItems) || turnItems.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var item in turnItems.EnumerateArray())
                {
                    items.Add(ToConversationItem(item, turnId));
                }
            }
        }

        return new AppServerThreadReadResult(read.ThreadId, items);
    }

    public async Task<IReadOnlyList<ModelInfoDto>> ListModelsAsync(CancellationToken ct)
    {
        try
        {
            var models = await client.Models.ListAsync(ct);
            return models
                .Select(model => new ModelInfoDto(model.Id, model.DisplayName, model.Provider))
                .ToArray();
        }
        catch (JsonRpcException ex) when (ex.Code == -32601)
        {
            return [];
        }
    }

    public Task<AppBindingConnectionStatus> CompleteAppConnectionAsync(
        AppBindingConnectionConnectRequest request,
        CancellationToken ct) =>
        client.AppBindings.ConnectAsync<AppBindingConnectionStatus>(request, ct);

    public Task<AppBindingConnectionStatus> GetAppConnectionStatusAsync(
        AppBindingConnectionStatusRequest request,
        CancellationToken ct) =>
        client.AppBindings.GetConnectionStatusAsync<AppBindingConnectionStatus>(request, ct);

    public Task<AppBindingConnectionRequestInfo> GetAppConnectionRequestAsync(
        AppBindingConnectionRequestGetRequest request,
        CancellationToken ct) =>
        client.AppBindings.GetConnectionRequestAsync<AppBindingConnectionRequestInfo>(request, ct);

    public Task<AppBindingRequestInfo> GetAppBindingRequestAsync(
        AppBindingRequestGetRequest request,
        CancellationToken ct) =>
        client.AppBindings.GetBindingRequestAsync<AppBindingRequestInfo>(request, ct);

    public Task<AppBindingAcceptResponse> AcceptAppBindingAsync(
        AppBindingAcceptRequest request,
        CancellationToken ct) =>
        client.AppBindings.AcceptBindingAsync<AppBindingAcceptResponse>(request, ct);

    public Task<AppBindingAttachToolsResponse> AttachAppBindingToolsAsync(
        AppBindingAttachToolsRequest request,
        CancellationToken ct) =>
        client.AppBindings.AttachToolsAsync<AppBindingAttachToolsResponse>(
            request with { Tools = request.Tools },
            ct);

    public Task<AppBindingContextBlockUpsertResponse> UpsertAppBindingContextBlockAsync(
        AppBindingContextBlockUpsertRequest request,
        CancellationToken ct) =>
        client.RequestAsync<AppBindingContextBlockUpsertResponse>(
            "app/binding/context/upsert",
            request,
            ct);

    public async IAsyncEnumerable<AppServerNotification> ReadNotificationsAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await foreach (var notification in client.ReadNotificationsAsync(ct))
        {
            yield return new AppServerNotification(notification.Method, notification.Params);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _dynamicToolRegistration?.Dispose();
        await client.DisposeAsync();
    }

    private static IReadOnlyList<SdkDynamicToolSpec>? ToSdkTools(IReadOnlyList<AppServerDynamicToolSpec>? tools) =>
        tools?.Select(ToSdkTool).ToArray();

    private static IReadOnlyDictionary<string, SdkRuntimeAdditionalContextEntry>? ToSdkAdditionalContext(
        IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry>? additionalContext) =>
        additionalContext?.ToDictionary(
            entry => entry.Key,
            entry => new SdkRuntimeAdditionalContextEntry(entry.Value.Value, entry.Value.Kind),
            StringComparer.Ordinal);

    private static SdkDynamicToolSpec ToSdkTool(AppServerDynamicToolSpec tool) =>
        new(
            tool.Namespace,
            tool.Name,
            tool.Description,
            tool.InputSchema,
            tool.DeferLoading,
            tool.Approval is null
                ? null
                : new SdkToolApprovalDescriptor(
                    tool.Approval.Kind,
                    tool.Approval.TargetArgument,
                    tool.Approval.Operation,
                    tool.Approval.OperationArgument));

    private static IReadOnlyList<SdkTurnInputPart> NormalizeInput(IReadOnlyList<TurnInputPartDto> input) =>
        input
            .Where(part => !string.IsNullOrWhiteSpace(part.Type))
            .Select(part => new SdkTurnInputPart(
                part.Type,
                part.Text,
                part.Name,
                Path: part.Path,
                DisplayPath: part.DisplayPath,
                Url: part.Url,
                MimeType: part.MimeType,
                FileName: part.FileName))
            .ToArray();

    private static AppServerDynamicToolCall ToOratorioCall(SdkDynamicToolCall call) =>
        new(call.ThreadId, call.TurnId, call.CallId, call.Namespace, call.Tool, call.Arguments);

    private static SdkDynamicToolResult ToSdkResult(AppServerDynamicToolResult result) =>
        new(
            result.Success,
            result.ContentItems?.Select(item => new SdkToolContentItem(item.Type, item.Text)).ToArray(),
            result.StructuredResult,
            result.ErrorCode,
            result.ErrorMessage);

    private static ConversationItemDto ToConversationItem(JsonElement item, string? fallbackTurnId)
    {
        var id = ExtractString(item, "id") ?? ExtractString(item, "itemId") ?? Guid.NewGuid().ToString("n");
        var type = ExtractString(item, "type") ?? "unknown";
        var payload = item.TryGetProperty("payload", out var payloadElement)
            ? payloadElement.Clone()
            : item.Clone();
        return new ConversationItemDto(
            id,
            ExtractString(item, "turnId") ?? fallbackTurnId,
            type,
            ExtractString(item, "status") ?? "completed",
            payload,
            ExtractDateTimeOffset(item, "createdAt"),
            ExtractDateTimeOffset(item, "completedAt"),
            Streaming: false);
    }

    private static string? ExtractString(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
    }

    private static DateTimeOffset? ExtractDateTimeOffset(JsonElement element, string propertyName)
    {
        var value = ExtractString(element, propertyName);
        return DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;
    }
}
