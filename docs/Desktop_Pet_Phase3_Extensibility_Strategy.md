# Phase 3: Future Strategy, Extensibility & Ecosystem Architecture
## Productivity Desktop Companion App — 3–12 Month Post-Launch Roadmap

**Context:** With the AI Provider & MCP Agent Engine promoted into the core MVP (Milestone 4 of the Phase 2 spec), this document covers what genuinely remains for *after* launch: the theming/customization engine, a developer ecosystem built on top of the MCP infrastructure you'll already have shipped, and an extended AI strategy that goes beyond the v1 BYOK model — plus an explicit stance on retention ethics, since a companion app has real potential to manipulate users through emotional attachment if built carelessly.

---

## 1. The Theme & Customization Engine

**Goal:** let users sideload custom sprite sheets, animations, and dashboard themes without recompiling the app or waiting on you to ship official content.

### Asset Pack Format
A pack is a folder or zip with a defined structure:
```
my-custom-pack/
├── manifest.json        (name, author, version, min-app-version)
├── sprites/              (PNG sprite sheets)
├── animations/           (JSON: state → frame sequence mapping)
└── theme/
    └── variables.css     (CSS custom properties only — see Security below)
```

- **Validation on load:** the manifest declares which pet states it covers (idle, walk, sleep, happy, etc.). Missing states fall back to the default built-in asset for that state rather than crashing or leaving a blank sprite.
- **Hot-reloadable:** packs live in a user-writable app-data directory and can be scanned/activated from Settings without a full app restart.

### Security Constraint (Important)
Dashboard theming should be restricted to **CSS custom properties/variables only** — not arbitrary CSS injection, and never JS execution from a theme pack. A malicious pack that can inject full CSS/JS into the Utility Window could visually spoof UI elements (e.g., fake a consent-gate card from Milestone 4 to trick a user into approving an action they didn't intend). Given this app has real external-write capability via the Agent Engine, this isn't a hypothetical risk — theme sandboxing needs to be treated with the same seriousness as the MCP consent model.

### Distribution
Start with a community GitHub-based submission process (low overhead, easy moderation via PR review) rather than building a full in-app marketplace immediately — this mirrors how OpenPets and similar community-driven pet apps have bootstrapped their asset ecosystems. A browsable in-app gallery is a reasonable v2 once there's enough community content to justify it.

---

## 2. Developer Ecosystem & Extensibility API

Because MCP is now core infrastructure (not a future add-on), the developer ecosystem can build directly on top of it rather than needing a separate bespoke plugin system from scratch. Two distinct extension surfaces:

### A. Trigger Rules (event → reaction, no code required)
A lightweight, user/developer-configurable rules system:
```
{ event_source: "github-mcp:workflow_run.failed", condition: "repo == 'my-project'", reaction: "flash_red" }
{ event_source: "calendar-mcp:event.status", condition: "label == 'Deep Work'", reaction: "sleep" }
```
These are evaluated by the backend whenever a connected MCP server pushes or is polled for an event. No plugin code needed — this covers your original examples (CI failure, Deep Work calendar blocks) with a simple config surface most users could set up themselves, not just developers.

### B. Sandboxed Plugin SDK (for logic beyond simple rules)
For behavior more complex than trigger rules can express — custom mood logic, novel reminder types, bespoke integrations:
- JS-based plugins running in a sandbox with **no direct filesystem or network access**. Plugins can only act through a defined host-provided API surface.
- This constraint matters more here than it would in a purely cosmetic pet app: because the Agent Engine can already take real external actions, an unsandboxed plugin system would be a serious security hole. Plugins should never bypass the same consent-gate model that governs the Agent Engine itself.
- Plugin manifests declare which host API version they target, so app updates don't silently break third-party plugins.

### Distribution
Same GitHub-based, community-review model as the theme packs — one shared distribution/moderation pipeline for both asset packs and plugins keeps this manageable for a small team.

---

## 3. Extended AI Strategy: Beyond BYOK

Your original blueprint envisioned an on-device local LLM (ONNX Runtime / llama.cpp) for privacy-first summarization. Since v1's Agent Engine is now cloud-based BYOK (OpenAI/Anthropic/Gemini), local AI should be reframed as a **complementary privacy-maximalist option**, not a replacement:

- **Who it's for:** users who don't want to supply *any* external API key, or who want specific lightweight features to work fully offline.
- **Good local-model use cases:** note summarization, journal sentiment tagging, and potentially even upgrading the Context Engine's active-window categorization from simple pattern-matching to something smarter — all without any data leaving the device.
- **Recommended scope:** a small (1–3B parameter) quantized model via llama.cpp bindings, run fully offline. This should be **opt-in and disabled by default** — even a small quantized model adds a real, non-trivial RAM footprint, which cuts against the resource-discipline goal running through this entire spec. Show the user the expected RAM cost before they enable it.
- This becomes the answer for the privacy-maximalist segment of your user base without compromising the lighter-weight default experience for everyone else.

---

## 4. Ethical Retention Strategy

A companion app built around emotional attachment to a pet has real potential to slide into manipulative retention mechanics if this isn't decided deliberately up front. Recommended principles:

- **No guilt-based retention hooks.** Avoid Tamagotchi-style "your pet is sad/dying because you left" mechanics. In a productivity-positioned app, guilt-tripping the user back in undermines the actual value proposition and is the kind of dark pattern that erodes trust once users notice it.
- **No manufactured urgency.** Streak mechanics (from the existing XP/progression system) should celebrate consistency positively rather than punishing a broken streak with aggressive loss-framing.
- **Gamification stays positive-reinforcement-only.** Celebrate task completion and consistency; don't design mechanics whose primary function is generating anxiety about absence.
- **Progressive onboarding, not a feature dump.** Introduce the Agent Engine contextually rather than front-loading all AI/MCP capability into first-run setup — e.g., core pet + to-do list on day one, and only prompt to connect an AI provider when the user creates a task that looks like something the agent could actually help execute (e.g., "email the invoice to Sam" → "Want your pet to send this for you? Connect an AI provider to try it").

This isn't just a compliance nicety — it's a real differentiator against competitors in this space that lean on cosmetic-pet emotional pressure as their primary retention lever.

---

## Summary: What's Actually Left for 3–12 Months Out

With the Agent Engine now shipping as part of the core MVP, Phase 3 is genuinely just:
1. Theme/customization engine (with real security constraints given the app's write capabilities)
2. Trigger rules + sandboxed plugin SDK, built on the MCP foundation already in place
3. An offline local-AI option for privacy-maximalist users, positioned alongside — not replacing — BYOK
4. A deliberate, documented stance against manipulative retention patterns, baked into the onboarding and gamification design rather than left to chance

This closes out all three phases of your original planning structure.
