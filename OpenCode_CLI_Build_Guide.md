# OpenCode CLI Build Guide
## TauriPetApp — Phases, Model Routing & Runnable Commands

**Scope:** Milestones 1–3 only (barebones rendering, OS hooks, data layer) — same scope as the Master Build Prompt.

---

## ⚠️ Honest Caveat on Model Selection

Big Pickle, MiMo V2.5, North Mini Code, DeepSeek V4 Flash, Nemotron 3 Ultra, and Hy3 are all labeled by OpenCode as free-for-a-limited-time / feedback-collection models — meaning their exact capabilities, context windows, and availability can shift under you. I don't have verified benchmarks for this specific lineup. The routing below is a **reasonable best-effort mapping based on naming/positioning** (e.g., "Ultra" > "Mini", "Flash" = speed-optimized), not hard data:

| Model | My best-effort read | Use for |
|---|---|---|
| **Nemotron 3 Ultra Free** | Largest in its family, likely strongest reasoning | Architecture planning, complex debugging |
| **Big Pickle** | Positioned as a general coding-agent model | Default/fallback for most tasks |
| **MiMo V2.5 Free** | This model family has shown strength on multi-file/large-codebase work | Backend scaffolding, multi-file Rust work |
| **DeepSeek V4 Flash Free** | "Flash" = speed-optimized, likely lighter reasoning | Fast frontend/styling tasks, boilerplate |
| **North Mini Code Free** | "Mini" = smaller/faster | Small, well-defined edits, config files |
| **Hy3 Free** | Unclear positioning, no strong signal either way | Use as a second opinion/fallback if another model stalls on a task |

**Run `opencode models opencode --refresh`** before starting to confirm exact model IDs — the slug format may not exactly match what's below (e.g. it might be `opencode/mimo-v2.5-free` or `opencode/mimo-2.5`). Swap the IDs in the commands below once confirmed.

---

## Phase 0: Project Setup (do this once, before Phase 1)

```bash
# 1. Create project folder and enter it
mkdir TauriPetApp && cd TauriPetApp
git init   # IMPORTANT — your safety net for when a smaller model makes a bad edit

# 2. Create the docs folder and drop in your 6 reference MD files
mkdir -p docs
# Copy these into docs/:
#   Desktop_Pet_PRD_Technical_Spec.md
#   Desktop_Pet_IPC_and_Database_Reference.md
#   Desktop_Pet_Agent_Orchestration_and_System_Prompt.md
#   Desktop_Pet_Stitch_Design_Brief.md
#   Desktop_Pet_Asset_Animation_Spec_Sheet.md
#   Desktop_Pet_Phase3_Extensibility_Strategy.md

mkdir -p docs/prompts   # this is where each phase's prompt text will live

# 3. Confirm OpenCode is installed and check available models
opencode --version
opencode models opencode --refresh
```

**Create `opencode.json`** in the project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/big-pickle",
  "instructions": ["AGENTS.md", "docs/*.md"],
  "permission": {
    "edit": "allow",
    "bash": "allow"
  },
  "autoupdate": true,
  "snapshot": true
}
```

**What this does:**
- `"instructions": ["AGENTS.md", "docs/*.md"]` — every single run automatically loads your full reference documentation as context. You never have to re-paste your spec.
- `"permission": { "edit": "allow", "bash": "allow" }` — this is what lets OpenCode directly edit files and run shell commands **without pausing for confirmation each time**, which is what you asked for.

**The tradeoff you're accepting:** with `"allow"` set, a smaller/free model can make a wrong edit or run a bad command with no confirmation gate in the way. This is exactly why `git init` above matters — **commit after every successful task below**, so you can always `git diff` to review what changed and `git checkout -- .` to revert if a model goes off the rails. If you'd rather keep a manual checkpoint before edits apply, change `"edit": "allow"` to `"edit": "ask"` and accept the extra confirmation step — your call.

**Generate AGENTS.md** (OpenCode's project-context file):
```bash
opencode
# then inside the TUI, run:
/init
# this scans your project and docs/, generates AGENTS.md, then exit the TUI (ctrl+c)
```

---

## PHASE 1: Planning & Architecture

### Task 1.1 — Architecture & Folder Structure Plan
**Model:** `opencode/nemotron-3-ultra-free` (best reasoning available in this lineup)

Save this as `docs/prompts/phase1_task1_architecture.md`:

```markdown
You are the lead architect for a Tauri v2 desktop application. Read
docs/Desktop_Pet_PRD_Technical_Spec.md (Sections 2-3) and
docs/Desktop_Pet_IPC_and_Database_Reference.md (Section 9) before doing anything else.

Create the following actual files and folders in this project (use real file system
operations, not just a description):

1. The full folder structure:
   src-tauri/src/{main.rs, db.rs, events.rs}
   src-tauri/src/commands/{tasks.rs, notes.rs, alarms.rs, window.rs}
   src/{main.tsx}
   src/pet-window/{index.tsx, canvas-renderer.ts, animation-state.ts}
   src/utility-window/{index.tsx, TaskList.tsx, NotesEditor.tsx, AlarmModal.tsx, Settings.tsx}
   src/shared/{ipc-client.ts, types.ts, hooks.ts}
   src/styles/{globals.css, variables.css}
   src/assets/sprites/
   
   Create each file as an empty stub with a one-line comment describing its purpose —
   do not implement logic yet, that comes in Phase 2.

2. Initialize package.json with dependencies: react, react-dom, @tauri-apps/api,
   typescript, vite, @vitejs/plugin-react

3. Write docs/architecture-plan.md documenting:
   - Confirmed tech stack and why
   - The dependency list organized by which Milestone needs it (M1/M2/M3)
   - Critical implementation notes: Rust backend is sole state writer, IPC contract
     lives in Desktop_Pet_IPC_and_Database_Reference.md and must not be deviated from

Run `git status` at the end and show me what was created.
```

Run it:
```bash
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase1_task1_architecture.md)"
```

**After it finishes:**
```bash
git add -A && git commit -m "Phase 1.1: architecture plan and folder scaffold"
```

---

### Task 1.2 — Pet Animation State Machine Design
**Model:** `opencode/nemotron-3-ultra-free`

Save as `docs/prompts/phase1_task2_statemachine.md`:

```markdown
Read docs/Desktop_Pet_PRD_Technical_Spec.md (Section 3.1) and
docs/Desktop_Pet_Asset_Animation_Spec_Sheet.md (Section 2 — all 11 animation states)
before doing anything else.

Write docs/pet-state-machine.md documenting:

1. The full FSM: all 11 states (idle, walk, sleep, waking_up, happy, worried,
   celebrate, typing_focused, eating, consent_ask, bring_me_a_note), what triggers
   each transition, and what state follows.

2. Click-through toggle logic: idle state -> click-through enabled after N seconds;
   global hotkey (Alt+P) -> click-through disabled, pet "perks up"; already
   interactive + hotkey -> opens Utility Window. Explain the three-state resolution.

3. Fullscreen detection: pet hides immediately (not occluded) when a fullscreen app
   gains focus; restores with waking_up animation when it loses focus.

4. Frame timing: looping states run ~8-10fps, one-off states run ~150ms/frame then
   hold or return to idle.

Do not write any code yet — this is a design document only. Save it to
docs/pet-state-machine.md.
```

Run it:
```bash
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase1_task2_statemachine.md)"
git add -A && git commit -m "Phase 1.2: pet state machine design"
```

---

## PHASE 2: Core Backend (Rust + Database)

### Task 2.1 — Tauri Scaffolding & Database Schema
**Model:** `opencode/mimo-v2.5-free` (best for multi-file backend work in this lineup)

Save as `docs/prompts/phase2_task1_scaffold.md`:

```markdown
Read docs/architecture-plan.md and docs/Desktop_Pet_IPC_and_Database_Reference.md
(Section 9) before doing anything else.

Implement the following in src-tauri/:

1. src-tauri/Cargo.toml — add dependencies: tauri (v2, with features for window
   transparency and always-on-top), serde, serde_json, tokio, rusqlite (bundled
   feature), tauri-plugin-sql (sqlite feature), tauri-plugin-keyring,
   tauri-plugin-autostart.

2. src-tauri/src/main.rs — set up a Tauri app with TWO windows:
   - "pet" window: 64x64px, transparent(true), decorations(false), always_on_top(true)
   - "utility" window: 400x600px, visible(false) by default
   Register a Tauri event system for backend-to-frontend communication.

3. src-tauri/src/db.rs — implement the exact SQLite schema from
   Desktop_Pet_IPC_and_Database_Reference.md Section 9 (tasks, notes, alarms,
   app_state, provider_credentials, agent_actions tables with the exact columns,
   types, and indexes specified). Enable WAL mode. Implement a versioned migration
   system, not a single raw SQL dump. Add a startup function that seeds app_state
   with a last_alive_timestamp key.

4. src-tauri/tauri.conf.json — configure both windows, enable the sql/autostart/
   keyring plugins, set withGlobalTauri: true.

Run `cargo build` inside src-tauri/ at the end and fix any compile errors before
finishing. Show me the build output.
```

Run it:
```bash
opencode run --model opencode/mimo-v2.5-free "$(cat docs/prompts/phase2_task1_scaffold.md)"
```

**Review before committing** — this is backend/database code, worth a manual look:
```bash
git diff
# if it looks right:
git add -A && git commit -m "Phase 2.1: Tauri scaffold and database schema"
# if something's off, ask a follow-up in the same session:
opencode run -c "The db.rs migration system isn't versioned correctly, fix it to use a migrations array with version numbers"
```

---

### Task 2.2 — IPC Command Implementations
**Model:** `opencode/mimo-v2.5-free`

Save as `docs/prompts/phase2_task2_commands.md`:

```markdown
Read docs/Desktop_Pet_IPC_and_Database_Reference.md Sections 1-4 (Task, Notes,
Alarm, Window commands) before doing anything else. Match command names,
parameters, and return types EXACTLY as specified there — do not deviate.

Implement these files:

1. src-tauri/src/commands/tasks.rs:
   create_task, update_task, complete_task, delete_task, list_tasks
   Each emits the correct event (task-created, task-updated, task-completed,
   task-deleted) after a successful database write.

2. src-tauri/src/commands/notes.rs:
   save_note, delete_note, list_notes
   Emits note-updated, note-deleted.

3. src-tauri/src/commands/alarms.rs:
   create_alarm, delete_alarm, list_alarms, get_missed_alarms_summary
   get_missed_alarms_summary must read last_alive_timestamp from app_state, query
   alarms where fire_at < now AND fired_at IS NULL AND fire_at >= last_alive_timestamp,
   mark them missed=true, and emit missed-alarms-ready on startup if any exist.

4. src-tauri/src/commands/window.rs:
   set_click_through, get_pet_state, set_auto_start, get_monitor_layout
   Use Tauri's native window/monitor APIs, not custom implementations.

5. Update src-tauri/src/main.rs to register all these commands in the
   invoke_handler.

All commands return Result<T, String>. Timestamps are Unix epoch seconds.
Use prepared statements for all database queries — no string concatenation into SQL.

Run `cargo build` and fix any errors. Then run `cargo test` if any tests exist.
Show me the output.
```

Run it:
```bash
opencode run --model opencode/mimo-v2.5-free "$(cat docs/prompts/phase2_task2_commands.md)"
git diff   # review — this is the core data layer, worth checking
git add -A && git commit -m "Phase 2.2: IPC command implementations"
```

---

## PHASE 3: Frontend, Rendering & UI

### Task 3.1 — Canvas Renderer & Animation Loop
**Model:** `opencode/deepseek-v4-flash-free` (frontend/rendering logic, speed-favored task)

Save as `docs/prompts/phase3_task1_canvas.md`:

```markdown
Read docs/pet-state-machine.md and docs/Desktop_Pet_Asset_Animation_Spec_Sheet.md
(Section 4: JSON metadata format) before doing anything else.

Implement src/pet-window/canvas-renderer.ts with:

1. A SpriteSheet loader that reads a {state}.png and {state}.json pair from
   src/assets/sprites/ for each of the 11 states.

2. An AnimationFSM class that tracks currentState, currentFrameIndex, frameTimer,
   and advances frames based on each sprite's fps and loop metadata. Non-looping
   animations hold their final frame instead of restarting.

3. A PetRenderer class with a render() method that:
   - Clears the canvas each frame
   - Draws the current animation frame from the correct sprite sheet
   - Applies horizontal mirroring (ctx.scale(-1,1)) when facing left, since sprites
     are generated right-facing only
   - Sets imageSmoothingEnabled = false to keep pixel art crisp
   - Throttles to ~8-10fps during idle/sleep/worried states, up to 60fps during
     active states (walk, happy, celebrate, eating) — this matters for battery life

4. A startLoop() method using requestAnimationFrame.

For now, since final art isn't ready, generate a placeholder sprite for each of the
11 states as a simple colored 64x64 PNG (different color per state) plus its
matching JSON metadata file, so the renderer can be tested end-to-end immediately.

Test this compiles with `npm run build` or equivalent and fix any TypeScript errors.
```

Run it:
```bash
opencode run --model opencode/deepseek-v4-flash-free "$(cat docs/prompts/phase3_task1_canvas.md)"
git add -A && git commit -m "Phase 3.1: canvas renderer and placeholder sprites"
```

---

### Task 3.2 — Pet Window Component (wiring renderer to backend events)
**Model:** `opencode/deepseek-v4-flash-free`

Save as `docs/prompts/phase3_task2_petwindow.md`:

```markdown
Read src/pet-window/canvas-renderer.ts (just built) and
docs/Desktop_Pet_IPC_and_Database_Reference.md Sections 4-7 (event names/payloads)
before doing anything else.

Implement src/pet-window/index.tsx as a React component that:

1. Renders a single <canvas width={64} height={64}> and initializes the
   PetRenderer from canvas-renderer.ts on mount.

2. Listens for these Tauri events and updates the animation FSM accordingly:
   - task-completed -> 'happy'
   - alarm-fired -> 'bring_me_a_note'
   - pet-state-changed -> update local petState, sync to FSM if relevant
   Use @tauri-apps/api/event's listen(), and clean up listeners on unmount.

3. Handles drag-and-drop: onDrop, prevent default, extract the file, call
   invoke('ingest_dropped_content', { kind: 'file', payload: filePath }),
   trigger the 'eating' animation.

4. Handles click-through CSS: when petState is 'idle' (click-through active),
   the canvas should visually indicate this isn't blocking clicks (cursor: default);
   when interactive, cursor: pointer.

Also implement src/shared/ipc-client.ts as a thin wrapper around invoke() for
all commands from Sections 1-4 of the IPC reference, and src/shared/types.ts
with the Task, Note, Alarm, Settings TypeScript interfaces matching the IPC
reference exactly.

Verify this compiles and there are no TypeScript type errors.
```

Run it:
```bash
opencode run --model opencode/deepseek-v4-flash-free "$(cat docs/prompts/phase3_task2_petwindow.md)"
git add -A && git commit -m "Phase 3.2: pet window component wired to events"
```

---

### Task 3.3 — Utility Window UI (Tasks, Notes, Alarms)
**Model:** `opencode/big-pickle` (general-purpose, good default for UI + IPC wiring)

Save as `docs/prompts/phase3_task3_utility.md`:

```markdown
Read docs/Desktop_Pet_IPC_and_Database_Reference.md Sections 1-3 and
src/shared/ipc-client.ts (just built) before doing anything else.

Implement these components:

1. src/utility-window/TaskList.tsx:
   - Fetch via ipc-client on mount (list_tasks)
   - Checkbox list with an add-task input at top
   - Checking a box calls complete_task(id)
   - Submitting the input calls create_task(title)
   - Listen for 'task-completed' event to update the list immediately without refetch

2. src/utility-window/NotesEditor.tsx:
   - A <textarea> bound to a single note's content_markdown
   - Debounced autosave (1 second after last keystroke) calling save_note(id, content)
   - Show a small "Saving..." / "Saved" text indicator

3. src/utility-window/AlarmModal.tsx:
   - A modal with a datetime input and an optional dropdown to link an existing task
   - Submitting calls create_alarm(task_id?, fire_at)

4. src/utility-window/index.tsx:
   - Simple tab layout: Tasks | Notes (Settings tab can be a stub for now)
   - Renders TaskList by default

Keep styling minimal and functional for now — plain CSS is fine, this isn't the
final visual design (that comes later via Stitch, which is a separate tool not
part of this build).

Verify everything compiles with no TypeScript errors, and that the Utility Window
renders without crashing when you run the dev server.
```

Run it:
```bash
opencode run --model opencode/big-pickle "$(cat docs/prompts/phase3_task3_utility.md)"
git add -A && git commit -m "Phase 3.3: utility window UI wired to IPC"
```

---

### Task 3.4 — Boilerplate & Config Cleanup
**Model:** `opencode/north-mini-code-free` (small, well-defined task — good fit for a lighter model)

Save as `docs/prompts/phase3_task4_boilerplate.md`:

```markdown
Generate or fix these config files so the project builds cleanly end to end:

1. tsconfig.json — proper React + Vite + Tauri TypeScript config
2. vite.config.ts — Vite config pointing at the Tauri dev server conventions
3. package.json — verify all dependencies are present and versions are compatible;
   add scripts: "dev": "vite", "tauri:dev": "tauri dev", "tauri:build": "tauri build"
4. .gitignore — standard Rust + Node + Tauri ignores (target/, node_modules/,
   dist/, src-tauri/target/)

Run `npm install` and then `npm run tauri:dev` (or the closest equivalent command
available) and report any errors you hit. Fix config issues only — do not modify
component logic in this task.
```

Run it:
```bash
opencode run --model opencode/north-mini-code-free "$(cat docs/prompts/phase3_task4_boilerplate.md)"
git add -A && git commit -m "Phase 3.4: config and boilerplate cleanup"
```

---

## PHASE 4: Testing & Debugging

### Task 4.1 — End-to-End Test Pass
**Model:** `opencode/nemotron-3-ultra-free` (best reasoning for systematic verification)

Save as `docs/prompts/phase4_task1_testing.md`:

```markdown
Read docs/Desktop_Pet_PRD_Technical_Spec.md Section 5 (QA acceptance matrix)
before doing anything else.

Run the app with `npm run tauri:dev` (or equivalent) and systematically verify
each of these, documenting results in docs/test-report.md:

1. Both windows launch (pet window + utility window)
2. Canvas renders a placeholder sprite in the pet window
3. Creating a task in the Utility Window updates the SQLite database
   (check with a manual sqlite3 query if needed)
4. Completing a task fires the task-completed event and the pet's animation
   state changes to 'happy'
5. The database file persists between app restarts (kill and relaunch, verify
   tasks are still there)
6. Notes autosave works (type in the notes editor, wait 1s, verify DB updated)

For each check: document what you tested, what you expected, what actually
happened, and pass/fail. If something fails, do NOT fix it yet — just document
it clearly in docs/test-report.md so Task 4.2 can address it.
```

Run it:
```bash
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase4_task1_testing.md)"
git add -A && git commit -m "Phase 4.1: test report"
cat docs/test-report.md   # review before moving to bug fixes
```

---

### Task 4.2 — Bug Fixes
**Model:** `opencode/nemotron-3-ultra-free`, fallback `opencode/hy3-free` if it stalls on something

Save as `docs/prompts/phase4_task2_bugfix.md`:

```markdown
Read docs/test-report.md before doing anything else.

For each failing test documented there:
1. Trace the actual code path causing the failure (is it Rust, TypeScript, or
   the IPC bridge between them?)
2. Make the minimal fix needed — do not refactor unrelated code
3. Re-run the specific test manually to confirm it now passes
4. Update docs/test-report.md to reflect the fix

If you get stuck on any single issue for more than a few attempts, stop, document
exactly what you tried and why it didn't work in docs/test-report.md, and move on
to the next failing test rather than looping indefinitely.

At the end, run the full test pass from Task 4.1 again and confirm the final
pass/fail state of every item.
```

Run it:
```bash
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase4_task2_bugfix.md)"
git diff   # review carefully — bug fixes are worth a manual check
git add -A && git commit -m "Phase 4.2: bug fixes, Milestones 1-3 verified"
```

**If Nemotron gets stuck on something specific**, try the same prompt with a different model for a second opinion:
```bash
opencode run --model opencode/hy3-free -c "Try a different approach to the issue documented in docs/test-report.md that Nemotron couldn't resolve"
```

---

## Quick Reference: All Commands In Order

```bash
# Setup (once)
mkdir TauriPetApp && cd TauriPetApp && git init
mkdir -p docs docs/prompts
# [copy your 6 MD files into docs/]
# [create opencode.json as shown above]
opencode  # then run /init inside the TUI, then exit

# Phase 1
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase1_task1_architecture.md)"
git add -A && git commit -m "Phase 1.1"
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase1_task2_statemachine.md)"
git add -A && git commit -m "Phase 1.2"

# Phase 2
opencode run --model opencode/mimo-v2.5-free "$(cat docs/prompts/phase2_task1_scaffold.md)"
git add -A && git commit -m "Phase 2.1"
opencode run --model opencode/mimo-v2.5-free "$(cat docs/prompts/phase2_task2_commands.md)"
git add -A && git commit -m "Phase 2.2"

# Phase 3
opencode run --model opencode/deepseek-v4-flash-free "$(cat docs/prompts/phase3_task1_canvas.md)"
git add -A && git commit -m "Phase 3.1"
opencode run --model opencode/deepseek-v4-flash-free "$(cat docs/prompts/phase3_task2_petwindow.md)"
git add -A && git commit -m "Phase 3.2"
opencode run --model opencode/big-pickle "$(cat docs/prompts/phase3_task3_utility.md)"
git add -A && git commit -m "Phase 3.3"
opencode run --model opencode/north-mini-code-free "$(cat docs/prompts/phase3_task4_boilerplate.md)"
git add -A && git commit -m "Phase 3.4"

# Phase 4
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase4_task1_testing.md)"
git add -A && git commit -m "Phase 4.1"
opencode run --model opencode/nemotron-3-ultra-free "$(cat docs/prompts/phase4_task2_bugfix.md)"
git add -A && git commit -m "Phase 4.2 - Milestones 1-3 complete"
```

---

## Important Practical Notes

1. **Commit after every task, not just every phase.** Free/experimental models are more likely to make an unexpected edit than Claude was in the earlier plan — frequent commits mean you never lose more than one task's worth of work.

2. **`git diff` before committing backend/database work especially** (Phase 2) — that's the highest-consequence code in M1–3, since a schema mistake compounds into every later task.

3. **If a model stalls or produces something clearly wrong**, don't fight it — switch models for that specific task. `opencode run -c "..."` continues the same session with a different model if you want it to see its own prior (broken) attempt, or start fresh with a new model if you'd rather it not anchor on a bad approach.

4. **Watch context window limits.** Smaller free models may have tighter context limits than Claude did — if a task references too many docs at once and the model seems to ignore parts of the spec, split the task further or trim which docs are loaded via `instructions` for that run.

5. **Re-run `opencode models opencode --refresh` periodically** — since these are explicitly temporary free offerings, availability or naming could change mid-project.
