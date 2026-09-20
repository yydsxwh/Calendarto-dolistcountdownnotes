# AGENTS.md

## Project overview

网页产品 **颗秒日事**：日历、待办、倒数日、便签四合一，本地优先。

- **今日** — 最近倒数日、今天的课、考试、待办、钉住便签
- **日历** — 月历圆点（含考试）
- **待办** — 到期日与优先级
- **超级课程表** — 周课表；导入表格或课表照片（MathCode 视觉接口）
- **Android** — Capacitor 壳 `com.yydsxwh.kemiao.days`，校园粉蓝火焰 UI，本地通知
- **考试时间表** — 期中/期末/补考 + 提前提醒
- **倒数日** — Days Matter 风格大数字卡片，可每年重复
- **便签** — 彩色便利贴，可钉住

数据在浏览器 `localStorage`（键 `kemiao-days-v1`），不登录也能完整使用。
跨设备同步走统一账号：日事是 `https://account.yydsxwh.com` 的 OIDC 客户端，
对应仓库内新增的 BFF（`server/`）。日事不保存密码、不做注册表单。
目标线上入口是主站软件产品栏：`https://www.yydsxwh.com/products` → `/products/days`。

## Tech stack

- React 18 + TypeScript, bundled with Vite 5.
- ESLint 9 (flat config in `eslint.config.js`) with typescript-eslint.

## Commands

Standard scripts are defined in `package.json`:

- `npm run dev` — start the Vite dev server (http://localhost:5173).
- `npm run dev:server` — start the account/sync BFF on http://localhost:3100.
- `npm run build` — type-check (`tsc -b`) and produce a production build in `dist/`.
- `npm run build:server` — compile the BFF into `dist-server/`.
- `npm run lint` — run ESLint over the project.
- `npm run typecheck` — type-check both the SPA and the BFF.
- `npm test` — run the server/auth suite (Vitest).
- `npm run preview` — serve the production build locally.

## Before changing anything

Read [`docs/existing-features.md`](docs/existing-features.md) first. It is the
authoritative list of what already exists and is **not deletable**: 8 hash
routes, 4 localStorage keys and 7 business entities, all inventoried from the
source rather than from a requirements list.
[`docs/feature-migration-map.md`](docs/feature-migration-map.md) pairs each
user-facing entry with the layer underneath it. The underneath may change; the
entry may not.

Three things people routinely assume exist and do not: long-form 笔记 (only
便签 exists), a 纪念日 feature (only `Countdown.repeatYearly`), and a 今日提醒
recurring-task entity (我的一天 is an aggregate view). Two that exist and are
easy to miss: 考试时间表 and 自律.

`calendarEvents` and `src/lib/calendar-core.ts` are written but unwired — a
recurrence model with no UI, and a domain model nothing imports. Look at both
before writing any new recurrence engine, or the repo ends up with two.

`npm test` includes 102 regression tests over the existing behaviour. If one
fails, the default assumption is that the change broke something a user
depends on, not that the test is stale.

## Cursor Cloud specific instructions

- Dependencies install with `npm install` (npm is the package manager; a
  `package-lock.json` is committed). This is handled by the environment update
  script, so you normally do not need to run it manually.
- The dev server (`npm run dev`) binds to `0.0.0.0:5173` (`server.host` is
  enabled in `vite.config.ts`) so it is reachable from outside the VM.
- There is no backend/service to start and no environment variables or secrets
  are required — running the Vite dev server is sufficient to exercise all
  features end to end.
- App state lives in browser `localStorage` (`kemiao-days-v1`); reset by
 clearing site data, or use the in-app「清空本机数据」. When the user signs in
 with the unified account, the same document is mirrored per-user on the BFF.
- Unified account login is an OpenID Connect Authorization Code + PKCE flow
 against `https://account.yydsxwh.com`, implemented in `server/` with
 `openid-client` v6. Identity is the OIDC `sub`; 日事 stores no passwords and
 has no registration form. The browser only ever holds 日事's own HttpOnly
 session cookie — never an account-center token. Read
 `docs/authentication.md` before touching anything under `server/auth/`; it
 carries the Account Integration Contract and the cross-repo checklist, so
 you do not need to open the account-center repository. Real end-to-end login
 is BLOCKED until `ACCOUNT_CLIENT_SECRET` is provisioned; without it
 `/api/auth/login` returns 503 on purpose. Never invent a placeholder secret,
 never commit one, never put one behind a `VITE_` prefix. Tests run against a
 local mock OpenID Provider (`server/test/oidc-provider-mock.ts`); passing
 them is not the same as having integrated with the real account center.
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
  or built APKs.
