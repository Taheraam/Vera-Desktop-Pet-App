# Architecture Plan — TauriPetApp

## Confirmed Tech Stack & Rationale

| Layer | Choice | Why |
|-------|--------|-----|
| **Backend** | Tauri v2 (Rust) | Single process owns all state; native OS hooks (hotkeys, fullscreen, tray, autostart); small binary; sidecar-free |
| **Frontend** | React 18 + TypeScript + Vite | Familiar component model; hot reload in dev; two windows share same codebase via entry points |
| **Rendering** | HTML5 Canvas 2D (default), WebGL/PixiJS (settings-gated) | Canvas 2D = minimal GPU/CPU at idle; WebGL swap is a renderer module behind same animation-state interface |
| **Database** | SQLite via `tauri-plugin-sql` (WAL mode) | Embedded, zero-config, atomic writes, crash recovery; migrations via plugin array |
| **Secure Storage** | `tauri-plugin-keyring` (Keychain / Credential Manager) | API keys never touch SQLite — only OS keychain references stored |
| **Autostart** | `tauri-plugin-autostart` | Cross-platform (Task Scheduler / LaunchAgents) with correct defaults |
| **IPC** | Tauri `invoke()` + event emit | Type-safe commands; single-writer event fan-out to both windows |

---

## Dependency List by Milestone

### Milestone 1 — Barebones Transparency & Canvas Rendering
- `@tauri-apps/api` (core IPC, window APIs)
- `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`
- *No additional Rust crates beyond Tauri defaults*

### Milestone 2 — Native OS Hooks & Toggle Engine
- `tauri-plugin-autostart` (opt-in login launch)
- `tauri-plugin-global-shortcut` (Alt+P hotkey)
- `tauri-plugin-window-state` (optional, for position persistence)
- OS-specific: `windows-rs` / `core-foundation` for fullscreen detection hooks

### Milestone 3 — Data Layer & Utility Window
- `tauri-plugin-sql` (SQLite + migrations)
- `tauri-plugin-sql-builder` or raw SQL via `sqlx` (compile-time checked queries)
- `tauri-plugin-opener` (for file drops / external links)

### Milestone 4 — AI Provider & MCP Agent Engine
- `tauri-plugin-keyring` (OS secure key storage)
- `reqwest` + `serde_json` (HTTP to OpenAI/Anthropic/Gemini)
- `mcp-client` (Rust MCP client crate — evaluate `rmcp` or `mcp-client-rust`)
- `tokio` (async runtime for agent loops)
- Provider SDKs: `async-openai`, `anthropic-sdk-rust`, `gemini-rust` (or raw HTTP)

### Milestone 5 — Context Engine
- `tauri-plugin-accessibility` (macOS permission prompt wrapper)
- `windows-rs` foreground window hooks (Windows)
- `tauri-plugin-positioner` (optional, for tray-relative positioning)

### Milestone 6 — Deep Interaction & Gamification
- `tauri-plugin-fs` (file read for drag-drop ingestion)
- `image` crate (image processing for dropped images)

### Milestone 7 — Settings, Packaging & Polish
- `tauri-plugin-updater` (auto-update)
- Code signing certificates (Windows EV + macOS Developer ID)
- `tauri-bundler` config for MSI/DMG

---

## Critical Implementation Notes

### 1. Rust Backend is Sole State Writer
- **All mutations** go through Tauri commands defined in `src-tauri/src/commands/`.
- **Frontend windows never write SQLite directly** — they `invoke()` → backend persists → backend emits event → both windows react.
- Pet Window is **read-only subscriber**; it only sends *intent* events (drag, double-click) via `invoke()`.

### 2. IPC Contract is Immutable Source of Truth
- Defined in `docs/Desktop_Pet_IPC_and_Database_Reference.md` (Sections 1–9).
- **Never infer signatures** — always reference that doc when adding/modifying commands.
- Schema changes (Section 9) require:
  1. Update the markdown doc first
  2. Add a migration to `tauri-plugin-sql` migration array
  3. Update Rust command handlers and TypeScript types in `src/shared/types.ts`

### 3. Event Bus = Fan-Out, Not Sync
- Backend emits on `tauri::ipc::Channel` or `AppHandle::emit()`.
- Both windows listen via `@tauri-apps/api/event`.
- No bidirectional sync logic — single source of truth, many readers.

### 4. Security Boundaries
- API keys → OS keychain only (`tauri-plugin-keyring`), never SQLite, never logs.
- Consent gate: **every external write/send/delete via MCP pauses for visual approval** (Pet Window consent card). Read-only tools execute immediately.
- Theme packs = CSS custom properties only — no arbitrary CSS/JS injection (prevents consent-gate spoofing).

### 5. Performance Budgets (Non-Negotiable)
- Idle: 8–10 FPS, <50 MB RAM combined (Pet + Utility + Backend).
- Active: 60 FPS walking/animating.
- Frame throttling via conditional `requestAnimationFrame` gate in `canvas-renderer.ts`.
- Sprite atlas loaded once at startup; frame indices swapped, not textures.

### 6. Cross-Platform Gotchas
- **Windows:** Global hooks + autostart + window manipulation = AV false positives. Sign everything. Document privacy page.
- **macOS:** Accessibility permission required for Context Engine (Milestone 5). Graceful fallback if denied — no crash, no nag.
- DPI: Use Tauri's `availableMonitors()` per-frame-batch, not `window.screen`.

### 7. File Structure Ownership
```
src-tauri/src/
  main.rs           → Tauri app entry, plugin registration, event bus setup
  db.rs             → SQLite connection, migrations, WAL pragmas
  events.rs         → Event emission helpers (task-completed, alarm-fired, etc.)
  commands/
    tasks.rs        → create_task, update_task, complete_task, delete_task, list_tasks
    notes.rs        → save_note, delete_note, list_notes
    alarms.rs       → create_alarm, delete_alarm, list_alarms, get_missed_alarms_summary
    window.rs       → set_click_through, get_pet_state, set_auto_start, get_monitor_layout
```
Frontend windows are separate entry points (`src/pet-window/index.tsx`, `src/utility-window/index.tsx`) sharing `src/shared/` types and hooks.