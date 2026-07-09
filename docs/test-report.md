# Test Report — Phase 4, Task 4.1 (End-to-End Test Pass)

**Date:** 2026-07-09
**Scope:** Verify the core Milestone 1–3 mechanics end-to-end against `docs/Desktop_Pet_PRD_Technical_Spec.md` §5 (QA acceptance matrix).
**Reference matrix rows exercised:** DB crash recovery (persistence), idle frame throttling (indirectly), drag-and-drop (out of scope here), missed-alarm catch-up (out of scope), plus the window/event mechanics from Milestones 1–3.

---

## Environment / Method

- Windows (win32), headless (no graphical display, no UI-automation tooling available).
- Commands run: `npm run tauri:dev` (and, as an equivalent, Vite started manually via `npm run dev` on `:1420` with `tauri dev` re-run so it could connect).
- Frontend assets verified via HTTP `200` from the Vite dev server.
- Rust backend compiled cleanly (`cargo check` passed; full build succeeded — only harmless `unused import` / `dead_code` warnings).
- **Limitation:** because the environment is headless, *visual* canvas rendering and *interactive* UI actions (clicking checkboxes, typing in the notes box) cannot be performed by the agent. Checks that require a live rendered window or user input are marked BLOCKED below, with the exact manual steps a human must follow in a graphical session.

---

## Check 1 — Both windows launch (pet window + utility window)

- **Tested:** Ran `npm run tauri:dev`. Also attempted the equivalent path (Vite started manually, then `tauri dev` re-run so it could connect to the already-running dev server).
- **Expected:** Rust backend builds, Vite dev server starts, and two Tauri webview windows (`pet`, `utility`) are created and the app keeps running.
- **Actual:** Two distinct failures, both config-level:
  1. **First run (`tauri dev` alone):** Rust built fine, but the command sat at `Warn Waiting for your frontend dev server to start on http://localhost:1420/` for 180s and then errored: `Could not connect to http://localhost:1420/ after 180s.` → Vite is **never started by `tauri dev`** because `tauri.conf.json` has **no `beforeDevCommand`**.
  2. **Second run (Vite already up):** Rust built and launched `target\debug\verapetapp.exe`, which **panicked immediately**:
     ```
     thread 'main' panicked at src\main.rs:69:10:
     error while running VeraPet app: PluginInitialization("autostart",
       "Error deserializing 'plugins.autostart' within your Tauri configuration:
        invalid type: map, expected unit")
     ```
     → The app exits (code 101) during plugin initialization, **before** any window is created and **before** `seed_app_state` runs.
- **Result:** ❌ **FAIL** (app does not launch).
- **Blocker for Task 4.2:**
  - **B1:** `tauri.conf.json` is missing `beforeDevCommand` (e.g. `"beforeDevCommand": "npm run dev"`). Without it `tauri dev` never launches the frontend.
  - **B2:** `tauri.conf.json` → `plugins.autostart` is malformed (`{"enabled": false, "launchMode": "login"}`). The installed `tauri-plugin-autostart` v2 expects a *unit* config here (got a map). Remove/replace this block with the format valid for the installed plugin version.

---

## Check 2 — Canvas renders a placeholder sprite in the pet window

- **Tested:** With Vite up, fetched the pet-window entry and the placeholder sprite asset over HTTP.
  - `GET /src/pet-window/index.html` → **200**
  - `GET /src/assets/sprites/idle.png` → **200** (placeholder sprite present and served)
  - All 11 sprite PNGs + JSON exist in `src/assets/sprites/` (generated in Phase 3.1).
- **Expected:** The pet window canvas loads `idle.png` (and the other states) and paints a frame.
- **Actual:** The sprite *asset pipeline* is correct (files exist, served 200), but the **actual canvas paint cannot be confirmed** — the app process panics at plugin init (B2) before any webview window is created, so no canvas is ever instantiated.
- **Result:** ⚠️ **INCONCLUSIVE / PARTIAL** — asset delivery verified (200); live rendering **BLOCKED** by Check 1's failure.
- **Manual follow-up (graphical session):** after B1/B2 are fixed, launch the app and confirm the pet window shows a colored circle (idle placeholder) without console errors.

---

## Check 3 — Creating a task in the Utility Window updates SQLite

- **Tested:** Inspected the command path (`UtilityWindow` → `TaskList` → `createTask()` → `invoke('create_task')` → Rust `commands::tasks::create_task` → `INSERT INTO tasks`). Attempted to confirm the DB file exists.
- **Expected:** After typing a title + Add, a row appears in `tasks` and the DB file `$APPDATA/verapet.db` is created/written.
- **Actual:** The app never reaches the DB layer — it panics at plugin init (B2) **before** `db::seed_app_state` runs, so **`$APPDATA/verapet.db` does not exist yet**. No task can be created because no window/UI is running. Note: `sqlite3` CLI is **not installed** in this environment, so even a manual DB query would require installing it or using a Node/Python SQLite reader.
- **Result:** ⛔ **BLOCKED** by Check 1 (app does not launch; no DB created).
- **Manual follow-up (graphical session):** after B1/B2 fixed, open Utility Window → Tasks tab → type a title → Add. Then verify with `sqlite3 $APPDATA/verapet.db "SELECT * FROM tasks;"` (install `sqlite3` or use a DB viewer).

---

## Check 4 — Completing a task fires `task-completed` and pet animation → `happy`

- **Tested:** Verified the wiring in code: `TaskList.handleToggle` → `completeTask(id)` → `invoke('complete_task')`; backend `complete_task` emits `task-completed` (now wrapped `{task}` per the Phase-4 contract fix); `AnimationStateBridge` listens for `task-completed` and calls `requestState('happy')`.
- **Expected:** Checking a task box emits `task-completed`; the pet window's FSM transitions to `happy`.
- **Actual:** Cannot be exercised — no running app (B2), and the action requires a UI checkbox click (headless). The event-name and payload contract were statically confirmed to match (backend emits `task-completed` with `{task: Task}`; frontend bridge listens for `task-completed` and reads `p.task`).
- **Result:** ⛔ **BLOCKED** by Check 1; logic/path statically verified only.
- **Manual follow-up:** after B1/B2 fixed, check a task in the Utility Window and confirm (a) no error in console, (b) pet window plays the happy animation.

---

## Check 5 — Database persists between app restarts

- **Tested:** Attempted to locate `$APPDATA/verapet.db` before and (planned) after a kill/relaunch.
- **Expected:** Tasks survive a kill + relaunch (WAL mode, last-consistent state).
- **Actual:** DB file **not created** (app crashes at startup, B2, before `seed_app_state`). Persistence therefore cannot be measured yet. WAL is enabled in `db.rs` (`PRAGMA journal_mode=WAL`), which is the intended durability mechanism, but it is unexercised.
- **Result:** ⛔ **BLOCKED** by Check 1 (no DB to test persistence against).
- **Manual follow-up:** after B1/B2 fixed, create a task, fully kill the app (`taskkill /IM verapetapp.exe`), relaunch, and confirm the task is still listed.

---

## Check 6 — Notes autosave works (type, wait 1s, verify DB updated)

- **Tested:** Verified the wiring: `NotesEditor` debounces 1s → `saveNote({id, content_markdown})` → `invoke('save_note')` → Rust `save_note` → `INSERT`/`UPDATE notes`. Confirmed the 1s debounce + `Saving…`/`Saved` indicator exist in code.
- **Expected:** Typing in the notes box, waiting 1s, writes the markdown to `notes` and the indicator shows "Saved".
- **Actual:** Cannot be exercised — no running app (B2) and requires typing into the textarea (headless). The DB layer is unreachable (no DB file).
- **Result:** ⛔ **BLOCKED** by Check 1; logic/path statically verified only.
- **Manual follow-up:** after B1/B2 fixed, open Utility Window → Notes tab → type text → wait 1s → confirm "Saved" shows and `sqlite3 $APPDATA/verapet.db "SELECT content_markdown FROM notes;"` reflects the text.

---

## Summary

| # | Check | Result | Root cause |
|---|-------|--------|-----------|
| 1 | Both windows launch | ❌ FAIL | B1 (missing `beforeDevCommand`) + B2 (`plugins.autostart` config parse panic) |
| 2 | Canvas renders placeholder sprite | ⚠️ PARTIAL | Assets serve 200; live paint blocked by B2 |
| 3 | Create task → SQLite | ⛔ BLOCKED | B2 (no app, no DB) |
| 4 | Complete task → `happy` event | ⛔ BLOCKED | B2; path statically verified |
| 5 | DB persists across restart | ⛔ BLOCKED | B2 (no DB created) |
| 6 | Notes autosave → DB | ⛔ BLOCKED | B2; path statically verified |

**Conclusion:** The end-to-end launch is currently broken by **two config defects in `tauri.conf.json`** (B1, B2). Everything downstream is blocked on these. No code/logic defects were found in the feature paths themselves (task/note/alarm commands, event wrapping, animation bridge, notes debounce) — those were statically verified and the backend compiles.

**Hand-off to Task 4.2 (do NOT fix here, per instructions):** correct `tauri.conf.json`:
- Add `"beforeDevCommand": "npm run dev"` (so `tauri dev` starts Vite).
- Fix `"plugins": { "autostart": ... }` to the format valid for the installed `tauri-plugin-autostart` v2 (current `"{enabled:false, launchMode:login}"` is rejected as a map where a unit is expected).
