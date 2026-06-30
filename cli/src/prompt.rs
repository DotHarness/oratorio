use std::{collections::BTreeSet, path::PathBuf, str::FromStr};

use anyhow::{Result, anyhow, bail};
use inquire::{Confirm, Password, Select, Text};

use crate::config::{
    DEFAULT_APPSERVER_PORT, DEFAULT_DASHBOARD_PORT, DEFAULT_DEPLOY_DIR,
    DEFAULT_GITHUB_PRIVATE_KEY_CONTAINER_PATH, DEFAULT_MODEL, DEFAULT_ORATORIO_PORT,
    DEFAULT_PROVIDER, DeploymentOptions, GitHubInstallationArg, GithubProject,
    build_github_app_config, first_available_port,
};

pub fn prompt_init_options(
    dir: Option<PathBuf>,
    repos: Vec<GithubProject>,
    yes: bool,
    provider: Option<String>,
    model: Option<String>,
    dotcraft_api_key: Option<String>,
    github_app_id: Option<String>,
    github_app_private_key_path: Option<String>,
    github_app_private_key_file: Option<PathBuf>,
    github_installations: Vec<GitHubInstallationArg>,
    github_installation_id: Option<String>,
    github_writes_enabled: bool,
) -> Result<(PathBuf, DeploymentOptions)> {
    if yes {
        let dir = dir.unwrap_or_else(|| PathBuf::from(DEFAULT_DEPLOY_DIR));
        if repos.is_empty() {
            bail!("--yes requires at least one --repo github:owner/repo");
        }
        let github_app = build_github_app_config(
            &repos,
            github_app_id,
            github_app_private_key_path,
            github_app_private_key_file,
            github_installations,
            github_installation_id,
            github_writes_enabled,
        )?;

        return Ok((
            dir,
            DeploymentOptions {
                provider: provider.unwrap_or_else(|| DEFAULT_PROVIDER.to_string()),
                model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
                dotcraft_api_key: dotcraft_api_key.unwrap_or_default(),
                github_app: Some(github_app),
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

    let repos = if repos.is_empty() {
        let first = Text::new("First GitHub repository")
            .with_help_message("Use github:owner/repo or owner/repo")
            .prompt()?;
        vec![GithubProject::from_str(&first).map_err(|error| anyhow!("{error}"))?]
    } else {
        repos
    };

    let github_app_id = match github_app_id {
        Some(value) => value,
        None => Text::new("GitHub App ID").prompt()?,
    };
    let github_app_private_key_path =
        if github_app_private_key_path.is_none() && github_app_private_key_file.is_none() {
            Some(
                Text::new("Container private key path")
                    .with_default(DEFAULT_GITHUB_PRIVATE_KEY_CONTAINER_PATH)
                    .prompt()?,
            )
        } else {
            github_app_private_key_path
        };
    let github_installation_id = prompt_installation_id_if_single_owner(
        &repos,
        github_installations.is_empty(),
        github_installation_id,
    )?;
    let github_writes_enabled = Confirm::new("Enable GitHub write-back?")
        .with_default(github_writes_enabled)
        .prompt()?;
    let github_app = build_github_app_config(
        &repos,
        Some(github_app_id),
        github_app_private_key_path,
        github_app_private_key_file,
        github_installations,
        github_installation_id,
        github_writes_enabled,
    )?;

    let auto_review = Confirm::new("Enable auto review for configured repositories?")
        .with_default(true)
        .prompt()?;

    Ok((
        dir,
        DeploymentOptions {
            provider,
            model,
            dotcraft_api_key,
            github_app: Some(github_app),
            repos,
            auto_review,
            oratorio_port: first_available_port(DEFAULT_ORATORIO_PORT)?,
            appserver_port: first_available_port(DEFAULT_APPSERVER_PORT)?,
            dashboard_port: first_available_port(DEFAULT_DASHBOARD_PORT)?,
        },
    ))
}

fn prompt_installation_id_if_single_owner(
    repos: &[GithubProject],
    can_prompt: bool,
    installation_id: Option<String>,
) -> Result<Option<String>> {
    if installation_id.is_some() || !can_prompt {
        return Ok(installation_id);
    }

    let owners = repos
        .iter()
        .map(|repo| repo.owner().to_lowercase())
        .collect::<BTreeSet<_>>();
    if owners.len() != 1 {
        return Ok(None);
    }

    let value = Text::new("GitHub installation ID (optional)")
        .with_help_message("Leave empty to let the server discover the installation at runtime.")
        .prompt()?;
    Ok(Some(value).filter(|value| !value.trim().is_empty()))
}
