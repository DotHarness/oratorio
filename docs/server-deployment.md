# Server Deployment

A server deployment runs the **Oratorio backend** and its dependency, the **DotCraft AppServer**, continuously on a single Linux host — for unattended source sync, run dispatch, and draft generation. The recommended path is the Docker Compose stack under `oratorio/deploy/docker/`.

## Key constraint: a shared filesystem

Oratorio creates a git worktree and passes its **absolute path** to DotCraft for execution. The two services can therefore be separated at the network layer, but **must share a single filesystem mounted at the same path** (here, `/workspace`).

In deployment terms, both containers simply mount the same `/workspace` volume; the provided Compose stack already configures this.

## Quick start

No source checkout is required — fetch the Compose file and the `.env` template, and the container images (Oratorio and DotCraft) are pulled automatically from GHCR.

```bash
mkdir oratorio && cd oratorio
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/.env.example

cp .env.example .env          # fill in the three required settings below
mkdir -p workspace
git clone https://github.com/owner/myrepo workspace/myrepo   # place dispatchable repos on the shared volume

docker compose up -d
```

Once running, the backend listens on `http://127.0.0.1:5087` (exposing a `GET /health` check) and binds to loopback only by default.

## Required settings (`.env`)

| Setting | Description |
| --- | --- |
| `APPSERVER_TOKEN` | AppServer bearer token, shared by both services; generate one with `openssl rand -base64 32` |
| `DOTCRAFT_API_KEY` (and provider / model) | Model API key used by DotCraft to run agents |
| `ORATORIO_REPO0_PROJECT` / `ORATORIO_REPO0_WORKSPACE` | Maps a repository to its path on the shared volume (e.g. `github:owner/myrepo` → `/workspace/myrepo`); add one entry per dispatchable repository |

## Remote access

All ports bind to `127.0.0.1` only by default; do not expose them directly to the internet. Reach them over an SSH tunnel:

```bash
ssh -N -L 5087:127.0.0.1:5087 user@your-server
```

Then set the Oratorio Desktop backend address to `http://127.0.0.1:5087`.

> [!NOTE]
> In a server deployment, manage configuration through `.env` or environment variables: the configuration write API accepts loopback requests only, so tunneled remote requests are rejected.

## Further reading

- [How Oratorio connects to DotCraft](/dotcraft-workspaces)
- [Configuration Reference](/configuration)
- [DotCraft server deployment ↗](https://www.dotcraft.net/features/self-hosted/server-deployment)
