# Desktop Deck

A lightweight, always-on-desktop widget for Windows — inspired by Stream Deck. Quick-access buttons for system tools, automations, and productivity modules, living permanently on your desktop without cluttering the taskbar.

Built with **Rust + Tauri v2** (backend) and **React + TypeScript** (frontend). Designed from the ground up to consume minimal CPU and RAM.

---

## What it does

Desktop Deck sits on your desktop as a floating panel. It stays behind all open windows (never covers your work), becomes nearly invisible when you're not using it, and snaps back to full opacity the moment you hover over it. You can drag it anywhere on screen, and it remembers its position across reboots.

It gives you one-click access to the actions you reach for most — clearing RAM, emptying the recycle bin, muting your mic, projecting your display — without opening any menus or switching windows. It also includes more advanced productivity modules: sticky notes that float on the desktop, a file staging area, an image converter, a text snippets library, and a decision maker.

---

## Features

### Always-on-Desktop Behavior
- Pinned to the bottom of the Windows Z-order via `SetWindowPos(HWND_BOTTOM)` — it never floats above your open applications
- Fullscreen applications (games, videos) cover it completely
- Touchpad gestures like **3-finger swipe down** (Show Desktop) do not minimize or disturb it
- Does **not** appear in the Windows taskbar — managed exclusively from the system tray

### Transparency Mode
- **Idle:** Adjustable opacity (default 20%) — visible but non-intrusive
- **Hover:** 100% opacity — fully visible when you need it
- Idle opacity is adjustable live via the slider in the widget header
- Transition is instant; no animation delay

### Drag & Position Memory
- Grab the **header bar** to drag the widget anywhere on screen
- Position is saved automatically to `%APPDATA%\Desktop Deck\config.json`
- On next launch, the widget appears exactly where you left it

### System Tray Control
- Right-click the tray icon to access the menu:
  - **Show / Hide** — toggle widget visibility
  - **Quit** — quit the application (saves position before exit)
- The widget can be hidden when you don't need it and restored from the tray at any time

### Auto-Start with Windows
- Registers itself in the Windows startup registry on first run
- Launches silently in the background — no splash screen, no UAC prompt
- Can be disabled via **Task Manager → Startup Apps**

---

## Action Buttons

The widget has 12 action buttons. Each opens a focused tool or triggers a single system operation with a press animation.

| Button | Icon | Description |
|---|---|---|
| **Recycle Bin** | 🗑️ | Empties the Windows Recycle Bin |
| **New Folder** | 📁 | Creates a new empty folder on the Desktop instantly |
| **Clipboard** | 📋 | Wipes the entire Windows clipboard history |
| **Display** | 🖥️ | Opens the Windows display projection panel (Win+P equivalent) |
| **Panic** | 🔕 | Minimizes all open windows and mutes system volume simultaneously |
| **Mic Off** | 🎤 | Toggles a system-level microphone kill-switch |
| **RAM Flush** | 💾 | Clears background memory cache to free up RAM |
| **Cleaner** | 🧹 | Keyboard & touchpad cleaner mode — disables input for physical cleaning; click Stop or wait 60 s to exit |
| **Snippets** | ✂️ | Clipboard shortcuts for frequently typed text (IBAN, email, code blocks, etc.) |
| **Decision** | 🎲 | Can't decide? Flip a coin, roll a dice, or spin a wheel |
| **Sticky Notes** | 📝 | Floating sticky notes pinned to the desktop — each note is draggable, resizable, with adjustable opacity and font size |
| **Drop Zone** | 📥 | Temporary file staging area — drag files in, open, copy path, show in Explorer, or drag them out |
| **Converter** | 🔄 | Drag image files onto it, pick a target format (PNG / JPG / WEBP / BMP), choose an output folder, and convert in bulk |

---

## Module Details

### Snippets
Define your own text snippets (IBAN, email addresses, code templates, etc.). Click a snippet to copy it to the clipboard instantly. Snippets are stored in `%APPDATA%\Desktop Deck\snippets.json`.

### Decision Maker
Three modes accessible via tabs:
- **Coin** — flip a coin (Heads / Tails)
- **Dice** — roll a six-sided die with a spin animation
- **Wheel** — spin a customizable wheel with your own choices

### Sticky Notes
Create notes in up to 5 colors. Each note can be:
- **Pinned to the desktop** — opens a floating window that lives behind your apps, just like the main widget
- **Dragged** anywhere on screen
- **Resized** by dragging the bottom-right corner handle
- **Font size** adjustable per note (9–20 px)
- **Opacity** adjustable per note (25–100%)

Settings (font size + opacity) are accessed via the pencil (✎) button in the note footer. All settings are persisted per note in `%APPDATA%\Desktop Deck\notes.json`.

### Drop Zone
A file staging area inside the widget. Drag any file onto the panel while the Drop Zone drawer is open:
- **Open** — open the file with its default application
- **Show in Explorer** — highlight the file in Windows Explorer
- **Copy Path** — copy the full path to clipboard
- **Remove** — remove the file from the list (does not delete the file)

Files are kept in the list as long as the app is running (survive drawer open/close).

### Quick File Converter
Drag image files (PNG, JPG, JPEG, WEBP, BMP) onto the converter area. Pick a target format, click **Convert**, choose an output folder via the native Windows folder picker, and all files are converted in one go. Status per file (pending / converting / done / error) is shown in the list. Conversion is done entirely in Rust via the `image` crate — no external tools required.

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
| Windows API | Win32 via `extern "system"` FFI | — |
| Image processing | `image` crate (pure Rust) | 0.25 |
| Config storage | JSON file | `%APPDATA%\Desktop Deck\` |

### Tools & Programs Used

| Tool | Purpose | Where to get |
|---|---|---|
| **Rust + Cargo** | Compiles the backend; manages Rust dependencies | [rustup.rs](https://rustup.rs) |
| **Visual C++ Build Tools** | Required by Rust on Windows to link native binaries | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/) |
| **Node.js** | Runs the frontend toolchain (Vite, TypeScript, npm) | [nodejs.org](https://nodejs.org) — v18 or newer |
| **npm** | Installs JS/TS dependencies | Comes with Node.js |
| **Tauri CLI** | Bridges Vite and the Rust binary; runs dev server and builds | Installed via npm |
| **Vite** | Frontend dev server and bundler | Installed via npm |
| **TypeScript** | Type-checks the React frontend | Installed via npm |
| **VS Code** *(optional)* | Recommended editor with `rust-analyzer` for Rust IntelliSense | [code.visualstudio.com](https://code.visualstudio.com) |

**Why Tauri over Electron?** The release binary is under 10 MB and idles at under 5 MB RAM. Electron-based alternatives typically consume 80–200 MB at idle.

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

> If Windows Smart App Control blocks the dev build, go to **Windows Security → App & browser control → Smart App Control → Off**.

### Release Build

```bash
npm run tauri build -- --bundles nsis
```

Output: `src-tauri/target/release/desktop-deck.exe` and an NSIS installer in `src-tauri/target/release/bundle/nsis/`.

---

## Customizing

Desktop Deck is open source. The codebase is intentionally straightforward — you can fork it and adapt it to your exact workflow.

**Common customizations:**

- **Add or remove action buttons** — edit the `STATIC_ACTIONS` array in `src/App.tsx`. The grid layout adjusts automatically.
- **Change what a button does** — add a Tauri command in `src-tauri/src/commands.rs` and call it from the button's handler in `App.tsx` via `invoke()`.
- **Adjust idle opacity** — drag the opacity slider in the widget header, or change the default in `App.tsx`.
- **Resize the widget** — edit `width` and `height` in `src-tauri/tauri.conf.json` under the `windows` array.
- **Change config save path** — edit `config.rs`.
- **Add a new system action** — write a Win32 call in Rust, expose it with `#[tauri::command]`, register it in `invoke_handler![]`, and call it from the frontend with `invoke()`.

---

## File Structure

```
Desktop Deck/
├── src/                              # React frontend
│   ├── App.tsx                       # Main widget UI, action buttons, state
│   ├── SnippetsDrawer.tsx            # Text snippets module
│   ├── StickyNotesDrawer.tsx         # Sticky notes list and management
│   ├── NoteWindow.tsx                # Floating desktop note window
│   ├── DecisionDrawer.tsx            # Coin / dice / wheel decision maker
│   ├── DropZoneDrawer.tsx            # File staging area
│   ├── FileConverterDrawer.tsx       # Image format converter
│   └── styles/global.css            # All widget styles
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # Tauri setup, tray, window pinning, event handling
│   │   ├── commands.rs               # All Tauri commands (system + notes + converter)
│   │   ├── config.rs                 # Position and notes save/load (%APPDATA%)
│   │   ├── cleaner.rs                # Keyboard/touchpad cleaner mode
│   │   ├── desktop.rs                # Win32 desktop attach helpers
│   │   └── autostart.rs              # Windows startup registry
│   ├── icons/                        # App and tray icons
│   └── tauri.conf.json               # Window config (size, decorations, transparency)
└── Project-Description.md            # Full feature specification
```

---

## License

This project is licensed under the [MIT License](LICENSE).

You are free to use, modify, and distribute this software, but you **must** include the original copyright notice and license in any copy or substantial portion of the software.
