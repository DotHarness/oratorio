using Microsoft.Extensions.Options;
using Oratorio.Server.Sources;

namespace Oratorio.Server.DotCraft;

public interface IDotCraftWorkspaceResolver
{
    string ResolveWorkspacePath(string? repository);
}

public sealed class DotCraftWorkspaceResolutionException(string code, string message) : InvalidOperationException(message)
{
    public string Code { get; } = code;
}

public sealed class DotCraftWorkspaceResolver(IOptionsMonitor<DotCraftOptions> options) : IDotCraftWorkspaceResolver
{
    public string ResolveWorkspacePath(string? repository)
    {
        var value = options.CurrentValue;
        var normalizedRepository = NormalizeRepository(repository);
        if (normalizedRepository is not null)
        {
            foreach (var configured in value.RepositoryWorkspaces)
            {
                if (SourceProjectKey.AreEquivalent(configured.Key, normalizedRepository)
                    && !string.IsNullOrWhiteSpace(configured.Value))
                {
                    return configured.Value;
                }
            }
        }

        throw new DotCraftWorkspaceResolutionException("workspaceMappingMissing", normalizedRepository is null
            ? "No repository workspace is configured for this run."
            : $"No DotCraft workspace is configured for repository '{normalizedRepository}'. Add a repository workspace mapping in Settings.");
    }

    private static string? NormalizeRepository(string? repository) =>
        SourceProjectKey.TryParse(repository, out var key)
            ? key.Key
            : SourceProjectKey.NormalizeGitHubRepository(repository);
}
