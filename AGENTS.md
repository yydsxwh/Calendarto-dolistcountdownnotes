# AGENTS.md

## Project overview

A local-first single-page web app combining four tools described in the README
(日历、待办、倒数日和笔记):

- **日历 (Calendar)** — month grid with navigation and today/selected highlight.
- **待办 (To-do)** — add/complete/filter/delete tasks.
- **倒数日 (Countdown)** — count days until/since dated events.
- **笔记 (Notes)** — quick editable notes.

All data is persisted client-side in the browser's `localStorage`; there is no
backend, database, login, or external service.

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
- App state lives entirely in browser `localStorage`; to reset to a clean state,
  clear site data / localStorage in the browser rather than touching any files.
