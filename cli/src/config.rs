#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::{
    collections::BTreeSet,
    fmt, fs,
    net::TcpListener,
    path::{Path, PathBuf},
    str::FromStr,
};
#[cfg(unix)]
use std::{fs::OpenOptions, io::Write};

use anyhow::{Context, Result, bail};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use serde::{Deserialize, Serialize};

pub const DEFAULT_DEPLOY_DIR: &str = "oratorio-review";
pub const DEFAULT_PROVIDER: &str = "anthropic";
pub const DEFAULT_MODEL: &str = "claude-opus-4-8";
pub const DEFAULT_ORATORIO_PORT: u16 = 5087;
pub const DEFAULT_APPSERVER_PORT: u16 = 19100;
pub const DEFAULT_DASHBOARD_PORT: u16 = 18080;
pub const CLI_TARGET: &str = "linux-x64";

pub fn cli_artifact_name(version: &str) -> String {
    format!("oratorio-cli-{version}-{CLI_TARGET}.tar.gz")
}

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct GithubProject {
    owner: String,
    repo: String,
}

impl GithubProject {
    pub fn key(&self) -> String {
        format!("github:github.com/{}/{}", self.owner, self.repo)
    }

    pub fn legacy_key(&self) -> String {
        format!("github:{}/{}", self.owner, self.repo)
    }

    pub fn repository(&self) -> String {
        format!("{}/{}", self.owner, self.repo)
    }

    pub fn default_clone_url(&self) -> String {
        format!("git@github.com:{}/{}.git", self.owner, self.repo)
    }

    pub fn workspace_dir_name(&self) -> String {
        format!(
            "{}__{}",
            sanitize_workspace_segment(&self.owner),
            sanitize_workspace_segment(&self.repo)
        )
    }
}

impl fmt::Display for GithubProject {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.key())
    }
}

impl FromStr for GithubProject {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self> {
        let trimmed = value.trim();
        let raw = trimmed.strip_prefix("github:").unwrap_or(trimmed);
        if raw.is_empty()
            || raw.contains('\\')
            || raw.contains("..")
            || raw.starts_with('/')
            || raw.ends_with('/')
        {
            bail!("GitHub project must look like github:owner/repo");
        }

        let parts: Vec<_> = raw.split('/').collect();
        if parts.len() != 2 || parts.iter().any(|part| part.trim().is_empty()) {
            bail!("GitHub project must look like github:owner/repo");
        }

        Ok(Self {
            owner: parts[0].trim().to_string(),
            repo: parts[1].trim().to_string(),
        })
    }
}

#[derive(Clone, Debug)]
pub struct GitHubAppConfig {
    pub app_id: String,
    pub private_key_path: String,
    pub installation_id: String,
}

#[derive(Clone, Debug)]
pub struct DeploymentOptions {
    pub provider: String,
    pub model: String,
    pub dotcraft_api_key: String,
    pub github_token: String,
    pub github_app: Option<GitHubAppConfig>,
    pub repos: Vec<GithubProject>,
    pub auto_review: bool,
    pub oratorio_port: u16,
    pub appserver_port: u16,
    pub dashboard_port: u16,
}

#[derive(Clone, Debug)]
pub struct GeneratedDeployment {
    pub compose: String,
    pub env: String,
    pub config: String,
}

#[derive(Clone, Debug)]
pub struct DeploymentPaths {
    pub root: PathBuf,
    pub workspace: PathBuf,
    pub secrets: PathBuf,
    pub compose: PathBuf,
    pub env: PathBuf,
    pub config: PathBuf,
}

impl DeploymentPaths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        Self {
            workspace: root.join("workspace"),
            secrets: root.join("secrets"),
            compose: root.join("docker-compose.yml"),
            env: root.join(".env"),
            config: root.join("oratorio.config.json"),
            root,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ConfigDocument {
    #[serde(rename = "Oratorio")]
    pub oratorio: OratorioConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct OratorioConfig {
    #[serde(rename = "GitHub")]
    pub github: GitHubConfig,
    #[serde(rename = "DotCraft")]
    pub dotcraft: DotCraftConfig,
    #[serde(rename = "Automation")]
    pub automation: AutomationConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GitHubConfig {
    #[serde(rename = "Repositories")]
    pub repositories: Vec<String>,
    #[serde(rename = "WritesEnabled")]
    pub writes_enabled: bool,
    #[serde(rename = "AppId", skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(rename = "PrivateKeyPath", skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    #[serde(rename = "InstallationProfiles", skip_serializing_if = "Vec::is_empty")]
    pub installation_profiles: Vec<GitHubInstallationProfile>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct GitHubInstallationProfile {
    #[serde(rename = "Instance")]
    pub instance: String,
    #[serde(rename = "Owner")]
    pub owner: String,
    #[serde(rename = "InstallationId")]
    pub installation_id: String,
    #[serde(rename = "Source")]
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DotCraftConfig {
    #[serde(rename = "RepositoryWorkspaceRoutes")]
    pub repository_workspace_routes: Vec<RepositoryWorkspaceRoute>,
    #[serde(rename = "AppServerUrl")]
    pub app_server_url: String,
    #[serde(rename = "HubDiscoveryEnabled")]
    pub hub_discovery_enabled: bool,
    #[serde(rename = "ManagedWorktreesEnabled")]
    pub managed_worktrees_enabled: bool,
    #[serde(rename = "WorktreeRoot")]
    pub worktree_root: String,
    #[serde(rename = "GlobalMaxActiveRuns")]
    pub global_max_active_runs: u16,
    #[serde(rename = "MaxActiveRunsPerRepository")]
    pub max_active_runs_per_repository: u16,
    #[serde(rename = "MaxActiveRunsPerSource")]
    pub max_active_runs_per_source: u16,
}

impl Default for DotCraftConfig {
    fn default() -> Self {
        Self {
            repository_workspace_routes: Vec::new(),
            app_server_url: format!("ws://dotcraft:{DEFAULT_APPSERVER_PORT}/ws"),
            hub_discovery_enabled: false,
            managed_worktrees_enabled: true,
            worktree_root: "/workspace/.oratorio/worktrees".to_string(),
            global_max_active_runs: 2,
            max_active_runs_per_repository: 1,
            max_active_runs_per_source: 2,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryWorkspaceRoute {
    #[serde(rename = "Project")]
    pub project: String,
    #[serde(rename = "WorkspacePath")]
    pub workspace_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AutomationConfig {
    #[serde(rename = "AutoReviewRepositories")]
    pub auto_review_repositories: Vec<String>,
}

pub fn build_deployment(options: &DeploymentOptions) -> Result<GeneratedDeployment> {
    validate_workspace_dir_names(&options.repos)?;
    let config = build_config(options);
    let config = serde_json::to_string_pretty(&config).context("failed to serialize config")?;
    Ok(GeneratedDeployment {
        compose: render_compose(options),
        env: render_env(options),
        config: format!("{config}\n"),
    })
}

pub fn build_config(options: &DeploymentOptions) -> ConfigDocument {
    let repos = unique_sorted(options.repos.clone());
    let mut doc = ConfigDocument::default();
    doc.oratorio.github.repositories = unique_sorted(
        repos
            .iter()
            .map(GithubProject::repository)
            .collect::<Vec<_>>(),
    );
    if let Some(app) = &options.github_app {
        doc.oratorio.github.writes_enabled = true;
        doc.oratorio.github.app_id = Some(app.app_id.clone());
        doc.oratorio.github.private_key_path = Some(app.private_key_path.clone());
        doc.oratorio.github.installation_profiles = unique_sorted(
            repos
                .iter()
                .map(|repo| GitHubInstallationProfile {
                    instance: "github.com".to_string(),
                    owner: repo.owner.clone(),
                    installation_id: app.installation_id.clone(),
                    source: "manual".to_string(),
                })
                .collect::<Vec<_>>(),
        );
    }

    doc.oratorio.dotcraft.app_server_url = format!("ws://dotcraft:{}/ws", options.appserver_port);
    doc.oratorio.dotcraft.repository_workspace_routes = repos
        .iter()
        .map(|repo| RepositoryWorkspaceRoute {
            project: repo.key(),
            workspace_path: workspace_path(repo),
        })
        .collect();

    if options.auto_review {
        doc.oratorio.automation.auto_review_repositories =
            repos.iter().map(GithubProject::key).collect();
    }

    doc
}

pub fn add_github_repo(
    doc: &mut ConfigDocument,
    repo: &GithubProject,
    auto_review: bool,
) -> Result<()> {
    ensure_workspace_route_available(doc, repo)?;

    push_unique(&mut doc.oratorio.github.repositories, repo.repository());
    doc.oratorio
        .automation
        .auto_review_repositories
        .retain(|value| !repo.matches_project_key(value));
    if auto_review {
        push_unique(
            &mut doc.oratorio.automation.auto_review_repositories,
            repo.key(),
        );
    }

    if let Some(route) = doc
        .oratorio
        .dotcraft
        .repository_workspace_routes
        .iter_mut()
        .find(|route| repo.matches_project_key(&route.project))
    {
        route.project = repo.key();
        route.workspace_path = workspace_path(repo);
    } else {
        doc.oratorio
            .dotcraft
            .repository_workspace_routes
            .push(RepositoryWorkspaceRoute {
                project: repo.key(),
                workspace_path: workspace_path(repo),
            });
    }

    Ok(())
}

pub fn read_config(path: &Path) -> Result<ConfigDocument> {
    let raw =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("failed to parse {}", path.display()))
}

pub fn write_generated(paths: &DeploymentPaths, generated: &GeneratedDeployment) -> Result<()> {
    fs::create_dir_all(&paths.root)?;
    fs::create_dir_all(&paths.workspace)?;
    fs::create_dir_all(&paths.secrets)?;
    secure_secrets_dir(&paths.secrets)?;
    fs::write(&paths.compose, &generated.compose)?;
    write_secret_file(&paths.env, &generated.env)?;
    fs::write(&paths.config, &generated.config)?;
    fs::write(
        paths.root.join(".gitignore"),
        ".env\nsecrets/\nworkspace/.oratorio/\n",
    )?;
    Ok(())
}

pub fn write_config(path: &Path, config: &ConfigDocument) -> Result<()> {
    let raw = serde_json::to_string_pretty(config)?;
    fs::write(path, format!("{raw}\n"))
        .with_context(|| format!("failed to write {}", path.display()))
}

pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn first_available_port(start: u16) -> Result<u16> {
    for port in start..=u16::MAX {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }

    bail!("no available loopback port found at or after {start}")
}

fn render_env(options: &DeploymentOptions) -> String {
    format!(
        r#"# Generated by `oratorio server init`.
# Secrets live here; server-admin structure lives in oratorio.config.json.

APPSERVER_TOKEN={appserver_token}
APPSERVER_PORT={appserver_port}
DASHBOARD_PORT={dashboard_port}
APPSERVER_PUBLISH_HOST=127.0.0.1
DASHBOARD_PUBLISH_HOST=127.0.0.1

DOTCRAFT_PROVIDER={provider}
DOTCRAFT_MODEL={model}
DOTCRAFT_API_KEY={dotcraft_api_key}

ORATORIO_PORT={oratorio_port}
ORATORIO_PUBLISH_HOST=127.0.0.1
ORATORIO_WORKSPACE_DIR=./workspace

GITHUB_TOKEN={github_token}
"#,
        appserver_token = generate_token(),
        appserver_port = options.appserver_port,
        dashboard_port = options.dashboard_port,
        provider = options.provider,
        model = options.model,
        dotcraft_api_key = options.dotcraft_api_key,
        oratorio_port = options.oratorio_port,
        github_token = options.github_token
    )
}

fn render_compose(options: &DeploymentOptions) -> String {
    format!(
        r#"# Generated by `oratorio server init`.
# Oratorio + a dedicated DotCraft AppServer share /workspace.

services:
  dotcraft:
    image: ghcr.io/dotharness/dotcraft:latest
    env_file:
      - .env
    environment:
      DOTCRAFT_WORKSPACE: /workspace
      APPSERVER_LISTEN_HOST: 0.0.0.0
      APPSERVER_PORT: ${{APPSERVER_PORT:-{appserver_port}}}
      APPSERVER_TOKEN: ${{APPSERVER_TOKEN:?set APPSERVER_TOKEN in .env}}
      DASHBOARD_LISTEN_HOST: 0.0.0.0
      DASHBOARD_PORT: ${{DASHBOARD_PORT:-{dashboard_port}}}
    ports:
      - "${{APPSERVER_PUBLISH_HOST:-127.0.0.1}}:${{APPSERVER_PORT:-{appserver_port}}}:${{APPSERVER_PORT:-{appserver_port}}}"
      - "${{DASHBOARD_PUBLISH_HOST:-127.0.0.1}}:${{DASHBOARD_PORT:-{dashboard_port}}}:${{DASHBOARD_PORT:-{dashboard_port}}}"
    volumes:
      - ${{ORATORIO_WORKSPACE_DIR:-./workspace}}:/workspace
    restart: unless-stopped

  oratorio:
    image: ghcr.io/dotharness/oratorio:latest
    depends_on:
      - dotcraft
    env_file:
      - .env
    environment:
      ASPNETCORE_URLS: http://0.0.0.0:5087
      ORATORIO_STATE_ROOT: /data/oratorio
      ORATORIO_CONFIG_PATH: /etc/oratorio/oratorio.config.json
      Oratorio__Settings__Writable: "false"
      Oratorio__DotCraft__AppServerToken: ${{APPSERVER_TOKEN:-}}
      Oratorio__GitHub__Token: ${{GITHUB_TOKEN:-}}
    volumes:
      - ${{ORATORIO_WORKSPACE_DIR:-./workspace}}:/workspace
      - ./oratorio.config.json:/etc/oratorio/oratorio.config.json:ro
      - ./secrets:/secrets:ro
      - oratorio-state:/data/oratorio
    ports:
      - "${{ORATORIO_PUBLISH_HOST:-127.0.0.1}}:${{ORATORIO_PORT:-{oratorio_port}}}:5087"
    restart: unless-stopped

volumes:
  oratorio-state:
"#,
        appserver_port = options.appserver_port,
        dashboard_port = options.dashboard_port,
        oratorio_port = options.oratorio_port
    )
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&value))
    {
        values.push(value);
        values.sort_by_key(|item| item.to_lowercase());
    }
}

fn workspace_path(repo: &GithubProject) -> String {
    format!("/workspace/{}", repo.workspace_dir_name())
}

fn sanitize_workspace_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'A'..='Z' => ch.to_ascii_lowercase(),
            'a'..='z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '-',
        })
        .collect()
}

impl GithubProject {
    fn matches_project_key(&self, value: &str) -> bool {
        value.eq_ignore_ascii_case(&self.key())
            || value.eq_ignore_ascii_case(&self.legacy_key())
            || value.eq_ignore_ascii_case(&self.repository())
    }
}

fn validate_workspace_dir_names(repos: &[GithubProject]) -> Result<()> {
    let mut seen: Vec<(String, String)> = Vec::new();
    for repo in repos {
        let dir = repo.workspace_dir_name();
        if let Some((existing_key, _)) = seen
            .iter()
            .find(|(_, existing_dir)| existing_dir.eq_ignore_ascii_case(&dir))
        {
            if !repo.matches_project_key(existing_key) {
                bail!(
                    "workspace directory collision: {} and {} both map to workspace/{}",
                    existing_key,
                    repo.key(),
                    dir
                );
            }
        } else {
            seen.push((repo.key(), dir));
        }
    }

    Ok(())
}

fn ensure_workspace_route_available(doc: &ConfigDocument, repo: &GithubProject) -> Result<()> {
    let desired_path = workspace_path(repo);
    if let Some(route) = doc
        .oratorio
        .dotcraft
        .repository_workspace_routes
        .iter()
        .find(|route| {
            route.workspace_path.eq_ignore_ascii_case(&desired_path)
                && !repo.matches_project_key(&route.project)
        })
    {
        bail!(
            "workspace route collision: {} already maps to {}",
            route.project,
            desired_path
        );
    }

    Ok(())
}

#[cfg(unix)]
fn secure_secrets_dir(path: &Path) -> Result<()> {
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .with_context(|| format!("failed to secure {}", path.display()))
}

#[cfg(not(unix))]
fn secure_secrets_dir(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(unix)]
fn write_secret_file(path: &Path, contents: &str) -> Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .with_context(|| format!("failed to write {}", path.display()))?;
    file.write_all(contents.as_bytes())
        .with_context(|| format!("failed to write {}", path.display()))?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .with_context(|| format!("failed to secure {}", path.display()))
}

#[cfg(not(unix))]
fn write_secret_file(path: &Path, contents: &str) -> Result<()> {
    fs::write(path, contents).with_context(|| format!("failed to write {}", path.display()))
}

fn unique_sorted<T>(values: Vec<T>) -> Vec<T>
where
    T: Ord,
{
    values
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> DeploymentOptions {
        DeploymentOptions {
            provider: DEFAULT_PROVIDER.to_string(),
            model: DEFAULT_MODEL.to_string(),
            dotcraft_api_key: "model-key".to_string(),
            github_token: "github-token".to_string(),
            github_app: None,
            repos: vec!["github:owner/repo-a".parse().unwrap()],
            auto_review: true,
            oratorio_port: 5087,
            appserver_port: 19100,
            dashboard_port: 18080,
        }
    }

    #[test]
    fn artifact_name_is_lowercase() {
        assert_eq!(
            cli_artifact_name("v1.2.3"),
            "oratorio-cli-v1.2.3-linux-x64.tar.gz"
        );
    }

    #[test]
    fn parses_github_project_keys() {
        let project: GithubProject = "github:DotHarness/oratorio".parse().unwrap();
        assert_eq!(project.key(), "github:github.com/DotHarness/oratorio");
        assert_eq!(project.legacy_key(), "github:DotHarness/oratorio");
        assert_eq!(project.repository(), "DotHarness/oratorio");
        assert_eq!(project.workspace_dir_name(), "dotharness__oratorio");
        assert_eq!(
            project.default_clone_url(),
            "git@github.com:DotHarness/oratorio.git"
        );
        assert!("github:owner".parse::<GithubProject>().is_err());
        assert!("github:owner/repo/extra".parse::<GithubProject>().is_err());
    }

    #[test]
    fn generated_config_contains_routes_and_auto_review() {
        let generated = build_deployment(&options()).unwrap();
        assert!(
            generated
                .compose
                .contains("Oratorio__Settings__Writable: \"false\"")
        );
        assert!(generated.env.contains("APPSERVER_PORT=19100"));
        assert!(
            generated
                .config
                .contains("\"Project\": \"github:github.com/owner/repo-a\"")
        );
        assert!(
            generated
                .config
                .contains("\"WorkspacePath\": \"/workspace/owner__repo-a\"")
        );
        assert!(generated.config.contains("\"AutoReviewRepositories\""));
    }

    #[test]
    fn add_repo_updates_existing_config() {
        let mut doc = build_config(&options());
        let repo: GithubProject = "owner/repo-b".parse().unwrap();
        add_github_repo(&mut doc, &repo, true).unwrap();

        assert_eq!(
            doc.oratorio.github.repositories,
            ["owner/repo-a", "owner/repo-b"]
        );
        assert!(
            doc.oratorio
                .dotcraft
                .repository_workspace_routes
                .iter()
                .any(|route| route.project == "github:github.com/owner/repo-b"
                    && route.workspace_path == "/workspace/owner__repo-b")
        );
    }

    #[test]
    fn add_repo_can_disable_auto_review() {
        let mut doc = build_config(&options());
        let repo: GithubProject = "owner/repo-b".parse().unwrap();
        add_github_repo(&mut doc, &repo, false).unwrap();

        assert!(
            !doc.oratorio
                .automation
                .auto_review_repositories
                .iter()
                .any(|value| value == "github:github.com/owner/repo-b")
        );
        assert!(
            doc.oratorio
                .dotcraft
                .repository_workspace_routes
                .iter()
                .any(|route| route.project == "github:github.com/owner/repo-b")
        );
    }

    #[test]
    fn add_repo_rejects_workspace_route_collision() {
        let mut doc = build_config(&options());
        doc.oratorio
            .dotcraft
            .repository_workspace_routes
            .push(RepositoryWorkspaceRoute {
                project: "github:github.com/alice/api".to_string(),
                workspace_path: "/workspace/bob__api".to_string(),
            });
        let repo: GithubProject = "bob/api".parse().unwrap();

        let error = add_github_repo(&mut doc, &repo, true).unwrap_err();

        assert!(error.to_string().contains("workspace route collision"));
    }

    #[test]
    fn build_deployment_rejects_workspace_directory_collision() {
        let mut options = options();
        options.repos = vec![
            "owner/repo-name".parse().unwrap(),
            "owner/repo name".parse().unwrap(),
        ];

        let error = build_deployment(&options).unwrap_err();

        assert!(error.to_string().contains("workspace directory collision"));
    }

    #[cfg(unix)]
    #[test]
    fn generated_secret_files_are_private_on_unix() {
        let root = tempfile::tempdir().unwrap();
        let paths = DeploymentPaths::new(root.path());
        let generated = build_deployment(&options()).unwrap();

        write_generated(&paths, &generated).unwrap();

        let env_mode = fs::metadata(&paths.env).unwrap().permissions().mode() & 0o777;
        let secrets_mode = fs::metadata(&paths.secrets).unwrap().permissions().mode() & 0o777;
        assert_eq!(env_mode, 0o600);
        assert_eq!(secrets_mode, 0o700);
    }

    #[test]
    fn finds_next_available_port() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let occupied = listener.local_addr().unwrap().port();
        let selected = first_available_port(occupied).unwrap();
        assert!(selected > occupied);
    }
}
