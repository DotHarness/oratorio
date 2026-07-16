using System.Text.Json;
using System.Threading.Channels;
using DotCraft.Sdk.AppServer;
using DotCraft.Sdk.Wire;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Oratorio.Server.DotCraft;
using Oratorio.Server.Services;

namespace Oratorio.Server.Tests;

public sealed class OratorioAppBindingSdkTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    [Fact]
    public async Task ApproveConnection_UsesSdkAppBindingClientAndPersistsTypedResult()
    {
        var transport = new TestJsonRpcTransport();
        var sdkClient = await ConnectSdkClientAsync(transport);
        var client = new DotCraftAppServerClient(sdkClient);
        var factory = new SingleClientFactory(client);
        var stateDirectory = Path.Combine(Path.GetTempPath(), $"oratorio-app-binding-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stateDirectory);

        try
        {
            var store = new OratorioDotCraftBindingStore(Path.Combine(stateDirectory, "binding.json"));
            using var services = new ServiceCollection().BuildServiceProvider();
            var boardSurfaceRuntime = new OratorioBoardSurfaceRuntime();
            var service = new OratorioAppBindingService(
                factory,
                null!,
                Options.Create(new DotCraftOptions()),
                store,
                new PassthroughSecretProtector(),
                new OratorioBindingMcpRuntime(services.GetRequiredService<IServiceScopeFactory>()),
                boardSurfaceRuntime,
                NullLogger<OratorioAppBindingService>.Instance);

            var approveTask = service.ApproveAsync(
                "oratorio://dotcraft/connect?app=com.dotharness.oratorio&request=connect_req_1&token=request-token&endpoint=ws%3A%2F%2F127.0.0.1%3A9100%2Fws",
                "http://127.0.0.1:5199",
                CancellationToken.None);

            using (var outbound = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/connection/connect", outbound.RootElement.GetProperty("method").GetString());
                var parameters = outbound.RootElement.GetProperty("params");
                Assert.Equal("connect_req_1", parameters.GetProperty("connectionRequestId").GetString());
                Assert.Equal("request-token", parameters.GetProperty("requestToken").GetString());
                Assert.Equal("Oratorio", parameters.GetProperty("accountLabel").GetString());

                await transport.PushInboundAsync(new
                {
                    jsonrpc = "2.0",
                    id = outbound.RootElement.GetProperty("id").GetInt64(),
                    result = new
                    {
                        principal = new
                        {
                            principalId = "principal-1",
                            appId = "com.dotharness.oratorio",
                            userId = "user-1",
                            expiresAt = "2026-08-15T00:00:00.0000000+00:00"
                        },
                        credential = "credential-1"
                    }
                });
            }

            using (var authenticate = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/connection/authenticate", authenticate.RootElement.GetProperty("method").GetString());
                var parameters = authenticate.RootElement.GetProperty("params");
                Assert.Equal("com.dotharness.oratorio", parameters.GetProperty("appId").GetString());
                Assert.Equal("credential-1", parameters.GetProperty("credential").GetString());
                await transport.PushResultAsync(authenticate, new { });
            }

            using (var publish = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/surface/publish", publish.RootElement.GetProperty("method").GetString());
                var parameters = publish.RootElement.GetProperty("params");
                Assert.Equal("board", parameters.GetProperty("surfaceId").GetString());
                Assert.Equal("http://127.0.0.1:5199/dotcraft/surfaces/board/api/v1", parameters.GetProperty("endpoint").GetString());
                Assert.Equal(boardSurfaceRuntime.Bearer, parameters.GetProperty("bearer").GetString());
                await transport.PushResultAsync(publish, new
                {
                    appId = "com.dotharness.oratorio",
                    surfaceId = "board",
                    endpoint = "http://127.0.0.1:5199/dotcraft/surfaces/board/api/v1",
                    bearer = boardSurfaceRuntime.Bearer,
                    expiresAt = "2026-07-16T12:02:00Z"
                });
            }

            var result = await approveTask.WaitAsync(Timeout);
            Assert.Equal("connect", result.Operation);
            Assert.Equal("connected", result.State);
            Assert.True(store.TryLoad(out var persisted));
            Assert.Equal("ws://127.0.0.1:9100/ws", persisted.AppServerUrl);
            Assert.Equal("principal-1", persisted.PrincipalId);
            Assert.Equal("credential-1", persisted.ProtectedCredential);
            Assert.Equal(DateTimeOffset.Parse("2026-08-15T00:00:00+00:00"), persisted.PrincipalExpiresAt);
        }
        finally
        {
            Directory.Delete(stateDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task ApproveBinding_UsesSdkAuthenticationInspectionAndActivation()
    {
        var transport = new TestJsonRpcTransport();
        var sdkClient = await ConnectSdkClientAsync(transport);
        var stateDirectory = Path.Combine(Path.GetTempPath(), $"oratorio-app-binding-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stateDirectory);

        try
        {
            var store = new OratorioDotCraftBindingStore(Path.Combine(stateDirectory, "binding.json"));
            store.Save(new OratorioDotCraftBinding(
                "ws://127.0.0.1:9100/ws",
                "com.dotharness.oratorio",
                "principal-1",
                "credential-1",
                DateTimeOffset.UtcNow.AddDays(20),
                "Oratorio",
                []));
            using var services = new ServiceCollection().BuildServiceProvider();
            var service = new OratorioAppBindingService(
                new SingleClientFactory(new DotCraftAppServerClient(sdkClient)),
                null!,
                Options.Create(new DotCraftOptions()),
                store,
                new PassthroughSecretProtector(),
                new OratorioBindingMcpRuntime(services.GetRequiredService<IServiceScopeFactory>()),
                new OratorioBoardSurfaceRuntime(),
                NullLogger<OratorioAppBindingService>.Instance);

            var approveTask = service.ApproveAsync(
                "oratorio://dotcraft/bind?app=com.dotharness.oratorio&request=bind_req_1&token=request-token&endpoint=ws%3A%2F%2F127.0.0.1%3A9100%2Fws",
                "http://127.0.0.1:5199",
                CancellationToken.None);

            using (var authenticate = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/connection/authenticate", authenticate.RootElement.GetProperty("method").GetString());
                await transport.PushResultAsync(authenticate, new { });
            }

            using (var inspect = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/binding/request/get", inspect.RootElement.GetProperty("method").GetString());
                await transport.PushResultAsync(inspect, new
                {
                    bindingRequestId = "bind_req_1",
                    bindingId = "binding-1",
                    threadId = "thread-1",
                    appId = "com.dotharness.oratorio",
                    state = "connecting",
                    expiresAt = "2026-07-16T12:00:00+00:00"
                });
            }

            using (var activate = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/binding/activate", activate.RootElement.GetProperty("method").GetString());
                var parameters = activate.RootElement.GetProperty("params");
                Assert.Equal("bind_req_1", parameters.GetProperty("bindingRequestId").GetString());
                Assert.Equal("http://127.0.0.1:5199/dotcraft/bindings/binding-1/mcp", parameters.GetProperty("endpoint").GetString());
                Assert.False(string.IsNullOrWhiteSpace(parameters.GetProperty("bearer").GetString()));
                await transport.PushResultAsync(activate, new
                {
                    bindingId = "binding-1",
                    threadId = "thread-1",
                    appId = "com.dotharness.oratorio",
                    state = "active",
                    authorityRevision = 1
                });
            }

            var result = await approveTask.WaitAsync(Timeout);
            Assert.Equal("binding-1", result.BindingId);
            Assert.Equal("active", result.State);
            Assert.True(store.TryLoad(out var persisted));
            var hint = Assert.Single(persisted.Bindings!);
            Assert.Equal("binding-1", hint.BindingId);
            Assert.Equal(1, hint.AuthorityRevision);
        }
        finally
        {
            Directory.Delete(stateDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task RebindPersisted_UsesSdkRebindWithStoredAuthorityRevision()
    {
        var transport = new TestJsonRpcTransport();
        var sdkClient = await ConnectSdkClientAsync(transport);
        var stateDirectory = Path.Combine(Path.GetTempPath(), $"oratorio-app-binding-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stateDirectory);

        try
        {
            var store = new OratorioDotCraftBindingStore(Path.Combine(stateDirectory, "binding.json"));
            store.Save(new OratorioDotCraftBinding(
                "ws://127.0.0.1:9100/ws",
                "com.dotharness.oratorio",
                "principal-1",
                "credential-1",
                DateTimeOffset.UtcNow.AddDays(20),
                "Oratorio",
                [new OratorioBindingRebindHint("binding-1", "thread-1", 7)]));
            using var services = new ServiceCollection().BuildServiceProvider();
            var service = new OratorioAppBindingService(
                new SingleClientFactory(new DotCraftAppServerClient(sdkClient)),
                null!,
                Options.Create(new DotCraftOptions()),
                store,
                new PassthroughSecretProtector(),
                new OratorioBindingMcpRuntime(services.GetRequiredService<IServiceScopeFactory>()),
                new OratorioBoardSurfaceRuntime(),
                NullLogger<OratorioAppBindingService>.Instance);

            var rebindTask = service.RebindPersistedAsync("http://127.0.0.1:5199", CancellationToken.None);

            using (var authenticate = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/connection/authenticate", authenticate.RootElement.GetProperty("method").GetString());
                await transport.PushResultAsync(authenticate, new { });
            }

            using (var rebind = await transport.ReadOutboundAsync().WaitAsync(Timeout))
            {
                Assert.Equal("app/binding/rebind", rebind.RootElement.GetProperty("method").GetString());
                var parameters = rebind.RootElement.GetProperty("params");
                Assert.Equal("binding-1", parameters.GetProperty("bindingId").GetString());
                Assert.Equal(7, parameters.GetProperty("authorityRevision").GetInt64());
                Assert.Equal("http://127.0.0.1:5199/dotcraft/bindings/binding-1/mcp", parameters.GetProperty("endpoint").GetString());
                Assert.False(string.IsNullOrWhiteSpace(parameters.GetProperty("bearer").GetString()));
                await transport.PushResultAsync(rebind, new { state = "active", authorityRevision = 7 });
            }

            await rebindTask.WaitAsync(Timeout);
        }
        finally
        {
            Directory.Delete(stateDirectory, recursive: true);
        }
    }

    private static async Task<DotCraftClient> ConnectSdkClientAsync(TestJsonRpcTransport transport)
    {
        var connectTask = DotCraftClient.ConnectAsync(
            transport,
            new DotCraftClientOptions { ClientName = "oratorio-test", ClientVersion = "1" });

        using (var initialize = await transport.ReadOutboundAsync().WaitAsync(Timeout))
        {
            await transport.PushInboundAsync(new
            {
                jsonrpc = "2.0",
                id = initialize.RootElement.GetProperty("id").GetInt64(),
                result = new
                {
                    serverInfo = new { name = "dotcraft", version = "1", protocolVersion = "1" },
                    capabilities = new { appBinding = true, appBindingVersion = 2 }
                }
            });
        }

        using (var initialized = await transport.ReadOutboundAsync().WaitAsync(Timeout))
        {
            Assert.Equal("initialized", initialized.RootElement.GetProperty("method").GetString());
        }

        return await connectTask.WaitAsync(Timeout);
    }

    private sealed class SingleClientFactory(IDotCraftAppServerClient client) : IDotCraftAppServerClientFactory
    {
        public Task<IDotCraftAppServerClient> ConnectAsync(string appServerUrl, CancellationToken ct, string? token = null) =>
            Task.FromResult(client);
    }

    private sealed class PassthroughSecretProtector : IConfigurationSecretProtector
    {
        public bool IsProtected(string? value) => false;
        public string Protect(string value) => value;
        public string? Unprotect(string? value) => value;
    }

    private sealed class TestJsonRpcTransport : IJsonRpcTransport
    {
        private readonly Channel<JsonDocument> _inbound = Channel.CreateUnbounded<JsonDocument>();
        private readonly Channel<JsonDocument> _outbound = Channel.CreateUnbounded<JsonDocument>();

        public Task<JsonDocument?> ReadAsync(CancellationToken cancellationToken = default) =>
            ReadNullableAsync(_inbound.Reader, cancellationToken);

        public Task WriteAsync(object message, CancellationToken cancellationToken = default)
        {
            var json = JsonSerializer.Serialize(message, DotCraftJson.Options);
            _outbound.Writer.TryWrite(JsonDocument.Parse(json));
            return Task.CompletedTask;
        }

        public Task PushInboundAsync(object message)
        {
            var json = JsonSerializer.Serialize(message, DotCraftJson.Options);
            _inbound.Writer.TryWrite(JsonDocument.Parse(json));
            return Task.CompletedTask;
        }

        public Task PushResultAsync(JsonDocument request, object result) =>
            PushInboundAsync(new
            {
                jsonrpc = "2.0",
                id = request.RootElement.GetProperty("id").GetInt64(),
                result
            });

        public Task<JsonDocument> ReadOutboundAsync(CancellationToken cancellationToken = default) =>
            _outbound.Reader.ReadAsync(cancellationToken).AsTask();

        public ValueTask DisposeAsync()
        {
            _inbound.Writer.TryComplete();
            _outbound.Writer.TryComplete();
            return ValueTask.CompletedTask;
        }

        private static async Task<JsonDocument?> ReadNullableAsync(
            ChannelReader<JsonDocument> reader,
            CancellationToken cancellationToken)
        {
            try
            {
                return await reader.ReadAsync(cancellationToken);
            }
            catch (ChannelClosedException)
            {
                return null;
            }
        }
    }
}
