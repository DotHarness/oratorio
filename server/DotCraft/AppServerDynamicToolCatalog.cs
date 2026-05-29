using System.Text.Json;

namespace Oratorio.Server.DotCraft;

public static class AppServerDynamicToolCatalog
{
    public const string Namespace = "oratorio";
    public const string AppId = "com.dotharness.oratorio";
    public const string BoardReadScope = "board.read";
    public const string BoardManageScope = "board.manage";
    public const string SubmitDiscussionReplyName = "SubmitDiscussionReply";
    public const string SubmitDiscussionReplyId = "oratorio.SubmitDiscussionReply";
    public const string ResolveReviewFindingName = "ResolveReviewFinding";
    public const string ResolveReviewFindingId = "oratorio.ResolveReviewFinding";
    public const string ListBoardItemsName = "ListBoardItems";
    public const string GetBoardItemName = "GetBoardItem";
    public const string CreateBoardTaskName = "CreateBoardTask";
    public const string QueueReviewRoundName = "QueueReviewRound";

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
            Description: "Resolve a published Oratorio review finding once it is fixed or agreed to be a non-issue. Use resolutionKind 'fixed' when the current code addresses it, or 'dismissed' when it was agreed not to action. Only resolve findings you are confident about; otherwise leave them open. Oratorio records the resolution and, when enabled, resolves the matching GitHub/GitLab review thread.",
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

    public static IReadOnlyList<AppServerDynamicToolSpec> AppBoundManagerTools(
        JsonSerializerOptions jsonOptions,
        IReadOnlySet<string> grantedScopes)
    {
        var tools = new List<AppServerDynamicToolSpec>();
        if (grantedScopes.Contains(BoardReadScope))
        {
            tools.Add(ListBoardItems(jsonOptions));
            tools.Add(GetBoardItem(jsonOptions));
        }

        if (grantedScopes.Contains(BoardManageScope))
        {
            tools.Add(CreateBoardTask(jsonOptions));
            tools.Add(QueueReviewRound(jsonOptions));
        }

        return tools;
    }

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
            }, jsonOptions));

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
            }, jsonOptions));

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
                Operation: "Queue Oratorio review round"));

    public static IReadOnlyList<string> DynamicToolIds(IReadOnlyList<AppServerDynamicToolSpec> dynamicTools) =>
        dynamicTools
            .Select(tool => string.IsNullOrWhiteSpace(tool.Namespace) ? tool.Name : $"{tool.Namespace}.{tool.Name}")
            .Order(StringComparer.Ordinal)
            .ToArray();
}
