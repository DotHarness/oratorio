use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    path::Path,
    thread,
    time::{Duration, Instant},
};

use anyhow::{Result, bail};

use crate::{
    config::{DeploymentPaths, read_config},
    docker,
};

#[derive(Debug)]
pub struct CheckResult {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

pub fn run_checks(root: &Path) -> Vec<CheckResult> {
    let paths = DeploymentPaths::new(root);
    let mut results = Vec::new();

    results.push(check_command("docker", "docker", &["--version"]));
    results.push(check_command(
        "docker compose",
        "docker",
        &["compose", "version"],
    ));
    results.push(check_command("git", "git", &["--version"]));
    results.push(check_file("docker-compose.yml", &paths.compose));
    results.push(check_file(".env", &paths.env));
    results.push(check_file("oratorio.config.json", &paths.config));

    if let Ok(env) = fs::read_to_string(&paths.env) {
        results.push(check_env_value("APPSERVER_TOKEN", &env));
        results.push(check_env_value("DOTCRAFT_API_KEY", &env));
    }

    if let Ok(config) = read_config(&paths.config) {
        for route in config.oratorio.dotcraft.repository_workspace_routes {
            let workspace = route
                .workspace_path
                .strip_prefix("/workspace/")
                .map(|relative| paths.workspace.join(relative))
                .unwrap_or_else(|| {
                    paths
                        .workspace
                        .join(route.workspace_path.trim_start_matches('/'))
                });
            let git_dir = workspace.join(".git");
            results.push(CheckResult {
                name: format!("workspace {}", route.project),
                ok: workspace.is_dir() && git_dir.exists(),
                detail: if workspace.is_dir() && git_dir.exists() {
                    workspace.display().to_string()
                } else {
                    format!("missing git checkout at {}", workspace.display())
                },
            });
        }
    }

    let port = parse_env_port(&paths.env, "ORATORIO_PORT").unwrap_or(5087);
    results.push(check_health(port));
    results
}

pub fn print_results(results: &[CheckResult]) {
    for result in results {
        let marker = if result.ok { "ok" } else { "fail" };
        println!("[{marker}] {} - {}", result.name, result.detail);
    }
}

pub fn wait_for_oratorio_health(port: u16, timeout: Duration) -> Result<()> {
    let address = format!("127.0.0.1:{port}");
    let deadline = Instant::now() + timeout;

    loop {
        if http_health_ok(&address).unwrap_or(false) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            bail!("Oratorio did not become healthy at http://{address}/health");
        }

        thread::sleep(Duration::from_secs(2));
    }
}

fn check_command(name: &str, program: &str, args: &[&str]) -> CheckResult {
    let ok = docker::command_exists(program, args);
    CheckResult {
        name: name.to_string(),
        ok,
        detail: if ok {
            "available".to_string()
        } else {
            "not found or not usable".to_string()
        },
    }
}

fn check_file(name: &str, path: &Path) -> CheckResult {
    CheckResult {
        name: name.to_string(),
        ok: path.is_file(),
        detail: path.display().to_string(),
    }
}

fn check_env_value(name: &str, env: &str) -> CheckResult {
    let value = env
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{name}=")))
        .unwrap_or_default()
        .trim();
    CheckResult {
        name: name.to_string(),
        ok: !value.is_empty(),
        detail: if value.is_empty() {
            "empty".to_string()
        } else {
            "configured".to_string()
        },
    }
}

fn check_health(port: u16) -> CheckResult {
    let address = format!("127.0.0.1:{port}");
    let detail = format!("http://{address}/health");
    let ok = http_health_ok(&address).unwrap_or(false);
    CheckResult {
        name: "oratorio health".to_string(),
        ok,
        detail,
    }
}

fn http_health_ok(address: &str) -> Result<bool> {
    let mut stream = TcpStream::connect(address)?;
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    Ok(response.starts_with("HTTP/1.1 200") && response.contains("\"service\":\"oratorio\""))
}

fn parse_env_port(path: &Path, key: &str) -> Option<u16> {
    let env = fs::read_to_string(path).ok()?;
    env.lines()
        .find_map(|line| line.strip_prefix(&format!("{key}=")))
        .and_then(|value| value.trim().parse().ok())
}
