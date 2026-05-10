import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ─── Snippets config — edit `text` to personalise ────────────────────────────
const SNIPPET_LIST = [
  { id: "s1", label: "Email",  text: "yourname@example.com" },
  { id: "s2", label: "Phone",  text: "+90 555 000 00 00" },
  { id: "s3", label: "IBAN",   text: "TR00 0000 0000 0000 0000 0000 00" },
];

// ─── Command map ─────────────────────────────────────────────────────────────
const COMMANDS: Record<string, string> = {
  recycle:   "empty_recycle_bin",
  folder:    "new_desktop_folder",
  ram:       "flush_ram",
  clipboard: "clear_clipboard",
  display:   "open_display",
  panic:     "panic_button",
  mic:       "toggle_mic",
};

interface Action { id: string; label: string; description: string; }

const STATIC_ACTIONS: Action[] = [
  { id: "recycle",   label: "Recycle Bin", description: "Empties the Windows Recycle Bin. A confirmation dialog will appear." },
  { id: "folder",    label: "New Folder",   description: "Creates a new empty folder on your Desktop." },
  { id: "clipboard", label: "Clipboard",    description: "Clears the entire Windows clipboard. Useful after copying sensitive data." },
  { id: "display",   label: "Display",      description: "Opens Windows display projection settings (Win+P)." },
  { id: "panic",     label: "Panic",        description: "Minimizes all open windows and mutes audio. Mute stays until you restore it." },
  { id: "mic",       label: "Mic On",       description: "Microphone is active — click to mute." },
  { id: "ram",       label: "RAM Flush",    description: "Flushes working set memory across all processes to free up RAM." },
  { id: "snippets",  label: "Snippets",     description: "Click any snippet to copy it to clipboard." },
];

interface Toast { msg: string; ok: boolean; key: number; }

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive]             = useState(false);
  const [pressed, setPressed]           = useState<string | null>(null);
  const [hovered, setHovered]           = useState<string | null>(null);
  const [toast, setToast]               = useState<Toast | null>(null);
  const [micMuted, setMicMuted]         = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<boolean>("get_mic_state").then(setMicMuted).catch(() => {});
  }, []);

  const showToast = useCallback((msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const runCommand = useCallback((id: string) => {
    if (id === "snippets") { setShowSnippets((v) => !v); return; }
    const cmd = COMMANDS[id];
    if (!cmd) { showToast("Coming soon", false); return; }
    invoke<string | null>(cmd)
      .then((result) => {
        const msg = typeof result === "string" && result.length ? result : "Done";
        showToast(msg, true);
        if (id === "mic") setMicMuted(msg === "muted");
      })
      .catch((err: unknown) => showToast(String(err), false));
  }, [showToast]);

  // JS-based drag: tracks pointer delta and moves window via Win32 in physical pixels
  const handleDragStart = useCallback(async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const win = getCurrentWindow();
    const dpr = window.devicePixelRatio || 1;
    let initPos: { x: number; y: number };
    try { initPos = await win.outerPosition(); } catch { return; }
    const startX = e.screenX;
    const startY = e.screenY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    let rafId: number | null = null;
    let moveX = 0, moveY = 0;
    const onMove = (ev: PointerEvent) => {
      moveX = Math.round((ev.screenX - startX) * dpr);
      moveY = Math.round((ev.screenY - startY) * dpr);
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          invoke("move_window", { x: initPos.x + moveX, y: initPos.y + moveY }).catch(() => {});
        });
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", () => {
      document.removeEventListener("pointermove", onMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    }, { once: true });
  }, []);

  // Resize handle — uses Rust command (bypasses resizable:false config)
  const handleResizeStart = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { width: initW, height: initH } = await getCurrentWindow().outerSize();
    const startX = e.screenX;
    const startY = e.screenY;
    const dpr = window.devicePixelRatio || 1;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const newW = Math.max(Math.round(280 * dpr), Math.round(initW + (ev.screenX - startX) * dpr));
      const newH = Math.max(Math.round(400 * dpr), Math.round(initH + (ev.screenY - startY) * dpr));
      invoke("resize_window", { width: newW, height: newH }).catch(() => {});
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", () => document.removeEventListener("pointermove", onMove), { once: true });
  }, []);

  const micLabel = micMuted ? "Mic Off" : "Mic On";
  const micDesc  = micMuted
    ? "Microphone is muted — click to unmute."
    : "Microphone is active — click to mute.";

  const actions = STATIC_ACTIONS.map((a) =>
    a.id === "mic" ? { ...a, label: micLabel, description: micDesc } : a
  );
  const hoveredAction = actions.find((a) => a.id === hovered);

  return (
    <div
      className="overlay"
      style={{ opacity: active ? 1 : 0.20 }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => { setActive(false); setPressed(null); setHovered(null); }}
    >
      <div className="panel">

        {/* ── Toast ── */}
        {toast && (
          <div key={toast.key} className={`toast${toast.ok ? "" : " toast-error"}`}>
            <span className="toast-dot" />
            {toast.msg}
          </div>
        )}

        {/* ── Header ── */}
        <header className="panel-header" onPointerDown={handleDragStart}>
          <div className="header-brand">
            <div className="brand-badge">D</div>
            <span className="brand-name">Desktop Deck</span>
          </div>
          <button
            className="hide-btn"
            title="Hide panel"
            onPointerUp={(e) => { e.stopPropagation(); invoke("hide_window"); }}
          >
            ×
          </button>
        </header>

        <div className="panel-rule" />

        {/* ── Grid ── */}
        <div className="grid-section">
          <p className="section-eyebrow">Quick Actions</p>
          <div className="action-grid">
            {actions.map((a) => (
              <button
                key={a.id}
                className={[
                  "action-btn",
                  pressed === a.id ? "is-pressed" : "",
                  a.id === "mic" && micMuted ? "is-muted" : "",
                  a.id === "snippets" && showSnippets ? "is-active" : "",
                ].filter(Boolean).join(" ")}
                onPointerDown={() => setPressed(a.id)}
                onPointerUp={() => { setPressed(null); runCommand(a.id); }}
                onPointerLeave={() => setPressed(null)}
                onMouseEnter={() => setHovered(a.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="btn-icon">
                  {a.id === "mic"
                    ? <MicIcon muted={micMuted} />
                    : BTN_ICONS[a.id]}
                </span>
                <span className="btn-label">{a.label}</span>
              </button>
            ))}
          </div>

          {/* ── Snippets drawer (replaces info-bar when open) ── */}
          {showSnippets ? (
            <div className="snippets-drawer">
              <p className="snippets-eyebrow">Tap to copy</p>
              {SNIPPET_LIST.map((s) => (
                <button
                  key={s.id}
                  className="snippet-row"
                  onPointerUp={() =>
                    invoke("copy_to_clipboard", { text: s.text })
                      .then(() => showToast(`Copied: ${s.label}`, true))
                      .catch((e: unknown) => showToast(String(e), false))
                  }
                >
                  <span className="snippet-label">{s.label}</span>
                  <span className="snippet-value">{s.text}</span>
                  <CopyIcon />
                </button>
              ))}
            </div>
          ) : (
            <div className={`info-bar${hoveredAction ? " info-bar--visible" : ""}`}>
              <span className="info-icon">ℹ</span>
              <span className="info-text">{hoveredAction?.description ?? ""}</span>
            </div>
          )}
        </div>

        {/* ── Status bar ── */}
        <footer className="status-bar">
          <span className="status-beacon" />
          <span className="status-copy">{actions.length} actions ready</span>
        </footer>

        {/* ── Resize handle — absolute so it stays visible when panel shrinks ── */}
        <div className="resize-handle" onPointerDown={handleResizeStart} title="Drag to resize">
          <ResizeCorner />
        </div>

      </div>
    </div>
  );
}

// ─── Button icons ─────────────────────────────────────────────────────────────

const BTN_ICONS: Record<string, React.ReactNode> = {
  recycle:   "🗑️",
  folder:    "📁",
  clipboard: "📋",
  display:   "🖥️",
  panic:     "🔕",
  ram:       "💾",
  snippets:  "✂️",
};

// ─── SVG icon components ──────────────────────────────────────────────────────

function MicIcon({ muted }: { muted: boolean }) {
  const c = muted ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.88)";
  // Compact viewBox — only the mic area, no extra whitespace
  return (
    <svg width="14" height="16" viewBox="4 1 16 22" fill="none" aria-hidden style={{ display: "block" }}>
      <rect x="9" y="2" width="6" height="12" rx="3" fill={c} />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="12" y1="18" x2="12" y2="21" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <line x1="8"  y1="21" x2="16" y2="21" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {muted && (
        <line x1="5" y1="4" x2="19" y2="20" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
      )}
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden style={{ flexShrink: 0, opacity: 0.45 }}>
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function ResizeCorner() {
  // Classic bottom-right resize grip: 3 diagonal parallel lines
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <line x1="10" y1="2"  x2="2"  y2="10"/>
      <line x1="10" y1="6"  x2="6"  y2="10"/>
      <line x1="10" y1="10" x2="10" y2="10"/>
    </svg>
  );
}
