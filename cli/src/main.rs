use std::process::ExitCode;

use anyhow::Result;
use clap::{Parser, Subcommand};
use oratorio_cli::command::{
    AddRepoArgs, InitArgs, ServerDirArgs, ServerLogsArgs, add_repo, doctor, init, logs, restart,
    status, upgrade,
};

#[derive(Parser)]
#[command(name = "oratorio")]
#[command(version)]
#[command(about = "Oratorio server deployment and configuration CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Manage a remote Oratorio server deployment.
    Server {
        #[command(subcommand)]
        command: ServerCommands,
    },
}

#[derive(Subcommand)]
enum ServerCommands {
    /// Interactively create an Oratorio review stack.
    Init(InitArgs),
    /// Add a GitHub repository to an existing review stack.
    AddRepo(AddRepoArgs),
    /// Check Docker, configuration, workspaces, and backend health.
    Doctor(ServerDirArgs),
    /// Show Docker Compose service status.
    Status(ServerDirArgs),
    /// Stream service logs.
    Logs(ServerLogsArgs),
    /// Restart the review stack.
    Restart(ServerDirArgs),
    /// Pull the latest images and restart the review stack.
    Upgrade(ServerDirArgs),
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::from(1)
        }
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Server { command } => match command {
            ServerCommands::Init(args) => init(args),
            ServerCommands::AddRepo(args) => add_repo(args),
            ServerCommands::Doctor(args) => doctor(args),
            ServerCommands::Status(args) => status(args),
            ServerCommands::Logs(args) => logs(args),
            ServerCommands::Restart(args) => restart(args),
            ServerCommands::Upgrade(args) => upgrade(args),
        },
    }
}
