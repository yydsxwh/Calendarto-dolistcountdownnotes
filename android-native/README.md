# 颗秒日事 · 原生 Android

Kotlin + Jetpack Compose + Material 3。`applicationId` 为 `com.yydsxwh.kemiao.days`。这是官网唯一正式 Android 客户端，当前版本 `2.2.0`（versionCode 10）。

不是 WebView 套壳。账号走现有 BFF：系统 Custom Tabs 打开 `/api/days/auth/login?native=1`，回调 `kemiao-days://auth?handoff=`，再 `POST /api/days/auth/handoff`。Token 存在 EncryptedSharedPreferences。业务数据仍是整份 `AppData`，`GET/PUT /api/days/sync`，冲突按 id 并集（宁可多留）。

## 打开工程

Android Studio 打开本目录 `android-native/`。需要 JDK 17、Android SDK 35。

```bash
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew testDebugUnitTest
./gradlew lintDebug
./gradlew assembleDebug
./gradlew bundleRelease
```

- 启动器名称：`颗秒日事`。Debug 包名带 `.debug`，名称是 `颗秒日事调试`，不能上传官网。
- 正式包：`scripts/build-android-native-release.sh`，签名只从 `ANDROID_KEYSTORE_*` 环境变量读取。缺少任一变量时 Release 失败，不会改用 debug 证书。
- 产物：`app/build/outputs/apk/release/app-release.apk`
- 旧 `android/` Capacitor 工程不参与这次发布。

仓库根目录也可以：

```bash
npm run android:native:test
npm run android:native:release
npm run android:native:deploy
```

## 回调、API 与权限

| 项 | 值 |
|---|---|
| 登录页 | `https://www.yydsxwh.com/api/days/auth/login?native=1` |
| 回调 | `kemiao-days://auth` |
| API | `https://www.yydsxwh.com`（`/api/days/auth/*`、`/api/days/sync`、`/api/days/timetable-ocr`、`/api/days/admin/*`） |
| 站长入口 | 仅当 `GET /api/days/admin/me` 返回 `admin: true` |

账号中心不需要为 Android 再登记一个 OIDC client：BFF 已用现有 confidential client 完成 PKCE，再把一次性 handoff 交给 App。

生产登录还依赖服务器 `/etc/kemiao-days-sync.env` 里的 `ACCOUNT_CLIENT_SECRET`。密钥为空时 BFF 返回 503，网页和 App 都登不进去。

## 文档

- 功能对照矩阵：`FEATURE_MATRIX.md`
- 架构决策：`ARCHITECTURE.md`
