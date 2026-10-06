#!/usr/bin/env bash
# SSH is the only server transport; no registry access or image build on server.
set -euo pipefail
channel="${1:?main or dev}"
action="${2:-deploy}"
case "$channel" in main|dev) ;; *) exit 1;; esac
remote_root=/www/wwwroot/easypocketmd/docker
release="$remote_root/releases/$channel-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
ssh_options=(-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
if [ -n "${SERVER_SSH_HOST_KEY:-}" ]; then
  mkdir -p "$HOME/.ssh"
  printf '%s\n' "$SERVER_SSH_HOST_KEY" >> "$HOME/.ssh/known_hosts"
  ssh_options=(-o StrictHostKeyChecking=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
fi
remote="${SERVER_USER:?}@${SERVER_HOST:?}"
control_dir="${DEPLOY_CONTROL_DIR:-docker-control}"
image_dir="${DEPLOY_IMAGE_DIR:-image-cas}"
transport=(sshpass -e ssh)
if [ -n "${SERVER_SSH_KEY_FILE:-}" ]; then
  ssh_options+=(-i "$SERVER_SSH_KEY_FILE" -o IdentitiesOnly=yes -o BatchMode=yes)
  transport=(ssh)
fi
# sshpass reads SSHPASS from the process environment, not command-line arguments.
if [ "$action" != deploy ]; then
  echo "Only deployment is supported; rollback image backups are disabled." >&2
  exit 1
fi
"${transport[@]}" "${ssh_options[@]}" "$remote" \
  "set -e; command -v docker >/dev/null; command -v python3 >/dev/null; command -v rsync >/dev/null; docker info >/dev/null; mkdir -p '$remote_root/cache/objects' '$release'; chmod 700 '$remote_root/releases' '$release'"
# SHA-addressed immutable members: existing image layers are never sent again.
printf -v RSYNC_RSH '%q ' "${transport[@]}" "${ssh_options[@]}"
export RSYNC_RSH
rsync -r --chmod=F600,D700 "$control_dir/" "$remote:$release/"
# Fail before uploading large layers if transfer/import would fill the disk.
"${transport[@]}" "${ssh_options[@]}" "$remote" \
  "python3 '$release/deploy-resources.py' transfer '$remote_root/cache' '$release' '$channel'"
rsync -r --ignore-existing --partial-dir=.rsync-partial --delay-updates --stats "$image_dir/objects/" "$remote:$remote_root/cache/objects/"
"${transport[@]}" "${ssh_options[@]}" "$remote" \
  "python3 '$release/deploy-resources.py' deploy '$remote_root/cache' '$release' '$channel'"
