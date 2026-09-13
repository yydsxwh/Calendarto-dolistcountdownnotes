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
ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "mkdir -p '$DEST'"
scp -i "$KEY" -o IdentitiesOnly=yes -r "$ROOT/dist/." "$HOST:$DEST/"

APK_SRC="${DEPLOY_APK_FILE:-$ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
if [[ -f "$APK_SRC" ]]; then
  scp -i "$KEY" -o IdentitiesOnly=yes "$APK_SRC" "$HOST:$DEST/kemiao-days.apk"
  echo "Published Android APK $HOST:$DEST/kemiao-days.apk"
else
  echo "No APK at $APK_SRC; skip install-package upload. Run npm run android:apk first."
fi

echo "Published $HOST:$DEST"
echo "Open https://www.yydsxwh.com/products/days/"
echo "Listing: https://www.yydsxwh.com/products"
