import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Action {
  id: string;
  icon: string;
  label: string;
  description: string;
}

const COMMANDS: Record<string, string> = {
  recycle:   "empty_recycle_bin",
  folder:    "new_desktop_folder",
  ram:       "flush_ram",
  clipboard: "clear_clipboard",
  display:   "open_display",
  panic:     "panic_button",
  mic:       "toggle_mic",
};

const ACTIONS: Action[] = [
  {
    id: "recycle",
    icon: "🗑️",
    label: "Recycle Bin",
    description: "Empties the Windows Recycle Bin. A confirmation dialog will appear before deletion.",
  },
  {
    id: "folder",
    icon: "📁",
    label: "New Folder",
    description: "Creates a new empty 'New Folder' on your Desktop, numbered if one already exists.",
  },
  {
    id: "clipboard",
    icon: "📋",
    label: "Clipboard",
    description: "Clears the entire Windows clipboard. Useful after copying passwords or sensitive data.",
  },
  {
    id: "display",
    icon: "🖥️",
    label: "Display",
    description: "Opens Windows display projection settings (Win+P) to switch between screen modes.",
  },
  {
    id: "panic",
    icon: "🔕",
    label: "Panic",
    description: "Instantly minimizes all open windows and mutes system audio. Privacy in one click.",
  },
  {
    id: "mic",
    icon: "🎤",
    label: "Mic Off",
    description: "Toggles your default microphone mute on or off at the system level.",
  },
  {
    id: "ram",
    icon: "💾",
    label: "RAM Flush",
    description: "Flushes working set memory across all processes to free up RAM on a sluggish system.",
  },
  {
    id: "snippets",
    icon: "✂️",
    label: "Snippets",
    description: "Copy a predefined text snippet to clipboard instantly. (Coming in a future update)",
  },
];

interface Toast {
  msg: string;
  ok: boolean;
  key: number;
}

export default function App() {
  const [active, setActive]   = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [toast, setToast]     = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const runCommand = useCallback((id: string) => {
    const cmd = COMMANDS[id];
    if (!cmd) {
      showToast("Coming soon", false);
      return;
    }
    invoke<string | null>(cmd)
      .then((result) => {
        const msg = typeof result === "string" && result.length > 0 ? result : "Done";
        showToast(msg, true);
      })
      .catch((err: unknown) => {
        showToast(String(err), false);
      });
  }, [showToast]);

  const hoveredAction = ACTIONS.find((a) => a.id === hovered);

  return (
    <div
      className="overlay"
      style={{ opacity: active ? 1 : 0.20 }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => { setActive(false); setPressed(null); setHovered(null); }}
    >
      <div className="panel">

        {/* ── Toast notification ── */}
        {toast && (
          <div key={toast.key} className={`toast${toast.ok ? "" : " toast-error"}`}>
            <span className="toast-dot" />
            {toast.msg}
          </div>
        )}

        {/* ── Header — drag region ── */}
        <header className="panel-header" data-tauri-drag-region>
          <div className="header-brand" data-tauri-drag-region>
            <div className="brand-badge">D</div>
            <span className="brand-name">Desktop Deck</span>
          </div>
          <div className="header-grip" data-tauri-drag-region>
            <GripIcon />
          </div>
        </header>

        <div className="panel-rule" />

        {/* ── Action grid ── */}
        <div className="grid-section">
          <p className="section-eyebrow">Quick Actions</p>
          <div className="action-grid">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                className={`action-btn${pressed === a.id ? " is-pressed" : ""}`}
                onPointerDown={() => setPressed(a.id)}
                onPointerUp={() => {
                  setPressed(null);
                  runCommand(a.id);
                }}
                onPointerLeave={() => setPressed(null)}
                onMouseEnter={() => setHovered(a.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="btn-icon">{a.icon}</span>
                <span className="btn-label">{a.label}</span>
              </button>
            ))}
          </div>

          {/* ── Info bar (tooltip area) ── */}
          <div className={`info-bar${hoveredAction ? " info-bar--visible" : ""}`}>
            <span className="info-icon">ℹ</span>
            <span className="info-text">{hoveredAction?.description ?? ""}</span>
          </div>
        </div>

        {/* ── Status bar ── */}
        <footer className="status-bar">
          <span className="status-beacon" />
          <span className="status-copy">{ACTIONS.length} actions ready</span>
        </footer>

      </div>
    </div>
  );
}

function GripIcon() {
  const dots: [number, number][] = [
    [2, 2], [6, 2], [10, 2],
    [2, 6], [6, 6], [10, 6],
  ];
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="currentColor" aria-hidden>
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" />
      ))}
    </svg>
  );
}
