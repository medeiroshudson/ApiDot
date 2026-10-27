#!/usr/bin/env bash
set -euo pipefail

# ApiDot Agent Installation Script
# Installs to ~/.apidot/bin
# Injected server URL or override via environment variable
SERVER_URL="${APIDOT_SERVER_URL:-__SERVER_URL__}"
SERVER_URL="${SERVER_URL%/}"

echo "==> Detecting operating system and architecture..."

OS_RAW="$(uname -s)"
case "${OS_RAW}" in
    Darwin)
        TARGET_OS="osx"
        ;;
    Linux)
        TARGET_OS="linux"
        ;;
    *)
        echo "Error: Unsupported operating system: ${OS_RAW}. ApiDot Agent supports macOS (Darwin) and Linux." >&2
        exit 1
        ;;
esac

ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
    x86_64|amd64)
        TARGET_ARCH="x64"
        ;;
    arm64|aarch64)
        TARGET_ARCH="arm64"
        ;;
    *)
        echo "Error: Unsupported architecture: ${ARCH_RAW}. ApiDot Agent supports x64 and arm64." >&2
        exit 1
        ;;
esac

DOWNLOAD_URL="${SERVER_URL}/api/agent/download/${TARGET_OS}/${TARGET_ARCH}"
INSTALL_DIR="${HOME}/.apidot/bin"
TARGET_FILE="${INSTALL_DIR}/apidot-agent"
TMP_FILE="${TARGET_FILE}.tmp.$$"

cleanup() {
    rm -f "${TMP_FILE}"
}
trap cleanup EXIT

echo "==> Target platform: ${TARGET_OS}/${TARGET_ARCH}"
echo "==> Downloading ApiDot Agent from: ${DOWNLOAD_URL}"

mkdir -p "${INSTALL_DIR}"

if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_FILE}"
elif command -v wget >/dev/null 2>&1; then
    wget -qO "${TMP_FILE}" "${DOWNLOAD_URL}"
else
    echo "Error: Neither curl nor wget was found. Please install curl or wget to continue." >&2
    exit 1
fi

chmod +x "${TMP_FILE}"
mv -f "${TMP_FILE}" "${TARGET_FILE}"
trap - EXIT

echo ""
echo "==> ApiDot Agent installed successfully to: ${TARGET_FILE}"
echo ""
echo "To connect your agent to ApiDot Server:"
echo "  ${TARGET_FILE} connect --token <YOUR_DEVICE_TOKEN>"
echo ""
echo "To add apidot-agent to your PATH, add this line to your shell profile (~/.bashrc, ~/.zshrc):"
echo "  export PATH=\"\$HOME/.apidot/bin:\$PATH\""
echo ""
