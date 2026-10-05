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
# sshpass reads SSHPASS from the process environment, not command-line arguments.
if [ "$action" != deploy ]; then
  echo "Only deployment is supported; rollback image backups are disabled." >&2
  exit 1
fi
sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "set -e; command -v docker >/dev/null; command -v python3 >/dev/null; command -v rsync >/dev/null; docker info >/dev/null; mkdir -p '$remote_root/cache/objects' '$release'; chmod 700 '$remote_root/releases' '$release'"
# SHA-addressed immutable members: existing image layers are never sent again.
export RSYNC_RSH="sshpass -e ssh ${ssh_options[*]}"
rsync -r --chmod=F600,D700 docker-control/ "$remote:$release/"
# Fail before uploading large layers if transfer/import would fill the disk.
sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "python3 '$release/deploy-resources.py' transfer '$remote_root/cache' '$release' '$channel'"
rsync -r --ignore-existing --partial-dir=.rsync-partial --delay-updates --stats image-cas/objects/ "$remote:$remote_root/cache/objects/"
sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "python3 '$release/deploy-resources.py' deploy '$remote_root/cache' '$release' '$channel'"
