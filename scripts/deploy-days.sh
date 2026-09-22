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
# dist 里若混进 APK，整目录上传会盖掉线上正式包。
find "$ROOT/dist" -name '*.apk' -delete
ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "mkdir -p '$DEST'"
# 网页部署不碰官网 APK。正式包只能来自 android-native 的 release 产物，
# 由 scripts/deploy-android-native-release.sh 校验后原子替换。
scp -i "$KEY" -o IdentitiesOnly=yes -r "$ROOT/dist/." "$HOST:$DEST/"
echo "Skipped APK upload. Official package is android-native release only."

echo "Published $HOST:$DEST"
echo "Open https://www.yydsxwh.com/products/days/"
echo "Listing: https://www.yydsxwh.com/products"

if [[ "${DEPLOY_SKIP_BFF:-}" != "1" ]]; then
  echo "Also deploying BFF (set DEPLOY_SKIP_BFF=1 to skip)"
  bash "$ROOT/scripts/deploy-days-bff.sh"
fi
