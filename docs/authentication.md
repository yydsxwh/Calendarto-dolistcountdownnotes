# 颗秒日事 · 统一账号接入

本文是日事这一侧的权威说明。**普通日事开发不需要打开账号中心仓库**：日事依赖
账号中心的全部行为集中记录在下面的
[Account Integration Contract](#account-integration-contract)。

> **当前状态：代码完成，真实联调 BLOCKED。**
> 所有不依赖账号中心源码的工作已完成，并通过 106 个自动化测试。
> 这些测试跑在一个**本地 mock OpenID Provider** 上。
> 「Mock 测试通过」≠「已经接入账号中心」。真实成功必须等
> `ACCOUNT_CLIENT_SECRET` 到位 + 双仓库联调完成，见
> [跨库联调清单](#cross-repository-integration-checklist)。

---

## 1. 日事为什么不自己管理密码

密码是整个生态里最贵的一类责任：哈希算法选型、撞库防护、找回流程、2FA、
泄露应急、合规留痕。这些跟「日历 / 待办 / 课表 / 倒数日 / 便签」没有任何关系，
每多一个产品自己实现一遍，就多一处可以被攻破的地方，而且用户会得到一堆
互不相通的账号。

所以日事**不存密码、不做注册表单、不建独立登录**。注册和登录都发生在账号中心。

## 2. 谁是谁

| 角色 | 是谁 | 职责 |
| --- | --- | --- |
| Identity Provider (OP) | 账号中心 `https://account.yydsxwh.com` | 注册、登录、密码、2FA、签发身份 |
| Relying Party (RP / OIDC Client) | 颗秒日事 | 信任账号中心签发并经过完整校验的身份，管自己的业务数据 |

日事**禁止**：保存密码、复制账号中心用户库、直连账号中心数据库、共享账号中心
的 `AUTH_SECRET`、直接读取账号中心的 Session Cookie、用 email 判断是不是同一个人。

## 3. 架构：为什么日事多了一个服务端

改造前，日事是一个纯静态 Vite + React SPA，数据全在浏览器 `localStorage`
（键 `kemiao-days-v1`），没有后端、没有数据库、没有 API。

confidential client 必须有地方存 `client_secret`，服务端会话必须有地方存会话，
`WHERE userId = currentUser.id` 必须有一个服务端来执行。**浏览器里做不到任何一件。**
所以新增了一个 BFF（Backend for Frontend），放在同一个仓库的 `server/`：

```
浏览器 / Android / iOS / Windows 客户端
        │  只认日事自己的会话
        ▼
颗秒日事 BFF  (server/, Node 22 + Express 5 + SQLite)
        │  Authorization Code + PKCE，服务端持有 client_secret
        ▼
账号中心 account.yydsxwh.com  (独立仓库、独立部署)
```

原有的静态构建、Capacitor Android / iOS 外壳、Electron Windows 打包和
`scripts/deploy-days.sh` 完全没有改动，`npm run build` 的行为逐字保持原样。
BFF 是**新增**的、独立部署的进程。

## 4. Endpoint 从 discovery 来，不硬编码

代码里唯一写死的账号中心地址是 `ACCOUNT_ISSUER`。其余全部来自

```
${ACCOUNT_ISSUER}/.well-known/openid-configuration
```

`authorization_endpoint` / `token_endpoint` / `userinfo_endpoint` / `jwks_uri` /
`revocation_endpoint` / `end_session_endpoint` 都由 `openid-client` 自动发现。
发现结果缓存 `ACCOUNT_DISCOVERY_TTL_SECONDS`（默认 1 小时），失败后按
`ACCOUNT_DISCOVERY_RETRY_SECONDS` 退避，不会把账号中心的一次网络抖动放大成
日事整体不可用。

实现见 `server/auth/oidc.ts`。

## 5. 用哪个 OIDC Client，为什么

**`openid-client` v6**（panva 维护，OpenID Certified）。

评估过的其他选项：

- **NextAuth / Auth.js**：NextAuth 绑定 Next.js，本仓库不是 Next.js。`@auth/core`
  框架无关，但需要适配层，而它内部同样依赖 `oauth4webapi`——也就是
  `openid-client` 的底座。多一层抽象，不多一分安全。
- **自己实现**：明确禁止，也不该做。

`openid-client` 原生提供 discovery、PKCE、`state`、`nonce`、JWKS、issuer /
audience / expiry 校验、refresh token rotation、RFC 7009 revocation，与 Node 22
和现有 TypeScript 配置直接兼容。

### 一个必须知道的默认行为

OIDC Core §3.1.3.7 规定：Authorization Code Flow 中 ID Token 经由 TLS 保护的
Token Endpoint 直接取得时，**可以用 TLS 服务端校验代替验签**。`openid-client`
据此**默认不验 ID Token 的 JWS 签名**。

日事显式打开验签：

```ts
execute.push(client.enableNonRepudiationChecks)
```

由 `ACCOUNT_VERIFY_ID_TOKEN_SIGNATURE` 控制，默认 `true`。
这一项在写测试时被真实发现——关掉它时「用不在 JWKS 里的密钥签名的 ID Token」
可以登录成功。

## 6. 完整登录流程

```
用户点「使用统一账号登录」
        ↓
GET /api/auth/login?returnTo=/todos
        ↓  服务端生成 state / nonce / PKCE code_verifier + code_challenge
        ↓  三者只写入服务端 oidc_auth_request 表
        ↓  浏览器只拿到一个 HttpOnly 的 rishi_authtx（内容仅为 state）
        ↓
302 → 账号中心 authorization_endpoint（code_challenge_method=S256）
        ↓
用户在账号中心登录 / 注册
        ↓
302 → GET /api/auth/callback?code=...&state=...
        ↓  ① state 必须同时匹配 URL 与 rishi_authtx（阻断 login CSRF）
        ↓  ② 事务一次性消费（阻断重放）
        ↓  ③ openid-client 用 code + code_verifier 换取令牌
        ↓  ④ 完整校验 ID Token：签名 / iss / aud / exp / iat / nonce
        ↓  ⑤ 取 sub，为空即中止
        ↓  ⑥ 按 sub 查 rishi_user，没有就创建
        ↓  ⑦ 签发全新的日事会话（旧 Cookie 一律不复用）
        ↓
302 → 回到 returnTo（只接受站内相对路径）
```

失败时统一 302 回应用并带 `?auth_error=<code>`，前端翻译成中文提示。
浏览器拿不到账号中心的响应体、堆栈或任何令牌。

## 7. sub → RishiUser 映射

身份主键是 OIDC `sub`，形如 `usr_VJQ4V0D7H5W0JYKEGSR7VQ670V`。

```
rishi_user
  id              TEXT PRIMARY KEY        日事内部 id（UUID）
  account_user_id TEXT NOT NULL UNIQUE    = OIDC sub ← 唯一身份键
  display_name    TEXT                    ┐
  email           TEXT                    ├ Profile Cache，不是身份
  avatar_url      TEXT                    ┘
```

- `account_user_id` 建了 `UNIQUE` 约束。
- **不存在** `email UNIQUE`。email 可变、可缺失、可与他人重复，绝不作为跨产品
  身份绑定依据。
- 用户改 email / 昵称 / 头像 → 只更新缓存，`id` 不变，数据不丢。
- 某个 profile claim 缺失 → 缓存保持原值（`COALESCE`），登录照常。
- 两个不同 `sub` 即使 email 相同，也是两个用户。

实现见 `server/auth/users.ts`，测试见 `server/test/user-mapping.test.ts`。

## 8. 日事自己的 Session

登录成功后日事签发**自己的**会话，不把账号中心的任何令牌交给浏览器。

| 项目 | 取值 |
| --- | --- |
| 载体 | Cookie `rishi_sid`（网页） / `Authorization: Bearer`（原生客户端） |
| 令牌 | 32 字节随机数，base64url |
| 入库 | 只存 `sha256(token)`——库被拖走也无法重放成活会话 |
| Cookie 属性 | `HttpOnly`、`Secure`（生产强制）、`SameSite=Lax`、`Path=/` |
| 绝对有效期 | 30 天，只有重新登录才能延长 |
| 空闲有效期 | 14 天滑动窗口 |
| 密钥 | `RISHI_SESSION_SECRET`，与账号中心任何 Secret 都不同，相同则拒绝启动 |

- **Session Fixation**：登录一定 `sessions.create()` 生成全新令牌，登录前的
  Cookie 一律不复用。
- **Session Hijacking**：`HttpOnly` 挡 JS 读取，`Secure` 挡明文传输，
  服务端可随时作废。
- **CSRF**：`SameSite=Lax` + `Origin` 白名单校验（`server/http/security.ts`）。
  校验**只作用于靠 Cookie 认证的非安全请求**：CSRF 的本质是让受害者浏览器花掉
  一个会自动附带的凭据，而 Bearer 不会自动附带，没带凭据的请求也没有权限可被
  滥用。这条规则同时让原生客户端的 `capacitor://` 来源能正常完成登录交接。
- 过期会话在读取时直接删除，另有定时清理。

`SameSite` 用 `Lax` 而不是 `Strict`：账号中心回跳是一次顶层 GET 导航，
`Strict` 会让回跳后的第一个请求丢掉 Cookie。

## 9. 三种令牌的职责，不得混用

| 令牌 | 用途 | 生命周期 | 是否给浏览器 |
| --- | --- | --- | --- |
| **ID Token** | 证明**用户是谁**。核心 claim 是 `sub` | 回调内用完即弃 | 否 |
| **Access Token** | 让**日事服务端**调用账号中心受保护 API（如 UserInfo） | 回调内用完即弃，不落库 | 否 |
| **Refresh Token** | 需要时换取新令牌 | 默认不申请、不保存 | 否，永远 |

明确禁止：把 ID Token 当普通 API Access Token 用；把 Refresh Token 暴露给
浏览器 JavaScript、`localStorage`、`sessionStorage`、`IndexedDB` 或明文 Cookie。

## 10. Refresh Token 策略：默认不要

日事真实需要的只有三件事：登录时拿到身份、建立自己的会话、偶尔读一次基础
profile。这些在回调那一次请求里全部完成，**之后不需要再代表用户调用账号中心**。

按「没有必要就不要保存」的原则，`ACCOUNT_SCOPES` 默认是
`openid profile email`，**不含 `offline_access`**，`RISHI_STORE_REFRESH_TOKENS`
默认 `false`。即使账号中心主动返回 refresh token，日事也不会存。

将来确有需要时：

1. `ACCOUNT_SCOPES` 加上 `offline_access`
2. `RISHI_STORE_REFRESH_TOKENS=true`（少了第 1 步会拒绝启动）

开启后的保护：

- AES-256-GCM 加密后入 `account_token` 表。密钥由 `RISHI_SESSION_SECRET` 经
  HKDF-SHA256 以独立 `info` 标签派生，不等于会话密钥本身。
- **Rotation**：账号中心返回新 refresh token 时，同一次调用内立即覆盖旧值，
  旧 token 不会被用第二次。
- 收到 `invalid_grant`：立刻删除本地副本，抛 `account_link_expired` 要求重新授权，
  不会拿着废 token 无限重试。
- 退出登录时按 RFC 7009 调用 `revocation_endpoint`，失败只记日志，不影响本地退出。

实现见 `server/auth/tokens.ts`，测试见 `server/test/refresh-token.test.ts`。

## 11. 用户信息

`sub` 是唯一必须存在的 claim；其余全部按「可能没有」处理。

1. 先读 ID Token 的 `name` / `preferred_username` / `email` / `picture`
2. 缺项且 discovery 提供了 `userinfo_endpoint` 时，用 Access Token 补一次
3. UserInfo 失败、超时或返回不匹配的 `sub` → **只记日志，登录照常成功**

没有头像或昵称不会导致登录失败，也不会创建新用户。

> 具体 claim 名称以账号中心实际实现为准，见
> [跨库联调清单](#cross-repository-integration-checklist)。

## 12. 业务数据隔离

**当前用户只能来自服务端已验证的会话。**

```ts
router.put('/sync', (req, res) => {
  const userId = currentUserId(req)   // 只从 req.auth 取，req.auth 只有 attachSession 能写
  ctx.userData.write(userId, body.data, baseVersion)
})
```

- 客户端传来的 `userId` / `accountUserId` / `sub` / `ownerId` / `user_id`
  在入库前被剥离，且**从不参与鉴权判断**。
- todo 的 `id` 与 `createdAt` 由服务端生成，客户端指定的 id 会被丢弃。
- `rishi_data_item` 记录「条目 → 归属用户」，用来区分 404 与 403。

状态码语义：

| 情况 | 状态码 |
| --- | --- |
| 没有会话 / 会话失效 | `401 unauthenticated` |
| 有会话，但资源属于别人 | `403 forbidden` |
| 资源不存在 | `404 not_found` |
| 版本冲突 | `409 version_conflict` |

`GET /api/auth/session` 是唯一的例外：它是给 SPA 的探测端点，未登录时返回
`200 {"authenticated": false}` 而不是 401。

### 为什么业务数据仍然是一个 JSON 文档

日事从第一天起就是一个 `AppData` 文档（`localStorage` 的 `kemiao-days-v1`），
所有组件、store、导入导出都围绕整份对象工作。把它拆成 todo / course / exam /
note 等若干张表，需要重写全部业务代码，风险远大于收益——正是「为了重构而重构」。

所以服务端沿用文档模型，**改变的是归属**：一份文档属于且只属于一个 `rishi_user`，
读写一律 `WHERE user_id = <会话用户>`。`PUT /api/sync` 用 `version` 做乐观并发，
旧版本写入返回 409 而不是静默覆盖别的设备。

未来若需要细粒度协同（多人共享课表、按条目增量同步），再做正式 migration 拆表。

## 13. 未登录访问策略

日事的页面**默认全部公开**。不登录也能完整使用日历、待办、课表、考试、
倒数日、便签——数据留在本机 `localStorage`。这是产品既有承诺，不能因为接了
账号中心就把所有人挡在门外。

需要登录的只有一件事：**跨设备同步**。对应的 API（`/api/sync`、`/api/todos`）
未认证时返回 401，前端把登录入口显示在「更多」菜单里。

## 14. 退出登录

`POST /api/auth/logout` 当前语义是**退出日事**：

1. 删除服务端会话行（不只是清 Cookie）
2. 清除 `rishi_sid`
3. 若存有 refresh token，按 RFC 7009 尽力撤销
4. 本机 `localStorage` 数据**保留不动**

**退出日事 ≠ 退出统一账号体系。** 账号中心是否提供 RP-Initiated Logout /
`end_session_endpoint` 尚未确认，在确认之前不会自己发明一套 Single Logout 协议。
`openid-client` 的 `buildEndSessionUrl` 已经可用，接通只是一次小改动。

将来可以拆成两个能力：「退出当前产品」和「退出所有产品」。

## 15. 账号中心不可用时

- 已登录用户的日事会话**不会**因为账号中心短暂故障而失效。会话是日事自己的，
  按自己的生命周期管理。
- discovery 文档有缓存，账号中心离线期间 `/api/auth/login` 仍能正常跳转。
- 冷启动且账号中心不可达时，`/api/auth/login` 返回 `503 account_unavailable`，
  并进入退避，不会对着一个挂掉的服务狂打。
- 只有真正依赖账号中心的动作会失败，其余功能不受影响。

## 16. 安全措施清单

| 威胁 | 措施 |
| --- | --- |
| 授权码拦截 | PKCE S256，`code_verifier` 只存服务端 |
| CSRF（登录） | `state` + `rishi_authtx` Cookie 双向绑定 |
| CSRF（业务） | `SameSite=Lax` + 对 Cookie 认证请求做 `Origin` 白名单校验 |
| 授权码重放 | 事务一次性消费；账号中心侧也应保证 code 一次性 |
| 令牌替换 | `nonce` 绑定，`openid-client` 强制校验 |
| 伪造 ID Token | JWKS 验签（显式开启）+ `iss` / `aud` / `exp` / `iat` 校验 |
| `alg=none` | `openid-client` 只接受 discovery 声明的签名算法，不接受 `none` |
| 只 decode 不 verify | 代码中没有任何手工 JWT 解析 |
| Open Redirect | `returnTo` 只接受站内相对路径，拒绝 `//`、`/\`、控制字符 |
| Session Fixation | 登录必发新令牌 |
| Session Hijacking | `HttpOnly` + `Secure` + 服务端可撤销 + 只存摘要 |
| XSS 窃取令牌 | 会话 Cookie `HttpOnly`，JS 完全读不到 |
| Token 泄露 | 账号中心令牌从不出服务端 |
| Secret 泄露 | 不入库、不入日志、不带 `VITE_` 前缀、`.gitignore` 覆盖 `.env*` |
| 信任浏览器身份 | 客户端 `sub` / `userId` 一律剥离 |
| 日志泄露凭据 | 结构化日志按键名脱敏 + JWT 形状识别 |

**没有为了「让它能跑」关掉任何一项校验。**

## 17. 日志

禁止出现在日志中：authorization code、access / refresh / ID token、
`client_secret`、`RISHI_SESSION_SECRET`、Cookie、密码、`code_verifier`、
`state`、`nonce`、handoff code。

`server/logger.ts` 按键名脱敏，并额外识别 JWT 形状的字符串。布尔与数值不脱敏
——凭据不可能是布尔值，把 `storeRefreshTokens: false` 打成 `[redacted]` 只会
让启动横幅失去意义。

错误日志保留 `errorCode` 与服务端 `detail` 供排障；返回给用户的只有稳定错误码
和一句中文提示。

> 字段名注意：`code` 会被脱敏（那是授权码的名字），错误码请用 `errorCode`。

## 18. 环境变量

完整清单见 [`.env.example`](../.env.example)。关键项：

| 变量 | 说明 |
| --- | --- |
| `ACCOUNT_ISSUER` | `https://account.yydsxwh.com` |
| `ACCOUNT_CLIENT_ID` | `rishi` |
| `ACCOUNT_CLIENT_SECRET` | confidential client 密钥，**生产必填** |
| `ACCOUNT_REDIRECT_URI` | 必须与账号中心登记值逐字符一致 |
| `ACCOUNT_SCOPES` | 默认 `openid profile email` |
| `ACCOUNT_CLIENT_AUTH_METHOD` | `client_secret_post`（默认）/ `client_secret_basic` / `none` |
| `ACCOUNT_VERIFY_ID_TOKEN_SIGNATURE` | 默认 `true` |
| `RISHI_SESSION_SECRET` | 日事专用，**生产必填**，≥32 字符，不得与账号中心任何 Secret 相同 |
| `RISHI_APP_ORIGIN` | SPA 所在 origin，用于回跳与 `Origin` 白名单 |
| `RISHI_ALLOWED_ORIGINS` | 额外可信来源（原生外壳、主站页面） |
| `RISHI_DATABASE_FILE` | SQLite 路径，默认 `var/rishi.sqlite` |
| `RISHI_STORE_REFRESH_TOKENS` | 默认 `false` |
| `VITE_RISHI_API_BASE` | **前端可见**，只能放非机密地址 |

生产环境的启动前置校验（不满足直接拒绝启动，见 `server/config.ts`）：

- `ACCOUNT_CLIENT_SECRET` 必须存在
- `RISHI_SESSION_SECRET` 必须存在且 ≥32 字符
- `RISHI_SESSION_SECRET !== ACCOUNT_CLIENT_SECRET`
- `ACCOUNT_ISSUER` / `ACCOUNT_REDIRECT_URI` 必须是 https
- `ACCOUNT_ALLOW_INSECURE_HTTP` 必须关闭
- `RISHI_SESSION_COOKIE_SECURE` 必须开启
- 开启 refresh token 存储时 `ACCOUNT_SCOPES` 必须含 `offline_access`

**没有真实 secret 时，`/api/auth/login` 返回 503 并记录原因。**
不会伪造一个假 secret 来假装接入成功。

## 19. 本地开发

```bash
npm install
cp .env.example .env          # 填入真实 ACCOUNT_CLIENT_SECRET 后才能真正登录
npm run dev:server            # BFF，http://localhost:3100
npm run dev                   # SPA，http://localhost:5173
```

`vite.config.ts` 已把 `/api/auth`、`/api/sync`、`/api/todos`、`/api/health`
代理到 `127.0.0.1:3100`，且不改写 Host，因此 Cookie 与 `Origin` 校验按同源处理。
`/api/days`（课表识图）仍然代理到主站，未受影响。

本地回调地址 `http://localhost:3100/api/auth/callback` 需要在账号中心一并登记。

### 拿不到真实 secret 时，也能走通整条链路

仓库里带了一个本地模拟 OpenID Provider，用来在真实联调之前把 SPA → BFF →
Provider 整条链路跑一遍：

```bash
npm run dev:mock-account        # http://127.0.0.1:4400

ACCOUNT_ISSUER=http://127.0.0.1:4400 \
ACCOUNT_CLIENT_SECRET=local-mock-client-secret \
ACCOUNT_REDIRECT_URI=http://localhost:5173/api/auth/callback \
ACCOUNT_ALLOW_INSECURE_HTTP=1 \
RISHI_APP_ORIGIN=http://localhost:5173 \
RISHI_SESSION_COOKIE_SECURE=false \
RISHI_SESSION_SECRET=local-demo-session-secret-at-least-32-characters \
npm run dev:server

npm run dev                     # http://localhost:5173
```

> **这是开发夹具，不是账号中心。** 在这里跑通，只说明日事这一侧的 RP 实现是对的。
> 真实接入仍以[跨库联调清单](#cross-repository-integration-checklist)为准。

检查：

```bash
npm run lint
npm run typecheck
npm test              # 106 个服务端测试
npm run test:timetable
npm run build
```

## 20. 生产部署

BFF 是**新增**的独立进程，静态站点的发布方式完全不变。

```bash
npm run build:server                      # tsc → dist-server/
NODE_ENV=production node dist-server/server/index.js
```

建议用 PM2 托管，nginx 把 `rishi.yydsxwh.com` 的 `/api/` 反代到 `127.0.0.1:3100`
并设置 `RISHI_TRUST_PROXY=true`。SQLite 文件（默认 `var/rishi.sqlite`）需要放在
可持久化、可备份的目录，它承载所有用户的云端数据。

数据库 migration 在进程启动时自动执行，记录在 `schema_migration` 表，
幂等、可重复运行。回滚 SQL 写在 `server/db/migrations.ts` 的 `down` 字段里，
需要人工执行。

## 21. 安全边界

- 日事**永远不**读取账号中心的数据库、Session 表或 Cookie。
- 日事**永远不**与账号中心共享 Session 密钥。
- 账号中心**不需要**知道日事的业务数据模型。
- 两者之间唯一的接口就是下面这份契约。

---

## Account Integration Contract

> 日事当前**假定**账号中心具备以下行为。每一条都要在双仓库联调阶段核对。
> 标 `NEEDS_CROSS_REPO_VERIFICATION` 的项目在单仓库阶段无法验证，不做猜测。

### 已确定（由集成规格给出）

| 项目 | 值 |
| --- | --- |
| Issuer | `https://account.yydsxwh.com` |
| Discovery | `/.well-known/openid-configuration` |
| JWKS | `/.well-known/jwks.json` |
| Authorization | `/api/oauth/authorize` |
| Token | `/api/oauth/token` |
| UserInfo | `/api/oauth/userinfo` |
| Revocation | `/api/oauth/revoke` |
| 协议 | OAuth 2.0 Authorization Code + OIDC |
| 安全参数 | PKCE、`state`、`nonce` |
| ID Token 签名 | RS256 |
| 能力 | Refresh Token Rotation、RFC 7009 Revocation |
| 标准 scope | `openid` `profile` `email` `offline_access` |
| 用户唯一身份 | OIDC `sub`，形如 `usr_VJQ4V0D7H5W0JYKEGSR7VQ670V`，全平台唯一、永久、不可变 |

### 日事需要在账号中心登记

| 项目 | 值 |
| --- | --- |
| `client_id` | `rishi` |
| 客户端类型 | confidential |
| 生产回调 | `https://rishi.yydsxwh.com/api/auth/callback` |
| 本地开发回调 | `http://localhost:3100/api/auth/callback` |
| 申请 scope | `openid profile email`（`offline_access` 暂不申请） |
| `grant_types` | `authorization_code`（将来可能加 `refresh_token`） |
| `response_types` | `code` |
| PKCE | 必须支持 `S256` |

### 待验证项目

| 标记 | 需要验证什么 | 为什么需要 | 可能影响 |
| --- | --- | --- | --- |
| `NEEDS_CROSS_REPO_VERIFICATION` | `token_endpoint_auth_methods_supported` 的实际取值 | 日事默认 `client_secret_post` | 不匹配则改 `ACCOUNT_CLIENT_AUTH_METHOD`，无需改代码 |
| `NEEDS_CROSS_REPO_VERIFICATION` | discovery 里的 `issuer` 是否与 `ACCOUNT_ISSUER` **逐字符**相同（含末尾斜杠） | `openid-client` 严格比对 | 不一致则所有登录失败 |
| `NEEDS_CROSS_REPO_VERIFICATION` | ID Token 是否带 `kid`，JWKS 是否可公开访问、是否支持轮换 | 验签依赖 JWKS | 缺失需关闭 `ACCOUNT_VERIFY_ID_TOKEN_SIGNATURE`（降低保障，需权衡） |
| `NEEDS_CROSS_REPO_VERIFICATION` | profile claim 的**实际名称**（`name` / `nickname` / `preferred_username` / `email` / `picture` / `avatar`） | 日事按标准名读取 | 名称不同则头像昵称显示为空，登录不受影响 |
| `NEEDS_CROSS_REPO_VERIFICATION` | UserInfo 返回的 `sub` 是否与 ID Token 一致 | `openid-client` 会校验 | 不一致则跳过 profile 补全，登录仍成功 |
| `NEEDS_CROSS_REPO_VERIFICATION` | 是否提供 `end_session_endpoint` | 决定能否做 RP-Initiated Logout | 没有就维持「只退出日事」 |
| `NEEDS_CROSS_REPO_VERIFICATION` | authorization code 是否严格一次性 | 防重放 | 账号中心侧必须保证 |
| `NEEDS_CROSS_REPO_VERIFICATION` | refresh token rotation 的确切行为（是否每次都换、旧 token 是否立刻失效） | 影响启用 `offline_access` 后的策略 | 当前默认不启用，暂不阻塞 |
| `NEEDS_CROSS_REPO_VERIFICATION` | 回调 URI 的匹配规则（精确匹配 / 允许查询参数） | 日事传固定 `redirect_uri` | 不匹配则换码失败 |
| `NEEDS_CROSS_REPO_VERIFICATION` | 是否支持 `authorization_response_iss_parameter_supported`（RFC 9207） | 若声明支持，回调必须带 `iss` | `openid-client` 会自动按 discovery 处理 |
| `BLOCKED` | 真实 `ACCOUNT_CLIENT_SECRET` | 没有它无法完成任何一次真实换码 | 登录全程不可用；日事目前返回 503 而不是伪造成功 |
| `NEEDS_PRODUCT_DECISION` | 原生客户端（Android / iOS）深链接登录 | 服务端交接已实现并测试，客户端侧还缺 `@capacitor/app` 的 `appUrlOpen` 监听和 AndroidManifest 的 intent-filter | 未接通前 APK 只能本机使用，无法跨设备同步 |

---

## Cross-repository integration checklist

双仓库（日事 + account）打开后**逐项核对**。目标是「核对 + 联调 + 最小修复」，
而不是重新开发日事认证。

### A. Discovery 文档

```bash
curl -s https://account.yydsxwh.com/.well-known/openid-configuration | jq
```

- [ ] `issuer` 与 `ACCOUNT_ISSUER` 逐字符相同（**注意末尾斜杠**）
- [ ] `authorization_endpoint` = `https://account.yydsxwh.com/api/oauth/authorize`
- [ ] `token_endpoint` = `https://account.yydsxwh.com/api/oauth/token`
- [ ] `userinfo_endpoint` = `https://account.yydsxwh.com/api/oauth/userinfo`
- [ ] `revocation_endpoint` = `https://account.yydsxwh.com/api/oauth/revoke`
- [ ] `jwks_uri` = `https://account.yydsxwh.com/.well-known/jwks.json`
- [ ] `end_session_endpoint` 是否存在（决定 §14 的后续能力）
- [ ] `scopes_supported` 含 `openid` `profile` `email`（以及 `offline_access`）
- [ ] `response_types_supported` 含 `code`
- [ ] `grant_types_supported` 含 `authorization_code`（及 `refresh_token`）
- [ ] `code_challenge_methods_supported` 含 `S256`
- [ ] `id_token_signing_alg_values_supported` 含 `RS256`，且**不含** `none`
- [ ] `token_endpoint_auth_methods_supported` 与 `ACCOUNT_CLIENT_AUTH_METHOD` 一致

### B. JWKS

```bash
curl -s https://account.yydsxwh.com/.well-known/jwks.json | jq
```

- [ ] 无需认证即可访问
- [ ] 至少一个 `kty: RSA`、`alg: RS256`、`use: sig` 的密钥
- [ ] 每个密钥都有 `kid`，且与 ID Token header 的 `kid` 对得上
- [ ] 确认密钥轮换策略（日事缓存 discovery，`openid-client` 会按需重取 JWKS）

### C. 在账号中心 `/studio/apps` 登记

- [ ] `client_id` = `rishi`
- [ ] 类型 = confidential
- [ ] 回调 = `https://rishi.yydsxwh.com/api/auth/callback`
- [ ] 回调 = `http://localhost:3100/api/auth/callback`（开发）
- [ ] 允许 scope：`openid` `profile` `email`
- [ ] 确认回调匹配规则（精确 / 前缀 / 是否允许额外查询参数）
- [ ] 生成 `client_secret`，通过 Cursor Secrets 或服务器环境变量下发，
      **不要粘贴到聊天、不要写进仓库**

### D. 真实登录联调

- [ ] `/api/auth/login` 302 到账号中心，URL 含 `code_challenge_method=S256`
- [ ] 账号中心页面正常显示，可注册、可登录
- [ ] 回调命中 `/api/auth/callback`，换码成功
- [ ] ID Token 通过签名 / `iss` / `aud` / `exp` / `nonce` 全部校验
- [ ] `sub` 形如 `usr_...`，与账号中心的公共用户 ID 一致
- [ ] 记录 ID Token 的**实际 claim 名称**，回填本文档 §11
- [ ] `rishi_user` 只新增一行
- [ ] 同一账号第二次登录不产生第二行
- [ ] 在账号中心改 email 后重新登录，仍是同一个 `rishi_user`
- [ ] `rishi_sid` 带 `HttpOnly`、`Secure`、`SameSite=Lax`
- [ ] 浏览器 DevTools 里搜不到任何账号中心令牌
- [ ] 登录后回跳到发起登录的页面
- [ ] 在账号中心点「取消」→ 得到 `auth_error=login_cancelled`

### E. 数据与多端

- [ ] 网页登录后本机数据上传成功
- [ ] 换一台设备登录同一账号，数据一致
- [ ] 两台设备同时改动，后写的一方收到 409 并正确合流
- [ ] 用另一账号登录，看不到第一个账号的任何数据
- [ ] 退出登录后本机数据仍在

### F. 退出与撤销

- [ ] `POST /api/auth/logout` 返回 204，会话立即失效
- [ ] 确认 `end_session_endpoint` 是否存在，决定要不要做 RP-Initiated Logout
- [ ] 若启用 `offline_access`：确认 rotation 行为与 RFC 7009 撤销确实生效

### G. 上线前

- [ ] 生产环境变量齐备（§18）
- [ ] `RISHI_SESSION_SECRET` 与账号中心任何 Secret 都不同
- [ ] SQLite 文件在可持久化目录，且已纳入备份
- [ ] nginx 反代正确，`RISHI_TRUST_PROXY=true`
- [ ] 生产日志抽查：搜不到 token / code / secret / cookie
- [ ] 账号中心短暂重启，确认已登录用户不掉线
