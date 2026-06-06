using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

namespace Oratorio.Server.DotCraft;

/// <summary>
/// On startup, silently re-announces Oratorio's current loopback surface endpoint
/// to DotCraft using the persisted durable binding. Because Oratorio Desktop may
/// bind a new dynamic port each launch, this keeps the DotCraft-side apiBase live
/// so the embedded board reconnects with no manual re-bind. It is best-effort: if
/// DotCraft's app-server is not running, it logs and exits quietly.
/// </summary>
public sealed class OratorioAppBindingReannounceWorker(
    IHostApplicationLifetime lifetime,
    IServer server,
    IDotCraftAppServerClientFactory clientFactory,
    OratorioDotCraftBindingStore bindingStore,
    ILogger<OratorioAppBindingReannounceWorker> logger) : IHostedService
{
    private CancellationTokenRegistration _registration;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Run after the server has bound its address so the live loopback URL is known.
        _registration = lifetime.ApplicationStarted.Register(
            () => _ = ReannounceAsync(lifetime.ApplicationStopping));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _registration.Dispose();
        return Task.CompletedTask;
    }

    private async Task ReannounceAsync(CancellationToken ct)
    {
        try
        {
            if (!bindingStore.TryLoad(out var binding))
            {
                return;
            }

            var baseUrl = ResolveLiveBaseUrl();
            var metadata = OratorioAppBindingService.BuildPublicConnectionMetadata(baseUrl);
            if (metadata is null)
            {
                logger.LogDebug("Skipping DotCraft re-announce: no live loopback surface URL resolved.");
                return;
            }

            var proof = JsonDocument.Parse(binding.ConnectionProofJson).RootElement.Clone();

            await using var client = await clientFactory.ConnectAsync(binding.AppServerUrl, ct);
            await client.InitializeAsync(ct);
            await client.RefreshAppConnectionMetadataAsync(
                new AppBindingConnectionMetadataRefreshRequest(binding.AppId, proof, metadata),
                ct);

            logger.LogInformation(
                "Re-announced Oratorio loopback surface to DotCraft for {AppId} at {BaseUrl}.",
                binding.AppId,
                baseUrl);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // DotCraft may simply not be running yet; the board falls back to its
            // friendly "Open Oratorio" state and recovers on the next refresh.
            logger.LogDebug(ex, "Skipped DotCraft re-announce (app-server may be unavailable).");
        }
    }

    private string? ResolveLiveBaseUrl()
    {
        var addresses = server.Features.Get<IServerAddressesFeature>()?.Addresses;
        if (addresses is null)
        {
            return null;
        }

        // Prefer an explicit loopback address; the desktop launches the server with
        // ASPNETCORE_URLS=http://127.0.0.1:<port>, so the first address is loopback.
        foreach (var address in addresses)
        {
            if (Uri.TryCreate(address, UriKind.Absolute, out var uri) && uri.IsLoopback)
            {
                return uri.GetLeftPart(UriPartial.Authority);
            }
        }

        return addresses
            .Select(address => Uri.TryCreate(address, UriKind.Absolute, out var uri) ? uri : null)
            .FirstOrDefault(uri => uri is not null)?
            .GetLeftPart(UriPartial.Authority);
    }
}
