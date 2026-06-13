# How Oratorio Plugs into DotCraft

Oratorio is a board. [DotCraft](https://www.dotcraft.net/) is the AI agent doing the work. They're separate apps, and each one is responsible for half of the picture — Oratorio shows you where things stand, DotCraft does the thinking, runs the tools, and writes the result.

This page explains why DotCraft is the engine, what you get because of that, and how you connect the two.

## What DotCraft Brings

DotCraft is a project-native AI agent. Once it's set up for a project, the agent has:

- **Memory of your conversations.** What you talked about yesterday is still there today, in this project.
- **Project-level skills and plugins.** Custom abilities and tools you (or your team) install once stay attached to the project.
- **Local tool access via MCP.** Your agent can talk to databases, internal services, file converters, anything that speaks the [Model Context Protocol](https://modelcontextprotocol.io/).
- **The model you choose.** Anthropic, OpenAI, ChatGPT subscription, local OpenAI-compatible — pick what fits.
- **Per-project instructions.** A simple `AGENTS.md` file in the project lets you give the agent context that travels with the repository.

When Oratorio hands a task to the agent, all of that is already in place. You don't get a blank cold start — you get an agent that knows your project.

## Why That Matters for Oratorio

Oratorio doesn't try to be a second agent UI. The board, the side panel, and Settings stay focused on "what work is in flight and what's its verdict." Everything *agent-shaped* — the conversation, the plan, file diffs, terminal output — lives in DotCraft, one click away.

This split keeps Oratorio simple. It also means every project you wire in already has a fully configured AI agent ready to receive work — Oratorio is just the dispatcher and the scorecard.

## Setting It Up

> [!IMPORTANT]
> If you've never used DotCraft, start with its five-minute setup. It walks you through installation, picking your project, and configuring a model. **You should get a successful chat in DotCraft before connecting Oratorio.**
>
> → [DotCraft Getting Started ↗](https://www.dotcraft.net/getting-started)

The high-level flow:

1. **Install DotCraft.** Desktop release or build from source — either works.
2. **Open your project in DotCraft.** First-run setup creates an agent home inside the project so memory, skills, and configuration travel with it.
3. **Pick a model and chat once.** Confirm the agent responds before connecting anything else.
4. **In Oratorio, point Settings → Projects at the same project folder.** That's the only Oratorio-side step.

Once that's done, every task you hand off from Oratorio's board lands in an agent that's already at home in your project.

## Connecting It in Oratorio

Open **Settings → Projects** in Oratorio Desktop and add an entry that pairs each repository (or GitLab project) with its project folder on disk. For the field-by-field reference and edge cases, see [Configuration → Source Project to Workspace Mapping](/configuration#source-project-to-workspace-mapping).

Behind the scenes, Oratorio discovers the local agent endpoint through DotCraft's Hub, then talks to that agent directly. You don't have to manage ports or processes — the two apps find each other. If you want to inspect or override the bridge, **Settings → Agents** shows the live status:

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/settings-agents-dark.png" alt="Settings → Agents, showing DotCraft bridge status and AppServer connection" />

## Common Pitfalls

- **DotCraft hasn't been set up for the project yet.** The hand-off will fail because there's no agent there to receive it. Open the project in DotCraft and complete first-run before retrying.
- **Model isn't configured.** Setup looks complete, but the first agent call fails. Open the project in DotCraft and send a manual chat to confirm the model responds.
- **Folder paths differ between Windows and WSL.** Use the path your tools actually see. Running DotCraft from PowerShell? Use the Windows path. From WSL? Use the WSL path.

## Reading Further

- [DotCraft Getting Started ↗](https://www.dotcraft.net/getting-started) — install, model setup, first session
- [DotCraft Project Workspace ↗](https://www.dotcraft.net/features/workspace) — what lives with the project, how settings layer
- [DotCraft Configuration ↗](https://www.dotcraft.net/developing/configuration) — full field reference
- [Configuration Reference](/configuration) — Oratorio's own configuration, including the project connection field
