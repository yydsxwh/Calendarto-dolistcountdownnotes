#!/usr/bin/env bash
# Publish 日事 BFF (kemiao-days-sync) and nginx exact /api/days/* locations.
# Uses ~/.ssh/yyds_aliyun. Never commit that key or any env secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${DEPLOY_SSH_KEY_FILE:-$HOME/.ssh/yyds_aliyun}"
HOST="${DEPLOY_SSH_HOST:-admin@47.242.157.181}"
REMOTE_DIR="${DEPLOY_BFF_DIR:-/opt/kemiao-days-sync}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key at $KEY. Put the deploy key there (chmod 600). Do not paste it into chat." >&2
  exit 1
fi

cd "$ROOT"
npm run build:server
scp -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \
  "$ROOT/server/dist/index.mjs" "$HOST:/tmp/kemiao-days-sync.mjs"
scp -i "$KEY" -o IdentitiesOnly=yes \
  "$ROOT/server/days-sync/nginx-days-sync.conf" "$HOST:/tmp/nginx-days-sync.conf"

ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "set -e
  sudo mkdir -p '$REMOTE_DIR'
  if [[ -f '$REMOTE_DIR/index.mjs' ]]; then sudo cp -a '$REMOTE_DIR/index.mjs' '$REMOTE_DIR/index.mjs.bak'; fi
  sudo mv /tmp/kemiao-days-sync.mjs '$REMOTE_DIR/index.mjs'
  sudo mkdir -p /etc/nginx/snippets
  sudo mv /tmp/nginx-days-sync.conf /etc/nginx/snippets/kemiao-days-sync.conf
  if ! sudo nginx -t; then
    echo 'nginx -t failed; not reloading nginx' >&2
    exit 1
  fi
  sudo systemctl reload nginx
  if systemctl list-unit-files | grep -q kemiao-days-sync; then
    sudo systemctl restart kemiao-days-sync
    sudo systemctl --no-pager --full status kemiao-days-sync | head -40
  else
    echo 'BLOCKED: systemd unit kemiao-days-sync 不存在，静态包已不涉及 BFF'
  fi
"

echo "Published BFF $HOST:$REMOTE_DIR/index.mjs"
echo "Health: curl -sS https://www.yydsxwh.com/api/days/health"
