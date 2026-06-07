# syntax=docker/dockerfile:1
#
# Oratorio headless backend image.
#
# IMPORTANT: the build context must be the directory that contains BOTH the
# `oratorio/` and `dotcraft/` checkouts (they must sit side by side), because
# server/Oratorio.Server.csproj references ../../dotcraft/sdk/.../DotCraft.Sdk.csproj
# by path. The companion docker-compose.yml already sets `context: ../../..`.
#
#   docker build -f oratorio/deploy/docker/Dockerfile -t oratorio-server ../../..
#
# ---------------------------------------------------------------------------
# Build stage: compile + publish a self-contained linux-x64 build.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH=amd64
WORKDIR /src

# Copy only what the server build needs, preserving the sibling layout the
# project reference expects (oratorio + dotcraft as siblings under /src).
COPY dotcraft/sdk/dotnet/ ./dotcraft/sdk/dotnet/
COPY oratorio/server/ ./oratorio/server/

# Drop any host-built bin/obj that may have been copied in so the linux build
# starts clean (host obj may carry a different RID / Windows paths).
RUN find /src -type d \( -name bin -o -name obj \) -prune -exec rm -rf {} + || true

WORKDIR /src/oratorio/server
RUN dotnet publish Oratorio.Server.csproj \
        -c Release -r linux-x64 --self-contained true \
        -p:PublishIISAssets=false -p:DebugType=None -p:DebugSymbols=false \
        -o /out

# ---------------------------------------------------------------------------
# Runtime stage: minimal OS deps for a self-contained app + git (worktrees).
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0 AS runtime

# git: required by WorktreeManager / GitDeliveryClient (worktree add/commit/push).
# curl: used by the container HEALTHCHECK. tini: clean PID 1 / signal handling.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/oratorio
COPY --from=build /out/ ./
COPY oratorio/deploy/docker/oratorio-entrypoint.sh /usr/local/bin/oratorio-entrypoint.sh
RUN chmod +x /usr/local/bin/oratorio-entrypoint.sh /opt/oratorio/oratorio-server

ENV ASPNETCORE_URLS=http://0.0.0.0:5087 \
    ORATORIO_STATE_ROOT=/data/oratorio \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_gcServer=0

EXPOSE 5087
VOLUME ["/data/oratorio"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:5087/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/oratorio-entrypoint.sh"]
