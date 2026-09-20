# 颗秒日事 · 原生 Android

Kotlin + Jetpack Compose + Material 3。`applicationId` 为 `com.yydsxwh.kemiao.days`（与现网 Capacitor 包名相同，作为 2.0.0 升级路径）。

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

- 启动器名称：`颗秒日事v1`（`applicationId` 仍是 `com.yydsxwh.kemiao.days`，图标沿用现有粉蓝火焰）
- 网站侧载 APK：`./gradlew assembleWebsite` → `app/build/outputs/apk/website/app-website.apk`（debug 签名，无 `.debug` 后缀）
- Debug APK：`app/build/outputs/apk/debug/app-debug.apk`（applicationId 带 `.debug` 后缀，方便与正式包并存）
- Release AAB：`app/build/outputs/bundle/release/app-release.aab`
- Play / 正式签名、隐私政策待所有者提供，仓库不放密钥。

仓库根目录也可以：

```bash
npm run android:native:test
npm run android:native
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
