using System.Text.Json;

namespace Oratorio.Server.DotCraft;

public static class AppServerDynamicToolCatalog
{
    public const string Namespace = "oratorio_run";
    public const string AppId = "com.dotharness.oratorio";
    public const string SubmitDiscussionReplyName = "SubmitDiscussionReply";
    public const string SubmitDiscussionReplyId = "oratorio_run.SubmitDiscussionReply";
    public const string ResolveReviewFindingName = "ResolveReviewFinding";
    public const string ResolveReviewFindingId = "oratorio_run.ResolveReviewFinding";
    public const string SubmitReviewDraftName = "SubmitReviewDraft";
    public const string SubmitReviewDraftId = "oratorio_run.SubmitReviewDraft";
    public const string SubmitImplementationDraftName = "SubmitImplementationDraft";
    public const string SubmitImplementationDraftId = "oratorio_run.SubmitImplementationDraft";
    public const string SubmitFollowUpDraftName = "SubmitFollowUpDraft";
    public const string SubmitFollowUpDraftId = "oratorio_run.SubmitFollowUpDraft";
    public const string ListBoardItemsName = "ListBoardItems";
    public const string GetBoardItemName = "GetBoardItem";
    public const string CreateBoardTaskName = "CreateBoardTask";
    public const string QueueReviewRoundName = "QueueReviewRound";

    /// <summary>Bundled MCP Apps resources served by the binding MCP server.</summary>
    public const string UiResourcePrefix = "ui://oratorio";
    public const string BoardUiResourceUri = $"{UiResourcePrefix}/board.html";
    public const string ItemUiResourceUri = $"{UiResourcePrefix}/item.html";
    public const string ReviewUiResourceUri = $"{UiResourcePrefix}/review.html";
    public const string BoardNamespaceDescription = "Inspect and manage the authorized Oratorio project board. Read current board state before making claims; use mutation tools only when the user asks to change Oratorio state.";

    private static readonly string[] ModelAndAppVisibility = ["model", "app"];

    public static IReadOnlyList<object> McpBoardTools(JsonSerializerOptions jsonOptions) =>
        BoardTools(jsonOptions)
            .Select(tool => (object)new
            {
                name = tool.Name,
                description = tool.Description,
                inputSchema = tool.InputSchema,
                annotations = new
                {
                    readOnlyHint = tool.Name is ListBoardItemsName or GetBoardItemName,
                    destructiveHint = false,
                    openWorldHint = false
                },
                _meta = tool.Meta is null ? null : new
                {
                    ui = new
                    {
                        resourceUri = tool.Meta.Ui!.ResourceUri,
                        visibility = tool.Meta.Ui.Visibility
                    }
                }
            })
            .ToArray();

    public static IReadOnlyList<object> McpAppResources() =>
    [
        McpResource(BoardUiResourceUri, "Oratorio board", "board.html"),
        McpResource(ItemUiResourceUri, "Oratorio item", "item.html"),
        McpResource(ReviewUiResourceUri, "Oratorio review", "review.html")
    ];

    public static string? ResolveUiFile(string? uri) => uri switch
    {
        BoardUiResourceUri => "board.html",
        ItemUiResourceUri => "item.html",
        ReviewUiResourceUri => "review.html",
        _ => null
    };

    private static object McpResource(string uri, string name, string fileName) => new
    {
        uri,
        name,
        description = $"Bundled Oratorio MCP App: {fileName}",
        mimeType = "text/html;profile=mcp-app",
        _meta = new { ui = new { prefersBorder = true } }
    };

    public static AppServerDynamicToolSpec SubmitDiscussionReply(JsonSerializerOptions jsonOptions) =>
        new(
            Namespace: Namespace,
            Name: SubmitDiscussionReplyName,
            Description: "Submit the answer for the current Oratorio Agent Discussion Turn. Oratorio stores the reply as an internal discussion comment.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    discussionTurnId = new { type = "string" },
                    body = new { type = "string" }
                },
                required = new[] { "discussionTurnId", "body" }
            }, jsonOptions));

    public static AppServerDynamicToolSpec ResolveReviewFinding(JsonSerializerOptions jsonOptions) =>
        new(
            Namespace: Namespace,
            Name: ResolveReviewFindingName,
            Description: "Resolve a published Oratorio review finding once it is fixed or agreed to be a non-issue. Use resolutionKind 'fixed' when the current code addresses it, or 'dismissed' when it was agreed not to action. Only resolve findings you are confident about; otherwise leave them open. Oratorio records the resolution and resolves the matching GitHub/GitLab review thread when source writes are configured.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    findingId = new { type = "string", description = "The published review finding id (ReviewDraftComment id) to resolve." },
                    resolutionKind = new
                    {
                        type = "string",
                        @enum = new[] { "fixed", "dismissed" },
                        description = "fixed when the underlying issue was addressed in code; dismissed when the finding was agreed to be a non-issue or intentionally not actioned."
                    },
                    note = new { type = "string", description = "Optional short rationale for the resolution." }
                },
                required = new[] { "findingId", "resolutionKind" }
            }, jsonOptions));

    public static IReadOnlyList<AppServerDynamicToolSpec> BoardTools(JsonSerializerOptions jsonOptions) =>
    [
        ListBoardItems(jsonOptions),
        GetBoardItem(jsonOptions),
        CreateBoardTask(jsonOptions),
        QueueReviewRound(jsonOptions)
    ];

    public static AppServerDynamicToolSpec ListBoardItems(JsonSerializerOptions jsonOptions) =>
        new(
            Namespace: Namespace,
            Name: ListBoardItemsName,
            Description: "List Oratorio board items. Use filters to narrow by state, source, repository, assignee, or search text.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    state = new { type = "string", description = "Optional comma-separated Oratorio item states." },
                    source = new { type = "string", description = "Optional source filter such as local or github." },
                    repository = new { type = "string" },
                    assignee = new { type = "string" },
                    q = new { type = "string", description = "Search text." },
                    limit = new { type = "integer", minimum = 1, maximum = 100 },
                    includeArchived = new { type = "boolean" }
                }
            }, jsonOptions),
            Meta: new AppServerDynamicToolMeta(new AppServerDynamicToolUiMeta(
                BoardUiResourceUri,
                Visibility: ModelAndAppVisibility,
                PrefersBorder: true)));

    public static AppServerDynamicToolSpec GetBoardItem(JsonSerializerOptions jsonOptions) =>
        new(
            Namespace: Namespace,
            Name: GetBoardItemName,
            Description: "Read one Oratorio board item by item id or task short id.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    itemId = new { type = "string", description = "Oratorio item id or task short id." }
                },
                required = new[] { "itemId" }
            }, jsonOptions),
            Meta: new AppServerDynamicToolMeta(new AppServerDynamicToolUiMeta(
                ItemUiResourceUri,
                Visibility: ModelAndAppVisibility,
                PrefersBorder: true)));

    public static AppServerDynamicToolSpec CreateBoardTask(JsonSerializerOptions jsonOptions) =>
        new(
            Namespace: Namespace,
            Name: CreateBoardTaskName,
            Description: "Create a local Oratorio task on the board. This changes Oratorio state and requires approval in DotCraft.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    title = new { type = "string" },
                    description = new { type = "string" },
                    repository = new { type = "string" },
                    assignee = new { type = "string" },
                    branch = new { type = "string" },
                    labels = new
                    {
                        type = "array",
                        items = new { type = "string" }
                    }
                },
                required = new[] { "title" }
            }, jsonOptions),
            DeferLoading: true,
            Approval: new AppServerToolApprovalDescriptor(
                "remoteResource",
                "title",
                Operation: "Create Oratorio board task"));

    public static AppServerDynamicToolSpec QueueReviewRound(JsonSerializerOptions jsonOptions) =>
        new(
            Namespace: Namespace,
            Name: QueueReviewRoundName,
            Description: "Queue an Oratorio review-analysis round for an existing board item. This changes Oratorio state and requires approval in DotCraft.",
            InputSchema: JsonSerializer.SerializeToElement(new
            {
                type = "object",
                properties = new
                {
                    itemId = new { type = "string", description = "Oratorio item id or task short id." },
                    note = new { type = "string" }
                },
                required = new[] { "itemId" }
            }, jsonOptions),
            DeferLoading: true,
            Approval: new AppServerToolApprovalDescriptor(
                "remoteResource",
                "itemId",
                Operation: "Queue Oratorio review round"),
            Meta: new AppServerDynamicToolMeta(new AppServerDynamicToolUiMeta(
                ReviewUiResourceUri,
                Visibility: ModelAndAppVisibility,
                PrefersBorder: true)));

    public static IReadOnlyList<string> DynamicToolIds(IReadOnlyList<AppServerDynamicToolSpec> dynamicTools) =>
        dynamicTools
            .Select(tool => string.IsNullOrWhiteSpace(tool.Namespace) ? tool.Name : $"{tool.Namespace}.{tool.Name}")
            .Order(StringComparer.Ordinal)
            .ToArray();
}
