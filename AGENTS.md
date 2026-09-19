# AGENTS.md

## Project overview

网页产品 **颗秒日事**：日历、待办、倒数日、便签四合一，本地优先。

- **今日** — 最近倒数日、今天的课、考试、待办、钉住便签
- **日历** — 月历圆点（含考试）
- **待办** — 到期日与优先级
- **超级课程表** — 周课表；导入表格或课表照片（MathCode 视觉接口）
- **Android** — Capacitor 壳 `com.yydsxwh.kemiao.days`，校园粉蓝火焰 UI，本地通知
- **考试时间表** — 期中/期末/补考 + 提前提醒
- **倒数日 · 纪念日** — 同一个功能。一条记录同时回答「还有多少天」和
 「已经过去多少天」，可每年重复（生日 / 节日 / 出生那天 / 公司成立那天）
- **便签 · 笔记** — 同一个功能。彩色便利贴，可钉住；可送进主站网页文档
 继续写长文，或另存 `.docx` 给 WPS / Word 打开

数据本地优先，存浏览器 `localStorage`（键 `kemiao-days-v1`）。网页版登录主站后
额外实时同步到云端；原生壳仍是纯本机。
线上入口是主站软件产品栏：`https://www.yydsxwh.com/products` → `/products/days`。

## Tech stack

- React 18 + TypeScript, bundled with Vite 5.
- ESLint 9 (flat config in `eslint.config.js`) with typescript-eslint.

## Commands

Standard scripts are defined in `package.json`:

- `npm run dev` — start the Vite dev server (http://localhost:5173).
- `npm run build` — type-check (`tsc -b`) and produce a production build in `dist/`.
- `npm run lint` — run ESLint over the project.
- `npm run typecheck` — `tsc -b` on its own.
- `npm test` — Vitest unit tests (dates / sync merge / note→document).
- `npm run test:sync` — self-test for the cloud sync service, no framework needed.
- `npm run preview` — serve the production build locally.

## Cursor Cloud specific instructions

- Dependencies install with `npm install` (npm is the package manager; a
  `package-lock.json` is committed). This is handled by the environment update
  script, so you normally do not need to run it manually.
- The dev server (`npm run dev`) binds to `0.0.0.0:5173` (`server.host` is
  enabled in `vite.config.ts`) so it is reachable from outside the VM.
- No secrets are required for local work. The Vite dev server alone exercises
  every offline feature; only 登录 / 云同步 need the live main site.
- App state lives in browser `localStorage` (`kemiao-days-v1`); reset by
  clearing site data, or use the in-app「清空本机数据」.
- **`base` must stay `/products/days/` for production web builds.** The app is
  served from that subpath; building with Vite's default `/` makes `index.html`
  point at `/assets/...` on the site root, which nginx does not serve — that is
  a 404 white screen. `vite.config.ts` sets it for `command === 'build'`, and
  `deploy.yml` passes `--base=/products/days/` explicitly. Android/iOS override
  with `--base=./`; do not "simplify" either away.
- **登录与云同步走主站同源接口，不是账号中心。** `/products/days/` 和主站同源，
  所以 `GET /api/auth/session` 直接给出 `{user:{id,name,avatarUrl}}`（未登录返回
  `null` 而非 401）。不要再去打 `account.yydsxwh.com/api/products/days/sync` ——
  那个接口不存在，正是旧版「点登录没反应」的原因。账号中心虽然是完整的 OIDC
  Provider（discovery / JWKS / PKCE 都可用），但 `days` 客户端尚未登记，
  authorize 会返回「产品未登记或已停用」。
- 云同步服务在 `server/days-sync/`：只用 Node 内置模块，无 npm 依赖。身份靠把
  浏览器 Cookie 转给主站会话接口换取，客户端传的 userId 一律忽略。乐观并发，
  409 带回服务端现状由客户端合并（按 id 取并集，宁可多留不可丢失）。
  生产上是 systemd 服务 `kemiao-days-sync`（127.0.0.1:3120，数据在
  `/var/lib/kemiao-days`），nginx 用**精确匹配** `location = /api/days/sync`
  转发 —— 不要用 `^~ /api/days/`，那会抢走同前缀下属于 Next 的路由。
- 便签的「用网页文档打开 / 另存 Word」直接复用主站现成接口：`POST /api/docs`
  建文档、`POST /api/docs/export` 返回真正的 `.docx`（后者不需要登录）。内容是
  ProseMirror JSON，只允许 doc / heading / paragraph / text 等节点，且 text
  节点不能为空字符串。日事不自己造文档格式。
- 原生壳（Android / Windows）的页面不在 `www.yydsxwh.com` 源下，拿不到主站
  Cookie，因此只有本机模式，右上角显示「本机模式」而不是登录按钮。要让原生端
  也能同步，需要一次性 token 交接，尚未实现。
- Views are hash routes (`#today` `#calendar` `#todos` `#schedule` `#days` `#notes`).
- Course/exam import uses SheetJS (`xlsx`) for spreadsheets. Photos, screenshots,
  PDF pages, and Word/text go through `POST /api/days/timetable-ocr` on the main
  site (same MathCode vision key: `translateApi*` / `MATHCODE_*`, typically
  通义千问 `qwen-vl-max`). Vite proxies `/api/days` to `https://www.yydsxwh.com`
  in `npm run dev`. Sample files live in `public/samples/`.
  Parser self-test: `npm run test:timetable` (import + week-grid layout).
  Photo import resizes to JPEG ≤1600px before `POST /api/days/timetable-ocr`
  (phone originals often fail the first vision call). HEIC is rejected with
  a “导出 JPG” hint. Hydrate also accepts `weekday: 周一` and
  `startTime: 第1-2节`. Prefer `weekdayLabel` / `dayHeaders+slots.cells`
  over a weekday number — models often treat the 节次 column as weekday 1
  and shift 星期一 onto Tuesday. Packed rooms like `教一1506/1-2节/1-16周`
  are split into location + weeks (keep 单周/双周). Live OCR changes are
  patched into `.next/server/app/api/days/timetable-ocr/route.js` plus
  `packages/mathcode/lib/timetable-ocr.ts`; do not full-rebuild Next on
  this 3.4GB box while PM2 is up. Hidden dawn rows expand from a ▾ chip in the
  时间 header — do not put 隐藏 on weekday columns.   There is no standalone 「导入」 tab. Course import lives
  on 周课表 (拍教务处课表 / xlsx / csv); exam import lives
  on 考试时间表 and writes a date-sorted table.   Import
  infers class periods from printed clocks (e.g. 08:30) and hides hours
  outside the first/last class. The week-grid left gutter is a timeline:
  ticks follow imported class start/end clocks (08:30, 09:30, 11:30),
  not only whole hours, and the visible range clips to the first start
  through the last end. Do not feed inferred 45-minute 小节 splits into
  those ticks. Terms live in
  `AppData.terms` (学年 / 第1·2学期 / 寒暑假小学期 / 社会实践 /
  实习). Import writes into the current term. `npm run test:timetable`
  covers import + week-grid hide/layout.
- Class/exam reminders use the Notification API plus an in-app banner; they
  fire while the tab is open. Defaults: class 15 minutes, exam 1440 minutes
  and optionally again at 60 minutes.
- Production subpath build: `npx vite build --base=/products/days/` then
  `scripts/deploy-days.sh`.
- Live URLs: `https://www.yydsxwh.com/products` (软件产品 listing with
  网页版 + Android 下载) and `https://www.yydsxwh.com/products/days/`
  (app). Android package: `/products/days/kemiao-days.apk`. Static files
  live on the Hong Kong box at
  `/var/www/yyds-course-platform/public/products/days/`. nginx
  `location ^~ /products/days/` serves them; the Next app still owns
  `/products`. Listing card lives in Andyyyds
  `packages/shared/src/software-products.ts` (`kemiao-days` + `actions`).
  `scripts/deploy-days.sh` also uploads `kemiao-days.apk` when a local
  debug APK exists.
- SSH: `admin@47.242.157.181` with key file `~/.ssh/yyds_aliyun` (Aliyun
  console key name may show as `cursor`; key comment is `yyds-deploy`).
  Never write the private key into the repo or paste it into chat. If a key
  was pasted, rotate it on the server after deploy.
- Product catalog edits (`software-products.ts`, locales) are on the live
  Andyyyds tree at `/var/www/yyds-course-platform`. After those source
  changes, `npm run build` then `pm2 restart yyds-course`. Keep a `.next`
  backup before rebuilding.
- Do not block local setup on GitHub write access to `yydsxwh/Andyyyds`.
  That repo access was skipped; this product repo plus `npm run dev` is
  enough. Live listing/app were already published over SSH.
- Android: `npm run build:android` then `npm run android:apk`. The APK
  bundles `dist/` with `base: ./`. Native OCR posts to
  `https://www.yydsxwh.com/api/days/timetable-ocr`. Class/exam reminders
  use `@capacitor/local-notifications` so they can fire in the background.
  UI theme is campus pink/blue/flame (`#fff5f7`, `#2563eb`, `#fb7185`,
  `#ff6b35`, `#ffb703`, `#e11d48`). Do not commit `android/local.properties`
  or built APKs. Bump `versionCode` / `versionName` in
  `android/app/build.gradle` when shipping an update.
- Windows: `electron-builder --win` **cannot be finished on this Linux box** —
  NSIS packaging shells out to `wine`, and even with `wine` installed it needs
  the 32-bit wow64 components, so it dies with
  `failed to load ntdll.dll error c0000135` and leaves a truncated ~190KB
  installer. Do not upload that file over the working one. The
  `Deploy Days` workflow builds it properly on `windows-latest`; let CI do it.
