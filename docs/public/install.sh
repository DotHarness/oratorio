#!/usr/bin/env bash
set -euo pipefail

REPO="${ORATORIO_INSTALL_REPO:-DotHarness/oratorio}"
VERSION="${ORATORIO_VERSION:-latest}"
INSTALL_DIR="${ORATORIO_INSTALL_DIR:-$HOME/.local/bin}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "oratorio install: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

require curl
require grep
require head
require install
require sed
require tar
require sha256sum

OS="$(uname -s)"
ARCH="$(uname -m)"
if [ "$OS" != "Linux" ] || { [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "amd64" ]; }; then
  fail "oratorio CLI installer currently supports Linux x64 only (found $OS/$ARCH)"
fi

if [ "$VERSION" = "latest" ]; then
  VERSION="$(
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" |
      sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
      head -n 1
  )"
fi

[ -n "$VERSION" ] || fail "could not resolve latest release version"

ASSET="oratorio-cli-${VERSION}-linux-x64.tar.gz"
BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"

echo "Installing Oratorio CLI ${VERSION}"
curl -fL "${BASE_URL}/${ASSET}" -o "${TMP_DIR}/${ASSET}"
curl -fL "${BASE_URL}/checksums.txt" -o "${TMP_DIR}/checksums.txt"

(cd "$TMP_DIR" && grep " ${ASSET}\$" checksums.txt | sha256sum -c -) ||
  fail "checksum verification failed for ${ASSET}"

tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"
[ -x "${TMP_DIR}/oratorio" ] || fail "release archive did not contain executable ./oratorio"

mkdir -p "$INSTALL_DIR"
install -m 0755 "${TMP_DIR}/oratorio" "${INSTALL_DIR}/oratorio"

echo "Installed ${INSTALL_DIR}/oratorio"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "Add this to your shell profile if 'oratorio' is not found:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo
echo "Next step:"
echo "  oratorio server init"
