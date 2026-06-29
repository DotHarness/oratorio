# Server Deployment

A server deployment runs a dedicated **Oratorio backend** and **DotCraft
AppServer** on a Linux host for unattended source sync, PR review dispatch, and
draft generation. The recommended entry point is the Oratorio CLI.

```bash
curl -fsSL https://dotharness.github.io/oratorio/install.sh | bash
oratorio server init
```

The installer downloads the Linux x64 `oratorio` CLI from GitHub Releases and
verifies the release checksum. The CLI then creates and manages a Docker Compose
review stack for you.

## What The CLI Creates

`oratorio server init` creates an isolated review stack:

```text
oratorio-review/
  docker-compose.yml
  .env
  oratorio.config.json
  workspace/
  secrets/
```

The stack contains:

- one Oratorio backend container;
- one dedicated DotCraft AppServer container for review work;
- one shared `/workspace` mount used by both containers;
- one server-side `oratorio.config.json` managed by the CLI.

This review stack is intentionally separate from any DotCraft container you may
already use for bots, chats, or other business workflows.

## Key Constraint: Shared Filesystem

Oratorio creates Git worktrees and passes their absolute paths to DotCraft.
Therefore Oratorio and DotCraft must see the same workspace filesystem at the
same absolute path. The CLI-generated stack mounts the same host `workspace/`
directory into both containers at `/workspace`.

Multiple repositories do **not** require multiple containers. A single stack can
review many repositories through explicit workspace routes:

```bash
oratorio server add-repo github:owner/repo-a
oratorio server add-repo github:owner/repo-b
```

Each repository is cloned into `workspace/<repo>` and mapped to
`/workspace/<repo>` in `oratorio.config.json`.

## First Run

During `oratorio server init`, the CLI asks for:

- DotCraft provider, model, and API key;
- GitHub read token;
- one or more GitHub repositories;
- whether to enable Auto Review;
- optional GitHub App settings for review write-back.

The CLI uses your server's existing Git credentials for `git clone`; it does not
write the GitHub API token into Git remotes.

After the stack starts, the CLI prints the SSH tunnel command:

```bash
ssh -N -L 5087:127.0.0.1:5087 user@your-server
```

Then set Oratorio Desktop's backend URL to:

```text
http://127.0.0.1:5087
```

## Operations

Common server commands:

```bash
oratorio server doctor
oratorio server status
oratorio server logs --follow
oratorio server restart
oratorio server upgrade
```

`doctor` checks Docker, Docker Compose, Git, required secrets, repository
checkouts, workspace routes, and Oratorio health.

## Configuration Ownership

For server deployments, configuration is owned by the server-side CLI and files:

- `.env` stores secrets such as model keys, AppServer token, and GitHub token;
- `oratorio.config.json` stores source lists, workspace routes, and automation
  policy;
- Oratorio Desktop remote mode treats server-admin configuration as read-only.

The generated Docker stack sets `Oratorio:Settings:Writable=false`, so tunneled
Desktop sessions cannot accidentally write server-admin configuration even
though the request appears to come from loopback.

## Manual Compose Setup

Manual setup remains available for advanced operators. Fetch the Compose
template and edit it yourself:

```bash
mkdir oratorio && cd oratorio
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/.env.example
cp .env.example .env
```

For more than one repository, prefer `oratorio.config.json` over long
environment-variable arrays.

## Further Reading

- [How Oratorio connects to DotCraft](/dotcraft-workspaces)
- [Configuration Reference](/configuration)
- [GitHub Integration](/github)
