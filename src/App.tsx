import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Action {
  id: string;
  icon: string;
  label: string;
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
  { id: "recycle",   icon: "🗑️", label: "Recycle Bin" },
  { id: "folder",    icon: "📁", label: "New Folder"   },
  { id: "clipboard", icon: "📋", label: "Clipboard"    },
  { id: "display",   icon: "🖥️", label: "Display"      },
  { id: "panic",     icon: "🔕", label: "Panic"         },
  { id: "mic",       icon: "🎤", label: "Mic Off"       },
  { id: "ram",       icon: "💾", label: "RAM Flush"     },
  { id: "snippets",  icon: "✂️", label: "Snippets"      },
];

export default function App() {
  const [active, setActive]   = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);

  return (
    <div
      className="overlay"
      style={{ opacity: active ? 1 : 0.20 }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => { setActive(false); setPressed(null); }}
    >
      <div className="panel">

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
                  const cmd = COMMANDS[a.id];
                  if (cmd) invoke(cmd).catch(console.error);
                }}
                onPointerLeave={() => setPressed(null)}
              >
                <span className="btn-icon">{a.icon}</span>
                <span className="btn-label">{a.label}</span>
              </button>
            ))}
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
