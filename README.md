<div align="center">
  <img src="src/assets/sprites/LOGO/VeraPet_Logo.png" alt="VeraPet Logo" height="128" />

  # VeraPet
  **A desktop pet that keeps your tasks, notes and reminders, and stays out of your way.**

  [![CI](https://github.com/Taheraam/Vera-Desktop-Pet-App/actions/workflows/ci.yml/badge.svg)](https://github.com/Taheraam/Vera-Desktop-Pet-App/actions/workflows/ci.yml)
  [![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri)](https://v2.tauri.app/)
  [![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
  [![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust)](https://www.rust-lang.org/)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

<br/>

VeraPet is a pixel-art companion that lives in the corner of your Windows desktop. She naps when you're busy, wakes up when you need her, and holds your tasks, notes and reminders in a local SQLite database.

---

## ✨ Features

- **Always-on-top, transparent pet window:** a 260×210 window with a 128 px sprite. It parks at the bottom-right of the *work area* (DPI-aware), so it never covers the taskbar.
- **Awake / asleep:** after 10 s without mouse activity Vera falls asleep and parks in her corner, cycling sleep → wake → snack. Double-click, click, or press **Alt+P** (global hotkey) to wake her in place.
- **Tasks, notes, reminders:** double-click the awake pet to open the utility window. Reminders ring even if the app was busy with another tab, and anything that came due while Vera was closed shows up as *missed* until you dismiss it.
- **Drag & drop:** drop files onto Vera and she "eats" them into a note. Text files are inlined; binaries and files over 1 MB are stored as a reference.
- **Fullscreen awareness:** Vera hides while a game or fullscreen video is in front and comes back when it closes. The desktop and taskbar don't count as fullscreen.
- **XP:** completing a task earns XP (once per task).
- **Starts with Windows** (optional) and runs as a **single instance**.

**Experimental / not wired to the UI yet:** AI-provider keys (stored in Windows Credential Manager), a consent-gated agent loop, and an MCP server registry. The agent and MCP commands are disabled in every window's capability file until a real MCP transport exists.

---

## 🚀 Getting Started

### Prerequisites
- Windows 10/11 with [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11)
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (stable) + the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run it
```bash
git clone https://github.com/Taheraam/Vera-Desktop-Pet-App.git
cd Vera-Desktop-Pet-App
npm ci
npm run tauri:dev
```

### Build an installer
```bash
npm run tauri:build      # NSIS + MSI installers in src-tauri/target/release/bundle/
```

### Checks (the same ones CI runs)
```bash
npm run build                                                       # tsc + vite build
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
```

---

## 🛠️ Architecture

```
 ┌──────────── Pet window ────────────┐      ┌────────── Utility window ──────────┐
 │ Canvas 2D sprite renderer + FSM     │      │ Tasks · Notes · Clock · Settings    │
 │ idle timer → set_pet_mode(asleep)   │      │ reminder banner (all tabs)          │
 └────────────────┬────────────────────┘      └────────────────┬────────────────────┘
                  │ 3 commands                                  │ 27 commands
                  ▼        (per-window capability files)        ▼
 ┌──────────────────────────────── Rust (Tauri v2) ───────────────────────────────────┐
 │ commands/  tasks · notes · alarms · window · settings · gamification · provider     │
 │ threads    alarm scheduler (wakes on new alarm) · fullscreen detector (Win32)       │
 │ plugins    single-instance · global-shortcut (Alt+P) · autostart                     │
 │ storage    SQLite (versioned migrations, PRAGMA user_version) · Credential Manager   │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Rust owns the state.** Pet mode, tasks, notes, alarms and settings live in SQLite and change only through commands. The frontends re-render from the events Rust emits (`task-created`, `alarm-fired`, `pet-state-changed`, …).
- **Least-privilege IPC.** `build.rs` declares every command, and each window's capability file (`src-tauri/capabilities/`) grants only what that window uses. The pet window can't read tasks or API keys.
- **Dropped files are read by Rust** from the OS drag-drop event. No command takes a file path from JavaScript.
- **Strict CSP**, no global `window.__TAURI__`, and API keys sent in headers, never in URLs.

---

## 📜 License

MIT. See [LICENSE](LICENSE).
