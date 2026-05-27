using DotCraft.Sdk.Hub;
using Microsoft.Extensions.Options;

namespace Oratorio.Server.DotCraft;

public interface IDotCraftAppServerEndpointResolver
{
    Task<DotCraftAppServerEndpoint?> ResolveAsync(string workspacePath, CancellationToken ct);
}

public sealed record DotCraftAppServerEndpoint(string Url, string Source);

public sealed class DotCraftAppServerEndpointResolver(
    IOptionsMonitor<DotCraftOptions> options,
    IHttpClientFactory httpClientFactory,
    ILogger<DotCraftAppServerEndpointResolver> logger) : IDotCraftAppServerEndpointResolver
{
    public async Task<DotCraftAppServerEndpoint?> ResolveAsync(string workspacePath, CancellationToken ct)
    {
        var value = options.CurrentValue;
        if (value.HubDiscoveryEnabled)
        {
            var hubEndpoint = await ResolveFromHubAsync(value, workspacePath, ct);
            if (hubEndpoint is not null)
            {
                return hubEndpoint;
            }
        }

        return string.IsNullOrWhiteSpace(value.AppServerUrl)
            ? null
            : new DotCraftAppServerEndpoint(value.AppServerUrl, "configuration");
    }

    private async Task<DotCraftAppServerEndpoint?> ResolveFromHubAsync(DotCraftOptions value, string workspacePath, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(workspacePath))
        {
            return null;
        }

        try
        {
            var appServer = await CreateHubClient(value, startHubIfMissing: false)
                .GetAppServerByWorkspaceAsync(workspacePath, ct);
            if (appServer is null ||
                !string.Equals(appServer.State, HubAppServerStates.Running, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var appServerWebSocket = ResolveAppServerWebSocket(appServer);
            return string.IsNullOrWhiteSpace(appServerWebSocket)
                ? null
                : new DotCraftAppServerEndpoint(appServerWebSocket, "hub");
        }
        catch (Exception ex) when (ex is HubClientException or HttpRequestException or TaskCanceledException)
        {
            logger.LogDebug(ex, "Could not query DotCraft Hub for workspace AppServer.");
            return null;
        }
    }

    internal static HubClient CreateHubClient(
        DotCraftOptions value,
        IHttpClientFactory httpClientFactory,
        bool startHubIfMissing) =>
        new(new DotCraftHubClientOptions
        {
            HubLockPath = value.HubLockPath,
            DotCraftBin = ResolveDotCraftBin(value),
            StartHubIfMissing = startHubIfMissing,
            HttpClientFactory = () => httpClientFactory.CreateClient("DotCraftHub")
        });

    internal static string? ResolveAppServerWebSocket(HubAppServerResponse response)
    {
        if (response.Endpoints.TryGetValue("appServerWebSocket", out var endpoint))
        {
            return endpoint;
        }

        return response.ServiceStatus.TryGetValue("appServerWebSocket", out var service)
            ? service.Url
            : null;
    }

    private HubClient CreateHubClient(DotCraftOptions value, bool startHubIfMissing) =>
        CreateHubClient(value, httpClientFactory, startHubIfMissing);

    private static string? ResolveDotCraftBin(DotCraftOptions value)
    {
        if (string.Equals(Path.GetFileNameWithoutExtension(value.Command), "dotnet", StringComparison.OrdinalIgnoreCase))
        {
            return value.Arguments.FirstOrDefault(argument =>
                argument.EndsWith(".dll", StringComparison.OrdinalIgnoreCase));
        }

        return string.IsNullOrWhiteSpace(value.Command) ? null : value.Command;
    }
}
