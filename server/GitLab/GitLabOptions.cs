namespace Oratorio.Server.GitLab;

public sealed class GitLabOptions
{
    public bool Enabled { get; set; }
    public bool WritesEnabled { get; set; }
    public string Endpoint { get; set; } = "https://gitlab.com";
    // Kept for compatibility with older config files. Runtime derives the API URL from Endpoint.
    public string? ApiBaseUrl { get; set; }
    /// <summary>
    /// Legacy provider-wide token. New Settings writes ProjectProfiles instead.
    /// Runtime uses this value only when no project profiles are configured.
    /// </summary>
    public string? Token { get; set; }
    /// <summary>
    /// Legacy provider-wide token kind. Project profiles own new token kind labels.
    /// </summary>
    public string TokenKind { get; set; } = "accessToken";
    public string[] Projects { get; set; } = [];
    public GitLabProjectProfileOptions[] ProjectProfiles { get; set; } = [];
    /// <summary>
    /// Legacy provider-wide webhook secret. Runtime uses this value only when
    /// no project profiles are configured.
    /// </summary>
    public string? WebhookSecret { get; set; }
    /// <summary>
    /// Legacy provider-wide Standard Webhooks signing token. Runtime uses this
    /// value only when no project profiles are configured.
    /// </summary>
    public string? WebhookSigningToken { get; set; }
    public bool AllowLocalDevelopmentUnsafeWebhooks { get; set; }
    public int WebhookSigningToleranceSeconds { get; set; } = 300;

    public string EffectiveEndpoint =>
        string.IsNullOrWhiteSpace(Endpoint) ? "https://gitlab.com" : Endpoint.TrimEnd('/');

    public string EffectiveApiBaseUrl =>
        $"{EffectiveEndpoint}/api/v4";
}

public sealed class GitLabProjectProfileOptions
{
    public string Instance { get; set; } = "gitlab.com";
    public string ProjectPath { get; set; } = "";
    public string TokenKind { get; set; } = "accessToken";
    public string? Token { get; set; }
    public string? WebhookSecret { get; set; }
    public string? WebhookSigningToken { get; set; }
}
