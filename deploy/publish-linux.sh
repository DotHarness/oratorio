#!/usr/bin/env bash
#
# Publish the Oratorio backend as a self-contained linux-x64 build.
#
# Mirrors the server publish step in build.bat, but targets Linux instead of
# Windows. Produces a folder you can drop onto a server (systemd) or copy into a
# container image. Works from any host with the .NET 10 SDK installed (including
# Windows / macOS) as long as the sibling dotcraft repo is checked out next to
# oratorio so the DotCraft.Sdk project reference resolves.
#
# Usage:
#   deploy/publish-linux.sh [--rid linux-x64] [--single-file] [--out <dir>]
#
set -euo pipefail

RID="linux-x64"
OUT=""
SINGLE_FILE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --rid) RID="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --single-file) SINGLE_FILE=1; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Resolve repo root (this script lives in <repo>/deploy).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="$REPO_ROOT/server/Oratorio.Server.csproj"
OUT="${OUT:-$REPO_ROOT/build/release/server-$RID}"

if [ ! -d "$REPO_ROOT/../dotcraft" ]; then
  echo "WARNING: ../dotcraft was not found next to oratorio." >&2
  echo "         The DotCraft.Sdk project reference will fail to resolve." >&2
fi

echo "====================================="
echo " Publishing Oratorio.Server ($RID)"
echo " Output: $OUT"
echo "====================================="

rm -rf "$OUT"

PUBLISH_ARGS=(
  "$PROJECT"
  -c Release
  -r "$RID"
  --self-contained true
  -p:PublishIISAssets=false
  -p:DebugType=None
  -p:DebugSymbols=false
  -o "$OUT"
)

if [ "$SINGLE_FILE" -eq 1 ]; then
  PUBLISH_ARGS+=(
    -p:PublishSingleFile=true
    -p:IncludeNativeLibrariesForSelfExtract=true
    -p:EnableCompressionInSingleFile=true
  )
fi

dotnet publish "${PUBLISH_ARGS[@]}"

echo
echo "Done. Entry point: $OUT/oratorio-server"
