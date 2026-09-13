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

数据在浏览器 `localStorage`（键 `kemiao-days-v1`），无后端、无登录、无密钥。
目标线上入口是主站软件产品栏：`https://www.yydsxwh.com/products` → `/products/days`。

## Tech stack

- React 18 + TypeScript, bundled with Vite 5.
- ESLint 9 (flat config in `eslint.config.js`) with typescript-eslint.

## Commands

Standard scripts are defined in `package.json`:

- `npm run dev` — start the Vite dev server (http://localhost:5173).
- `npm run build` — type-check (`tsc -b`) and produce a production build in `dist/`.
- `npm run lint` — run ESLint over the project.
- `npm run preview` — serve the production build locally.

## Cursor Cloud specific instructions

- Dependencies install with `npm install` (npm is the package manager; a
  `package-lock.json` is committed). This is handled by the environment update
  script, so you normally do not need to run it manually.
- The dev server (`npm run dev`) binds to `0.0.0.0:5173` (`server.host` is
  enabled in `vite.config.ts`) so it is reachable from outside the VM.
- There is no backend/service to start and no environment variables or secrets
  are required — running the Vite dev server is sufficient to exercise all
  features end to end.
- App state lives entirely in browser `localStorage` (`kemiao-days-v1`); reset by
  clearing site data, or use the in-app「清空本机数据」.
- Views are hash routes (`#today` `#calendar` `#todos` `#schedule` `#days` `#notes`).
- Course/exam import uses SheetJS (`xlsx`) for spreadsheets. Photos, screenshots,
  PDF pages, and Word/text go through `POST /api/days/timetable-ocr` on the main
  site (same MathCode vision key: `translateApi*` / `MATHCODE_*`, typically
  通义千问 `qwen-vl-max`). Vite proxies `/api/days` to `https://www.yydsxwh.com`
  in `npm run dev`. Sample files live in `public/samples/`.
  Parser self-test: `npm run test:timetable` (import + week-grid layout).
  The `#schedule` week view is an Excel-like grid: columns are
  weekdays, rows are 00:00–23:59. Dawn hours 00–05 are hidden by
  default and can be toggled in 课表设置. Terms live in
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
