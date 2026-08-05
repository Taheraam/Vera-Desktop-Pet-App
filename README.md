<div align="center">
  <img src="src/assets/sprites/sleep.png" alt="VeraPet Logo" height="128" />

  # VeraPet
  **Your Smart, Unobtrusive Desktop Companion**

  [![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri)](https://v2.tauri.app/)
  [![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
  [![Rust](https://img.shields.io/badge/Rust-1.80+-000000?logo=rust)](https://www.rust-lang.org/)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

<br/>

VeraPet is a gamified, AI-powered virtual pet that lives quietly on your desktop. It helps you track tasks, manage notes, and stay on top of your workflow—all while staying out of your way when you need to focus.

*(Note: The logo above uses the raw `sleep.png` sprite sheet. For the best look on GitHub, we recommend exporting a single 128x128 frame as `logo.png`!)*

---

## ✨ Features

- **DPI-Aware Desktop Pet**: A transparent, always-on-top pet that anchors to your work area so it never covers your taskbar.
- **Smart Idle & Auto-Park**: Drag the pet anywhere to wake it up. After 10 seconds of inactivity, it falls asleep and automatically parks back in its cozy corner.
- **Drag & Drop Ingestion**: Drop text snippets or files directly onto VeraPet. It will "eat" them and store them in your notes database.
- **Smart Fullscreen Detection**: Watching a movie or playing a game? VeraPet detects fullscreen apps and automatically hides itself so it never distracts you.
- **AI & MCP Agent Integration**: Built-in support for Model Context Protocol (MCP) servers and AI-delegated background tasks.
- **Gamification**: Earn XP and level up your pet by completing tasks!

---

## 📸 See It In Action (Media Recommendations)

> **Developer Note**: Here is where you should put your screenshots and GIFs. Here are the 4 pieces of media you should record to show off the app properly:

### 1. The Desktop Companion (Hero GIF)
*Recommended: A short 5-second looping GIF right here showing the pet asleep on the Windows desktop, the user dragging it to the middle of the screen (waking it up), and it automatically parking back after a delay.*
<br/>
`<!-- <img src="docs/media/hero_demo.gif" width="600" /> -->`

### 2. Drag & Drop "Eating"
*Recommended: A GIF showing the user dragging a text file from their desktop onto the pet, triggering the eating animation and an XP popup.*
<br/>
`<!-- <img src="docs/media/drag_and_drop.gif" width="600" /> -->`

### 3. The Utility Window
*Recommended: A crisp, high-res static screenshot showing the "Tasks & Notes" utility window open next to the pet.*
<br/>
`<!-- <img src="docs/media/utility_window.png" width="600" /> -->`

### 4. Smart Fullscreen Auto-Hide
*Recommended: A video/GIF showing a YouTube video going fullscreen. The pet should instantly hide, and then play its "waking up" animation when the user exits fullscreen.*
<br/>
`<!-- <img src="docs/media/fullscreen_hide.gif" width="600" /> -->`

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri v2 CLI](https://v2.tauri.app/start/prerequisites/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/verapet.git
   cd verapet/TauriPetApp
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run tauri:dev
   ```

### Building for Production
To build a standalone executable for your operating system:
```bash
npm run tauri:build
```

---

## 🛠️ Architecture

VeraPet uses a dual-window architecture powered by Tauri:
1. **The Pet Window (`index.tsx`)**: A transparent, frameless, click-through capable window running a custom Canvas 2D sprite rendering engine.
2. **The Utility Window (`utility-window/index.tsx`)**: A standard app window for managing tasks, notes, alarms, and AI agent settings.
3. **The Rust Backend**: Manages SQLite data persistence, background alarm scheduling loops, and native Windows OS hooks (like fullscreen detection and DPI-aware positioning).

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
