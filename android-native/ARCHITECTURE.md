# 日事 Android 架构决策

## 为什么不用 Capacitor WebView

仓库里已有 `android/` Capacitor 壳（`com.yydsxwh.kemiao.days`）。它把 Vite 页面嵌进 WebView，不满足「成熟商业原生体验」要求。原生工程放在并行目录 `android-native/`，**同一个 applicationId**，作为 2.0.0 / versionCode 8 的升级路径。Capacitor 树保留，避免打断现有网页打包脚本。

没有可复用的 React Native / Flutter 客户端基础设施，因此选择 Kotlin + Jetpack Compose + Material 3。

## 分层

- `data.model`：与网页 `AppData` 对齐的领域模型、合并、OCR hydrate
- `data.local`：`LocalStore`（filesDir JSON）+ `SecureSession`（EncryptedSharedPreferences + Android Keystore）
- `data.remote`：OkHttp 调现有 BFF，不另建账号或同步协议
- `data.sync`：`SyncEngine` 复刻网页 `useCloudSync` 规则；`SyncWorker` 15 分钟
- `app.DaysViewModel`：StateFlow + 1.2s 防抖推送
- `ui`：Navigation Compose，底栏 5 个主任务，其余进「更多」
- `notify`：AlarmManager + 开机重排

手动装配，不用 Hilt，避免在没有现成 DI 图时引入额外复杂度。

## 账号

账号中心是完整 OIDC Provider，但 `days` 原生客户端尚未在 Provider 登记。现网已经为 Capacitor 做了安全交接：

1. Custom Tabs 打开 `https://www.yydsxwh.com/api/days/auth/login?native=1`
2. BFF 走 Authorization Code + PKCE（浏览器，不在 App WebView 收密码）
3. 回调 `kemiao-days://auth?handoff=`
4. `POST /api/days/auth/handoff` 换一次性 BFF session token
5. 之后 `/api/days/sync` 带 `Authorization: Bearer`

这与网页 Cookie 会话是同一套用户 `sub` 和同一份 AppData。退出时调用 `/api/days/auth/logout` 吊销 sid，并清本地密文 token。本机业务数据按网页规则保留。

## 同步权威

服务端文档是已登录用户的权威副本。规则与网页一致：

- 本机空、云端有 → 采用云端
- 云端空、本机有 → 推送本机
- 两边都有且指纹不同 → 按 id 并集（较新 `updatedAt`/`createdAt` 胜出），tombstone 阻止复活
- PUT 409 → 再并一次再推
- 失败保留本地 `pending`，允许下拉刷新重试
- 不静默覆盖；删除走 tombstone

没有第二套增量游标，第一代继续整份 AppData，避免和网页冲突。

## 不在本仓库做的事

- 不改账号中心用户表
- 不把日事模型塞进 `shared`
- 不发布 Play、不写入正式签名
- 不在源码放 `ACCOUNT_CLIENT_SECRET`
