import { useState, useCallback, useEffect, useRef } from "react";
import { DecisionDrawer } from "./DecisionDrawer";
import { StickyNotesDrawer } from "./StickyNotesDrawer";
import { DropZoneDrawer, DroppedFile } from "./DropZoneDrawer";
import { FileConverterDrawer } from "./FileConverterDrawer";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snippet { id: string; label: string; text: string; }
interface Action   { id: string; label: string; description: string; }
interface Toast    { msg: string; ok: boolean; key: number; }

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

const STATIC_ACTIONS: Action[] = [
  { id: "recycle",   label: "Recycle Bin", description: "Empties the Windows Recycle Bin. A confirmation dialog will appear." },
  { id: "folder",    label: "New Folder",   description: "Creates a new empty folder on your Desktop." },
  { id: "clipboard", label: "Clipboard",    description: "Clears the entire Windows clipboard. Useful after copying sensitive data." },
  { id: "display",   label: "Display",      description: "Opens Windows display projection settings (Win+P)." },
  { id: "panic",     label: "Panic",        description: "Minimizes all open windows and mutes audio. Mute stays until you restore it." },
  { id: "mic",       label: "Mic On",       description: "Microphone is active — click to mute." },
  { id: "ram",       label: "RAM Flush",    description: "Flushes working set memory across all processes to free up RAM." },
  { id: "snippets",  label: "Snippets",     description: "Click any snippet to copy it to clipboard." },
  { id: "cleaner",   label: "Cleaner",      description: "Locks keyboard for physical cleaning. Click 'Stop Cleaning' or wait 60s to unlock." },
  { id: "decision",  label: "Decision",     description: "Can't decide? Flip a coin, roll a dice, or spin the wheel." },
  { id: "sticky",    label: "Sticky Notes", description: "Floating notes on your desktop. Drag, resize, adjust opacity and font size per note." },
  { id: "dropzone",  label: "Drop Zone",    description: "Drag files here to stage them temporarily. Open, copy path, or reveal in Explorer." },
  { id: "converter", label: "Converter",    description: "Convert images between PNG, JPG, WEBP and BMP formats. Drop images, pick output folder." },
];

export default function App() {
  return <MainView />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MainView
// ═══════════════════════════════════════════════════════════════════════════════

function MainView() {
  const [active, setActive]               = useState(false);
  const [pressed, setPressed]             = useState<string | null>(null);
  const [hovered, setHovered]             = useState<string | null>(null);
  const [toast, setToast]                 = useState<Toast | null>(null);
  const [micMuted, setMicMuted]           = useState(false);
  const [showSnippets, setShowSnippets]   = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [snippets, setSnippets]           = useState<Snippet[]>([]);
  const [newLabel, setNewLabel]           = useState("");
  const [newText, setNewText]             = useState("");
  const [editMode, setEditMode]           = useState(false);
  const [cleanerActive, setCleanerActive]   = useState(false);
  const [cleanerSecs, setCleanerSecs]       = useState(60);
  const [showDecision, setShowDecision]     = useState(false);
  const [showSticky, setShowSticky]         = useState(false);
  const [showDropZone, setShowDropZone]     = useState(false);
  const [dropZoneFiles, setDropZoneFiles]   = useState<DroppedFile[]>([]);
  const [showConverter, setShowConverter]   = useState(false);
  const [inactiveOpacity, setInactiveOpacity] = useState(() =>
    Math.max(0.25, parseFloat(localStorage.getItem("dd-opacity") ?? "0.25"))
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<boolean>("get_mic_state").then(setMicMuted).catch(() => {});
    invoke<Snippet[]>("get_snippets").then(setSnippets).catch(() => {});
  }, []);

  // Cleaner mode: countdown + polling for external deactivation (Ctrl+F12 / timeout)
  useEffect(() => {
    if (!cleanerActive) return;
    setCleanerSecs(60);

    const countdown = setInterval(() => {
      setCleanerSecs((s) => (s > 1 ? s - 1 : 1));
    }, 1000);

    const poll = setInterval(async () => {
      const still = await invoke<boolean>("get_cleaner_active").catch(() => false);
      if (!still) setCleanerActive(false);
    }, 500);

    return () => { clearInterval(countdown); clearInterval(poll); };
  }, [cleanerActive]);

  const showToast = useCallback((msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const persistSnippets = useCallback((updated: Snippet[]) => {
    setSnippets(updated);
    invoke("save_snippets", { snippets: updated }).catch(() => {});
  }, []);

  const addSnippet = useCallback(() => {
    if (!newLabel.trim() || !newText.trim()) return;
    persistSnippets([
      ...snippets,
      { id: Date.now().toString(), label: newLabel.trim(), text: newText.trim() },
    ]);
    setNewLabel("");
    setNewText("");
  }, [newLabel, newText, snippets, persistSnippets]);

  const deleteSnippet = useCallback((id: string) => {
    persistSnippets(snippets.filter((s) => s.id !== id));
  }, [snippets, persistSnippets]);

  const runCommand = useCallback((id: string) => {
    if (id === "snippets") { setShowSnippets((v) => !v);  setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowDropZone(false); setShowConverter(false); return; }
    if (id === "decision") { setShowDecision((v) => !v);  setShowSnippets(false); setShowSettings(false); setShowSticky(false); setShowDropZone(false); setShowConverter(false); return; }
    if (id === "sticky")   { setShowSticky((v) => !v);    setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowDropZone(false); setShowConverter(false); return; }
    if (id === "dropzone")  { setShowDropZone((v) => !v);  setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowConverter(false); return; }
    if (id === "converter") { setShowConverter((v) => !v); setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowDropZone(false); return; }
    if (id === "cleaner") {
      invoke("start_cleaner").then(() => setCleanerActive(true)).catch(() => {});
      return;
    }
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

  // JS-based drag
  const handleDragStart = useCallback(async (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType !== "mouse") return;
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

  // Resize handle
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
      const newH = Math.max(Math.round(520 * dpr), Math.round(initH + (ev.screenY - startY) * dpr));
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
      style={{ opacity: active ? 1 : inactiveOpacity }}
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

          {/* ── Cleaner mode overlay ── */}
          {cleanerActive ? (
            <div className="cleaner-overlay">
              <div className="cleaner-icon">🧹</div>
              <p className="cleaner-title">Keyboard Locked</p>
              <p className="cleaner-hint">Click the button below to stop</p>
              <p className="cleaner-countdown">{cleanerSecs}s</p>
              <button
                className="cleaner-stop-btn"
                onPointerUp={() => {
                  invoke("stop_cleaner").then(() => setCleanerActive(false)).catch(() => {});
                }}
              >
                Stop Cleaning
              </button>
            </div>
          ) : (
            <>
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
                    a.id === "decision" && showDecision   ? "is-active" : "",
                    a.id === "sticky"   && showSticky    ? "is-active" : "",
                    a.id === "dropzone"  && (showDropZone || dropZoneFiles.length > 0) ? "is-active" : "",
                    a.id === "converter" && showConverter ? "is-active" : "",
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

              {/* ── Snippets drawer ── */}
              {showSnippets && !showSettings && (
                <div className="snippets-drawer">
                  <div className="snippets-eyebrow-row">
                    <span className="snippets-eyebrow">Tap to copy</span>
                    <button
                      className="snippets-settings-btn"
                      title="Manage snippets"
                      onPointerUp={(e) => { e.stopPropagation(); setShowSettings(true); }}
                    >
                      ⚙
                    </button>
                  </div>
                  {snippets.length === 0 && (
                    <p className="snippet-empty">No snippets yet — click ⚙ to add one.</p>
                  )}
                  {snippets.map((s) => (
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
              )}

              {/* ── Inline settings panel ── */}
              {showSnippets && showSettings && (
                <div className="snippets-drawer settings-panel">
                  <div className="snippets-eyebrow-row">
                    <button
                      className="snippets-settings-btn"
                      onPointerUp={(e) => { e.stopPropagation(); setShowSettings(false); setEditMode(false); }}
                      title="Back"
                    >
                      ← Back
                    </button>
                    <button
                      className={`snippets-settings-btn${editMode ? " is-edit-active" : ""}`}
                      onPointerUp={(e) => { e.stopPropagation(); setEditMode((v) => !v); }}
                    >
                      {editMode ? "✓ Done" : "✏ Edit"}
                    </button>
                  </div>

                  <div className="settings-snippet-list">
                    {snippets.length === 0 && (
                      <p className="snippet-empty">No snippets yet.</p>
                    )}
                    {snippets.map((s) => (
                      <div key={s.id} className="settings-snippet-row">
                        <span className="snippet-label">{s.label}</span>
                        <span className="snippet-value">{s.text}</span>
                        {editMode && (
                          <button
                            className="settings-delete-btn"
                            onPointerUp={(e) => { e.stopPropagation(); deleteSnippet(s.id); }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="settings-add-row">
                    <input
                      className="settings-input"
                      placeholder="Label"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSnippet()}
                    />
                    <input
                      className="settings-input"
                      placeholder="Text to copy"
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSnippet()}
                    />
                    <button
                      className="settings-add-btn"
                      onPointerUp={(e) => { e.stopPropagation(); addSnippet(); }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}

              {/* ── Decision maker drawer ── */}
              {showDecision && <DecisionDrawer showToast={showToast} />}

              {/* ── Sticky Notes drawer ── */}
              {showSticky && <StickyNotesDrawer showToast={showToast} />}

              {/* ── File Converter drawer ── */}
              {showConverter && <FileConverterDrawer showToast={showToast} />}

              {/* ── Drop Zone drawer ── */}
              {showDropZone && (
                <DropZoneDrawer
                  files={dropZoneFiles}
                  setFiles={setDropZoneFiles}
                  showToast={showToast}
                />
              )}

              {/* ── Info bar (hover description) ── */}
              {!showSnippets && !showDecision && !showSticky && !showDropZone && !showConverter && (
                <div className={`info-bar${hoveredAction ? " info-bar--visible" : ""}`}>
                  <span className="info-icon">ℹ</span>
                  <span className="info-text">{hoveredAction?.description ?? ""}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Opacity control ── */}
        <div className="opacity-bar">
          <span className="opacity-icon">◑</span>
          <input
            type="range"
            className="opacity-slider"
            min={0.25}
            max={0.80}
            step={0.05}
            value={inactiveOpacity}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setInactiveOpacity(v);
              localStorage.setItem("dd-opacity", String(v));
            }}
            title={`Idle opacity: ${Math.round(inactiveOpacity * 100)}%`}
          />
          <span className="opacity-val">{Math.round(inactiveOpacity * 100)}%</span>
        </div>

        {/* ── Status bar ── */}
        <footer className="status-bar">
          <span className="status-beacon" />
          <span className="status-copy">{actions.length} actions ready</span>
        </footer>

        {/* ── Resize handle ── */}
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
  cleaner:   "🧹",
  decision:  "🎯",
  sticky:    "📝",
  dropzone:  "📥",
  converter: "🔄",
};

// ─── SVG icon components ──────────────────────────────────────────────────────

function MicIcon({ muted }: { muted: boolean }) {
  const c = muted ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.88)";
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
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <line x1="10" y1="2"  x2="2"  y2="10"/>
      <line x1="10" y1="6"  x2="6"  y2="10"/>
      <line x1="10" y1="10" x2="10" y2="10"/>
    </svg>
  );
}
