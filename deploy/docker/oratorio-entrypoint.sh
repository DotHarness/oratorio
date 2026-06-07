#!/usr/bin/env sh
#
# Oratorio backend container entrypoint.
#
# Responsibilities before launching the server:
#   1. Give git an identity (managed worktree branches need user.name/email).
#   2. Trust volume-mounted repos that may be owned by another uid.
#   3. Auto-adopt the DotCraft AppServer token from the shared workspace when it
#      is not supplied explicitly (DotCraft writes it on first start).
#
set -eu

# 1 + 2: git configuration for worktree operations on the shared volume.
git config --global user.name  "${ORATORIO_GIT_USER_NAME:-Oratorio}" || true
git config --global user.email "${ORATORIO_GIT_USER_EMAIL:-oratorio@localhost}" || true
git config --global --add safe.directory '*' || true

# 3: adopt the DotCraft AppServer bearer token from the shared workspace if the
# operator did not pass one. Setting APPSERVER_TOKEN in .env (recommended) wins,
# because docker-compose maps it to Oratorio__DotCraft__AppServerToken directly.
TOKEN_FILE="${DOTCRAFT_APPSERVER_TOKEN_FILE:-/workspace/.craft/appserver.token}"
if [ -z "${Oratorio__DotCraft__AppServerToken:-}" ] && [ -f "$TOKEN_FILE" ]; then
  Oratorio__DotCraft__AppServerToken="$(cat "$TOKEN_FILE")"
  export Oratorio__DotCraft__AppServerToken
  echo "oratorio: adopted DotCraft AppServer token from ${TOKEN_FILE}"
fi

mkdir -p "${ORATORIO_STATE_ROOT:-/data/oratorio}"

# Allow `docker run ... <args>` to override; otherwise launch the server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

cd /opt/oratorio
exec ./oratorio-server
