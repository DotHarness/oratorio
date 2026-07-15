using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

namespace Oratorio.Server.DotCraft;

/// <summary>
/// Rebinds saved application connections after restart with fresh, memory-only MCP bearers.
/// </summary>
public sealed class OratorioAppBindingReannounceWorker(
    IHostApplicationLifetime lifetime,
    IServer server,
    OratorioAppBindingService appBindingService,
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
            var baseUrl = ResolveLiveBaseUrl();
            if (baseUrl is null)
            {
                logger.LogDebug("Skipping DotCraft re-announce: no live loopback surface URL resolved.");
                return;
            }

            await appBindingService.RebindPersistedAsync(baseUrl, ct);
            logger.LogInformation("Rebound persisted Oratorio MCP bindings at {BaseUrl}.", baseUrl);
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
