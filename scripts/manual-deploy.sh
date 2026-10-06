#!/usr/bin/env bash
# Run from the extracted GitHub artifact on Linux/macOS/WSL, not the server.
set -euo pipefail
bundle=$(cd "$(dirname "$0")" && pwd)
export SERVER_HOST="${1:?Usage: bash manual-deploy.sh SERVER_IP [USER] [main|dev]}"
export SERVER_USER="${2:-root}"
channel="${3:-main}"
case "$channel" in main|dev) ;; *) echo 'Invalid channel' >&2; exit 1;; esac
command -v rsync >/dev/null
command -v ssh >/dev/null
if [ -z "${SERVER_SSH_KEY_FILE:-}" ]; then
  command -v sshpass >/dev/null || { echo 'Install sshpass or set SERVER_SSH_KEY_FILE' >&2; exit 1; }
  if [ -z "${SSHPASS:-}" ]; then read -r -s -p 'Server SSH password: ' SSHPASS; printf '\n'; fi
  export SSHPASS
fi
export GITHUB_RUN_ID="manual-$(date +%s)-$$" GITHUB_RUN_ATTEMPT=1
export DEPLOY_CONTROL_DIR="$bundle/docker-control" DEPLOY_IMAGE_DIR="$bundle/image-cas"
export DEPLOY_TARGET_LABEL=manual-origin DEPLOY_REUSE_RUNTIME_CONFIG=1
bash "$bundle/scripts/transfer-docker-release.sh" "$channel" deploy
