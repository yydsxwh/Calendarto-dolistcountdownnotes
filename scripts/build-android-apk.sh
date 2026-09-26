#!/usr/bin/env bash
# 历史 Capacitor/WebView 调试包。不能作为官网正式 APK，也不能覆盖 kemiao-days.apk。
set -euo pipefail
if [[ "${ALLOW_CAPACITOR_DEBUG:-}" != "1" ]]; then
  echo "已停止。android/ 只保留作历史参考。正式包请运行 scripts/build-android-native-release.sh" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

cd "$ROOT"
npm run build:android

if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo "Installing Android command-line tools into $SDK"
  mkdir -p "$SDK/cmdline-tools"
  zip="$SDK/commandlinetools.zip"
  curl -fsSL -o "$zip" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  rm -rf "$SDK/cmdline-tools/latest"
  mkdir -p "$SDK/cmdline-tools/latest"
  unzip -q "$zip" -d "$SDK/cmdline-tools/_tmp"
  mv "$SDK/cmdline-tools/_tmp/cmdline-tools/"* "$SDK/cmdline-tools/latest/"
  rm -rf "$SDK/cmdline-tools/_tmp" "$zip"
fi

yes | sdkmanager --sdk_root="$SDK" --licenses >/tmp/android-sdk-licenses.log || true
sdkmanager --sdk_root="$SDK" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" || sdkmanager --sdk_root="$SDK" \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"

printf 'sdk.dir=%s\n' "$SDK" > "$ROOT/android/local.properties"

cd "$ROOT/android"
./gradlew assembleDebug --no-daemon
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  mkdir -p /opt/cursor/artifacts
  cp "$APK" /opt/cursor/artifacts/kemiao-days-campus-debug.apk
  cp "$APK" "$ROOT/android/app-debug.apk"
  echo "APK $APK"
  echo "Copied to /opt/cursor/artifacts/kemiao-days-campus-debug.apk"
fi
