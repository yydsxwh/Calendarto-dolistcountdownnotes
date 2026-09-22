#!/usr/bin/env bash
# 用环境变量里的正式 keystore 构建 android-native release。
# 密钥只在临时文件里出现，构建结束即删除，不写进仓库、日志或 APK。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
missing=()
for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "正式 Release 缺少签名配置：${missing[*]}。拒绝使用 debug 签名。" >&2
  exit 1
fi

umask 077
tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
export KEYSTORE_OUT="$tmp/release.jks"
python3 - << 'PY'
import base64, os, pathlib
raw = os.environ["ANDROID_KEYSTORE_BASE64"].strip()
data = base64.b64decode(raw)
path = pathlib.Path(os.environ["KEYSTORE_OUT"])
path.write_bytes(data)
path.chmod(0o600)
if len(data) < 32:
    raise SystemExit("keystore decode produced an empty file")
print(f"keystore_bytes={len(data)}")
PY

export ANDROID_KEYSTORE_PATH="$KEYSTORE_OUT"
if ! keytool -list -keystore "$ANDROID_KEYSTORE_PATH" -storepass "$ANDROID_KEYSTORE_PASSWORD" -alias "$ANDROID_KEY_ALIAS" >/tmp/kemiao-keystore-list.txt 2>/tmp/kemiao-keystore-list.err; then
  echo "正式 keystore 无法用给定别名打开。Release 已停止。" >&2
  exit 1
fi
rm -f /tmp/kemiao-keystore-list.txt /tmp/kemiao-keystore-list.err

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/tmp/android-sdk}}"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"
printf 'sdk.dir=%s\n' "$SDK" > "$ROOT/android-native/local.properties"
chmod 600 "$ROOT/android-native/local.properties"

cd "$ROOT/android-native"
./gradlew assembleRelease --no-daemon
APK="$ROOT/android-native/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  echo "没有生成 android-native release APK。" >&2
  exit 1
fi
echo "release_apk=$APK"
echo "release_bytes=$(wc -c < "$APK" | tr -d ' ')"
