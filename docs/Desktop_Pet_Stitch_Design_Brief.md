# Stitch Design Brief
## For generating Utility Window screens via Google Stitch MCP inside Antigravity

**Purpose:** Stitch generates good screens when given a consistent design language up front — otherwise each new screen prompt drifts stylistically from the last one. This brief is what you feed Stitch first, before generating any individual screen, so everything shares one visual identity. Export the resulting `DESIGN.md` and keep it alongside the IPC/Database Reference — hand both to Antigravity together.

**Important limitation to plan around:** Stitch generates static layouts, not behavior. Hover states, validation logic, drag-and-drop interactions, and the actual state management for anything in this app still need to be implemented in Antigravity afterward. Treat every Stitch output as a well-grounded visual first draft, not a finished component.

---

## 1. Starting Design Tokens (adjust interactively in Stitch, then lock via DESIGN.md)

These are a reasonable starting point given the product's positioning — a calm, low-friction productivity companion, not a loud game UI:

- **Palette:** a muted, warm neutral base (off-white / soft charcoal for light/dark mode) with one accent color reserved specifically for the pet's presence — e.g., a warm coral or teal accent used only for pet-related UI elements (the consent-gate card border, XP progress), so the Utility Window itself stays calm and the pet-driven moments visually stand out.
- **Typography:** a rounded, friendly sans-serif for headings, a plain readable sans for body/task text. Avoid anything playful enough to undercut the "legitimate productivity tool" positioning from the original blueprint.
- **Spacing:** generous whitespace — this is a small utility window, not a dashboard; avoid cramming.
- **Corners:** soft rounding throughout (8–12px) to match the pet's approachable character without tipping into a toy-like UI.

**First Stitch prompt (design system pass):**
> "A calm, minimal productivity app UI. Warm off-white background, soft charcoal text, one coral accent color used sparingly for highlights and notifications. Rounded sans-serif headings, plain readable body text. Generous padding. Should feel trustworthy and low-friction, not playful or game-like."

Iterate on this first, export `DESIGN.md`, then generate individual screens against it so they inherit the same tokens.

---

## 2. Screens to Generate

| Screen | Stitch prompt starting point | Notes |
|---|---|---|
| **Onboarding — Welcome** | "Single welcome screen introducing a desktop pet companion app, one primary CTA to continue" | First thing the user sees — keep it to one screen, not a multi-step wizard |
| **Onboarding — Auto-start consent** | "A single toggle screen asking if the app should launch at login, with a plain-language explanation, default off" | Ties to `set_auto_start` command |
| **Onboarding — Permissions consent** | "A permissions screen explaining window-activity detection in plain language, with a single 'Enable' and 'Skip for now' option" | Ties to `request_accessibility_permission`; must clearly explain what's read (Section 3.2 of the main spec) |
| **Task list (main view)** | "A to-do list view with checkboxes, due dates, and an add-task input at the top" | Backed by `list_tasks` / `create_task` / `complete_task` |
| **Notes editor** | "A minimal markdown notes editor, single document view, autosave indicator" | Backed by `save_note` |
| **Alarm creation** | "A simple modal for setting a reminder time, optionally linked to an existing task" | Backed by `create_alarm` |
| **Missed alarms summary** | "A single consolidated card listing reminders missed while the app was closed, with a dismiss action" | Backed by `get_missed_alarms_summary` — must NOT be a stack of individual notification-style cards (see Section 3.5 of the main spec) |
| **AI provider settings** | "A settings section listing three AI provider slots (OpenAI, Anthropic, Gemini) each with an add-key input, a verify button, and an active/inactive indicator" | Backed by `add_provider_key` / `verify_provider_key` / `list_providers` |
| **Agent consent card** | "A small card-style prompt showing a pending action description, the target, and Approve/Deny buttons, styled to feel like it's coming from the pet rather than the OS" | This is the most important screen in the whole UI — see Section 3.6 of the main spec. Should use the accent color prominently since it's a trust-critical moment |
| **Agent action audit log** | "A simple reverse-chronological list of past agent actions with status badges (executed, denied, failed)" | Backed by `list_agent_actions` |
| **General settings** | "A settings page with sections for render engine, hotkey remapping, auto-start toggle, and permissions review" | Backed by `get_settings` / `update_settings` |

---

## 3. Consent-Gate Card — Extra Design Direction

Because this is the trust-critical surface flagged repeatedly in the main spec, give Stitch more specific direction than the other screens:

> "A small floating card, NOT a modal overlay — should feel like it's attached to a character rather than blocking the screen. Shows: a short description of the pending action in plain language, the specific target (e.g. recipient, filename), and two clearly distinct buttons — Approve and Deny — with Deny visually secondary but never hidden or de-emphasized to the point of being hard to find."

This maps directly to the anti-dark-pattern principle from the Phase 3 strategy doc — deny should never be visually buried the way many consent UIs bury "reject all."

---

## 4. Handoff Note

Once each screen is generated: use `get_screen_code` (or `build_site` for the full set) via the Stitch MCP tools to pull the HTML/CSS into Antigravity, then wire it to the actual `invoke()` calls from the IPC Reference. Don't treat the Stitch output as final — expect to add real state, loading states, and error handling that Stitch's static generation doesn't produce.
