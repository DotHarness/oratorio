use std::{
    ffi::OsStr,
    path::Path,
    process::{Command, Stdio},
};

use anyhow::{Context, Result, bail};

pub fn command_exists(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn run<I, S>(program: &str, args: I, cwd: Option<&Path>) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let status = command
        .status()
        .with_context(|| format!("failed to start {program}"))?;
    if !status.success() {
        bail!("{program} exited with {status}");
    }

    Ok(())
}

pub fn capture<I, S>(program: &str, args: I, cwd: Option<&Path>) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let output = command
        .output()
        .with_context(|| format!("failed to start {program}"))?;
    if !output.status.success() {
        bail!("{program} exited with {}", output.status);
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn compose(args: &[&str], cwd: &Path) -> Result<()> {
    run(
        "docker",
        ["compose"].into_iter().chain(args.iter().copied()),
        Some(cwd),
    )
}

pub fn compose_capture(args: &[&str], cwd: &Path) -> Result<String> {
    capture(
        "docker",
        ["compose"].into_iter().chain(args.iter().copied()),
        Some(cwd),
    )
}

pub fn git_clone(clone_url: &str, target: &Path) -> Result<()> {
    let parent = target
        .parent()
        .ok_or_else(|| anyhow::anyhow!("target path has no parent: {}", target.display()))?;
    std::fs::create_dir_all(parent)?;
    run(
        "git",
        ["clone", clone_url, target.to_string_lossy().as_ref()],
        None,
    )
}
