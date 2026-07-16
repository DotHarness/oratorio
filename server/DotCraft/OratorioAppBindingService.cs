using System.Globalization;
using System.Text.Json;
using DotCraft.Sdk.AppBinding;
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
    OratorioBoardSurfaceRuntime boardSurfaceRuntime,
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
            await AuthenticateAsync(client.AppBindings, durable, ct);
            var status = await client.AppBindings.GetConnectionStatusAsync(durable.AppId, ct);
            return new DotCraftAppBindingStatusResponse(
                durable.AppId, true, bridge.Configured, status.State == "connected", status.State,
                bridge.WorkspacePath, bridge.Endpoint, bridge.EndpointSource, durable.AccountLabel,
                ParseTimestamp(status.ConnectedAt), ParseTimestamp(status.ExpiresAt), status.Diagnostic,
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
        var handoff = ParseHandoff(handoffUrl);
        await using var client = await ConnectAsync(handoff, ct);
        if (handoff.Operation == OratorioAppBindingOperations.Connect)
        {
            var request = await client.AppBindings.GetConnectionRequestAsync<JsonElement>(new
            {
                connectionRequestId = handoff.RequestId,
                requestToken = handoff.RequestToken
            }, ct);
            return new(handoff.Operation, request, null);
        }

        await AuthenticateStoredPrincipalAsync(client.AppBindings, ct);
        var binding = await client.AppBindings.GetBindingRequestAsync(
            handoff.AppId, handoff.RequestId, handoff.RequestToken, ct);
        return new(handoff.Operation, null, binding);
    }

    public async Task<OratorioAppBindingApprovalResult> ApproveAsync(string handoffUrl, string? surfaceBaseUrl, CancellationToken ct)
    {
        var handoff = ParseHandoff(handoffUrl);
        await using var client = await ConnectAsync(handoff, ct);
        return handoff.Operation == OratorioAppBindingOperations.Connect
            ? await CompleteConnectionAsync(client.AppBindings, handoff, surfaceBaseUrl, ct)
            : await ActivateBindingAsync(client.AppBindings, handoff, surfaceBaseUrl, ct);
    }

    public async Task RebindPersistedAsync(string? surfaceBaseUrl, CancellationToken ct)
    {
        if (!bindingStore.TryLoad(out var durable) || durable.Bindings is not { Count: > 0 }) return;
        await using var client = await clientFactory.ConnectAsync(durable.AppServerUrl, ct);
        await client.InitializeAsync(ct);
        await AuthenticateAsync(client.AppBindings, durable, ct);
        foreach (var binding in durable.Bindings)
        {
            if (!TryBuildMcpEndpoint(surfaceBaseUrl, binding.BindingId, out var endpoint)) continue;
            var bearer = mcpRuntime.Issue(binding.BindingId, binding.AuthorityRevision);
            try
            {
                await client.AppBindings.RebindAsync(
                    binding.BindingId, binding.AuthorityRevision, endpoint, bearer,
                    cancellationToken: ct);
            }
            catch
            {
                mcpRuntime.Revoke(binding.BindingId);
                throw;
            }
        }
    }

    /// <summary>Authenticates the saved application principal and republishes its board surface.</summary>
    public async Task PublishSurfacePersistedAsync(string surfaceBaseUrl, CancellationToken ct)
    {
        if (!bindingStore.TryLoad(out var durable)) return;
        await using var client = await clientFactory.ConnectAsync(durable.AppServerUrl, ct);
        await client.InitializeAsync(ct);
        await AuthenticateAsync(client.AppBindings, durable, ct);
        await PublishBoardSurfaceAsync(client.AppBindings, surfaceBaseUrl, ct);
    }

    private async Task<OratorioAppBindingApprovalResult> CompleteConnectionAsync(
        DotCraftAppBindingClient appBindings, AppBindingHandoff handoff, string? surfaceBaseUrl, CancellationToken ct)
    {
        var endpoint = BuildBoardSurfaceEndpoint(surfaceBaseUrl);
        var result = await appBindings.CompleteConnectionAsync(
            new CompleteConnectionRequest(handoff.RequestId, handoff.RequestToken, "Oratorio"), ct);
        bindingStore.Save(new OratorioDotCraftBinding(
            ResolveAppServerUrl(handoff), handoff.AppId, result.Principal.PrincipalId,
            secretProtector.Protect(result.Credential), RequireTimestamp(result.Principal.ExpiresAt), "Oratorio", []));
        await appBindings.AuthenticateAsync(handoff.AppId, result.Credential, ct);
        await appBindings.PublishSurfaceAsync(
            OratorioBoardSurfaceRuntime.SurfaceId, endpoint, boardSurfaceRuntime.Bearer, ct);
        return new(handoff.Operation, "connected", null);
    }

    private async Task<OratorioAppBindingApprovalResult> ActivateBindingAsync(
        DotCraftAppBindingClient appBindings, AppBindingHandoff handoff, string? surfaceBaseUrl, CancellationToken ct)
    {
        var durable = await AuthenticateStoredPrincipalAsync(appBindings, ct);
        var request = await appBindings.GetBindingRequestAsync(
            handoff.AppId, handoff.RequestId, handoff.RequestToken, ct);
        if (!TryBuildMcpEndpoint(surfaceBaseUrl, request.BindingId, out var endpoint))
            throw OratorioApiException.Validation("Oratorio must expose a loopback HTTP endpoint for App Binding.");

        const long initialRevision = 1;
        var bearer = mcpRuntime.Issue(request.BindingId, initialRevision);
        JsonElement activated;
        try
        {
            activated = await appBindings.ActivateAsync(
                handoff.RequestId, endpoint, bearer,
                cancellationToken: ct);
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

    private async Task<OratorioDotCraftBinding> AuthenticateStoredPrincipalAsync(
        DotCraftAppBindingClient appBindings, CancellationToken ct)
    {
        if (!bindingStore.TryLoad(out var durable))
            throw OratorioApiException.Validation("Connect Oratorio to DotCraft before accepting a thread binding.");
        await AuthenticateAsync(appBindings, durable, ct);
        return bindingStore.TryLoad(out var refreshed) ? refreshed : durable;
    }

    private async Task AuthenticateAsync(
        DotCraftAppBindingClient appBindings, OratorioDotCraftBinding durable, CancellationToken ct)
    {
        var credential = secretProtector.Unprotect(durable.ProtectedCredential);
        if (string.IsNullOrWhiteSpace(credential))
            throw OratorioApiException.Validation("The saved DotCraft principal credential is unavailable.");
        await appBindings.AuthenticateAsync(durable.AppId, credential, ct);
        if (durable.PrincipalExpiresAt <= DateTimeOffset.UtcNow.AddDays(7))
        {
            var refreshedPayload = await appBindings.RefreshCredentialAsync(ct);
            var refreshed = DotCraftAppBindingClient.Deserialize<AppConnectionConnectResult>(refreshedPayload);
            bindingStore.Save(durable with
            {
                PrincipalId = refreshed.Principal.PrincipalId,
                ProtectedCredential = secretProtector.Protect(refreshed.Credential),
                PrincipalExpiresAt = RequireTimestamp(refreshed.Principal.ExpiresAt)
            });
        }
    }

    private async Task<IDotCraftAppServerClient> ConnectAsync(AppBindingHandoff handoff, CancellationToken ct)
    {
        var client = await clientFactory.ConnectAsync(ResolveAppServerUrl(handoff), ct);
        await client.InitializeAsync(ct);
        return client;
    }

    private string ResolveAppServerUrl(AppBindingHandoff handoff) =>
        !string.IsNullOrWhiteSpace(handoff.AppServerUrl) ? handoff.AppServerUrl :
        !string.IsNullOrWhiteSpace(dotCraftOptions.Value.AppServerUrl) ? dotCraftOptions.Value.AppServerUrl :
        throw OratorioApiException.Validation("DotCraft AppServer endpoint was not provided by the handoff.");

    private async Task PublishBoardSurfaceAsync(
        DotCraftAppBindingClient appBindings, string surfaceBaseUrl, CancellationToken ct)
    {
        await appBindings.PublishSurfaceAsync(
            OratorioBoardSurfaceRuntime.SurfaceId,
            BuildBoardSurfaceEndpoint(surfaceBaseUrl),
            boardSurfaceRuntime.Bearer,
            ct);
    }

    private string BuildBoardSurfaceEndpoint(string? surfaceBaseUrl)
    {
        try
        {
            return boardSurfaceRuntime.BuildEndpoint(surfaceBaseUrl ?? string.Empty);
        }
        catch (ArgumentException)
        {
            throw OratorioApiException.Validation("Oratorio must expose a loopback HTTP endpoint for the board surface.");
        }
    }

    private static bool TryBuildMcpEndpoint(string? surfaceBaseUrl, string bindingId, out string endpoint)
    {
        endpoint = string.Empty;
        if (string.IsNullOrWhiteSpace(surfaceBaseUrl) || !Uri.TryCreate(surfaceBaseUrl, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttp || !uri.IsLoopback) return false;
        endpoint = $"{uri.GetLeftPart(UriPartial.Authority).TrimEnd('/')}/dotcraft/bindings/{Uri.EscapeDataString(bindingId)}/mcp";
        return true;
    }

    private static AppBindingHandoff ParseHandoff(string url)
    {
        AppBindingHandoff handoff;
        try
        {
            handoff = AppBindingHandoff.Parse(
                url,
                expectedScheme: "oratorio",
                expectedAppId: AppServerDynamicToolCatalog.AppId);
        }
        catch (FormatException ex)
        {
            throw OratorioApiException.Validation(ex.Message);
        }

        if (handoff.Operation is not (OratorioAppBindingOperations.Connect or OratorioAppBindingOperations.Bind))
            throw OratorioApiException.Validation($"Unsupported App Binding operation '{handoff.Operation}'.");
        return handoff;
    }

    private static DateTimeOffset RequireTimestamp(string value) =>
        ParseTimestamp(value) ?? throw OratorioApiException.Validation("DotCraft returned an invalid App Binding expiry timestamp.");

    private static DateTimeOffset? ParseTimestamp(string? value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;

    private static DotCraftAppBindingStatusResponse Status(DotCraftStatusResponse bridge, bool available, string state, string? message) =>
        new(AppServerDynamicToolCatalog.AppId, available, bridge.Configured, false, state,
            bridge.WorkspacePath, bridge.Endpoint, bridge.EndpointSource, null, null, null, state, message ?? "DotCraft connection is unavailable.");
}

public static class OratorioAppBindingOperations
{
    public const string Connect = "connect";
    public const string Bind = "bind";
}

public sealed record OratorioAppBindingInspection(string Operation, JsonElement? Connection, AppBindingRequestInfo? Binding);
public sealed record OratorioAppBindingApprovalResult(string Operation, string State, string? BindingId);
