<div align="center">

![Oratorio](https://github.com/DotHarness/resources/raw/master/oratorio/banner.png)

[中文](./README_ZH.md) · [Documentation](./docs/en/index.md) · [Getting Started](./docs/en/getting-started.md) · [DotCraft](https://github.com/DotHarness/dotcraft)

The project board where agents collaborate with you.

</div>

## About

Oratorio is an agent-addressable project board, powered by DotCraft. It
turns local tasks, GitHub/GitLab issues, and pull or merge requests into one
durable board where agents and operators can coordinate review, implementation,
follow-up work, and source-backed delivery.

## Highlights

- Agent-addressable board: scoped Oratorio tools let agents list and read board
  items, create local tasks, and queue review rounds without turning the board
  into free-form chat state.
- Work-first source model: Local Tasks, GitHub/GitLab issues, and PRs/MRs share
  the same Task board, lifecycle, comments, rounds, decisions, and timeline.
- Typed drafts: review, implementation, and follow-up work is submitted through
  Oratorio runtime tools as structured drafts, not parsed from free-form model
  text.
- Delivery handoff: Implementation Drafts can stay manual or move through
  backend delivery to create a generated GitHub PR or GitLab MR with Source
  Write history.
- DotCraft-powered execution: Oratorio owns board state, workflow state, drafts,
  and source writes; DotCraft remains the detailed agent execution surface, with
  code-changing runs using Oratorio-managed Git worktrees.

## Get Started

For local development, start from the desktop app:

```powershell
.\dev.bat
```

You can also run the server directly:

```powershell
dotnet build Oratorio.sln
dotnet run --project server/Oratorio.Server.csproj
```

Requirements, source setup, release builds, and test commands live in the
[development guide](./docs/en/development.md).

## Connect with DotCraft

Connect Oratorio to a DotCraft session and let the Agent manage your board.

![Connect Oratorio with DotCraft](https://github.com/DotHarness/resources/raw/master/dotcraft/whats-new/app.gif)

## Documentation

| Goal | Document |
|------|----------|
| Install, run, and understand the first local flow | [Getting Started](./docs/en/getting-started.md) |
| Build, test, and contribute to the codebase | [Development](./docs/en/development.md) |
| Configure Settings, state paths, GitHub/GitLab, and DotCraft routing | [Configuration](./docs/en/configuration.md) |
| Configure GitLab projects, tokens, webhooks, and MR delivery | [GitLab Integration](./docs/en/gitlab.md) |
| Check what works locally and what still depends on external sources | [Local Support Matrix](./docs/en/local-support.md) |

## Credits

Inspired by [openai/symphony](https://github.com/openai/symphony) and built on [DotCraft](https://github.com/DotHarness/dotcraft), the
Agent Harness and AppServer runtime that powers its agent execution workflow.

## License

Apache License 2.0