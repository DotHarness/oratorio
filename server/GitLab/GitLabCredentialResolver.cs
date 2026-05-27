using Oratorio.Server.Services;
using Oratorio.Server.Sources;

namespace Oratorio.Server.GitLab;

public sealed record GitLabCredentialStatus(
    bool HasToken,
    bool HasWebhookSecret,
    bool HasWebhookSigningToken,
    bool AllowsUnsafeLocalWebhooks,
    bool UsesProjectProfiles);

public sealed record GitLabProjectCredentialStatus(
    bool ProfileConfigured,
    bool HasToken,
    bool HasWebhookSecret,
    bool HasWebhookSigningToken,
    string TokenKind,
    bool UsesLegacyFallback,
    bool AllowsUnsafeLocalWebhooks);

public sealed class GitLabCredentialException(string code, string message) : InvalidOperationException(message)
{
    public string Code { get; } = code;
}

public interface IGitLabCredentialResolver
{
    GitLabCredentialStatus Resolve(GitLabOptions options);
    GitLabProjectCredentialStatus ResolveProject(GitLabOptions options, GitLabProjectRef project);
    string? ResolveToken(GitLabOptions options, GitLabProjectRef project);
    string? ResolveWebhookSecret(GitLabOptions options, GitLabProjectRef project);
    string? ResolveWebhookSigningToken(GitLabOptions options, GitLabProjectRef project);
    string? ResolveSecret(string? value);
}

public sealed class GitLabCredentialResolver(IConfigurationSecretProtector secretProtector) : IGitLabCredentialResolver
{
    public GitLabCredentialStatus Resolve(GitLabOptions options)
    {
        var profiles = EffectiveProfiles(options).ToArray();
        if (profiles.Length == 0)
        {
            return new GitLabCredentialStatus(
                !string.IsNullOrWhiteSpace(ResolveSecret(options.Token)),
                !string.IsNullOrWhiteSpace(ResolveSecret(options.WebhookSecret)),
                !string.IsNullOrWhiteSpace(ResolveSecret(options.WebhookSigningToken)),
                options.AllowLocalDevelopmentUnsafeWebhooks,
                false);
        }

        var instance = SourceProjectKey.ResolveGitLabInstance(options.Endpoint);
        var currentProfiles = profiles
            .Where(profile => string.Equals(NormalizeInstance(profile.Instance), instance, StringComparison.OrdinalIgnoreCase))
            .ToArray();
        return new GitLabCredentialStatus(
            currentProfiles.Any(profile => !string.IsNullOrWhiteSpace(ResolveSecret(profile.Token))),
            currentProfiles.Any(profile => !string.IsNullOrWhiteSpace(ResolveSecret(profile.WebhookSecret))),
            currentProfiles.Any(profile => !string.IsNullOrWhiteSpace(ResolveSecret(profile.WebhookSigningToken))),
            options.AllowLocalDevelopmentUnsafeWebhooks,
            true);
    }

    public GitLabProjectCredentialStatus ResolveProject(GitLabOptions options, GitLabProjectRef project)
    {
        var profile = ResolveProfile(options, project);
        if (profile is null)
        {
            return new GitLabProjectCredentialStatus(
                false,
                false,
                false,
                false,
                "none",
                false,
                options.AllowLocalDevelopmentUnsafeWebhooks);
        }

        var usesLegacy = EffectiveProfiles(options).Count == 0;
        return new GitLabProjectCredentialStatus(
            true,
            !string.IsNullOrWhiteSpace(ResolveSecret(profile.Token)),
            !string.IsNullOrWhiteSpace(ResolveSecret(profile.WebhookSecret)),
            !string.IsNullOrWhiteSpace(ResolveSecret(profile.WebhookSigningToken)),
            string.IsNullOrWhiteSpace(profile.TokenKind) ? "accessToken" : profile.TokenKind,
            usesLegacy,
            options.AllowLocalDevelopmentUnsafeWebhooks);
    }

    public string? ResolveToken(GitLabOptions options, GitLabProjectRef project) =>
        ResolveSecret(ResolveProfile(options, project)?.Token);

    public string? ResolveWebhookSecret(GitLabOptions options, GitLabProjectRef project) =>
        ResolveSecret(ResolveProfile(options, project)?.WebhookSecret);

    public string? ResolveWebhookSigningToken(GitLabOptions options, GitLabProjectRef project) =>
        ResolveSecret(ResolveProfile(options, project)?.WebhookSigningToken);

    public string? ResolveSecret(string? value) =>
        ExpandEnvironment(secretProtector.Unprotect(value));

    private GitLabProjectProfileOptions? ResolveProfile(GitLabOptions options, GitLabProjectRef project)
    {
        var profiles = EffectiveProfiles(options).ToArray();
        if (profiles.Length == 0)
        {
            return string.IsNullOrWhiteSpace(options.Token) &&
                string.IsNullOrWhiteSpace(options.WebhookSecret) &&
                string.IsNullOrWhiteSpace(options.WebhookSigningToken)
                ? null
                : new GitLabProjectProfileOptions
                {
                    Instance = SourceProjectKey.ResolveGitLabInstance(options.Endpoint),
                    ProjectPath = project.ProjectPath,
                    TokenKind = string.IsNullOrWhiteSpace(options.TokenKind) ? "accessToken" : options.TokenKind,
                    Token = options.Token,
                    WebhookSecret = options.WebhookSecret,
                    WebhookSigningToken = options.WebhookSigningToken
                };
        }

        var instance = SourceProjectKey.ResolveGitLabInstance(options.Endpoint);
        return profiles.FirstOrDefault(profile =>
            string.Equals(NormalizeInstance(profile.Instance), instance, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(SourceProjectKey.NormalizeGitLabProjectPath(profile.ProjectPath), project.ProjectPath, StringComparison.OrdinalIgnoreCase));
    }

    private static IReadOnlyList<GitLabProjectProfileOptions> EffectiveProfiles(GitLabOptions options) =>
        (options.ProjectProfiles ?? [])
            .Where(profile => !string.IsNullOrWhiteSpace(SourceProjectKey.NormalizeGitLabProjectPath(profile.ProjectPath)))
            .ToArray();

    private static string NormalizeInstance(string? instance) =>
        string.IsNullOrWhiteSpace(instance) ? "gitlab.com" : instance.Trim().ToLowerInvariant();

    private static string? ExpandEnvironment(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (value.StartsWith('$') && value.Length > 1)
        {
            return Environment.GetEnvironmentVariable(value[1..]);
        }

        return Environment.ExpandEnvironmentVariables(value);
    }
}
