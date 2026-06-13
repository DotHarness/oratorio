# Getting Started

Oratorio is a board where you hand work to your AI agent and watch it go. The agent itself is [DotCraft](https://www.dotcraft.net/) — a project-native AI that remembers your conversations, learns your project's skills, and connects to your local tools. This walkthrough takes you from install to your first hand-off and review. About fifteen minutes — five to set up DotCraft if you don't have it, ten for Oratorio.

> [!IMPORTANT]
> **DotCraft has to be set up for your project first.** Oratorio is the board; DotCraft is the agent doing the work. If you skip Step 1, you'll have a board with no one to answer it.

## 1. Set up DotCraft for your project

Install [DotCraft](https://www.dotcraft.net/), open your project in it, and complete the quick first-run — pick a model, send a test chat like "read this project's README and tell me what it does." That's it. Your project now has an AI agent that lives inside it.

If you've never used DotCraft, follow its setup first:

- [DotCraft Getting Started ↗](https://www.dotcraft.net/getting-started)
- [How Oratorio plugs into DotCraft](/dotcraft-workspaces)

**Don't move on until that test chat works.** The agent has to be reachable in DotCraft before Oratorio can hand it anything.

## 2. Install Oratorio

The fastest path is the release installer:

| Platform | File |
|----------|------|
| Windows | `Oratorio-*.exe` from [GitHub Releases](https://github.com/DotHarness/oratorio/releases) |

To build from source, install the [.NET 10 SDK](https://dotnet.microsoft.com/download) and Node.js, clone [DotCraft](https://github.com/DotHarness/dotcraft) alongside `oratorio/` (Oratorio uses the DotCraft SDK directly), then run from the Oratorio repo root:

```powershell
.\dev.bat
```

`dev.bat` installs the desktop dependencies, builds the backend, and launches Oratorio Desktop in development mode.

## 3. First launch

Oratorio Desktop starts with a brief splash while the local server warms up.

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/launch-overlay-light.png" alt="Oratorio launching" />

Once the splash fades, you land on an empty board.

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/board-light.png" alt="Oratorio's initial empty board" />

The board has four columns that follow the natural rhythm of work: **new**, **handing off**, **in progress**, and **ready for review**. Every card moves from left to right as your agent picks it up and finishes it.

## 4. Connect your project in Oratorio

Click the **Settings** gear, open **Projects**, and add the project you set up in Step 1. The one field you need to fill is the **project folder** — point it at the same folder DotCraft is configured for.

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/settings-projects-light.png" alt="Settings → Projects, with the form to add a repository and its project folder" />

That's it. One connection, one save.

> [!TIP]
> Want the field-by-field reference? See [Configuration → Source Project to Workspace Mapping](/configuration#source-project-to-workspace-mapping). You can also connect more than one project — each repository or GitLab project gets its own row.

## 5. Pull in real work (optional)

If you want Oratorio to mirror real issues and pull requests, connect one source in Settings → Credentials:

- **GitHub** — use a GitHub App for the full connection. See [GitHub Integration](/github).
- **GitLab** — add a token on each GitLab project card. See [GitLab Integration](/gitlab).

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/settings-credentials-light.png" alt="Settings → Credentials, with GitHub and GitLab fields" />

If you just want to try the board, skip this — you can write your own tasks and they work the same way.

## 6. Write your first task

On the board, click **New task** (or wait for sync to pull a real issue, if you connected GitHub or GitLab in the previous step). Give it a title, a short description, and pick the project you connected in Step 4.

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/create-task-dialog-light.png" alt="The New task dialog with title, description, source project, labels, assignee, and base branch fields" />

A card appears in the **new** column. Click it to open the side panel — that's where you'll see what your agent's up to, the links related to the task, and the few actions you can take from the board. Want the full conversation? One click jumps you into DotCraft.

## 7. Hand it off and review the result {#dispatch}

Drag the card into **handing off**. Behind the scenes:

1. Your agent gets its own safe copy of the project to work in.
2. DotCraft picks up the task in that copy.
3. Progress streams back into the side panel.

The card walks itself across **handing off → in progress → ready for review**. When it lands in **ready for review**, click in.

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/task-detail-review-dark.png" alt="The task detail showing the review summary and suggestions" />

You'll see what your agent did: a written summary, inline code suggestions you can apply with one click, and any reasoned comments that ask for your judgment. Three decisions are available:

- **Approve** — accept the work. For GitHub pull requests this writes an approval; for GitLab merge requests it marks the commit status as passing.
- **Ask for changes** — send the comments back to your agent and let it have another go.
- **Reject** — close the work as no-go. The commit status is marked failing.

Pick one. The card moves to the done lane (or off the board, depending on your filter).

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/task-detail-decision-light.png" alt="The decision recorded on the task" />

That's a full cycle — task created, agent worked, you decided.

## 8. Where to go next

| What you want to do | Where |
|---|---|
| Read the full Settings reference | [Configuration Reference](/configuration) |
| Set up GitHub repositories, webhooks, and write-back | [GitHub Integration](/github) |
| Set up GitLab projects, webhooks, and write-back | [GitLab Integration](/gitlab) |
| Check what works offline vs needs GitHub / GitLab | [Local Support Matrix](/local-support) |
| Build, test, contribute | [Development Guide](/development) |
| Understand how Oratorio plugs into DotCraft | [How Oratorio plugs in](/dotcraft-workspaces) |

## Troubleshooting

**The hand-off fails with "project not found."** Your project isn't connected, or the connection points to a folder that DotCraft hasn't been set up for. Re-check Step 1 (open in DotCraft) and Step 4 (Projects in Settings).

**Your agent starts but immediately stops on the first model call.** DotCraft is configured for the project but its model isn't working. Open the project in DotCraft and send a manual chat to confirm the model responds.

**A Settings change had no effect.** Some settings only take effect after the local server restarts. Use the **Restart server** button on the Settings banner.

**A saved password or token doesn't show up.** Expected. Settings only shows whether something is saved — never the value itself. To replace it, type a new value; to keep it, leave the field empty.
