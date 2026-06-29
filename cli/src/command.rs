use std::{fs, path::PathBuf, time::Duration};

use anyhow::{Context, Result, bail};
use clap::Args;

use crate::{
    config::{
        DeploymentPaths, GithubProject, add_github_repo, build_deployment, read_config,
        write_config, write_generated,
    },
    docker,
    doctor::{print_results, run_checks, wait_for_oratorio_health},
    prompt::prompt_init_options,
};

#[derive(Args, Debug)]
pub struct InitArgs {
    /// Deployment directory to create.
    #[arg(long)]
    pub dir: Option<PathBuf>,
    /// Add a GitHub repository during initialization.
    #[arg(long = "repo")]
    pub repos: Vec<GithubProject>,
    /// DotCraft provider name.
    #[arg(long)]
    pub provider: Option<String>,
    /// DotCraft model name.
    #[arg(long)]
    pub model: Option<String>,
    /// DotCraft API key. Omit for an interactive secret prompt.
    #[arg(long)]
    pub dotcraft_api_key: Option<String>,
    /// GitHub read token. Omit for an interactive secret prompt.
    #[arg(long)]
    pub github_token: Option<String>,
    /// Use defaults for omitted options and skip prompts.
    #[arg(long)]
    pub yes: bool,
    /// Print the generated plan without writing files or running Docker.
    #[arg(long)]
    pub dry_run: bool,
    /// Do not pull images or start Docker Compose.
    #[arg(long)]
    pub no_start: bool,
}

#[derive(Args, Debug)]
pub struct AddRepoArgs {
    /// GitHub project key, such as github:owner/repo.
    pub repo: GithubProject,
    /// Existing deployment directory.
    #[arg(long, default_value = ".")]
    pub dir: PathBuf,
    /// Clone URL. Defaults to git@github.com:owner/repo.git.
    #[arg(long)]
    pub clone_url: Option<String>,
    /// Add the repository to the Auto Review allowlist.
    #[arg(long, default_value_t = true, action = clap::ArgAction::SetTrue)]
    pub auto_review: bool,
    /// Do not add the repository to the Auto Review allowlist.
    #[arg(long = "no-auto-review", action = clap::ArgAction::SetTrue)]
    pub no_auto_review: bool,
    /// Print actions without writing config or cloning.
    #[arg(long)]
    pub dry_run: bool,
}

impl AddRepoArgs {
    pub fn auto_review_enabled(&self) -> bool {
        self.auto_review && !self.no_auto_review
    }
}

#[derive(Args, Debug)]
pub struct ServerDirArgs {
    /// Deployment directory.
    #[arg(long, default_value = ".")]
    pub dir: PathBuf,
}

#[derive(Args, Debug)]
pub struct ServerLogsArgs {
    /// Deployment directory.
    #[arg(long, default_value = ".")]
    pub dir: PathBuf,
    /// Follow logs.
    #[arg(short, long)]
    pub follow: bool,
}

pub fn init(args: InitArgs) -> Result<()> {
    let (dir, options) = prompt_init_options(
        args.dir,
        args.repos,
        args.yes,
        args.provider,
        args.model,
        args.dotcraft_api_key,
        args.github_token,
    )?;
    let paths = DeploymentPaths::new(&dir);

    if !args.dry_run
        && (options.dotcraft_api_key.trim().is_empty() || options.github_token.trim().is_empty())
    {
        bail!(
            "DotCraft API key and GitHub token are required. Run interactively or pass --dotcraft-api-key and --github-token."
        );
    }

    let generated = build_deployment(&options)?;

    if args.dry_run {
        println!("Would create deployment at {}", paths.root.display());
        println!("Would write {}", paths.compose.display());
        println!("Would write {}", paths.env.display());
        println!("Would write {}", paths.config.display());
        println!();
        println!("{}", generated.config);
        return Ok(());
    }

    ensure_prerequisites(!args.no_start)?;

    if paths.root.exists() && fs::read_dir(&paths.root)?.next().is_some() {
        bail!(
            "deployment directory already exists and is not empty: {}",
            paths.root.display()
        );
    }

    write_generated(&paths, &generated)?;
    for repo in &options.repos {
        let target = paths.workspace.join(repo.workspace_dir_name());
        if !target.exists() {
            println!(
                "Cloning {} into {}",
                repo.default_clone_url(),
                target.display()
            );
            docker::git_clone(&repo.default_clone_url(), &target)
                .with_context(|| format!("failed to clone {}", repo.key()))?;
        }
    }

    if !args.no_start {
        docker::compose(&["pull"], &paths.root)?;
        docker::compose(&["up", "-d"], &paths.root)?;
        println!("Waiting for Oratorio health check...");
        wait_for_oratorio_health(options.oratorio_port, Duration::from_secs(90))?;
    }

    print_connection_help(options.oratorio_port);
    Ok(())
}

pub fn add_repo(args: AddRepoArgs) -> Result<()> {
    let paths = DeploymentPaths::new(&args.dir);
    let mut config = read_config(&paths.config)?;
    add_github_repo(&mut config, &args.repo, args.auto_review_enabled())?;

    let target = paths.workspace.join(args.repo.workspace_dir_name());
    let clone_url = args
        .clone_url
        .unwrap_or_else(|| args.repo.default_clone_url());

    if args.dry_run {
        println!("Would add {} to {}", args.repo, paths.config.display());
        println!("Would clone {clone_url} into {}", target.display());
        return Ok(());
    }

    if !target.exists() {
        docker::git_clone(&clone_url, &target)
            .with_context(|| format!("failed to clone {}", args.repo.key()))?;
    }
    write_config(&paths.config, &config)?;

    println!(
        "Added {}. Restart Oratorio to load the updated config.",
        args.repo
    );
    Ok(())
}

pub fn doctor(args: ServerDirArgs) -> Result<()> {
    let results = run_checks(&args.dir);
    print_results(&results);
    if results.iter().any(|result| !result.ok) {
        bail!("one or more checks failed");
    }

    Ok(())
}

pub fn status(args: ServerDirArgs) -> Result<()> {
    let output = docker::compose_capture(&["ps"], &args.dir)?;
    println!("{output}");
    Ok(())
}

pub fn logs(args: ServerLogsArgs) -> Result<()> {
    if args.follow {
        docker::compose(&["logs", "-f"], &args.dir)
    } else {
        docker::compose(&["logs", "--tail", "120"], &args.dir)
    }
}

pub fn restart(args: ServerDirArgs) -> Result<()> {
    docker::compose(&["restart"], &args.dir)
}

pub fn upgrade(args: ServerDirArgs) -> Result<()> {
    docker::compose(&["pull"], &args.dir)?;
    docker::compose(&["up", "-d"], &args.dir)
}

fn print_connection_help(port: u16) {
    println!();
    println!("Oratorio review stack is ready.");
    println!("Connect from your desktop with:");
    println!("  ssh -N -L {port}:127.0.0.1:{port} <user>@<server>");
    println!();
    println!("Then set Oratorio Desktop remote URL to:");
    println!("  http://127.0.0.1:{port}");
}

fn ensure_prerequisites(require_docker: bool) -> Result<()> {
    let mut missing = Vec::new();
    if !docker::command_exists("git", &["--version"]) {
        missing.push("git");
    }

    if require_docker {
        if !docker::command_exists("docker", &["--version"]) {
            missing.push("docker");
        }

        if !docker::command_exists("docker", &["compose", "version"]) {
            missing.push("docker compose");
        }
    }

    if missing.is_empty() {
        return Ok(());
    }

    bail!("missing required command(s): {}", missing.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser, Debug)]
    struct AddRepoParser {
        #[command(flatten)]
        args: AddRepoArgs,
    }

    #[test]
    fn add_repo_defaults_auto_review_on() {
        let parsed = AddRepoParser::parse_from(["test", "owner/repo"]);

        assert!(parsed.args.auto_review_enabled());
    }

    #[test]
    fn add_repo_supports_no_auto_review() {
        let parsed = AddRepoParser::parse_from(["test", "owner/repo", "--no-auto-review"]);

        assert!(!parsed.args.auto_review_enabled());
    }

    #[test]
    fn add_repo_preserves_auto_review_flag_compatibility() {
        let parsed = AddRepoParser::parse_from(["test", "owner/repo", "--auto-review"]);

        assert!(parsed.args.auto_review_enabled());
    }
}
