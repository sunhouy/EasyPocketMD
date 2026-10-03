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
if [ "$action" = rollback ]; then
  sshpass -e ssh "${ssh_options[@]}" "$remote" "test -f '$remote_root/state-$channel.json' && current=\$(python3 -c 'import json;print(json.load(open(\"$remote_root/state-$channel.json\"))[\"current\"][\"release\"])') && python3 \"\$current/deploy-docker.py\" rollback '$channel'"
  exit
fi
sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "set -e; command -v docker >/dev/null; command -v python3 >/dev/null; command -v rsync >/dev/null; docker info >/dev/null; mkdir -p '$remote_root/cache/objects' '$release'; chmod 700 '$remote_root/releases' '$release'"
# SHA-addressed immutable members: existing image layers are never sent again.
export RSYNC_RSH="sshpass -e ssh ${ssh_options[*]}"
rsync -r --ignore-existing --partial-dir=.rsync-partial --delay-updates --stats image-cas/objects/ "$remote:$remote_root/cache/objects/"
rsync -r --chmod=F600,D700 docker-control/ "$remote:$release/"
sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "set -e; python3 '$release/image-cas.py' load '$remote_root/cache' '$release/release.json'; python3 '$release/deploy-docker.py' deploy '$channel' '$release'"
