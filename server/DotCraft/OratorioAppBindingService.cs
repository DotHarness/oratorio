using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Oratorio.Server.Api;

namespace Oratorio.Server.DotCraft;

public sealed class OratorioAppBindingService(
    IDotCraftAppServerClientFactory clientFactory,
    DotCraftStatusService dotCraftStatusService,
    IServiceScopeFactory scopeFactory,
    IOptions<DotCraftOptions> dotCraftOptions,
    OratorioDotCraftBindingStore bindingStore,
    ILogger<OratorioAppBindingService> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ConcurrentDictionary<string, IDotCraftAppServerClient> _activeBindings = new(StringComparer.Ordinal);
    private readonly object _connectionStatusGate = new();
    private AppBindingConnectionStatus? _lastConnectedStatus;

    public async Task<DotCraftAppBindingStatusResponse> GetConnectionStatusAsync(CancellationToken ct)
    {
        var bridge = await dotCraftStatusService.GetStatusAsync(ct);
        if (!bridge.Connected || string.IsNullOrWhiteSpace(bridge.Endpoint))
        {
            return new DotCraftAppBindingStatusResponse(
                AppServerDynamicToolCatalog.AppId,
                Available: false,
                Configured: bridge.Configured,
                Connected: false,
                State: "notConnected",
                bridge.WorkspacePath,
                bridge.Endpoint,
                bridge.EndpointSource,
                AccountLabel: null,
                ConnectedAt: null,
                ExpiresAt: null,
                Diagnostic: bridge.Reason,
                Message: bridge.Message ?? "DotCraft AppServer is not reachable.");
        }

        try
        {
            await using var client = await clientFactory.ConnectAsync(bridge.Endpoint, ct);
            await client.InitializeAsync(ct);
            var status = await client.GetAppConnectionStatusAsync(
                new AppBindingConnectionStatusRequest(AppServerDynamicToolCatalog.AppId),
                ct);
            var connected = string.Equals(status.State, "connected", StringComparison.Ordinal);
            if (connected)
            {
                RememberConnectedStatus(status);
            }
            else if (TryGetRememberedConnectedStatus(out var remembered))
            {
                return ToConnectionStatusResponse(remembered, bridge);
            }

            return new DotCraftAppBindingStatusResponse(
                status.AppId,
                Available: true,
                Configured: bridge.Configured,
                Connected: connected,
                status.State,
                bridge.WorkspacePath,
                bridge.Endpoint,
                bridge.EndpointSource,
                status.AccountLabel,
                status.ConnectedAt,
                status.ExpiresAt,
                status.Diagnostic,
                BuildConnectionStatusMessage(status));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Unable to read DotCraft App Binding connection status.");
            return new DotCraftAppBindingStatusResponse(
                AppServerDynamicToolCatalog.AppId,
                Available: false,
                Configured: bridge.Configured,
                Connected: false,
                State: "notConnected",
                bridge.WorkspacePath,
                bridge.Endpoint,
                bridge.EndpointSource,
                AccountLabel: null,
                ConnectedAt: null,
                ExpiresAt: null,
                Diagnostic: ex is WebSocketException ? "appServerWebSocketError" : "appConnectionStatusUnavailable",
                Message: "DotCraft App Binding status is unavailable.");
        }
    }

    public async Task<OratorioAppBindingInspection> InspectAsync(string handoffUrl, CancellationToken ct)
    {
        var handoff = OratorioAppBindingHandoff.FromUrl(handoffUrl);
        await using var client = await ConnectAsync(handoff, ct);

        if (handoff.Operation == OratorioAppBindingOperations.Connect)
        {
            var connection = await client.GetAppConnectionRequestAsync(
                new AppBindingConnectionRequestGetRequest(
                    handoff.AppId,
                    handoff.RequestId,
                    handoff.RequestToken),
                ct);
            return new OratorioAppBindingInspection(handoff.Operation, connection, Binding: null);
        }

        var binding = await client.GetAppBindingRequestAsync(
            new AppBindingRequestGetRequest(
                handoff.AppId,
                handoff.RequestId,
                handoff.RequestToken),
            ct);
        return new OratorioAppBindingInspection(handoff.Operation, Connection: null, binding);
    }

    public async Task<OratorioAppBindingApprovalResult> ApproveAsync(string handoffUrl, string? surfaceBaseUrl, CancellationToken ct)
    {
        var handoff = OratorioAppBindingHandoff.FromUrl(handoffUrl);
        var client = await ConnectAsync(handoff, ct);

        if (handoff.Operation == OratorioAppBindingOperations.Connect)
        {
            try
            {
                var status = await CompleteConnectionAsync(client, handoff, surfaceBaseUrl, ct);
                return new OratorioAppBindingApprovalResult(handoff.Operation, status.State, BindingId: null);
            }
            finally
            {
                await client.DisposeAsync();
            }
        }

        var bindingId = await AcceptAndAttachBindingAsync(client, handoff, ct);
        return new OratorioAppBindingApprovalResult(handoff.Operation, "active", bindingId);
    }

    private async Task<IDotCraftAppServerClient> ConnectAsync(OratorioAppBindingHandoff handoff, CancellationToken ct)
    {
        var appServerUrl = ResolveAppServerUrl(handoff);
        var client = await clientFactory.ConnectAsync(appServerUrl, ct);
        await client.InitializeAsync(ct);
        return client;
    }

    private async Task<AppBindingConnectionStatus> CompleteConnectionAsync(
        IDotCraftAppServerClient client,
        OratorioAppBindingHandoff handoff,
        string? surfaceBaseUrl,
        CancellationToken ct)
    {
        var request = await client.GetAppConnectionRequestAsync(
            new AppBindingConnectionRequestGetRequest(
                handoff.AppId,
                handoff.RequestId,
                handoff.RequestToken),
            ct);

        // Build the app-owned proof once as a concrete JSON element so the exact
        // same bytes can be both sent now and replayed on a later silent refresh
        // (DotCraft matches the stored proof by value).
        var proof = JsonSerializer.SerializeToElement(
            new
            {
                appId = handoff.AppId,
                workspaceLabel = request.WorkspaceLabel,
                mode = "deepLink",
                completedAt = DateTimeOffset.UtcNow
            },
            JsonOptions);

        var status = await client.CompleteAppConnectionAsync(
            new AppBindingConnectionConnectRequest(
                ConnectionRequestId: handoff.RequestId,
                RequestToken: handoff.RequestToken,
                AppId: handoff.AppId,
                AccountLabel: "Oratorio",
                ConnectionProof: proof,
                PublicMetadata: BuildPublicConnectionMetadata(surfaceBaseUrl)),
            ct);
        RememberConnectedStatus(status);

        // Persist the durable binding so a restart on a new dynamic loopback port
        // can silently re-announce the refreshed surface endpoint to DotCraft.
        if (string.Equals(status.State, "connected", StringComparison.Ordinal))
        {
            try
            {
                bindingStore.Save(new OratorioDotCraftBinding(
                    AppServerUrl: ResolveAppServerUrl(handoff),
                    AppId: handoff.AppId,
                    ConnectionProofJson: proof.GetRawText(),
                    AccountLabel: "Oratorio"));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to persist the DotCraft binding for startup re-announce.");
            }
        }

        logger.LogInformation(
            "Completed Oratorio App Binding connection for {AppId} with state {State}.",
            status.AppId,
            status.State);
        return status;
    }

    private async Task<string> AcceptAndAttachBindingAsync(
        IDotCraftAppServerClient client,
        OratorioAppBindingHandoff handoff,
        CancellationToken ct)
    {
        var request = await client.GetAppBindingRequestAsync(
            new AppBindingRequestGetRequest(
                handoff.AppId,
                handoff.RequestId,
                handoff.RequestToken),
            ct);
        var grantedScopes = NormalizeScopes(request.RequestedScopes);
        var grantId = $"oratorio-grant-{Guid.NewGuid():N}";
        var accepted = await client.AcceptAppBindingAsync(
            new AppBindingAcceptRequest(
                BindingRequestId: handoff.RequestId,
                RequestToken: handoff.RequestToken,
                GrantId: grantId,
                GrantedScopes: grantedScopes,
                ApprovalMode: "dotcraftConfigured",
                ApprovedBy: "oratorio-auto",
                AuditRef: $"oratorio-app-binding:{grantId}"),
            ct);

        var binding = accepted.Binding;
        var context = new OratorioAppBindingGrantContext(
            handoff.AppId,
            binding.BindingId,
            binding.ThreadId,
            grantId,
            grantedScopes.ToHashSet(StringComparer.Ordinal));

        client.SetDynamicToolHandler(async (call, handlerCt) =>
        {
            using var scope = scopeFactory.CreateScope();
            var handler = scope.ServiceProvider.GetRequiredService<OratorioAppBindingToolHandler>();
            return await handler.HandleAsync(context, call, handlerCt);
        });

        var tools = AppServerDynamicToolCatalog.AppBoundManagerTools(JsonOptions, context.GrantedScopes);
        var direct = tools
            .Where(tool => tool.DeferLoading != true)
            .Select(tool => tool.Name)
            .ToArray();
        var deferred = tools
            .Where(tool => tool.DeferLoading == true)
            .Select(tool => tool.Name)
            .ToArray();

        var attached = await client.AttachAppBindingToolsAsync(
            new AppBindingAttachToolsRequest(
                BindingId: binding.BindingId,
                ThreadId: binding.ThreadId,
                AppId: handoff.AppId,
                GrantId: grantId,
                Tools: tools,
                DirectToolNames: direct,
                DeferredToolNames: deferred,
                GrantProof: new
                {
                    appId = handoff.AppId,
                    bindingId = binding.BindingId,
                    threadId = binding.ThreadId,
                    grantId,
                    grantedScopes,
                    issuedAt = DateTimeOffset.UtcNow
                }),
            ct);
        await UpsertBoardToolsContextBlockAsync(client, binding, grantId, context.GrantedScopes, ct);
        RememberConnectedBinding(attached.Binding);

        logger.LogInformation(
            "Attached {ToolCount} Oratorio App Binding tool(s) for binding {BindingId}.",
            attached.AcceptedToolCount,
            binding.BindingId);

        if (_activeBindings.TryRemove(binding.BindingId, out var previousClient))
        {
            await previousClient.DisposeAsync();
        }

        _activeBindings[binding.BindingId] = client;
        _ = Task.Run(() => KeepBindingAliveAsync(binding.BindingId, client));
        return binding.BindingId;
    }

    private async Task UpsertBoardToolsContextBlockAsync(
        IDotCraftAppServerClient client,
        AppBindingWire binding,
        string grantId,
        IReadOnlySet<string> grantedScopes,
        CancellationToken ct)
    {
        try
        {
            await client.UpsertAppBindingContextBlockAsync(
                new AppBindingContextBlockUpsertRequest(
                    BindingId: binding.BindingId,
                    AppId: binding.AppId,
                    GrantId: grantId,
                    BlockId: AppServerDynamicToolCatalog.BoardToolsContextBlockId,
                    Kind: "policy",
                    Title: AppServerDynamicToolCatalog.BoardToolsContextBlockTitle,
                    Content: AppServerDynamicToolCatalog.AppBoundManagerToolsContext(grantedScopes),
                    Order: 100,
                    Version: "1",
                    Visibility: "model"),
                ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(
                ex,
                "Unable to upsert Oratorio App Binding context block for binding {BindingId}.",
                binding.BindingId);
        }
    }

    private async Task KeepBindingAliveAsync(string bindingId, IDotCraftAppServerClient client)
    {
        try
        {
            await foreach (var notification in client.ReadNotificationsAsync(CancellationToken.None))
            {
                logger.LogDebug(
                    "Received App Binding notification {Method} for binding {BindingId}.",
                    notification.Method,
                    bindingId);
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "App Binding notification loop ended for {BindingId}.", bindingId);
        }
        finally
        {
            if (_activeBindings.TryGetValue(bindingId, out var removed) && ReferenceEquals(removed, client))
            {
                _activeBindings.TryRemove(bindingId, out _);
                await client.DisposeAsync();
            }
        }
    }

    private string ResolveAppServerUrl(OratorioAppBindingHandoff handoff)
    {
        if (!string.IsNullOrWhiteSpace(handoff.AppServerUrl))
        {
            return handoff.AppServerUrl;
        }

        if (!string.IsNullOrWhiteSpace(dotCraftOptions.Value.AppServerUrl))
        {
            return dotCraftOptions.Value.AppServerUrl;
        }

        throw OratorioApiException.Validation("DotCraft AppServer endpoint was not provided by the handoff.");
    }

    private static IReadOnlyList<string> NormalizeScopes(IReadOnlyList<string> scopes)
    {
        var normalized = scopes
            .Select(scope => scope.Trim())
            .Where(scope => scope.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        return normalized.Length == 0
            ? [AppServerDynamicToolCatalog.BoardReadScope, AppServerDynamicToolCatalog.BoardManageScope]
            : normalized;
    }

    private void RememberConnectedStatus(AppBindingConnectionStatus status)
    {
        if (!string.Equals(status.AppId, AppServerDynamicToolCatalog.AppId, StringComparison.Ordinal) ||
            !string.Equals(status.State, "connected", StringComparison.Ordinal))
        {
            return;
        }

        lock (_connectionStatusGate)
        {
            _lastConnectedStatus = status;
        }
    }

    private bool TryGetRememberedConnectedStatus(out AppBindingConnectionStatus status)
    {
        lock (_connectionStatusGate)
        {
            status = _lastConnectedStatus!;
        }

        if (status is null)
        {
            return false;
        }

        if (status.ExpiresAt is { } expiresAt && expiresAt <= DateTimeOffset.UtcNow)
        {
            return false;
        }

        return true;
    }

    private void RememberConnectedBinding(AppBindingWire binding)
    {
        if (!string.Equals(binding.AppId, AppServerDynamicToolCatalog.AppId, StringComparison.Ordinal) ||
            !string.Equals(binding.ConnectionState, "connected", StringComparison.Ordinal))
        {
            return;
        }

        RememberConnectedStatus(new AppBindingConnectionStatus(
            binding.AppId,
            "connected",
            ConnectedAt: DateTimeOffset.UtcNow,
            AccountLabel: "Oratorio"));
    }

    private static DotCraftAppBindingStatusResponse ToConnectionStatusResponse(
        AppBindingConnectionStatus status,
        DotCraftStatusResponse bridge) =>
        new(
            status.AppId,
            Available: true,
            Configured: bridge.Configured,
            Connected: true,
            "connected",
            bridge.WorkspacePath,
            bridge.Endpoint,
            bridge.EndpointSource,
            status.AccountLabel,
            status.ConnectedAt,
            status.ExpiresAt,
            status.Diagnostic,
            BuildConnectionStatusMessage(status));

    private static string BuildConnectionStatusMessage(AppBindingConnectionStatus status)
    {
        if (string.Equals(status.State, "connected", StringComparison.Ordinal))
        {
            return string.IsNullOrWhiteSpace(status.AccountLabel)
                ? "DotCraft is connected to Oratorio."
                : $"DotCraft is connected to {status.AccountLabel}.";
        }

        if (!string.IsNullOrWhiteSpace(status.Diagnostic))
        {
            return status.Diagnostic;
        }

        return status.State switch
        {
            "connecting" => "DotCraft is connecting to Oratorio.",
            "error" => "DotCraft reported an App Binding connection error.",
            _ => "DotCraft has not connected Oratorio."
        };
    }

    internal static object? BuildPublicConnectionMetadata(string? surfaceBaseUrl)
    {
        if (!TryNormalizeLoopbackBaseUrl(surfaceBaseUrl, out var normalizedBaseUrl))
        {
            return null;
        }

        return new
        {
            displayName = "Oratorio",
            message = "Oratorio board surfaces are available from this local desktop session.",
            surfaceEndpoints = new
            {
                apiBase = $"{normalizedBaseUrl}/api/v1"
            }
        };
    }

    private static bool TryNormalizeLoopbackBaseUrl(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value) ||
            !Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https") ||
            !uri.IsLoopback)
        {
            return false;
        }

        normalized = new UriBuilder(uri)
        {
            Path = string.Empty,
            Query = string.Empty,
            Fragment = string.Empty
        }.Uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        return true;
    }
}

public static class OratorioAppBindingOperations
{
    public const string Connect = "connect";
    public const string Bind = "bind";
}

public sealed record OratorioAppBindingHandoff(
    string Operation,
    string AppId,
    string RequestId,
    string RequestToken,
    string? AppServerUrl)
{
    public static OratorioAppBindingHandoff FromUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            throw OratorioApiException.Validation("Invalid Oratorio App Binding handoff URL.");
        }

        if (!string.Equals(uri.Scheme, "oratorio", StringComparison.OrdinalIgnoreCase))
        {
            throw OratorioApiException.Validation("The handoff URL is not an Oratorio URL.");
        }

        var operation = uri.AbsolutePath.Trim('/').ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(operation))
        {
            operation = uri.Host.ToLowerInvariant();
        }

        if (operation is not (OratorioAppBindingOperations.Connect or OratorioAppBindingOperations.Bind))
        {
            throw OratorioApiException.Validation($"Unsupported App Binding operation '{operation}'.");
        }

        var query = ParseQuery(uri.Query);
        var appId = FirstNonEmpty(Get(query, "app"), Get(query, "appId")) ?? AppServerDynamicToolCatalog.AppId;
        if (!string.Equals(appId, AppServerDynamicToolCatalog.AppId, StringComparison.Ordinal))
        {
            throw OratorioApiException.Validation($"Unsupported App Binding app id '{appId}'.");
        }

        var requestId = FirstNonEmpty(Get(query, "request"), Get(query, "requestId"));
        var requestToken = FirstNonEmpty(Get(query, "token"), Get(query, "requestToken"));
        if (string.IsNullOrWhiteSpace(requestId) || string.IsNullOrWhiteSpace(requestToken))
        {
            throw OratorioApiException.Validation("The handoff URL is missing request id or token.");
        }

        return new OratorioAppBindingHandoff(
            operation,
            appId,
            requestId,
            requestToken,
            FirstNonEmpty(Get(query, "endpoint"), Get(query, "appServer")));
    }

    private static Dictionary<string, string> ParseQuery(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var trimmed = query.TrimStart('?');
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return result;
        }

        foreach (var part in trimmed.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pieces = part.Split('=', 2);
            var key = Uri.UnescapeDataString(pieces[0]);
            var value = pieces.Length == 2 ? Uri.UnescapeDataString(pieces[1]) : string.Empty;
            result[key] = value;
        }

        return result;
    }

    private static string? Get(IReadOnlyDictionary<string, string> values, string key) =>
        values.TryGetValue(key, out var value) ? value : null;

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();
}

public sealed record OratorioAppBindingInspection(
    string Operation,
    AppBindingConnectionRequestInfo? Connection,
    AppBindingRequestInfo? Binding);

public sealed record OratorioAppBindingApprovalResult(
    string Operation,
    string State,
    string? BindingId);
