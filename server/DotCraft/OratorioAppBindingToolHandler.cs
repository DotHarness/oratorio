using System.Text.Json;
using Oratorio.Server.Api;
using Oratorio.Server.Domain;
using Oratorio.Server.Services;

namespace Oratorio.Server.DotCraft;

public sealed record OratorioAppBindingGrantContext(
    string AppId,
    string BindingId,
    string ThreadId,
    string GrantId,
    IReadOnlySet<string> GrantedScopes);

public sealed class OratorioAppBindingToolHandler(OratorioService service)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<AppServerDynamicToolResult> HandleAsync(
        OratorioAppBindingGrantContext context,
        AppServerDynamicToolCall call,
        CancellationToken ct)
    {
        if (!string.Equals(context.AppId, AppServerDynamicToolCatalog.AppId, StringComparison.Ordinal))
        {
            return Failed("InvalidAppBinding", "The grant is not for the Oratorio App Binding app id.");
        }

        if (!string.Equals(call.ThreadId, context.ThreadId, StringComparison.Ordinal))
        {
            return Failed("InvalidAppBindingThread", "The tool call thread does not match this Oratorio grant.");
        }

        if (!string.Equals(call.Namespace, AppServerDynamicToolCatalog.Namespace, StringComparison.Ordinal))
        {
            return Failed("UnsupportedTool", "Only tools in the oratorio namespace are supported.");
        }

        try
        {
            return call.Tool switch
            {
                AppServerDynamicToolCatalog.ListBoardItemsName => await ListBoardItemsAsync(context, call.Arguments, ct),
                AppServerDynamicToolCatalog.GetBoardItemName => await GetBoardItemAsync(context, call.Arguments, ct),
                AppServerDynamicToolCatalog.CreateBoardTaskName => await CreateBoardTaskAsync(context, call.Arguments, ct),
                AppServerDynamicToolCatalog.QueueReviewRoundName => await QueueReviewRoundAsync(context, call.Arguments, ct),
                _ => Failed("UnsupportedTool", $"Unsupported Oratorio App Binding tool '{call.Tool}'.")
            };
        }
        catch (JsonException ex)
        {
            return Failed("InvalidArguments", ex.Message);
        }
        catch (OratorioApiException ex)
        {
            return Failed(ex.Code, ex.Message);
        }
    }

    private async Task<AppServerDynamicToolResult> ListBoardItemsAsync(
        OratorioAppBindingGrantContext context,
        JsonElement arguments,
        CancellationToken ct)
    {
        var scopeFailure = RequireScope(context, AppServerDynamicToolCatalog.BoardReadScope);
        if (scopeFailure is not null)
        {
            return scopeFailure;
        }

        var args = ReadArguments<ListBoardItemsArguments>(arguments);
        var result = await service.ListItemsAsync(
            state: args.State,
            source: args.Source,
            kind: null,
            repository: args.Repository,
            assignee: args.Assignee,
            q: args.Q,
            sort: null,
            includeArchived: args.IncludeArchived,
            limit: args.Limit,
            cursor: null,
            ct);
        return Succeeded(
            $"Found {result.Items.Count} Oratorio board item(s).",
            new
            {
                result.Items,
                result.NextCursor,
                context.BindingId,
                context.GrantId
            });
    }

    private async Task<AppServerDynamicToolResult> GetBoardItemAsync(
        OratorioAppBindingGrantContext context,
        JsonElement arguments,
        CancellationToken ct)
    {
        var scopeFailure = RequireScope(context, AppServerDynamicToolCatalog.BoardReadScope);
        if (scopeFailure is not null)
        {
            return scopeFailure;
        }

        var args = ReadArguments<ItemIdArguments>(arguments);
        RequireNonEmpty(args.ItemId, "itemId");
        var result = await service.GetTaskDetailAsync(args.ItemId!, ct);
        return Succeeded(
            $"Loaded Oratorio item '{result.Item.Title}'.",
            new
            {
                Detail = result,
                context.BindingId,
                context.GrantId
            });
    }

    private async Task<AppServerDynamicToolResult> CreateBoardTaskAsync(
        OratorioAppBindingGrantContext context,
        JsonElement arguments,
        CancellationToken ct)
    {
        var scopeFailure = RequireScope(context, AppServerDynamicToolCatalog.BoardManageScope);
        if (scopeFailure is not null)
        {
            return scopeFailure;
        }

        var args = ReadArguments<CreateBoardTaskArguments>(arguments);
        RequireNonEmpty(args.Title, "title");
        var result = await service.CreateLocalTaskAsync(
            new CreateLocalTaskRequest(
                args.Title!,
                args.Description,
                args.Repository,
                args.Assignee,
                args.Branch,
                args.Labels),
            ct);
        return Succeeded(
            $"Created Oratorio local task '{result.Item.Title}'.",
            new
            {
                Detail = result,
                context.BindingId,
                context.GrantId
            });
    }

    private async Task<AppServerDynamicToolResult> QueueReviewRoundAsync(
        OratorioAppBindingGrantContext context,
        JsonElement arguments,
        CancellationToken ct)
    {
        var scopeFailure = RequireScope(context, AppServerDynamicToolCatalog.BoardManageScope);
        if (scopeFailure is not null)
        {
            return scopeFailure;
        }

        var args = ReadArguments<QueueReviewRoundArguments>(arguments);
        RequireNonEmpty(args.ItemId, "itemId");
        var detail = await service.GetTaskDetailAsync(args.ItemId!, ct);
        var result = await service.DispatchByIdAsync(
            detail.Item.ItemId,
            new DispatchRequest(
                "appServer",
                args.Note,
                MockOutcome: null,
                MockDurationSeconds: null,
                WorkMode: "reviewAnalysis",
                DeliveryPolicy: DeliveryPolicy.ManualDelivery),
            RunDispatchTrigger.AppBinding,
            ct);
        return Succeeded(
            $"Queued an Oratorio review round for '{result.Item.Title}'.",
            new
            {
                Detail = result,
                context.BindingId,
                context.GrantId
            });
    }

    private static AppServerDynamicToolResult? RequireScope(
        OratorioAppBindingGrantContext context,
        string scope)
    {
        return context.GrantedScopes.Contains(scope)
            ? null
            : Failed("AppBindingScopeDenied", $"The Oratorio grant does not include scope '{scope}'.");
    }

    private static T ReadArguments<T>(JsonElement arguments) =>
        arguments.ValueKind == JsonValueKind.Undefined || arguments.ValueKind == JsonValueKind.Null
            ? JsonSerializer.Deserialize<T>("{}", JsonOptions)!
            : JsonSerializer.Deserialize<T>(arguments.GetRawText(), JsonOptions)
              ?? throw new JsonException("Tool arguments must be a JSON object.");

    private static void RequireNonEmpty(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw OratorioApiException.Validation($"{field} is required.", new Dictionary<string, object?> { ["field"] = field });
        }
    }

    private static AppServerDynamicToolResult Succeeded(string message, object structuredResult) =>
        new(
            true,
            [new AppServerToolContentItem("text", message)],
            StructuredResult: structuredResult);

    private static AppServerDynamicToolResult Failed(string code, string message) =>
        new(false, ErrorCode: code, ErrorMessage: message);

    private sealed record ListBoardItemsArguments(
        string? State,
        string? Source,
        string? Repository,
        string? Assignee,
        string? Q,
        int? Limit,
        bool? IncludeArchived);

    private sealed record ItemIdArguments(string? ItemId);

    private sealed record CreateBoardTaskArguments(
        string? Title,
        string? Description,
        string? Repository,
        string? Assignee,
        string? Branch,
        IReadOnlyList<string>? Labels);

    private sealed record QueueReviewRoundArguments(string? ItemId, string? Note);
}
