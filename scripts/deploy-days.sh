#!/usr/bin/env bash
# Publish the static 颗秒日事 build to www.yydsxwh.com/products/days/
# Uses ~/.ssh/yyds_aliyun (never commit that key).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${DEPLOY_SSH_KEY_FILE:-$HOME/.ssh/yyds_aliyun}"
HOST="${DEPLOY_SSH_HOST:-admin@47.242.157.181}"
DEST="${DEPLOY_REMOTE_DIR:-/var/www/yyds-course-platform/public/products/days}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key at $KEY. Put the deploy key there (chmod 600). Do not paste it into chat." >&2
  exit 1
fi

cd "$ROOT"
npx vite build --base=/products/days/
tar -czf /tmp/days-web.tgz -C "$ROOT/dist" .
ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "mkdir -p /tmp"
scp -i "$KEY" -o IdentitiesOnly=yes /tmp/days-web.tgz "$HOST:/tmp/days-web.tgz"
ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "set -e
  sudo mkdir -p '$DEST'
  rm -rf /tmp/days-web-release
  mkdir -p /tmp/days-web-release
  tar -xzf /tmp/days-web.tgz -C /tmp/days-web-release
  sudo find '$DEST' -mindepth 1 -maxdepth 1 ! -name 'kemiao-days.apk' ! -name 'kemiao-days-windows.exe' -exec rm -rf {} +
  sudo cp -a /tmp/days-web-release/. '$DEST/'
  rm -rf /tmp/days-web-release /tmp/days-web.tgz
"

APK_SRC="${DEPLOY_APK_FILE:-$ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
if [[ -f "$APK_SRC" ]]; then
  scp -i "$KEY" -o IdentitiesOnly=yes "$APK_SRC" "$HOST:/tmp/kemiao-days.apk"
  ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "sudo mv /tmp/kemiao-days.apk '$DEST/kemiao-days.apk'"
  echo "Published Android APK $HOST:$DEST/kemiao-days.apk"
  echo "Serve that file with scripts/nginx-kemiao-days-apk.conf (exact location, not SPA try_files)."
else
  echo "No APK at $APK_SRC; skip install-package upload. Run npm run android:apk first."
fi

echo "Published $HOST:$DEST"
echo "Open https://www.yydsxwh.com/products/days/"
echo "Listing: https://www.yydsxwh.com/products"

if [[ "${DEPLOY_SKIP_BFF:-}" != "1" ]]; then
  echo "Also deploying BFF (set DEPLOY_SKIP_BFF=1 to skip)"
  bash "$ROOT/scripts/deploy-days-bff.sh"
fi
