using System.Text.Json;
using Microsoft.Extensions.Options;
using Oratorio.Server.Api;
using Oratorio.Server.Services;

namespace Oratorio.Server.DotCraft;

/// <summary>Coordinates the application principal and its binding-scoped MCP authorities.</summary>
public sealed class OratorioAppBindingService(
    IDotCraftAppServerClientFactory clientFactory,
    DotCraftStatusService dotCraftStatusService,
    IOptions<DotCraftOptions> dotCraftOptions,
    OratorioDotCraftBindingStore bindingStore,
    IConfigurationSecretProtector secretProtector,
    OratorioBindingMcpRuntime mcpRuntime,
    ILogger<OratorioAppBindingService> logger)
{
    public async Task<DotCraftAppBindingStatusResponse> GetConnectionStatusAsync(CancellationToken ct)
    {
        var bridge = await dotCraftStatusService.GetStatusAsync(ct);
        if (!bridge.Connected || string.IsNullOrWhiteSpace(bridge.Endpoint))
            return Status(bridge, false, "notConnected", bridge.Reason ?? bridge.Message);
        if (!bindingStore.TryLoad(out var durable))
            return Status(bridge, true, "notConnected", "Connect Oratorio to DotCraft before enabling it in a thread.");

        try
        {
            await using var client = await clientFactory.ConnectAsync(bridge.Endpoint, ct);
            await client.InitializeAsync(ct);
            await AuthenticateAsync(client, durable, ct);
            var status = await client.RequestAsync<AppConnectionStatusWire>(
                "app/connection/status", new { appId = durable.AppId }, ct);
            return new DotCraftAppBindingStatusResponse(
                durable.AppId, true, bridge.Configured, status.State == "connected", status.State,
                bridge.WorkspacePath, bridge.Endpoint, bridge.EndpointSource, durable.AccountLabel,
                null, status.ExpiresAt, status.Diagnostic,
                status.State == "connected" ? "DotCraft is connected to Oratorio." : status.Diagnostic ?? "DotCraft connection is unavailable.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Unable to authenticate the Oratorio App Binding principal.");
            return Status(bridge, true, "notConnected", "The saved Oratorio connection must be renewed.");
        }
    }

    public async Task<OratorioAppBindingInspection> InspectAsync(string handoffUrl, CancellationToken ct)
    {
        var handoff = OratorioAppBindingHandoff.FromUrl(handoffUrl);
        await using var client = await ConnectAsync(handoff, ct);
        if (handoff.Operation == OratorioAppBindingOperations.Connect)
        {
            var request = await client.RequestAsync<AppBindingConnectionRequestInfo>(
                "app/connection/request/get",
                new { connectionRequestId = handoff.RequestId, requestToken = handoff.RequestToken }, ct);
            return new(handoff.Operation, request, null);
        }

        await AuthenticateStoredPrincipalAsync(client, ct);
        var binding = await client.RequestAsync<AppBindingRequestInfo>(
            "app/binding/request/get",
            new { bindingRequestId = handoff.RequestId, requestToken = handoff.RequestToken }, ct);
        return new(handoff.Operation, null, binding);
    }

    public async Task<OratorioAppBindingApprovalResult> ApproveAsync(string handoffUrl, string? surfaceBaseUrl, CancellationToken ct)
    {
        var handoff = OratorioAppBindingHandoff.FromUrl(handoffUrl);
        await using var client = await ConnectAsync(handoff, ct);
        return handoff.Operation == OratorioAppBindingOperations.Connect
            ? await CompleteConnectionAsync(client, handoff, ct)
            : await ActivateBindingAsync(client, handoff, surfaceBaseUrl, ct);
    }

    public async Task RebindPersistedAsync(string? surfaceBaseUrl, CancellationToken ct)
    {
        if (!bindingStore.TryLoad(out var durable) || durable.Bindings is not { Count: > 0 }) return;
        await using var client = await clientFactory.ConnectAsync(durable.AppServerUrl, ct);
        await client.InitializeAsync(ct);
        await AuthenticateAsync(client, durable, ct);
        foreach (var binding in durable.Bindings)
        {
            if (!TryBuildMcpEndpoint(surfaceBaseUrl, binding.BindingId, out var endpoint)) continue;
            var bearer = mcpRuntime.Issue(binding.BindingId, binding.AuthorityRevision);
            try
            {
                await client.RequestAsync<JsonElement>("app/binding/rebind", new
                {
                    bindingId = binding.BindingId,
                    authorityRevision = binding.AuthorityRevision,
                    endpoint,
                    bearer
                }, ct);
            }
            catch
            {
                mcpRuntime.Revoke(binding.BindingId);
                throw;
            }
        }
    }

    private async Task<OratorioAppBindingApprovalResult> CompleteConnectionAsync(
        IDotCraftAppServerClient client, OratorioAppBindingHandoff handoff, CancellationToken ct)
    {
        var result = await client.RequestAsync<AppConnectionConnectWire>("app/connection/connect", new
        {
            connectionRequestId = handoff.RequestId,
            requestToken = handoff.RequestToken,
            accountLabel = "Oratorio"
        }, ct);
        bindingStore.Save(new OratorioDotCraftBinding(
            ResolveAppServerUrl(handoff), handoff.AppId, result.Principal.PrincipalId,
            secretProtector.Protect(result.Credential), result.Principal.ExpiresAt, "Oratorio", []));
        return new(handoff.Operation, "connected", null);
    }

    private async Task<OratorioAppBindingApprovalResult> ActivateBindingAsync(
        IDotCraftAppServerClient client, OratorioAppBindingHandoff handoff, string? surfaceBaseUrl, CancellationToken ct)
    {
        var durable = await AuthenticateStoredPrincipalAsync(client, ct);
        var request = await client.RequestAsync<AppBindingRequestInfo>("app/binding/request/get", new
        {
            bindingRequestId = handoff.RequestId,
            requestToken = handoff.RequestToken
        }, ct);
        if (!TryBuildMcpEndpoint(surfaceBaseUrl, request.BindingId, out var endpoint))
            throw OratorioApiException.Validation("Oratorio must expose a loopback HTTP endpoint for App Binding.");

        const long initialRevision = 1;
        var bearer = mcpRuntime.Issue(request.BindingId, initialRevision);
        JsonElement activated;
        try
        {
            activated = await client.RequestAsync<JsonElement>("app/binding/activate", new
            {
                bindingRequestId = handoff.RequestId,
                endpoint,
                bearer
            }, ct);
        }
        catch
        {
            mcpRuntime.Revoke(request.BindingId);
            throw;
        }

        var revision = activated.TryGetProperty("authorityRevision", out var revisionElement)
            ? revisionElement.GetInt64()
            : initialRevision;
        var hints = (durable.Bindings ?? [])
            .Where(item => !string.Equals(item.BindingId, request.BindingId, StringComparison.Ordinal))
            .Append(new OratorioBindingRebindHint(request.BindingId, request.ThreadId, revision))
            .ToArray();
        bindingStore.Save(durable with { Bindings = hints });
        return new(handoff.Operation,
            activated.TryGetProperty("state", out var state) ? state.GetString() ?? "syncing" : "syncing",
            request.BindingId);
    }

    private async Task<OratorioDotCraftBinding> AuthenticateStoredPrincipalAsync(IDotCraftAppServerClient client, CancellationToken ct)
    {
        if (!bindingStore.TryLoad(out var durable))
            throw OratorioApiException.Validation("Connect Oratorio to DotCraft before accepting a thread binding.");
        await AuthenticateAsync(client, durable, ct);
        return bindingStore.TryLoad(out var refreshed) ? refreshed : durable;
    }

    private async Task AuthenticateAsync(IDotCraftAppServerClient client, OratorioDotCraftBinding durable, CancellationToken ct)
    {
        var credential = secretProtector.Unprotect(durable.ProtectedCredential);
        if (string.IsNullOrWhiteSpace(credential))
            throw OratorioApiException.Validation("The saved DotCraft principal credential is unavailable.");
        await client.RequestAsync<JsonElement>("app/connection/authenticate", new
        {
            appId = durable.AppId,
            credential
        }, ct);
        if (durable.PrincipalExpiresAt <= DateTimeOffset.UtcNow.AddDays(7))
        {
            var refreshed = await client.RequestAsync<AppConnectionConnectWire>(
                "app/connection/refresh", new { }, ct);
            bindingStore.Save(durable with
            {
                PrincipalId = refreshed.Principal.PrincipalId,
                ProtectedCredential = secretProtector.Protect(refreshed.Credential),
                PrincipalExpiresAt = refreshed.Principal.ExpiresAt
            });
        }
    }

    private async Task<IDotCraftAppServerClient> ConnectAsync(OratorioAppBindingHandoff handoff, CancellationToken ct)
    {
        var client = await clientFactory.ConnectAsync(ResolveAppServerUrl(handoff), ct);
        await client.InitializeAsync(ct);
        return client;
    }

    private string ResolveAppServerUrl(OratorioAppBindingHandoff handoff) =>
        !string.IsNullOrWhiteSpace(handoff.AppServerUrl) ? handoff.AppServerUrl :
        !string.IsNullOrWhiteSpace(dotCraftOptions.Value.AppServerUrl) ? dotCraftOptions.Value.AppServerUrl :
        throw OratorioApiException.Validation("DotCraft AppServer endpoint was not provided by the handoff.");

    private static bool TryBuildMcpEndpoint(string? surfaceBaseUrl, string bindingId, out string endpoint)
    {
        endpoint = string.Empty;
        if (string.IsNullOrWhiteSpace(surfaceBaseUrl) || !Uri.TryCreate(surfaceBaseUrl, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttp || !uri.IsLoopback) return false;
        endpoint = $"{uri.GetLeftPart(UriPartial.Authority).TrimEnd('/')}/dotcraft/bindings/{Uri.EscapeDataString(bindingId)}/mcp";
        return true;
    }

    private static DotCraftAppBindingStatusResponse Status(DotCraftStatusResponse bridge, bool available, string state, string? message) =>
        new(AppServerDynamicToolCatalog.AppId, available, bridge.Configured, false, state,
            bridge.WorkspacePath, bridge.Endpoint, bridge.EndpointSource, null, null, null, state, message ?? "DotCraft connection is unavailable.");

    private sealed record AppConnectionConnectWire(AppPrincipalWire Principal, string Credential);
    private sealed record AppPrincipalWire(string PrincipalId, string AppId, string UserId, DateTimeOffset ExpiresAt);
    private sealed record AppConnectionStatusWire(string AppId, string State, DateTimeOffset? ExpiresAt, string? Diagnostic);
}

public static class OratorioAppBindingOperations
{
    public const string Connect = "connect";
    public const string Bind = "bind";
}

public sealed record OratorioAppBindingHandoff(string Operation, string AppId, string RequestId, string RequestToken, string? AppServerUrl)
{
    public static OratorioAppBindingHandoff FromUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || !string.Equals(uri.Scheme, "oratorio", StringComparison.OrdinalIgnoreCase))
            throw OratorioApiException.Validation("Invalid Oratorio App Binding handoff URL.");
        var operation = uri.AbsolutePath.Trim('/').ToLowerInvariant();
        if (operation.Length == 0) operation = uri.Host.ToLowerInvariant();
        if (operation is not (OratorioAppBindingOperations.Connect or OratorioAppBindingOperations.Bind))
            throw OratorioApiException.Validation($"Unsupported App Binding operation '{operation}'.");
        var query = uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .ToDictionary(part => Uri.UnescapeDataString(part[0]), part => part.Length == 2 ? Uri.UnescapeDataString(part[1]) : string.Empty, StringComparer.OrdinalIgnoreCase);
        string? Read(params string[] keys) => keys.Select(key => query.GetValueOrDefault(key)).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        var requestId = Read("request", "requestId");
        var token = Read("token", "requestToken");
        if (requestId is null || token is null) throw OratorioApiException.Validation("The handoff URL is missing request id or token.");
        var appId = Read("app", "appId") ?? AppServerDynamicToolCatalog.AppId;
        if (appId != AppServerDynamicToolCatalog.AppId) throw OratorioApiException.Validation($"Unsupported App Binding app id '{appId}'.");
        return new(operation, appId, requestId, token, Read("endpoint", "appServer"));
    }
}

public sealed record OratorioAppBindingInspection(string Operation, AppBindingConnectionRequestInfo? Connection, AppBindingRequestInfo? Binding);
public sealed record OratorioAppBindingApprovalResult(string Operation, string State, string? BindingId);
