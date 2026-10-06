#!/usr/bin/env bash
# SSH is the only server transport; no registry access or image build on server.
set -euo pipefail
channel="${1:?main or dev}"
action="${2:-deploy}"
case "$channel" in main|dev) ;; *) exit 1;; esac
# Labels distinguish interleaved logs without printing credentials or server addresses.
label="${DEPLOY_TARGET_LABEL:-origin}/$channel"
run_phase() {
  local title="$1" started=$SECONDS status=0 pid heartbeat
  shift
  printf '[%s] START %s\n' "$label" "$title"
  "$@" & pid=$!
  (
    timer=''
    trap 'if [ -n "$timer" ]; then kill "$timer" 2>/dev/null || true; fi; exit 0' TERM INT
    while true; do
      sleep 30 & timer=$!
      wait "$timer" || exit 0
      printf '[%s] %s still running (%ss)\n' "$label" "$title" "$((SECONDS-started))"
    done
  ) & heartbeat=$!
  wait "$pid" || status=$?
  kill "$heartbeat" 2>/dev/null || true
  wait "$heartbeat" 2>/dev/null || true
  if [ "$status" -eq 0 ]; then
    printf '[%s] DONE %s (%ss)\n' "$label" "$title" "$((SECONDS-started))"
  else
    printf '[%s] FAILED %s (%ss, exit=%s)\n' "$label" "$title" "$((SECONDS-started))" "$status" >&2
  fi
  return "$status"
}
remote_root=/www/wwwroot/easypocketmd/docker
release="$remote_root/releases/$channel-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
ssh_options=(-o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
if [ -n "${SERVER_SSH_HOST_KEY:-}" ]; then
  mkdir -p "$HOME/.ssh"
  printf '%s\n' "$SERVER_SSH_HOST_KEY" >> "$HOME/.ssh/known_hosts"
  ssh_options=(-o ConnectTimeout=30 -o StrictHostKeyChecking=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
fi
if [ -n "${SERVER_SSH_CONFIG_FILE:-}" ]; then
  ssh_options+=(-F "$SERVER_SSH_CONFIG_FILE")
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
run_phase "SSH connection and server prerequisites" "${transport[@]}" "${ssh_options[@]}" "$remote" \
  "set -e; command -v docker >/dev/null; command -v python3 >/dev/null; command -v rsync >/dev/null; docker info >/dev/null; mkdir -p '$remote_root/cache/objects' '$release'; chmod 700 '$remote_root/releases' '$release'"
# SHA-addressed immutable members: existing image layers are never sent again.
printf -v RSYNC_RSH '%q ' "${transport[@]}" "${ssh_options[@]}"
export RSYNC_RSH
run_phase "Upload runtime configuration" rsync -r --timeout=300 --chmod=F600,D700 "$control_dir/" "$remote:$release/"
# Fail before uploading large layers if transfer/import would fill the disk.
run_phase "Cleanup, missing objects and disk capacity" "${transport[@]}" "${ssh_options[@]}" "$remote" \
  "python3 -u '$release/deploy-resources.py' transfer '$remote_root/cache' '$release' '$channel'"
run_phase "Upload missing image objects" rsync -r --ignore-existing --timeout=300 --partial-dir=.rsync-partial --delay-updates --info=progress2 --outbuf=L --stats "$image_dir/objects/" "$remote:$remote_root/cache/objects/"
run_phase "Verify/import images and activate release" "${transport[@]}" "${ssh_options[@]}" "$remote" \
  "python3 -u '$release/deploy-resources.py' deploy '$remote_root/cache' '$release' '$channel'"
