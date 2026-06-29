use std::{path::PathBuf, str::FromStr};

use anyhow::{Result, anyhow, bail};
use inquire::{Confirm, Password, Select, Text};

use crate::config::{
    DEFAULT_APPSERVER_PORT, DEFAULT_DASHBOARD_PORT, DEFAULT_DEPLOY_DIR, DEFAULT_MODEL,
    DEFAULT_ORATORIO_PORT, DEFAULT_PROVIDER, DeploymentOptions, GitHubAppConfig, GithubProject,
    first_available_port,
};

pub fn prompt_init_options(
    dir: Option<PathBuf>,
    repos: Vec<GithubProject>,
    yes: bool,
    provider: Option<String>,
    model: Option<String>,
    dotcraft_api_key: Option<String>,
    github_token: Option<String>,
) -> Result<(PathBuf, DeploymentOptions)> {
    if yes {
        let dir = dir.unwrap_or_else(|| PathBuf::from(DEFAULT_DEPLOY_DIR));
        if repos.is_empty() {
            bail!("--yes requires at least one --repo github:owner/repo");
        }

        return Ok((
            dir,
            DeploymentOptions {
                provider: provider.unwrap_or_else(|| DEFAULT_PROVIDER.to_string()),
                model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
                dotcraft_api_key: dotcraft_api_key.unwrap_or_default(),
                github_token: github_token.unwrap_or_default(),
                github_app: None,
                repos,
                auto_review: true,
                oratorio_port: first_available_port(DEFAULT_ORATORIO_PORT)?,
                appserver_port: first_available_port(DEFAULT_APPSERVER_PORT)?,
                dashboard_port: first_available_port(DEFAULT_DASHBOARD_PORT)?,
            },
        ));
    }

    let dir = match dir {
        Some(value) => value,
        None => PathBuf::from(
            Text::new("Deployment directory")
                .with_default(DEFAULT_DEPLOY_DIR)
                .prompt()?,
        ),
    };

    let provider = provider.unwrap_or_else(|| {
        Select::new(
            "DotCraft provider",
            vec![DEFAULT_PROVIDER.to_string(), "openai".to_string()],
        )
        .prompt()
        .unwrap_or_else(|_| DEFAULT_PROVIDER.to_string())
    });
    let model = model.unwrap_or_else(|| {
        Text::new("DotCraft model")
            .with_default(DEFAULT_MODEL)
            .prompt()
            .unwrap_or_else(|_| DEFAULT_MODEL.to_string())
    });
    let dotcraft_api_key = match dotcraft_api_key {
        Some(value) => value,
        None => Password::new("DotCraft API key")
            .without_confirmation()
            .prompt()?,
    };
    let github_token = match github_token {
        Some(value) => value,
        None => Password::new("GitHub read token")
            .without_confirmation()
            .prompt()?,
    };

    let repos = if repos.is_empty() {
        let first = Text::new("First GitHub repository")
            .with_help_message("Use github:owner/repo or owner/repo")
            .prompt()?;
        vec![GithubProject::from_str(&first).map_err(|error| anyhow!("{error}"))?]
    } else {
        repos
    };

    let auto_review = Confirm::new("Enable auto review for configured repositories?")
        .with_default(true)
        .prompt()?;

    let github_app = if Confirm::new("Configure a GitHub App for review write-back now?")
        .with_default(false)
        .prompt()?
    {
        Some(GitHubAppConfig {
            app_id: Text::new("GitHub App ID").prompt()?,
            private_key_path: Text::new("Container private key path")
                .with_default("/secrets/github-app.pem")
                .prompt()?,
            installation_id: Text::new("GitHub installation ID").prompt()?,
        })
    } else {
        None
    };

    Ok((
        dir,
        DeploymentOptions {
            provider,
            model,
            dotcraft_api_key,
            github_token,
            github_app,
            repos,
            auto_review,
            oratorio_port: first_available_port(DEFAULT_ORATORIO_PORT)?,
            appserver_port: first_available_port(DEFAULT_APPSERVER_PORT)?,
            dashboard_port: first_available_port(DEFAULT_DASHBOARD_PORT)?,
        },
    ))
}
