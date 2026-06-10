using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Oratorio.Server.Api;
using Oratorio.Server.DotCraft;

namespace Oratorio.Server.Tests;

public sealed class OratorioAppBindingTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    [Fact]
    public void ManagerTools_ExposeReadToolsDirect_AndWriteToolsDeferred()
    {
        var grantedScopes = new HashSet<string>(StringComparer.Ordinal)
        {
            AppServerDynamicToolCatalog.BoardReadScope,
            AppServerDynamicToolCatalog.BoardManageScope
        };
        var tools = AppServerDynamicToolCatalog.AppBoundManagerTools(JsonOptions, grantedScopes);

        Assert.Equal(
            [
                AppServerDynamicToolCatalog.ListBoardItemsName,
                AppServerDynamicToolCatalog.GetBoardItemName,
                AppServerDynamicToolCatalog.CreateBoardTaskName,
                AppServerDynamicToolCatalog.QueueReviewRoundName
            ],
            tools.Select(tool => tool.Name).ToArray());
        Assert.All(tools.Take(2), tool => Assert.False(tool.DeferLoading));
        Assert.All(tools.Skip(2), tool =>
        {
            Assert.True(tool.DeferLoading);
            Assert.NotNull(tool.Approval);
        });
    }

    [Fact]
    public void ManagerTools_DeclareInteractiveUiPerContract()
    {
        var grantedScopes = new HashSet<string>(StringComparer.Ordinal)
        {
            AppServerDynamicToolCatalog.BoardReadScope,
            AppServerDynamicToolCatalog.BoardManageScope
        };
        var tools = AppServerDynamicToolCatalog.AppBoundManagerTools(JsonOptions, grantedScopes)
            .ToDictionary(tool => tool.Name, StringComparer.Ordinal);

        // The DotCraft Interactive Tool UI contract (tool-result-presentation.md §15).
        Assert.Equal(
            AppServerDynamicToolCatalog.BoardUiResourceUri,
            tools[AppServerDynamicToolCatalog.ListBoardItemsName].Meta?.Ui?.ResourceUri);
        Assert.Equal(
            AppServerDynamicToolCatalog.ItemUiResourceUri,
            tools[AppServerDynamicToolCatalog.GetBoardItemName].Meta?.Ui?.ResourceUri);
        Assert.Equal(
            AppServerDynamicToolCatalog.ReviewUiResourceUri,
            tools[AppServerDynamicToolCatalog.QueueReviewRoundName].Meta?.Ui?.ResourceUri);
        Assert.Null(tools[AppServerDynamicToolCatalog.CreateBoardTaskName].Meta);

        // UI-bearing tools stay model-visible and become app-invocable (card refresh/actions).
        Assert.All(
            tools.Values.Where(tool => tool.Meta?.Ui is not null),
            tool =>
            {
                Assert.Contains("model", tool.Meta!.Ui!.Visibility ?? []);
                Assert.Contains("app", tool.Meta!.Ui!.Visibility ?? []);
            });

        // The wrapper must serialize _meta.ui (not a top-level ui) to match DotCraft's attach wire.
        var listSpec = tools[AppServerDynamicToolCatalog.ListBoardItemsName];
        using var wire = JsonSerializer.SerializeToDocument(listSpec, global::DotCraft.Sdk.Wire.DotCraftJson.Options);
        Assert.True(wire.RootElement.TryGetProperty("_meta", out var metaEl));
        Assert.Equal(
            AppServerDynamicToolCatalog.BoardUiResourceUri,
            metaEl.GetProperty("ui").GetProperty("resourceUri").GetString());
        Assert.False(wire.RootElement.TryGetProperty("ui", out _));

        // Every declared ui:// resource ships in the served UiResources folder.
        var folder = Path.Combine(AppContext.BaseDirectory, "UiResources");
        foreach (var tool in tools.Values.Where(tool => tool.Meta?.Ui is not null))
        {
            var relative = tool.Meta!.Ui!.ResourceUri[(AppServerDynamicToolCatalog.UiResourcePrefix.Length + 1)..];
            Assert.True(
                File.Exists(Path.Combine(folder, relative)),
                $"Missing UI resource file for {tool.Name}: {relative}");
        }
    }

    [Fact]
    public async Task ToolHandler_ValidatesGrant_AndCallsBoardTools()
    {
        await using var app = new TestOratorioApp();
        var client = app.CreateClient();
        var created = await PostAsync<ItemDetailResponse>(
            client,
            "/api/v1/local-tasks",
            new CreateLocalTaskRequest(
                "Seed app-bound board task",
                "This task is visible to DotCraft.",
                "example-owner/oratorio",
                "kai",
                "feature/app-binding",
                ["app-binding"]));

        using var scope = app.Services.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<OratorioAppBindingToolHandler>();
        var context = new OratorioAppBindingGrantContext(
            AppServerDynamicToolCatalog.AppId,
            "binding-test",
            "thread-test",
            "grant-test",
            new HashSet<string>([
                AppServerDynamicToolCatalog.BoardReadScope,
                AppServerDynamicToolCatalog.BoardManageScope
            ], StringComparer.Ordinal));

        var list = await handler.HandleAsync(
            context,
            Call("thread-test", AppServerDynamicToolCatalog.ListBoardItemsName, new { limit = 10 }),
            CancellationToken.None);

        Assert.True(list.Success);
        Assert.Contains("Seed app-bound board task", SerializeStructured(list));

        var get = await handler.HandleAsync(
            context,
            Call("thread-test", AppServerDynamicToolCatalog.GetBoardItemName, new { itemId = created.Item.ItemId }),
            CancellationToken.None);

        Assert.True(get.Success);
        Assert.Contains(created.Item.ItemId, SerializeStructured(get));

        var create = await handler.HandleAsync(
            context,
            Call("thread-test", AppServerDynamicToolCatalog.CreateBoardTaskName, new
            {
                title = "Created through App Binding",
                description = "Created by an app-bound manager tool."
            }),
            CancellationToken.None);

        Assert.True(create.Success);
        Assert.Contains("Created through App Binding", SerializeStructured(create));
    }

    [Fact]
    public async Task ToolHandler_RejectsWrongThread_AndMissingScope()
    {
        await using var app = new TestOratorioApp();
        _ = app.CreateClient();
        using var scope = app.Services.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<OratorioAppBindingToolHandler>();
        var readOnlyContext = new OratorioAppBindingGrantContext(
            AppServerDynamicToolCatalog.AppId,
            "binding-test",
            "thread-test",
            "grant-test",
            new HashSet<string>([AppServerDynamicToolCatalog.BoardReadScope], StringComparer.Ordinal));

        var wrongThread = await handler.HandleAsync(
            readOnlyContext,
            Call("other-thread", AppServerDynamicToolCatalog.ListBoardItemsName, new { }),
            CancellationToken.None);

        Assert.False(wrongThread.Success);
        Assert.Equal("InvalidAppBindingThread", wrongThread.ErrorCode);

        var missingScope = await handler.HandleAsync(
            readOnlyContext,
            Call("thread-test", AppServerDynamicToolCatalog.CreateBoardTaskName, new { title = "No grant" }),
            CancellationToken.None);

        Assert.False(missingScope.Success);
        Assert.Equal("AppBindingScopeDenied", missingScope.ErrorCode);
    }

    [Fact]
    public void Handoff_ParsesConnectionAndBindingDeepLinks()
    {
        var parsed = OratorioAppBindingHandoff.FromUrl(
            $"oratorio://dotcraft/bind?app={AppServerDynamicToolCatalog.AppId}&request=bind_req_1&token=token_1&endpoint=ws%3A%2F%2F127.0.0.1%3A9100%2Fws");

        Assert.Equal("bind", parsed.Operation);
        Assert.Equal("bind_req_1", parsed.RequestId);
        Assert.Equal("ws://127.0.0.1:9100/ws", parsed.AppServerUrl);
    }

    [Fact]
    public void Handoff_RejectsWrongAppId()
    {
        var ex = Assert.Throws<OratorioApiException>(() =>
            OratorioAppBindingHandoff.FromUrl("oratorio://dotcraft/connect?app=com.example.other&request=req_1&token=token_1"));
        Assert.Equal("validationFailed", ex.Code);
    }

    [Fact]
    public async Task ConnectionStatus_ReturnsConnectedDotCraftAppConnection()
    {
        var connectedAt = DateTimeOffset.Parse("2026-05-17T08:00:00Z");
        var expiresAt = DateTimeOffset.Parse("2026-05-17T09:00:00Z");
        var fakeProcess = new FakeDotCraftProcessManager(
            connected: true,
            endpoint: new DotCraftAppServerEndpoint("ws://127.0.0.1:9100/ws", "hub"));
        var fakeAppServer = new FakeAppServerClientFactory(FakeAppServerOutcome.Success)
        {
            ConnectionStatus = new AppBindingConnectionStatus(
                AppServerDynamicToolCatalog.AppId,
                "connected",
                connectedAt,
                expiresAt,
                "Kai")
        };

        await using var app = AppWithDotCraft(fakes =>
        {
            fakes.ProcessManager = fakeProcess;
            fakes.ClientFactory = fakeAppServer;
        });
        var client = app.CreateClient();

        var status = await client.GetFromJsonAsync<DotCraftAppBindingStatusResponse>(
            "/api/v1/dotcraft/app-binding/status",
            JsonOptions);

        Assert.NotNull(status);
        Assert.True(status.Available);
        Assert.True(status.Configured);
        Assert.True(status.Connected);
        Assert.Equal("connected", status.State);
        Assert.Equal("hub", status.EndpointSource);
        Assert.Equal("Kai", status.AccountLabel);
        Assert.Equal(connectedAt, status.ConnectedAt);
        Assert.Equal(expiresAt, status.ExpiresAt);
        Assert.Equal(1, fakeAppServer.ConnectCount);
    }

    [Fact]
    public async Task ConnectionStatus_ReturnsUnavailableWhenAppServerIsNotReachable()
    {
        var fakeProcess = new FakeDotCraftProcessManager(
            connected: false,
            endpoint: new DotCraftAppServerEndpoint("ws://127.0.0.1:9100/ws", "hub"),
            message: "DotCraft AppServer is offline.");
        var fakeAppServer = new FakeAppServerClientFactory(FakeAppServerOutcome.Success);

        await using var app = AppWithDotCraft(fakes =>
        {
            fakes.ProcessManager = fakeProcess;
            fakes.ClientFactory = fakeAppServer;
        });
        var client = app.CreateClient();

        var status = await client.GetFromJsonAsync<DotCraftAppBindingStatusResponse>(
            "/api/v1/dotcraft/app-binding/status",
            JsonOptions);

        Assert.NotNull(status);
        Assert.False(status.Available);
        Assert.False(status.Connected);
        Assert.Equal("notConnected", status.State);
        Assert.Equal("unreachable", status.Diagnostic);
        Assert.Equal("DotCraft AppServer is offline.", status.Message);
        Assert.Equal(0, fakeAppServer.ConnectCount);
    }

    [Fact]
    public async Task ConnectionStatus_DistinguishesReachableServerFromDisconnectedApp()
    {
        var fakeProcess = new FakeDotCraftProcessManager(
            connected: true,
            endpoint: new DotCraftAppServerEndpoint("ws://127.0.0.1:9100/ws", "hub"));
        var fakeAppServer = new FakeAppServerClientFactory(FakeAppServerOutcome.Success)
        {
            ConnectionStatus = new AppBindingConnectionStatus(
                AppServerDynamicToolCatalog.AppId,
                "notConnected",
                Diagnostic: "connectionMissing")
        };

        await using var app = AppWithDotCraft(fakes =>
        {
            fakes.ProcessManager = fakeProcess;
            fakes.ClientFactory = fakeAppServer;
        });
        var client = app.CreateClient();

        var status = await client.GetFromJsonAsync<DotCraftAppBindingStatusResponse>(
            "/api/v1/dotcraft/app-binding/status",
            JsonOptions);

        Assert.NotNull(status);
        Assert.True(status.Available);
        Assert.False(status.Connected);
        Assert.Equal("notConnected", status.State);
        Assert.Equal("connectionMissing", status.Diagnostic);
        Assert.Equal(1, fakeAppServer.ConnectCount);
    }

    [Fact]
    public async Task ConnectionStatus_UsesCompletedConnectionWhenDotCraftStatusIsUserScoped()
    {
        var fakeProcess = new FakeDotCraftProcessManager(
            connected: true,
            endpoint: new DotCraftAppServerEndpoint("ws://127.0.0.1:9100/ws", "hub"));
        var fakeAppServer = new FakeAppServerClientFactory(FakeAppServerOutcome.Success)
        {
            ConnectionStatus = new AppBindingConnectionStatus(
                AppServerDynamicToolCatalog.AppId,
                "notConnected")
        };

        await using var app = AppWithDotCraft(fakes =>
        {
            fakes.ProcessManager = fakeProcess;
            fakes.ClientFactory = fakeAppServer;
        });
        var client = app.CreateClient();
        var handoffUrl = $"oratorio://dotcraft/connect?app={AppServerDynamicToolCatalog.AppId}&request=connect_req_1&token=token_1&endpoint=ws%3A%2F%2F127.0.0.1%3A9100%2Fws";

        var approved = await PostAsync<OratorioAppBindingApprovalResult>(
            client,
            "/api/v1/dotcraft/app-binding/approve",
            new DotCraftAppBindingHandoffRequest(handoffUrl));
        var status = await client.GetFromJsonAsync<DotCraftAppBindingStatusResponse>(
            "/api/v1/dotcraft/app-binding/status",
            JsonOptions);

        Assert.Equal("connected", approved.State);
        Assert.NotNull(status);
        Assert.True(status.Connected);
        Assert.Equal("connected", status.State);
        Assert.Equal("Oratorio", status.AccountLabel);

        var connectRequest = Assert.IsType<AppBindingConnectionConnectRequest>(
            fakeAppServer.LastAppConnectionConnectRequest);
        using var metadata = JsonDocument.Parse(JsonSerializer.Serialize(
            connectRequest.PublicMetadata,
            JsonOptions));
        Assert.Equal("Oratorio", metadata.RootElement.GetProperty("displayName").GetString());
        var endpoints = metadata.RootElement.GetProperty("surfaceEndpoints");
        Assert.Equal("http://localhost/api/v1", endpoints.GetProperty("apiBase").GetString());
    }

    [Fact]
    public async Task ConnectionStatus_UsesAcceptedBindingWhenDotCraftStatusIsUserScoped()
    {
        var fakeProcess = new FakeDotCraftProcessManager(
            connected: true,
            endpoint: new DotCraftAppServerEndpoint("ws://127.0.0.1:9100/ws", "hub"));
        var fakeAppServer = new FakeAppServerClientFactory(FakeAppServerOutcome.Success)
        {
            ConnectionStatus = new AppBindingConnectionStatus(
                AppServerDynamicToolCatalog.AppId,
                "notConnected")
        };

        await using var app = AppWithDotCraft(fakes =>
        {
            fakes.ProcessManager = fakeProcess;
            fakes.ClientFactory = fakeAppServer;
        });
        var client = app.CreateClient();
        var handoffUrl = $"oratorio://dotcraft/bind?app={AppServerDynamicToolCatalog.AppId}&request=bind_req_1&token=token_1&endpoint=ws%3A%2F%2F127.0.0.1%3A9100%2Fws";

        var approved = await PostAsync<OratorioAppBindingApprovalResult>(
            client,
            "/api/v1/dotcraft/app-binding/approve",
            new DotCraftAppBindingHandoffRequest(handoffUrl));
        var status = await client.GetFromJsonAsync<DotCraftAppBindingStatusResponse>(
            "/api/v1/dotcraft/app-binding/status",
            JsonOptions);

        Assert.Equal("active", approved.State);
        Assert.NotNull(status);
        Assert.True(status.Connected);
        Assert.Equal("connected", status.State);
        Assert.Equal("Oratorio", status.AccountLabel);
        var contextBlock = Assert.Single(fakeAppServer.AppBindingContextBlockUpsertRequests);
        Assert.Equal(AppServerDynamicToolCatalog.BoardToolsContextBlockId, contextBlock.BlockId);
        Assert.Equal("policy", contextBlock.Kind);
        Assert.Equal("model", contextBlock.Visibility);
        Assert.Contains(AppServerDynamicToolCatalog.ListBoardItemsName, contextBlock.Content);
        Assert.Contains(AppServerDynamicToolCatalog.QueueReviewRoundName, contextBlock.Content);
    }

    private static AppServerDynamicToolCall Call(string threadId, string tool, object args) =>
        new(
            threadId,
            TurnId: null,
            CallId: "call-test",
            Namespace: AppServerDynamicToolCatalog.Namespace,
            Tool: tool,
            Arguments: JsonSerializer.SerializeToElement(args, JsonOptions));

    private static string SerializeStructured(AppServerDynamicToolResult result) =>
        JsonSerializer.Serialize(result.StructuredResult, JsonOptions);

    private static async Task<T> PostAsync<T>(HttpClient client, string path, object request)
    {
        using var response = await client.PostAsJsonAsync(path, request, JsonOptions);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions)
               ?? throw new InvalidOperationException("Missing response body.");
    }

    private static TestOratorioApp AppWithDotCraft(Action<DotCraftFakes> configure)
    {
        var fakes = new DotCraftFakes();
        configure(fakes);
        return new TestOratorioApp(services =>
        {
            services.RemoveAll<IDotCraftAppServerProcessManager>();
            services.RemoveAll<IDotCraftAppServerClientFactory>();
            services.AddSingleton(fakes.ProcessManager);
            services.AddSingleton<IDotCraftAppServerClientFactory>(fakes.ClientFactory);
        });
    }

    private sealed class DotCraftFakes
    {
        public IDotCraftAppServerProcessManager ProcessManager { get; set; } = new FakeDotCraftProcessManager();
        public FakeAppServerClientFactory ClientFactory { get; set; } = new(FakeAppServerOutcome.Success);
    }
}
