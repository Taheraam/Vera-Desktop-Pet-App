# Asset & Animation Spec Sheet
## For generating pet sprites via Higgsfield (or a dedicated sprite tool) and wiring them into the Canvas render loop

**Purpose:** this is the exact spec your art-generation tool needs so the output drops into the Canvas renderer without guesswork or repeated back-and-forth. Treat this as a contract the same way the IPC Reference is a contract — whoever/whatever generates the art works against these numbers, not vibes.

---

## 1. Canonical Sprite Dimensions

- **Base frame size:** 64×64px per frame, transparent background (PNG).
- **Directional handling:** generate the pet facing **right only**. Left-facing movement is handled in the renderer via a horizontal canvas transform (`ctx.scale(-1, 1)`), not by generating a mirrored asset set. This halves your generation workload for every directional state.
- **DPI scaling:** do not generate separate 1x/2x/3x asset sets. Generate at 64×64 and let the renderer scale using the monitor's `scaleFactor` (from `get_monitor_layout`, per Milestone 2 of the main spec) with `imageSmoothingEnabled = false` to keep pixel edges crisp rather than blurry when upscaled.

---

## 2. Required Animation States

| State | Frame count | Loop? | Trigger |
|---|---|---|---|
| `idle` | 4–6 | Yes | Default resting state |
| `walk` | 6–8 | Yes | Movement along screen/window edges (Milestone 1–2) |
| `sleep` | 2–4 | Yes | 10+ min system idle (blueprint's original spec) |
| `waking_up` | 4 | No (plays once) | Restoring from fullscreen suppression, or from sleep |
| `happy` | 6 | No (plays once) | `task-completed` event received |
| `worried` | 4 | Yes | Overdue task detected |
| `celebrate` | 6–8 | No (plays once) | To-do list fully cleared |
| `typing_focused` | 4 | Yes | Context Engine detects sustained typing (Milestone 5) |
| `eating` | 6 | No (plays once) | Drag-and-drop ingestion (Milestone 6) |
| `consent_ask` | 4 | Yes (until resolved) | Agent action pending consent (Milestone 4) — this is the "may I?" gesture referenced in the Stitch design brief and Phase 3 strategy doc |
| `bring_me_a_note` | 6 | No (plays once, then holds) | Alarm fires and pet walks to center screen |

**Total unique frames needed for v1: roughly 50–60** — a manageable batch for a single Higgsfield/PixelLab session plus an Aseprite cleanup pass, rather than treating each state as a separate art request.

---

## 3. Consistency Workflow (to work around AI sprite generation's known weak point)

1. Generate **one static reference image** first — the pet's base design, right-facing, neutral pose. Lock this before generating any animation.
2. For every subsequent state, feed that reference image back in as the starting point (image-to-image / reference-pinning) rather than re-prompting from text each time — this is what keeps proportions, colors, and silhouette consistent across all ~10 states.
3. After generation, run a manual consistency pass in Aseprite: check silhouette height/width is identical across all frames' canvases (AI output frequently drifts a few pixels between generations even with reference-pinning), and correct any color palette drift frame-to-frame.
4. Export each state as its own sprite sheet (PNG strip) plus a JSON frame map — matching the format `AutoSprite`/`Spritesheets.ai`-style tools already output, since that's a directly consumable format for a Canvas-based frame-index loop.

---

## 4. File Naming Convention

```
/assets/sprites/
  idle.png           idle.json
  walk.png           walk.json
  sleep.png          sleep.json
  waking_up.png      waking_up.json
  happy.png          happy.json
  worried.png        worried.json
  celebrate.png      celebrate.json
  typing_focused.png typing_focused.json
  eating.png         eating.json
  consent_ask.png    consent_ask.json
  bring_me_a_note.png bring_me_a_note.json
```

Each `.json` follows a simple frame-index format:
```json
{
  "frameWidth": 64,
  "frameHeight": 64,
  "frameCount": 6,
  "fps": 8,
  "loop": true
}
```

This exact shape is what the theme-pack manifest format from the Phase 3 strategy doc validates against — building to this spec now means the same asset structure works for community sideloaded packs later without a rework.

---

## 5. What This Spec Sheet Does NOT Cover (intentionally out of scope for v1)

- Four-directional or eight-directional movement — right-facing + mirror is sufficient for a screen-edge-walking pet; don't over-invest in directional art the design doesn't need.
- Outfit/hat customization layers — that's the Theme & Customization Engine from Phase 3, not v1.
- Sound effects/voice — not in any milestone yet; flag separately if you want it added to the roadmap.
