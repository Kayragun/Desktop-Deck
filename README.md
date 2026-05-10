# Desktop Deck

A lightweight, always-on-desktop widget for Windows — inspired by Stream Deck. Quick-access buttons for system tools, automations, and shortcuts, living permanently on your desktop without cluttering the taskbar.

Built with **Rust + Tauri v2** (backend) and **React + TypeScript** (frontend). Designed from the ground up to consume minimal CPU and RAM.

---

## What it does

Desktop Deck sits on your desktop as a floating panel. It stays behind all open windows (never covers your work), becomes nearly invisible when you're not using it, and snaps back to full opacity the moment you hover over it. You can drag it anywhere on screen, and it remembers its position across reboots.

It gives you one-click access to the actions you reach for most — clearing RAM, emptying the recycle bin, muting your mic, projecting your display, creating a new folder — without opening any menus or switching windows.

---

## Features

### Always-on-Desktop Behavior
- Pinned to the bottom of the Windows Z-order via `SetWindowPos(HWND_BOTTOM)` — it never floats above your open applications
- Fullscreen applications (games, videos) cover it completely
- Touchpad gestures like **3-finger swipe down** (Show Desktop) do not minimize or disturb it
- Does **not** appear in the Windows taskbar — managed exclusively from the system tray

### Transparency Mode
- **Idle:** 20% opacity — visible but non-intrusive
- **Hover:** 100% opacity — fully visible when you need it
- Transition is instant; no animation delay

### Drag & Position Memory
- Grab the **header bar** (the "Desktop Deck" title area or the grip icon on the right) to drag the widget anywhere on screen
- Position is saved automatically to `%APPDATA%\Desktop Deck\config.json`
- On next launch, the widget appears exactly where you left it

### System Tray Control
- Right-click the tray icon to access the menu:
  - **Göster / Gizle** — toggle widget visibility
  - **Çıkış** — quit the application (saves position before exit)
- The widget can be hidden when you don't need it and restored from the tray at any time

### Auto-Start with Windows
- Registers itself in the Windows startup registry on first run
- Launches silently in the background — no splash screen, no UAC prompt
- Can be disabled via **Task Manager → Startup Apps**

---

## Action Buttons

The widget currently shows 8 quick-action buttons. Each button has a press animation and is designed to trigger a single, focused system operation.

| Button | Icon | Description |
|---|---|---|
| **Recycle Bin** | 🗑️ | Empties the Windows Recycle Bin with a confirmation prompt |
| **New Folder** | 📁 | Creates a new empty folder on the Desktop instantly |
| **Clipboard** | 📋 | Wipes the entire Windows clipboard history (useful after copying passwords or sensitive data) |
| **Display** | 🖥️ | Opens the Windows display projection panel (equivalent to Win+P — useful for connecting to projectors or second screens) |
| **Panic** | 🔕 | Minimizes all open windows and mutes system volume simultaneously — one click to clear your screen in a hurry |
| **Mic Off** | 🎤 | Toggles a system-level microphone kill-switch — ensures the mic is fully off after calls |
| **RAM Flush** | 💾 | Clears background memory cache to free up RAM when the system feels sluggish |
| **Snippets** | ✂️ | Copies a predefined text snippet (IBAN, email address, code block, etc.) directly to your clipboard |

> **Note:** Button logic (Rust commands) is being implemented in Phase 2. The UI and layout are complete; clicking buttons does not yet trigger system actions in the current build.

---

## Planned Features (Roadmap)

These are defined in the project specification and will be implemented in upcoming phases:

### Phase 2 — Core Commands
- Functional Recycle Bin, New Folder, Display, RAM Flush, Clipboard Cleaner, Panic Button, Mic/Camera Kill-Switch

### Phase 3 — Advanced Modules
- **Keyboard & Touchpad Cleaner Mode** — disables keyboard input for physical cleaning; exit with `Ctrl + F12` or automatic 1-minute timeout; mouse remains functional
- **Custom Action Shortcuts** — bind any website, Windows setting, or application to a button
- **Text Snippets** — user-defined clipboard shortcuts for frequently typed text

### Phase 4 — Productivity Tools
- **Advanced Sticky Notes** — draggable notes pinned to the desktop with rich text support, resize controls, and per-note transparency settings
- **Drop Zone** — a temporary holding area on the widget for files mid-transfer; drag a file onto it, navigate to the destination, drag it off
- **Quick File Converter** — drag a `.png` onto it to get a `.jpg`; drag a text file to get a `.pdf`
- **Decision Maker** — right-click context menu with a coin flip / dice roll for quick decisions

### Phase 5 — Customization
- **Folder System** — group actions into collapsible folders inside the widget
- **Dynamic Icons** — live-updating icons showing real-time data (CPU usage, weather, etc.)
- **Custom Actions** — add your own scripts, smart home automations, or application launchers
- **Turkish / English UI** — language toggle in settings

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend runtime | Rust | stable (2021 edition) |
| Desktop framework | Tauri | v2 |
| Frontend library | React | 18 |
| Language | TypeScript | 5 |
| Frontend build tool | Vite | 5 |
| Styling | Plain CSS | — |
| Package manager | npm | — |
| Windows API | Win32 via `extern "system"` | — |
| Config storage | JSON file | `%APPDATA%\Desktop Deck\config.json` |

### Tools & Programs Used

| Tool | Purpose | Where to get |
|---|---|---|
| **Rust + Cargo** | Compiles the backend; manages Rust dependencies (`Cargo.toml`) | [rustup.rs](https://rustup.rs) |
| **Visual C++ Build Tools** | Required by Rust on Windows to link native binaries | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/) |
| **Node.js** | Runs the frontend toolchain (Vite, TypeScript compiler, npm scripts) | [nodejs.org](https://nodejs.org) — v18 or newer |
| **npm** | Installs JS/TS dependencies listed in `package.json` | Comes with Node.js |
| **Tauri CLI** (`@tauri-apps/cli`) | Bridges the Vite dev server with the Rust binary; runs `npm run tauri dev` and `tauri build` | Installed via npm |
| **Vite** | Frontend dev server and bundler; serves React on `localhost:1420` during development | Installed via npm |
| **TypeScript** | Type-checks the React frontend before bundling | Installed via npm |
| **VS Code** *(optional)* | Recommended editor; the `rust-analyzer` extension gives full Rust IntelliSense | [code.visualstudio.com](https://code.visualstudio.com) |
| **rust-analyzer** *(optional)* | VS Code extension for Rust autocompletion, error highlighting, and refactoring | VS Code Marketplace |

### Dependency Files

| File | What it controls |
|---|---|
| `package.json` | Frontend dependencies (React, Tauri API, Vite, TypeScript) |
| `src-tauri/Cargo.toml` | Backend dependencies (Tauri, Serde, serde_json) |
| `src-tauri/tauri.conf.json` | Window properties, app identifier, bundle settings |

**Why Tauri over Electron?** The release binary is under 10 MB and idles at under 5 MB RAM. Electron-based alternatives typically consume 80–200 MB at idle. Performance is the primary design constraint for this project.

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (required by Tauri on Windows)

### Development

```bash
git clone https://github.com/Kayragun/Desktop-Deck.git
cd Desktop-Deck
npm install
npm run tauri dev
```

> If Windows Application Control (Smart App Control) blocks the dev build, go to **Windows Security → App & browser control → Smart App Control → Off**.

### Release Build

```bash
npm run tauri build
```

Output: `src-tauri/target/release/desktop-deck.exe` and an installer in `src-tauri/target/release/bundle/`.

---

## Customizing

Desktop Deck is open source. The codebase is intentionally straightforward — you can fork it and adapt it to your exact workflow without deep Rust or Tauri knowledge.

**Common customizations:**

- **Add or remove buttons** — edit the `ACTIONS` array in `src/App.tsx`. Each entry is `{ id, icon, label }`. The grid layout adjusts automatically.
- **Change what a button does** — add a Tauri command in `src-tauri/src/main.rs` and call it from the button's `onClick` handler in `App.tsx` via `invoke()`.
- **Adjust opacity** — change the `0.20` idle opacity value in `App.tsx` line `style={{ opacity: active ? 1 : 0.20 }}`.
- **Resize the widget** — edit `width` and `height` in `src-tauri/tauri.conf.json` under the `windows` array.
- **Change position save path** — edit `config.rs` in the backend.
- **Add a new system action** — write an `unsafe` Win32 call in Rust (see `main.rs` for the `pin_to_desktop` example pattern), expose it with `#[tauri::command]`, and register it in `generate_handler![]`.

The project is structured to make each feature self-contained. Adding a new action button is a frontend change; wiring it to a system operation is a backend change. The two sides communicate through Tauri's `invoke` bridge.

---

## File Structure

```
Desktop Deck/
├── src/                        # React frontend
│   ├── App.tsx                 # Main widget UI and action buttons
│   └── styles/global.css       # Widget styles
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # Tauri setup, tray, window pinning, event handling
│   │   ├── config.rs           # Position save/load (%APPDATA%)
│   │   └── autostart.rs        # Windows startup registry
│   ├── icons/                  # App and tray icons
│   └── tauri.conf.json         # Window config (size, decorations, transparency)
└── Project-Description.md      # Full feature specification (14 modules, 5 phases)
```

---

## License

This project is licensed under the [MIT License](LICENSE).

You are free to use, modify, and distribute this software, but you **must** include the original copyright notice and license in any copy or substantial portion of the software. You cannot claim original ownership of this project.
