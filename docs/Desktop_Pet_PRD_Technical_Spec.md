# Product Requirement Document & Technical Specification
## Productivity Desktop Companion App (2D Desktop Pet)

**Version:** 1.0 (MVP Lock)
**Status:** Draft for Approval
**Stack:** Tauri v2 (Rust backend) + HTML5 Canvas 2D (WebGL/PixiJS deferred to settings-gated future milestone) + SQLite (via `tauri-plugin-sql`)

---

## 1. Product Vision (Carried Forward)

A lightweight, always-running desktop companion that merges cosmetic "desktop pet" charm with genuine productivity utility (notes, to-dos, alarms) — positioned as a legitimate lightweight alternative to Todoist/Notion, wrapped in an interactive pet skin. Cross-platform (Windows + macOS) from v1.

**Non-negotiable constraint:** the app must be safe to leave running 24/7 without meaningfully impacting battery life or RAM. Every architectural decision below is filtered through that lens.

---

## 2. System Architecture Overview

### 2.1 Process Model

The app is a single Tauri **backend process** (Rust) that owns all state, plus **two frontend windows** that are pure renderers/subscribers:

```
┌─────────────────────────────────────────────────────────────┐
│                     TAURI CORE (Rust)                        │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ SQLite    │ │ Alarm      │ │ Context   │ │ AI Agent Engine ││
│  │ Store     │ │ Scheduler  │ │ Engine    │ │ (multi-provider,││
│  │ (source   │ │ (catch-up  │ │ (active   │ │ MCP client,     ││
│  │ of truth) │ │ on launch) │ │ window,   │ │ consent-gated   ││
│  │           │ │            │ │ idle)     │ │ tool execution) ││
│  └─────┬─────┘ └─────┬──────┘ └─────┬─────┘ └────────┬────────┘│
│        └─────────────┴──────────────┴────────────────┘         │
│                        Tauri Event Bus                        │
└──────────┬──────────────────────────────────────┬─────────────┘
           │ emits state events                   │ emits state events
           ▼                                       ▼
   ┌───────────────────┐                 ┌────────────────────┐
   │  PET WINDOW        │                 │  UTILITY WINDOW     │
   │  (transparent,     │                 │  (hidden by         │
   │  borderless,       │                 │  default, toggled   │
   │  always-on-top,    │                 │  via hotkey/click)  │
   │  READ-ONLY         │                 │  WRITES via         │
   │  subscriber)       │                 │  Tauri commands     │
   └───────────────────┘                 └────────────────────┘
```

**Key rule:** the Pet Window never mutates app state directly. It sends *intent* events ("user dragged a file onto me," "user double-clicked me") to the Rust backend via Tauri `invoke()`, and the backend decides what happens, persists it, and re-broadcasts the resulting state. This eliminates the split-brain sync problem entirely — there is one writer, many readers.

### 2.2 Data Flow (Example: Completing a Task)

1. User checks off a task in the Utility Window.
2. Utility Window calls `invoke('complete_task', { id })`.
3. Rust backend updates SQLite, computes any side effects (XP gain, streak update).
4. Backend emits `task-completed` event on the shared event bus.
5. Both windows receive the event. Utility Window re-renders its list; Pet Window triggers the "happy flip" animation state.

This is a **single source of truth, fan-out event model** — not bidirectional sync.

---

## 3. Core System Specifications

### 3.1 Window & OS Behavior Engine

**Fullscreen handling**
- Backend polls (or subscribes to OS-native events where available) for a foreground fullscreen application.
- On detection: Pet Window is hidden entirely (not just occluded) to avoid wasted render cycles fighting the compositor.
- Restoring from fullscreen re-triggers pet visibility automatically, *and* the pet plays a brief "waking up" animation rather than snapping back silently.

**The "Call Pet" Global Hotkey (default: `Alt+P`, user-remappable)**
This single hotkey is context-aware and resolves to one of three actions depending on current state:
| Current Pet State | Hotkey Action |
|---|---|
| Hidden (fullscreen suppressed) | Un-hide, pet walks to center screen |
| Idle / click-through | Toggle to interactive mode, pet "perks up" |
| Already interactive | Opens Utility Window |

**Click-through state**
- Default idle behavior after N seconds of no interaction: window becomes click-through (`setIgnoreCursorEvents(true)` in Tauri).
- Only two ways to exit click-through: (a) the global hotkey above, or (b) double-clicking the system tray icon. Never a click *on* the pet itself, since click-through means clicks pass through it by definition.

**Multi-monitor & DPI**
- Position math uses Tauri's native `availableMonitors()` API (not `window.screen`), queried per-frame-batch (not per-frame) to avoid overhead.
- Sprite scale factor is recalculated whenever the pet's window crosses a monitor boundary, using that monitor's own `scaleFactor`.
- If a monitor is unplugged while the pet is on it, the pet is repositioned to the primary monitor's nearest edge on next tick, not left in undefined space.

**Auto-start (opt-in)**
- Never enabled by default. Presented as an explicit toggle during first-run onboarding with plain-language copy (e.g., "Launch \[Pet Name] automatically when you log in?").
- Implemented via `tauri-plugin-autostart`, which correctly targets Task Scheduler/Registry on Windows and Login Items/LaunchAgents on macOS.

### 3.2 Context Engine (Active-Window & Typing Detection) — In Scope for v1

Since this is in scope, it needs a formal consent gate, not a silent permission grab:

- **First-run permissions screen** explains exactly what is read (foreground app name/title, keyboard activity *timing only*, not keystroke content) and why (to animate contextual states like "pet is typing" or "pet is asleep").
- macOS: app must prompt for Accessibility permission via System Settings; the app detects if permission is denied and gracefully falls back to idle-time-only detection (no crash, no repeated nagging).
- Windows: uses foreground window hooks; flagged clearly in installer/signing metadata to reduce AV false-positive risk.
- **Critical privacy rule:** window *titles* are read in-memory for pattern matching (e.g., detecting a code editor vs. browser) and are never persisted to disk or logged. Only aggregate categories (e.g., "coding," "browsing," "idle") are ever written to SQLite.
- Typing detection is timing/frequency-based only (keydown event cadence) — never captures or stores actual key values.

### 3.3 Rendering Engine

- **Default: Canvas 2D API.** Single 2D context per window, sprite sheet blitting, manual dirty-rect redraw rather than full-canvas clear where possible.
- **Settings-exposed toggle:** `renderEngine: 'canvas' | 'webgl'`. WebGL/PixiJS path built as a swappable renderer module behind the same animation-state interface, so switching doesn't touch game logic — only the draw call implementation.
- **Frame throttling:** 60fps during active animation/walking states; throttled to 8–10fps during idle/sleeping states via a conditional `requestAnimationFrame` gate, to reduce battery draw during the (likely majority) of time the pet is just sitting there.
- **Memory discipline:** sprite sheet textures loaded once at startup into a shared texture atlas; animation state transitions swap frame *indices*, not texture objects, to avoid GC churn and leak vectors.

### 3.4 Data Layer

- **Engine:** SQLite via `tauri-plugin-sql`.
- **Source of truth:** Rust backend exclusively. All writes go through Tauri commands; no direct DB access from either frontend window.
- **Core schema (v1):**
  - `tasks (id, title, notes, due_at, completed_at, created_at)`
  - `notes (id, content_markdown, updated_at)`
  - `alarms (id, task_id, fire_at, fired_at, missed BOOLEAN)`
  - `app_state (key, value)` — stores things like `last_alive_timestamp`, XP totals, settings blob.
  - `provider_credentials (provider ENUM['openai','anthropic','gemini'], keychain_ref, is_active BOOLEAN, last_verified_at)` — **the key value itself is never stored here**; this table only holds a reference/handle to the OS-native secure keychain entry (see 3.6).
  - `agent_actions (id, task_id, provider, mcp_server, action_type, target_summary, status ENUM['pending_consent','approved','executed','denied','failed'], created_at, resolved_at)` — the audit log for every agent-initiated action, external or internal.
- **Crash resilience:** SQLite's WAL (write-ahead log) mode enabled by default, giving atomic writes and recovery from unclean shutdowns without a custom journaling layer.

### 3.5 Alarm & Notification System (Catch-Up Model)

- On every graceful shutdown, backend writes `last_alive_timestamp` to `app_state`.
- On launch, backend queries all alarms where `fire_at < now AND fired_at IS NULL`, marks them `missed = true`, and surfaces a single consolidated "While you were away" notification/summary card in the Utility Window rather than a flood of stacked native notifications.
- Future (not v1): configurable behavior for whether missed alarms auto-reschedule or require manual dismissal.

### 3.6 AI Provider & MCP Agent Engine — Promoted to Pre-Launch (Milestone 4)

This is the app's core differentiator: the pet doesn't just track tasks, it can execute them by calling out to user-connected external tools via MCP, using whichever AI provider the user has configured. Because this system touches external accounts (email, files, calendars) rather than just local data, it carries a materially higher trust bar than every other system in this spec and is treated accordingly.

**Multi-provider key management (BYOK)**
- Users may add one or more of: OpenAI, Anthropic, Gemini API keys. No key is required to use the app's non-AI features.
- Keys are stored exclusively via the OS-native secure credential store — `tauri-plugin-keyring` (wraps Keychain on macOS, Credential Manager on Windows). The SQLite `provider_credentials` table holds only a reference handle, never the raw key.
- A **Provider Abstraction Layer** in the Rust backend normalizes the three vendors' differing chat/tool-calling schemas behind one internal interface, so the agent orchestration logic is written once and is provider-agnostic.
- Settings UI allows adding, testing (a lightweight "verify key" ping), and removing each provider independently. One provider is marked "active" by default for task execution; advanced per-feature routing (e.g., different providers for different task types) is a later enhancement, not v1.

**MCP Client Integration**
- The backend acts as an MCP *client*, capable of connecting to user-configured MCP servers (e.g., filesystem, Gmail, Google Calendar, GitHub, Notion — whichever the user adds).
- Tool discovery happens per-server at connection time; available tools are surfaced to the active AI provider as part of its tool-calling context when a task is delegated to the agent.

**Task Delegation Flow**
1. User drags a task onto the pet (or issues a voice/typed command).
2. Backend sends the task + available MCP tool schemas to the active provider.
3. Provider returns a plan (which tools to call, in what order).
4. **Every external-facing tool call (send, delete, post, modify) pauses for explicit visual consent** before executing — read-only/internal calls (e.g., reading a local file to summarize it) do not require per-call consent once the MCP server itself was approved during setup.
5. Each action, approved or denied, is written to `agent_actions` for a persistent, user-reviewable audit trail.

**Consent-Gate UX**
- Rather than a generic OS-style permission dialog, the pet visually "presents" the pending action (holds up a card describing exactly what it's about to do and to whom/where) before any write/send/delete action executes.
- Denying an action never crashes or retries silently — the agent reports back what it couldn't do and why.

---

## 4. Development Milestones

### Milestone 1 — Barebones Transparency & Canvas Rendering
- Transparent, borderless, always-on-top Pet Window renders a static sprite.
- Manual drag-to-reposition works.
- Canvas render loop with idle animation cycling (no OS hooks yet).
- **Exit criteria:** Pet renders correctly across Windows + macOS with <50MB combined RAM at idle.

### Milestone 2 — Native OS Hooks & Toggle Engine
- Click-through / interactive toggle implemented.
- Global "Call Pet" hotkey implemented with the three-state resolution table (3.1).
- Fullscreen detection + auto-hide/restore.
- Multi-monitor position handling + DPI scale correction.
- Auto-start opt-in flow (onboarding screen + plugin wiring).
- **Exit criteria:** All items in the Phase 1 OS-behavior QA matrix (Section 5) pass on both OSes.

### Milestone 3 — Data Layer & Utility Window
- SQLite schema implemented, WAL mode confirmed active.
- Utility Window UI: to-do list, markdown notes editor, alarm creation.
- IPC event bus wired (backend → both windows, single-writer model).
- Missed-alarm catch-up logic on launch.
- **Exit criteria:** Force-killing the app mid-write does not corrupt or lose the last completed transaction.

### Milestone 4 — AI Provider & MCP Agent Engine (promoted from post-launch)
- Provider Abstraction Layer implemented for OpenAI, Anthropic, and Gemini behind one internal interface.
- Secure key storage via OS-native keychain (`tauri-plugin-keyring`); settings UI to add/verify/remove each provider.
- MCP client wired into the backend; supports connecting to at least 2–3 real MCP servers for initial testing (e.g., filesystem, a calendar/email server).
- Task delegation pipeline: task → provider plan → tool calls → consent gate on external actions → execution → audit log write.
- Consent-gate UX built as a pet-native visual pattern (not a generic OS dialog).
- **Exit criteria:** the agent can complete a real multi-step task spanning at least two different MCP servers (e.g., "read this file, summarize it, and save the summary to my notes") with the external/write step correctly pausing for visual consent and logging to `agent_actions` regardless of whether the user approves or denies it.

### Milestone 5 — Context Engine
- First-run permissions consent screen (explicit, plain-language).
- macOS Accessibility permission flow + graceful degradation if denied.
- Active-window category detection (coding/browsing/idle) feeding pet animation state.
- Typing-cadence-based "focused" animation state.
- **Exit criteria:** Denying permissions never crashes the app; it silently falls back to idle-only detection.

### Milestone 6 — Deep Interaction & Gamification
- "Bring Me a Note" alarm behavior (pet walks to center, drops overlay card).
- Drag-and-drop file/text ingestion onto the pet sprite.
- Visual reactivity states (worried on overdue tasks, celebration on list-clear).
- XP/progression system tied to task completion (and, where relevant, to completed agent-executed tasks from Milestone 4).

### Milestone 7 — Settings, Packaging & Polish
- Full settings panel: render engine toggle, hotkey remapping, auto-start toggle, permissions review/revoke, AI provider management, agent action audit log viewer.
- Installer signing (both platforms) to minimize AV false-positive friction.
- Cold-start performance pass and final RAM/CPU budget validation.

---

## 5. Technical Acceptance Criteria (Pass/Fail QA Matrix)

| Mechanic | Pass Condition | Fail Condition |
|---|---|---|
| Auto-start | App launches within 5s of login **only if** opted in during onboarding | App launches without prior explicit consent, or fails to launch when enabled |
| Fullscreen auto-hide | Pet fully hides within 1s of a fullscreen app gaining focus; reappears within 1s of it losing focus | Pet remains visible over fullscreen app, or fails to reappear after exit |
| Call-pet hotkey | Correctly resolves to the 3-state table in 3.1 in all cases, remappable in settings | Hotkey triggers wrong state, conflicts unrecoverably with OS/other app shortcuts |
| Click-through toggle | Clicks pass through pet sprite when idle; hotkey/tray reliably restores interactivity | Pet blocks clicks while idle, or cannot be restored to interactive state |
| Window bounds collision | Pet reverses/reacts within 1 frame of reaching any screen or monitor edge, scaled correctly per-monitor DPI | Pet overshoots bounds, freezes, or scales incorrectly across monitors |
| Drag-and-drop ingestion | Dropped file/text/image is saved to DB and reflected in Utility Window within 2s | Drop is silently lost, duplicated, or crashes the render loop |
| Missed alarm catch-up | All alarms missed while closed appear as a single consolidated summary on next launch | Missed alarms are silently dropped or spam individual notifications |
| DB crash recovery | Force-killing mid-write leaves DB in last-consistent state (verified via WAL) | Any data corruption or loss of the most recent completed write |
| Permissions consent | App functions in a degraded (idle-only) mode if Accessibility/permissions denied | App crashes, nags repeatedly, or silently fails without explanation |
| Idle frame throttling | Idle-state CPU/GPU usage drops measurably (frame rate ~8-10fps) vs. active walking state | No measurable difference in resource usage between idle and active states |
| API key storage | Keys are retrievable only via the OS-native keychain; no plaintext key ever appears in the SQLite file or logs | Any key is found in plaintext in the DB, config files, or logs |
| MCP consent gate | Every external write/send/delete action pauses for explicit visual consent before executing, regardless of provider | Any external action executes without a prior consent step, for any provider |
| Agent action audit log | Every agent action (approved, denied, or failed) has a corresponding `agent_actions` row with correct status | Any agent action occurs with no corresponding audit record |
| Multi-provider switching | Switching the active provider in settings takes effect on the next task delegation without requiring an app restart | Switching providers requires a restart, or silently continues using the old provider |

---

## 6. Known Risks & Open Items (carried into Phase 3 discussion)

- **AV/Antivirus false positives:** global input hooks + auto-start + window manipulation together resemble malware heuristics on Windows. Code-signing and a clear privacy disclosure page will help but won't eliminate this risk entirely.
- **macOS notarization:** Accessibility-permission-requesting apps face extra App Store/notarization scrutiny; if you intend a Mac App Store release, this needs a distinct compliance review before Milestone 5.
- **WebGL toggle cost:** even as a settings-gated feature, maintaining two renderer backends increases QA surface area — worth revisiting after Milestone 7 whether it's worth shipping vs. deferring further.
- **Agent scope creep risk:** Milestone 4 is now the highest-stakes, highest-complexity milestone in the pre-launch roadmap. Its exit criteria are intentionally narrow (one real multi-step task across two MCP servers) — resist expanding it to "support every popular MCP server" before shipping; breadth of integrations is a natural Phase 3 extension, not an MVP requirement.
- **Third-party API cost/availability risk:** the agent engine's usability is entirely dependent on user-supplied keys and the uptime/pricing of three external vendors — none of which this project controls. Worth stating explicitly in user-facing docs that this is a BYOK feature with variable real-world cost.

---

**This concludes the restructured Phase 2.** The AI Provider & MCP Agent Engine has been promoted from a post-launch idea into Milestone 4 of the core roadmap, sitting right after the data layer and before the Context Engine. Please review the full milestone sequence and the new Section 3.6 — once approved, I'll move to Phase 3 to cover what's left for the *further* future: deeper MCP server breadth, the theming/customization engine, the developer ecosystem API, and any on-device/local-AI strategy beyond the BYOK model.
