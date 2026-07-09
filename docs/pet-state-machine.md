# Pet Animation State Machine Design

**Sources:** `docs/Desktop_Pet_PRD_Technical_Spec.md` §3.1 (Window/OS behavior, click-through, fullscreen, hotkey) and `docs/Desktop_Pet_Asset_Animation_Spec_Sheet.md` §2 (11 animation states, frame counts, loop flags).

**Scope:** Design document only. No implementation. This defines the FSM the Canvas renderer (`src/pet-window/canvas-renderer.ts`) and animation-state module (`src/pet-window/animation-state.ts`) must conform to.

---

## 1. State inventory (11 states)

| State | Frames | Loop? | Trigger (entry) |
|---|---|---|---|
| `idle` | 4–6 | Yes | Default resting state; also the return state after any one-off/looping state finishes |
| `walk` | 6–8 | Yes | Pet must reposition (call-pet to center, edge wander, monitor-unplug recovery) |
| `sleep` | 2–4 | Yes | System idle > 10 minutes (no input) |
| `waking_up` | 4 | No (plays once) | Restoring from fullscreen suppression, or waking from `sleep` |
| `happy` | 6 | No (plays once) | `task-completed` event |
| `worried` | 4 | Yes | An overdue task is detected |
| `celebrate` | 6–8 | No (plays once) | To-do list fully cleared |
| `typing_focused` | 4 | Yes | Context Engine detects sustained typing cadence |
| `eating` | 6 | No (plays once) | Drag-and-drop ingestion (`ingest_dropped_content`) |
| `consent_ask` | 4 | Yes (until resolved) | `agent-consent-requested` event (pending MCP consent) |
| `bring_me_a_note` | 6 | No (plays once, then holds) | `alarm-fired` event (pet walks to center, drops card) |

---

## 2. Finite State Machine — transitions

`idle` is the hub state. All non-looping states return to `idle` when complete; looping states hold until their exit condition clears.

```
                        ┌──────────────────────────────────────────────────────┐
                        │                       idle                            │
                        └──┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────────┘
              walk ◄──────┘    │    │    │    │    │    │    │    │    │
              sleep ◄─────────┘    │    │    │    │    │    │    │    │
           waking_up ◄────────────┘    │    │    │    │    │    │    │
              happy ◄──────────────────┘    │    │    │    │    │    │
             worried ◄──────────────────────┘    │    │    │    │    │
            celebrate ◄──────────────────────────┘    │    │    │    │
         typing_focused ◄──────────────────────────────┘    │    │    │
              eating ◄────────────────────────────────────────┘    │    │
           consent_ask ◄────────────────────────────────────────────┘    │
         bring_me_a_note ◄─────────────────────────────────────────────────┘
```

### Transition rules

| From | To | Condition |
|---|---|---|
| `idle` | `walk` | Pet must move: call-pet from hidden state → walk to center; idle edge-wander; monitor unplugged → reposition to primary monitor |
| `idle` | `sleep` | No user input for > 10 minutes |
| `idle` | `waking_up` | Fullscreen app lost focus (restore) **or** user activity resumes after `sleep` |
| `idle` | `happy` | `task-completed` event received |
| `idle` | `worried` | At least one overdue task exists (checked on list load / task events) |
| `idle` | `typing_focused` | Context Engine reports sustained typing (`context-changed` → typing cadence) |
| `idle` | `eating` | `ingest_dropped_content` invoked (drag-drop onto pet) |
| `idle` | `consent_ask` | `agent-consent-requested` event |
| `idle` | `bring_me_a_note` | `alarm-fired` event |
| `walk` | `idle` | Arrival at destination / movement complete |
| `sleep` | `waking_up` | User input detected **or** fullscreen cleared |
| `waking_up` | `idle` | Final frame played (one-off) |
| `happy` | `idle` | Final frame played, brief hold then return |
| `worried` | `idle` | No overdue tasks remain (task-completed / task-deleted / list refresh) |
| `celebrate` | `idle` | Final frame played |
| `typing_focused` | `idle` | Typing stops / context returns to `idle` or `unknown` |
| `eating` | `idle` | Final frame played |
| `consent_ask` | `idle` | `agent-action-resolved` event (approved / denied / failed) |
| `bring_me_a_note` | `idle` | Walked to center, card held, then dismissed by user or alarm-ack timeout |

**Priority when multiple triggers fire at once:** external/consent events (`consent_ask`, `bring_me_a_note`) and celebratory/`happy` take precedence over ambient states (`worried`, `typing_focused`). `waking_up` preempts everything on restore. `idle` is the lowest priority (default fallback).

---

## 3. Click-through & the three-state hotkey (Alt+P)

Click-through is an **orthogonal interaction flag**, not an animation state. It gates whether the pet window receives pointer events.

### Click-through engagement
- While in `idle` (and not interactive) for **N seconds** of no interaction, the backend calls `set_click_through({ enabled: true })`. Clicks now pass through the pet to the desktop.
- The pet stays in `idle` visually; only the window's input behavior changes.

### Exiting click-through — the "Call Pet" hotkey (`Alt+P`)
The single hotkey resolves to one of three actions based on current pet state (PRD §3.1):

| Current state | Hotkey action |
|---|---|
| **Hidden** (fullscreen suppressed) | Un-hide window → `walk` to center screen → become interactive |
| **Idle / click-through** | Disable click-through → pet "perks up" (becomes interactive). Animation stays `idle` (or a brief `waking_up` if desired for feedback) |
| **Already interactive** | Open the Utility Window |

- The two **only** ways out of click-through are: (a) this hotkey, or (b) double-clicking the system tray icon. A click *on* the pet never exits click-through — by definition clicks pass through it.
- This is emitted as `pet-state-changed` so both windows stay in sync.

---

## 4. Fullscreen detection (visibility flag)

Fullscreen handling is an **orthogonal visibility flag** (`window_hidden`), separate from the animation FSM:

- On `fullscreen-detected`: the Pet Window is **hidden entirely** (not merely occluded) to avoid wasting render cycles. Animation loop pauses; no state transition is recorded (the pet "was" `idle`/whatever it was).
- On `fullscreen-cleared`: window is shown again and the pet enters `waking_up` (plays once) **rather than snapping back silently**, then returns to `idle`.
- This maps to the three-state hotkey's first row: a hidden (fullscreen-suppressed) pet responds to Alt+P by un-hiding and walking to center.

---

## 5. Frame timing

Per PRD §3.3 (idle throttling) and Asset Spec §2:

- **Looping states** (`idle`, `walk`, `sleep`, `worried`, `typing_focused`, `consent_ask`): **~8–10 fps**. This is the battery-saving idle rate and applies to the majority of runtime.
- **One-off states** (`waking_up`, `happy`, `celebrate`, `eating`, `bring_me_a_note`): **~150 ms/frame** (~6.6 fps), play once, then hold the final frame briefly before returning to `idle`. `bring_me_a_note` holds its final (card) frame until dismissed.
- **Active movement:** during `walk` the render loop may run up to **60 fps** (PRD §3.3 active rate) for smooth motion, while the sprite frame advance stays at the state's fps. The throttle is a `requestAnimationFrame` gate in `canvas-renderer.ts`.
- Non-looping animations **hold their final frame** rather than restarting; the FSM then transitions to `idle`.

---

## 6. Implementation contract (for later phases)

- `src/pet-window/animation-state.ts` owns this FSM: `currentState`, transition function `transition(event)`, and the two orthogonal flags `clickThrough` / `windowHidden`.
- Events consumed: `task-completed`, `alarm-fired`, `pet-state-changed`, `fullscreen-detected` / `fullscreen-cleared`, `context-changed`, `agent-consent-requested` / `agent-action-resolved`.
- This document is the source of truth for state names; the renderer must not invent states not listed in §1.
