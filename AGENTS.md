# AGENTS.md — VeraPetApp

## Project Overview
Tauri v2 (Rust backend) + HTML5 Canvas 2D frontend. Two windows: Pet Window (transparent, always-on-top, read-only) and Utility Window (hidden by default, writes via Tauri commands). Single Rust backend owns all state; frontend windows are pure subscribers.

**Key docs:** `docs/Desktop_Pet_PRD_Technical_Spec.md` (architecture, milestones), `docs/Desktop_Pet_IPC_and_Database_Reference.md` (IPC commands + SQLite schema), `docs/Desktop_Pet_Stitch_Design_Brief.md` (UI design tokens), `docs/Desktop_Pet_Asset_Animation_Spec_Sheet.md` (sprite specs), `docs/Desktop_Pet_Agent_Orchestration_and_System_Prompt.md` (MCP agent logic).

---

## Build / Dev Commands
```bash
# From repo root (after cargo install tauri-cli)
cargo tauri dev          # dev mode with hot reload
cargo tauri build        # production build
cargo check              # typecheck only
```

**Prerequisites:** Rust 1.75+, Node 18+, Tauri CLI (`cargo install tauri-cli`).

---

## Architecture Notes
- **Single-writer model:** Only Rust backend mutates SQLite. Frontend windows call `invoke()` → backend persists → emits events → both windows re-render.
- **Pet Window never writes state directly.** It sends intent events (drag, double-click) via `invoke()`.
- **IPC contracts** are defined in `docs/Desktop_Pet_IPC_and_Database_Reference.md` — treat as source of truth.
- **SQLite WAL mode enabled** for crash resilience.

---

## Milestone Status (from PRD)
| Milestone | Scope | Status |
|---|---|---|
| 1 | Barebones transparency + Canvas rendering | Pending |
| 2 | OS hooks, hotkey, fullscreen, multi-monitor, auto-start | Pending |
| 3 | SQLite + Utility Window (tasks, notes, alarms) | Pending |
| 4 | AI Provider (BYOK) + MCP Agent Engine + consent gate | Pending |
| 5 | Context Engine (permissions, active-window detection) | Pending |
| 6 | Drag-drop, gamification, "Bring Me a Note" | Pending |
| 7 | Settings, packaging, polish | Pending |

---

## Critical Constraints
- **Never enable auto-start by default** — opt-in only via onboarding.
- **API keys never stored in SQLite** — only OS keychain references (`tauri-plugin-keyring`).
- **Consent gate is mandatory** for every external write/send/delete via MCP. Read-only tools execute immediately.
- **Idle frame throttling:** 8–10fps idle vs 60fps active — measurable CPU/GPU drop required.
- **Theme packs = CSS custom properties only** — no arbitrary CSS/JS injection (security: prevents consent-gate spoofing).

---

## Testing / QA
No test framework configured yet. When added, follow the **Technical Acceptance Criteria** matrix in `docs/Desktop_Pet_PRD_Technical_Spec.md:Section 5` — each row is a pass/fail condition.

---

## Common Pitfalls
- **Don't infer IPC signatures** — always check `docs/Desktop_Pet_IPC_and_Database_Reference.md`.
- **Don't modify SQLite schema without updating that doc** — migrations use `tauri-plugin-sql` migration array.
- **Pet Window = read-only subscriber.** If you find it calling mutating commands, that's a bug.
- **Stitch outputs are static HTML/CSS** — wiring to real `invoke()` calls happens in Antigravity afterward.