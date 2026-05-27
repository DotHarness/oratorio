using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using Oratorio.Server.Services;
using Oratorio.Server.Sources;

namespace Oratorio.Server.DotCraft;

public sealed class DotCraftOptionsPostConfigure(
    IWebHostEnvironment environment,
    IOptions<SettingsWriteOptions> settingsOptions) : IPostConfigureOptions<DotCraftOptions>
{
    public void PostConfigure(string? name, DotCraftOptions options)
    {
        var workspaceRoutes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var route in ReadLegacyCanonicalRoutes(ResolveOverlayPath()))
        {
            workspaceRoutes[route.Project] = route.WorkspacePath;
        }

        foreach (var route in options.RepositoryWorkspaceRoutes)
        {
            if (TryNormalizeRoute(route, out var project, out var workspacePath))
            {
                workspaceRoutes[project] = workspacePath;
            }
        }

        var repositoryWorkspaces = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (project, workspacePath) in options.RepositoryWorkspaces)
        {
            if (string.IsNullOrWhiteSpace(project) ||
                string.IsNullOrWhiteSpace(workspacePath) ||
                SourceProjectKey.TryParse(project, out _))
            {
                continue;
            }

            repositoryWorkspaces[project.Trim()] = workspacePath.Trim();
        }

        foreach (var (project, workspacePath) in workspaceRoutes)
        {
            repositoryWorkspaces[project] = workspacePath;
        }

        options.RepositoryWorkspaces = repositoryWorkspaces;
        options.RepositoryWorkspaceRoutes = workspaceRoutes
            .OrderBy(route => route.Key, StringComparer.OrdinalIgnoreCase)
            .Select(route => new DotCraftRepositoryWorkspaceRoute
            {
                Project = route.Key,
                WorkspacePath = route.Value
            })
            .ToList();
    }

    private string ResolveOverlayPath()
    {
        var configured = Environment.GetEnvironmentVariable("ORATORIO_CONFIG_PATH");
        if (string.IsNullOrWhiteSpace(configured))
        {
            configured = settingsOptions.Value.ConfigPath;
        }

        return string.IsNullOrWhiteSpace(configured)
            ? OratorioStatePaths.ResolveDefaultConfigurationOverlayPath(
                environment.ContentRootPath,
                Environment.GetEnvironmentVariable("ORATORIO_STATE_ROOT"))
            : Path.GetFullPath(configured);
    }

    private static IEnumerable<DotCraftRepositoryWorkspaceRoute> ReadLegacyCanonicalRoutes(string overlayPath)
    {
        if (!File.Exists(overlayPath))
        {
            yield break;
        }

        using var document = JsonDocument.Parse(File.ReadAllText(overlayPath));
        if (!TryGetProperty(document.RootElement, "Oratorio", out var oratorio) ||
            !TryGetProperty(oratorio, "DotCraft", out var dotCraft) ||
            !TryGetProperty(dotCraft, "RepositoryWorkspaces", out var workspaces) ||
            workspaces.ValueKind != JsonValueKind.Object)
        {
            yield break;
        }

        foreach (var property in workspaces.EnumerateObject())
        {
            if (property.Value.ValueKind == JsonValueKind.String &&
                SourceProjectKey.TryParse(property.Name, out var project) &&
                !string.IsNullOrWhiteSpace(property.Value.GetString()))
            {
                yield return new DotCraftRepositoryWorkspaceRoute
                {
                    Project = project.Key,
                    WorkspacePath = property.Value.GetString()!.Trim()
                };
            }
        }
    }

    private static bool TryNormalizeRoute(DotCraftRepositoryWorkspaceRoute route, out string project, out string workspacePath)
    {
        project = "";
        workspacePath = "";
        if (!SourceProjectKey.TryParse(route.Project, out var key) ||
            string.IsNullOrWhiteSpace(route.WorkspacePath))
        {
            return false;
        }

        project = key.Key;
        workspacePath = route.WorkspacePath.Trim();
        return true;
    }

    private static bool TryGetProperty(JsonElement element, string propertyName, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }
}
