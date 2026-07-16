using System.Text.Json;
using System.Text.Json.Serialization;
using DotCraft.Sdk.AppBinding;
using DotCraft.Sdk.Wire;
using Oratorio.Server.Api;
using SdkClient = DotCraft.Sdk.AppServer.DotCraftClient;
using SdkClientOptions = DotCraft.Sdk.AppServer.DotCraftClientOptions;
using SdkDynamicToolCall = DotCraft.Sdk.AppServer.DynamicToolCall;
using SdkDynamicToolResult = DotCraft.Sdk.AppServer.DynamicToolResult;
using SdkDynamicToolDeclaration = DotCraft.Sdk.AppServer.RuntimeDynamicToolDeclaration;
using SdkDynamicToolFunction = DotCraft.Sdk.AppServer.RuntimeDynamicToolFunction;
using SdkDynamicToolNamespace = DotCraft.Sdk.AppServer.RuntimeDynamicToolNamespace;
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
    DotCraftAppBindingClient AppBindings { get; }
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
    AppServerToolApprovalDescriptor? Approval = null,
    [property: JsonPropertyName("_meta")] AppServerDynamicToolMeta? Meta = null);

/// <summary>
/// Historical metadata retained only for Runtime Dynamic result deserialization.
/// </summary>
public sealed record AppServerDynamicToolMeta(
    AppServerDynamicToolUiMeta? Ui = null);

/// <summary>
/// Historical UI descriptor retained only at the read boundary.
/// </summary>
public sealed record AppServerDynamicToolUiMeta(
    string ResourceUri,
    IReadOnlyList<string>? Visibility = null,
    bool? PrefersBorder = null);

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
    string? ErrorMessage = null,
    object? Meta = null);

public sealed record AppServerToolContentItem(string Type, string Text);

public sealed record AppServerNotification(string Method, JsonElement Params);

public sealed record AppServerThreadReadResult(string ThreadId, IReadOnlyList<ConversationItemDto> Items);

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

    public DotCraftAppBindingClient AppBindings => client.AppBindings;

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

    private static IReadOnlyList<SdkDynamicToolDeclaration>? ToSdkTools(IReadOnlyList<AppServerDynamicToolSpec>? tools)
    {
        if (tools is null)
            return null;

        var declarations = tools
            .Where(tool => string.IsNullOrWhiteSpace(tool.Namespace))
            .Select(tool => (SdkDynamicToolDeclaration)ToSdkTool(tool))
            .ToList();
        declarations.AddRange(tools
            .Where(tool => !string.IsNullOrWhiteSpace(tool.Namespace))
            .GroupBy(tool => tool.Namespace!, StringComparer.Ordinal)
            .Select(group => (SdkDynamicToolDeclaration)new SdkDynamicToolNamespace(
                group.Key,
                group.Key == "oratorio_run"
                    ? "Run-specific Oratorio callbacks for the active project workflow."
                    : $"Oratorio tools in the {group.Key} namespace.",
                group.Select(tool => (SdkDynamicToolDeclaration)ToSdkTool(tool)).ToArray())));
        return declarations;
    }

    private static IReadOnlyDictionary<string, SdkRuntimeAdditionalContextEntry>? ToSdkAdditionalContext(
        IReadOnlyDictionary<string, AppServerRuntimeAdditionalContextEntry>? additionalContext) =>
        additionalContext?.ToDictionary(
            entry => entry.Key,
            entry => new SdkRuntimeAdditionalContextEntry(entry.Value.Value, entry.Value.Kind),
            StringComparer.Ordinal);

    private static SdkDynamicToolFunction ToSdkTool(AppServerDynamicToolSpec tool) =>
        new(
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
