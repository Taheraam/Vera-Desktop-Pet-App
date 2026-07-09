# IPC Command Reference & Database Schema
## Productivity Desktop Companion App — Backend/Frontend Contract

**Purpose of this document:** this is the single source of truth for everything that crosses the boundary between the Rust backend (built in Codex) and the two frontend windows (built in Antigravity). Both agent sessions should be given this document directly — neither one should be inferring the other side's interface.

**Convention:** all commands are exposed via Tauri's `invoke()`. All timestamps are Unix epoch seconds (integers). All commands return `Result<T, String>` on the Rust side — the `String` error variant is a human-readable message safe to surface in the UI.

---

## 1. Task Commands (Milestone 3)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `create_task` | `{ title: string, notes?: string, due_at?: number }` | `Task` | Emits `task-created` |
| `update_task` | `{ id: number, title?: string, notes?: string, due_at?: number }` | `Task` | Emits `task-updated` |
| `complete_task` | `{ id: number }` | `Task` | Sets `completed_at`. Emits `task-completed` — this is what triggers the Pet Window's happy-flip animation |
| `delete_task` | `{ id: number }` | `void` | Cascades to associated alarms. Emits `task-deleted` |
| `list_tasks` | `{ include_completed?: boolean }` | `Task[]` | Default excludes completed tasks |

**`Task` shape:**
```ts
{
  id: number,
  title: string,
  notes: string | null,
  due_at: number | null,
  completed_at: number | null,
  created_at: number
}
```

---

## 2. Notes Commands (Milestone 3)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `save_note` | `{ id?: number, content_markdown: string }` | `Note` | Omit `id` to create; include it to update. Emits `note-updated` |
| `delete_note` | `{ id: number }` | `void` | Emits `note-deleted` |
| `list_notes` | none | `Note[]` | |

---

## 3. Alarm Commands (Milestone 3)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `create_alarm` | `{ task_id?: number, fire_at: number }` | `Alarm` | Emits `alarm-created` |
| `delete_alarm` | `{ id: number }` | `void` | |
| `list_alarms` | `{ upcoming_only?: boolean }` | `Alarm[]` | |
| `get_missed_alarms_summary` | none | `Alarm[]` | Called once on startup by the Utility Window. Backend computes this by diffing `fire_at < now AND fired_at IS NULL` against `last_alive_timestamp` |

**Events (backend → both windows, no invoke needed):**
- `alarm-fired` — `{ alarm: Alarm, task: Task | null }` — triggers the "Bring Me a Note" pet behavior
- `missed-alarms-ready` — `{ alarms: Alarm[] }` — fired once, shortly after launch

---

## 4. Window & OS Behavior Commands (Milestone 2)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `set_click_through` | `{ enabled: boolean }` | `void` | Pet Window only |
| `get_pet_state` | none | `PetState` | `'hidden' \| 'idle' \| 'interactive'` |
| `set_auto_start` | `{ enabled: boolean }` | `void` | Wraps `tauri-plugin-autostart`. Only ever called from the onboarding screen or Settings — never silently |
| `get_monitor_layout` | none | `Monitor[]` | Used for the walk-boundary/DPI logic in the pet's render loop |

**Events:**
- `pet-state-changed` — `{ state: PetState }` — fired on hotkey resolution (see Section 3.1 of the main spec's three-state table), fullscreen detection, or click-through toggle
- `fullscreen-detected` / `fullscreen-cleared` — no payload

---

## 5. AI Provider & MCP Agent Commands (Milestone 4)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `add_provider_key` | `{ provider: 'openai' \| 'anthropic' \| 'gemini', api_key: string }` | `void` | Key goes straight to OS keychain via `tauri-plugin-keyring`; only a reference is written to `provider_credentials` |
| `remove_provider_key` | `{ provider: string }` | `void` | |
| `verify_provider_key` | `{ provider: string }` | `{ valid: boolean }` | Lightweight ping call to the provider |
| `list_providers` | none | `ProviderStatus[]` | `{ provider, is_active, last_verified_at }[]` — never returns the key itself |
| `set_active_provider` | `{ provider: string }` | `void` | Takes effect immediately, no restart |
| `list_mcp_servers` | none | `McpServer[]` | Currently connected servers |
| `connect_mcp_server` | `{ name: string, config: object }` | `McpServer` | |
| `disconnect_mcp_server` | `{ name: string }` | `void` | |
| `delegate_task_to_agent` | `{ task_id: number, instruction: string }` | `{ delegation_id: string }` | Kicks off the tool-use loop described in the Agent Orchestration doc. A single delegation can spawn multiple `agent_actions` rows — one per tool call — each surfaced separately for consent if it's a write/external action |
| `respond_to_consent_request` | `{ agent_action_id: number, approved: boolean }` | `void` | Called from the pet-native consent-gate UI |
| `list_agent_actions` | `{ limit?: number }` | `AgentAction[]` | Backs the audit log viewer in Settings |

**Events:**
- `agent-consent-requested` — `{ delegation_id: string, agent_action_id: number, action_type: string, target_summary: string, mcp_server: string }` — this is what triggers the pet's "may I?" card
- `agent-action-resolved` — `{ delegation_id: string, agent_action_id: number, status: 'executed' | 'denied' | 'failed', detail?: string }` — the loop resumes automatically after this fires; approval executes the tool and feeds the result back to the model, denial feeds back a synthetic "user denied" result so the model can adapt
- `delegation-completed` — `{ delegation_id: string, final_message: string }` — fired when the model returns a final response instead of another tool call

---

## 6. Context Engine Commands (Milestone 5)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `request_accessibility_permission` | none | `{ granted: boolean }` | macOS only; triggers the System Settings prompt |
| `get_permission_status` | none | `{ accessibility: boolean, context_engine_enabled: boolean }` | |
| `get_current_context` | none | `ContextState` | `'coding' \| 'browsing' \| 'idle' \| 'unknown'` — degrades to `'unknown'` gracefully if permission denied |

**Events:**
- `context-changed` — `{ context: ContextState }` — drives the pet's contextual animation state

---

## 7. Drag-and-Drop & Gamification Commands (Milestone 6)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `ingest_dropped_content` | `{ kind: 'file' \| 'text' \| 'image', payload: string }` | `{ note_id: number }` | For files, `payload` is the file path; backend reads and stores content |
| `get_xp_state` | none | `{ xp: number, level: number }` | Reads from `app_state` |

---

## 8. Settings Commands (Milestone 7)

| Command | Params | Returns | Notes |
|---|---|---|---|
| `get_settings` | none | `Settings` | |
| `update_settings` | `Partial<Settings>` | `Settings` | |

**`Settings` shape:**
```ts
{
  render_engine: 'canvas' | 'webgl',
  hotkey: string,
  auto_start_enabled: boolean,
  context_engine_enabled: boolean
}
```

---

## 9. Database Schema (SQLite via `tauri-plugin-sql`, WAL mode enabled)

```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  due_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_markdown TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE alarms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  fire_at INTEGER NOT NULL,
  fired_at INTEGER,
  missed BOOLEAN NOT NULL DEFAULT 0
);
CREATE INDEX idx_alarms_fire_at ON alarms(fire_at);

CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE provider_credentials (
  provider TEXT PRIMARY KEY CHECK (provider IN ('openai','anthropic','gemini')),
  keychain_ref TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 0,
  last_verified_at INTEGER
);

CREATE TABLE agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delegation_id TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  mcp_server TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_consent','approved','executed','denied','failed','expired')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER
);
CREATE INDEX idx_agent_actions_status ON agent_actions(status);
CREATE INDEX idx_agent_actions_delegation ON agent_actions(delegation_id);
```

**Migration note for Codex:** use `tauri-plugin-sql`'s migration array (each migration is a `{ version, description, sql, kind }` entry) rather than a single init script — this is what lets you add columns later (e.g. a `renamed` flag) without hand-writing `ALTER TABLE` scripts for existing users' databases.

---

## 10. Handoff Notes for Antigravity (single-agent build)

- **Give Antigravity this entire document** at the start of the project, and re-paste it back in whenever a new session or task in the Manager surface starts fresh — this document is what keeps a long, multi-session build internally consistent even as individual agent sessions run out of context.
- **Treat Section 9 (schema) as fixed once Milestone 3 ships.** If a later milestone needs a new column, update this document first, then hand the updated section back to the agent as the instruction — don't let it improvise schema changes without updating the source of truth here.
- **When dispatching parallel agents inside Antigravity's Manager surface** (e.g., one agent on the Context Engine while another works on gamification), give each one only the sections relevant to its task rather than the whole document — reduces the chance of one agent "helpfully" touching a command signature outside its scope.
- **Stitch-generated screens plug into Section 8 (Settings) and Sections 1–7's UI surfaces** — once you have a `DESIGN.md` from Stitch, hand Antigravity both this document and that file together so generated screens wire up to the correct `invoke()` calls rather than using placeholder data.
