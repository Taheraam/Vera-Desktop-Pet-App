# VeraPetApp — Architecture Summary

## Overview

Two-window Tauri v2 desktop app: **Pet Window** (transparent canvas, read-only) + **Utility Window** (tasks/notes/clock, read+write). Single Rust backend owns all state; frontend windows are pure subscribers via event fan-out.

---

## Backend (`src-tauri/src/`)

| File | Purpose |
|---|---|
| `main.rs` | Entry — creates both windows (pet: 64×64 transparent, utility: 400×600 hidden), registers plugins (sql, autostart, window-state), runs DB migrations, seeds `last_alive_timestamp`, starts alarm scheduler thread. |
| `db.rs` | SQLite via `rusqlite` (WAL mode, bundled). Migrations: v1 = tasks/notes/alarms/app_state, v2 = provider_credentials/agent_actions + indices. |
| `commands/tasks.rs` | 5 commands: `create_task`, `update_task`, `complete_task` (emits `task-completed`), `delete_task`, `list_tasks`. |
| `commands/notes.rs` | 3 commands: `save_note` (create or update), `delete_note`, `list_notes`. |
| `commands/alarms.rs` | 4 commands: `create_alarm`, `delete_alarm`, `list_alarms`, `get_missed_alarms_summary` (catch-up on launch). |
| `commands/alarm_scheduler.rs` | Background thread polling every 10s for due alarms; emits `alarm-fired` with linked task. |
| `commands/window.rs` | Click-through toggle, autostart preference, monitor layout (name/size/position/scaleFactor). |
| `events.rs` | Placeholder for event bus helpers (currently emits happen inline in command files). |

### Backend design rules
- **Single writer:** Rust exclusively mutates SQLite. Frontend calls `invoke()` → backend persists → emits event → both windows react.
- **Pet window never writes state** — only sends drag intents via `invoke()`.
- **Alarm scheduler** runs in a background thread (tokio `spawn`), not a UI timer.

---

## Frontend (`src/`)

### Pet Window (read-only subscriber)

| File | Purpose |
|---|---|
| `pet-window/index.tsx` | Main component: creates `<canvas>`, manages DPI-aware sizing, handles pointer-event drag with screen-edge clamping. |
| `pet-window/canvas-renderer.ts` | `PetRenderer` — sprite atlas loader, `requestAnimationFrame` loop with per-state frame throttling, `ctx.scale(-1,1)` mirror for left-facing. `AnimationFSM` — state machine with advance/transition/completion callback. |
| `pet-window/animation-state.ts` | `AnimationStateBridge` — listens to 6 backend events, maps to FSM transitions via priority queue. Priority: `waking_up` (0) > `consent_ask` (1) > `bring_me_a_note` (2) > `celebrate` (3) > `happy` (4) > `eating` (5) > `sleep` (6) > `walk` (7) > `worried` (8) > `typing_focused` (9) > `idle` (10). |

### Utility Window (read + write)

| File | Purpose |
|---|---|
| `utility-window/index.tsx` | Main layout — 4-tab nav (Tasks / Notes / Clock / Settings). |
| `utility-window/TaskList.tsx` | CRUD task list with inline editing, checkbox completion, optimistic state from backend events. |
| `utility-window/NotesEditor.tsx` | Markdown editor with sidebar, 1s debounced autosave, save indicator. |
| `utility-window/ClockPanel.tsx` | Tabbed: Reminders (upcoming alarms, missed summary), Timer (HH:MM:SS countdown), Stopwatch (centiseconds). |
| `utility-window/AlarmModal.tsx` | Modal form — date-time picker + optional task link. |
| `utility-window/SettingsPanel.tsx` | Click-through toggle, auto-start toggle, version info. |
| `utility-window/Settings.tsx` | Stub — full implementation pending (render engine, hotkey, AI providers, audit log). |
| `utility-window/utility.css` | Full styling (~622 lines): warm off-white (#faf7f2), coral accent (#e8765a), rounded corners, generous whitespace. |

### Shared Code

| File | Purpose |
|---|---|
| `shared/types.ts` | **Single source of truth** — all TS types (`Task`, `Note`, `Alarm`, `PetState`, `AnimationState`, etc.), 14 event payload interfaces, typed command parameter interfaces. |
| `shared/ipc-client.ts` | Typed wrappers around `invoke()` for all ~25 backend commands + type-safe `onEvent()` listener over 14 events. |
| `shared/hooks.ts` | React hooks: `useTasks()`, `useNotes()`, `useAlarms()`, `usePetState()`, `useSettings()`, `useProviders()`, `useContextState()`, `useMissedAlarms()`. Each manages loading/error and auto-refreshes from backend events. |

---

## Event Bus (Backend → Both Windows)

| Event | Fired by | Payload |
|---|---|---|
| `task-created` | `create_task` | `{ task }` |
| `task-updated` | `update_task` | `{ task }` |
| `task-completed` | `complete_task` | `{ task }` |
| `task-deleted` | `delete_task` | `{ id }` |
| `note-updated` | `save_note` | `{ note }` |
| `note-deleted` | `delete_note` | `{ id }` |
| `alarm-created` | `create_alarm` | `{ alarm }` |
| `alarm-fired` | alarm scheduler thread | `{ alarm, task \| null }` |
| `missed-alarms-ready` | `get_missed_alarms_summary` | `{ alarms }` |
| `pet-state-changed` | `set_click_through` | `{ state }` |

---

## Key Design Patterns

- **Single-writer model:** Rust mutates SQLite → emits event → both windows re-render. No split-brain sync.
- **IPC contract:** `docs/Desktop_Pet_IPC_and_Database_Reference.md` is immutable source of truth for all command signatures.
- **Sprite pipeline:** 11 animation states (PNG + JSON frame maps). Right-facing only — left movement via canvas `ctx.scale(-1,1)`. Frame throttling: ambient states ~8fps, active states ~10fps.
- **Performance:** Idle target <50MB RAM, 8-10fps. Active 60fps during walks. Frame throttling via conditional `requestAnimationFrame` gate.
- **Security:** API keys go to OS keychain only (`tauri-plugin-keyring`), never SQLite. Consent gate required for every external write via MCP.

---

## Animation State Machine (11 states)

```
                        ┌──────────────────────────────────────┐
                        │                 idle                  │
                        └──┬────┬────┬────┬────┬────┬────┬──────┘
              walk ◄───────┘    │    │    │    │    │    │
              sleep ◄──────────┘    │    │    │    │    │
           waking_up ◄─────────────┘    │    │    │    │
              happy ◄───────────────────┘    │    │    │
             worried ◄───────────────────────┘    │    │
            celebrate ◄───────────────────────────┘    │
         typing_focused ◄──────────────────────────────┘
              eating ◄───────────────────────────────────┘
           consent_ask ◄──────────────────────────────────┘
         bring_me_a_note ◄─────────────────────────────────┘
```

`idle` is the hub. Non-looping states (happy, celebrate, waking_up, eating, bring_me_a_note) return to `idle` when complete. Looping states (sleep, worried, typing_focused, consent_ask) hold until exit condition clears.

---

## Current Milestone Status

| Milestone | Scope | Status |
|---|---|---|
| 1 | Barebones transparency + Canvas rendering | ✅ Done |
| 2 | OS hooks, hotkey, fullscreen, multi-monitor, auto-start | 🟡 Partial (no global hotkey yet) |
| 3 | SQLite + Utility Window (tasks, notes, alarms) | ✅ Done (all CRUD + scheduler + event bus working) |
| 4 | AI Provider (BYOK) + MCP Agent Engine + consent gate | ⏳ Not started |
| 5 | Context Engine (permissions, active-window detection) | ⏳ Not started |
| 6 | Drag-drop, gamification, "Bring Me a Note" | ⏳ Not started |
| 7 | Settings, packaging, polish | ⏳ Not started |

---

## Assets

- 11 sprite sheets + JSON frame maps in `src/assets/sprites/`
- Each JSON: `{ frameWidth, frameHeight, frameCount, fps, loop }`
- Total ~50-60 frames across all states

---

## Config

- `package.json` — React 18, Vite 5, TypeScript 5, @tauri-apps/api ^2
- `vite.config.ts` — 3 entry points (main/pet/utility), port 1420 strict
- `src-tauri/Cargo.toml` — tauri 2, rusqlite 0.31 (bundled), tauri-plugin-sql/autostart/window-state
- `src-tauri/tauri.conf.json` — `beforeDevCommand: "npm run dev"`, windows created programmatically
