import { useState, useCallback, useEffect, useRef } from "react";
import { DecisionDrawer } from "./DecisionDrawer";
import { StickyNotesDrawer } from "./StickyNotesDrawer";
import { DropZoneDrawer, DroppedFile } from "./DropZoneDrawer";
import { FileConverterDrawer } from "./FileConverterDrawer";
import { ShortcutsDrawer, Shortcut } from "./ShortcutsDrawer";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snippet { id: string; label: string; text: string; }
interface Action   { id: string; label: string; description: string; }
interface Toast    { msg: string; ok: boolean; key: number; }
type PrivacyState = "no_device" | "allowed" | "denied";

// ─── Command map ─────────────────────────────────────────────────────────────

const COMMANDS: Record<string, string> = {
  recycle:   "empty_recycle_bin",
  folder:    "new_desktop_folder",
  ram:       "flush_ram",
  clipboard: "clear_clipboard",
  display:   "open_display",
  panic:     "panic_button",
};

const STATIC_ACTIONS: Action[] = [
  { id: "recycle",   label: "Recycle Bin", description: "Empties the Windows Recycle Bin. A confirmation dialog will appear." },
  { id: "folder",    label: "New Folder",   description: "Creates a new empty folder on your Desktop." },
  { id: "clipboard", label: "Clipboard",    description: "Clears the entire Windows clipboard. Useful after copying sensitive data." },
  { id: "display",   label: "Display",      description: "Opens Windows display projection settings (Win+P)." },
  { id: "panic",     label: "Panic",        description: "Minimizes all open windows and mutes audio. Mute stays until you restore it." },
  { id: "camera",    label: "Camera",       description: "Camera access is allowed. Click to block all apps (OS-level)." },
  { id: "mic",       label: "Mic On",       description: "Microphone is allowed. Click to block all apps (OS-level)." },
  { id: "ram",       label: "RAM Flush",    description: "Flushes working set memory across all processes to free up RAM." },
  { id: "snippets",  label: "Snippets",     description: "Click any snippet to copy it to clipboard." },
  { id: "cleaner",   label: "Cleaner",      description: "Locks keyboard for physical cleaning. Click 'Stop Cleaning' or wait 60s to unlock." },
  { id: "decision",  label: "Decision",     description: "Can't decide? Flip a coin, roll a dice, or spin the wheel." },
  { id: "sticky",    label: "Sticky Notes", description: "Floating notes on your desktop. Drag, resize, adjust opacity and font size per note." },
  { id: "dropzone",  label: "Drop Zone",    description: "Drag files here to stage them temporarily. Open, copy path, or reveal in Explorer." },
  { id: "converter", label: "Converter",    description: "Convert images between PNG, JPG, WEBP and BMP formats. Drop images, pick output folder." },
  { id: "shortcuts", label: "Shortcuts",    description: "Launch websites, apps, or Windows settings with one click. Click ⚙ to manage your shortcuts." },
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
  const [camState, setCamState]           = useState<PrivacyState>("allowed");
  const [micState, setMicState]           = useState<PrivacyState>("allowed");
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
  const [showShortcuts, setShowShortcuts]   = useState(false);
  const [shortcuts, setShortcuts]           = useState<Shortcut[]>([]);
  const [inactiveOpacity, setInactiveOpacity] = useState(() =>
    Math.max(0.25, parseFloat(localStorage.getItem("dd-opacity") ?? "0.25"))
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<string>("get_camera_privacy_state").then((s) => setCamState(s as PrivacyState)).catch(() => {});
    invoke<string>("get_mic_privacy_state").then((s) => setMicState(s as PrivacyState)).catch(() => {});
    invoke<Snippet[]>("get_snippets").then(setSnippets).catch(() => {});
    invoke<Shortcut[]>("get_shortcuts").then(setShortcuts).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const [cs, ms] = await Promise.allSettled([
        invoke<string>("get_camera_privacy_state"),
        invoke<string>("get_mic_privacy_state"),
      ]);
      if (cs.status === "fulfilled") setCamState(cs.value as PrivacyState);
      if (ms.status === "fulfilled") setMicState(ms.value as PrivacyState);
    }, 4000);
    return () => clearInterval(id);
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

  const persistShortcuts = useCallback((updated: Shortcut[]) => {
    setShortcuts(updated);
    invoke("save_shortcuts", { shortcuts: updated }).catch(() => {});
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
    if (id === "snippets") { setShowSnippets((v) => !v);  setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowDropZone(false); setShowConverter(false); setShowShortcuts(false); return; }
    if (id === "decision") { setShowDecision((v) => !v);  setShowSnippets(false); setShowSettings(false); setShowSticky(false); setShowDropZone(false); setShowConverter(false); setShowShortcuts(false); return; }
    if (id === "sticky")   { setShowSticky((v) => !v);    setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowDropZone(false); setShowConverter(false); setShowShortcuts(false); return; }
    if (id === "dropzone")  { setShowDropZone((v) => !v);  setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowConverter(false); setShowShortcuts(false); return; }
    if (id === "converter") { setShowConverter((v) => !v);  setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowDropZone(false); setShowShortcuts(false); return; }
    if (id === "shortcuts") { setShowShortcuts((v) => !v); setShowSnippets(false); setShowSettings(false); setShowDecision(false); setShowSticky(false); setShowDropZone(false); setShowConverter(false); return; }
    if (id === "cleaner") {
      invoke("start_cleaner").then(() => setCleanerActive(true)).catch(() => {});
      return;
    }
    if (id === "camera") {
      if (camState === "no_device") return;
      const allow = camState === "denied";
      invoke<string>("set_camera_privacy", { allow })
        .then((s) => { setCamState(s as PrivacyState); showToast(allow ? "Camera unblocked" : "Camera blocked", true); })
        .catch((e: unknown) => showToast(String(e), false));
      return;
    }
    if (id === "mic") {
      if (micState === "no_device") return;
      const allow = micState === "denied";
      invoke<string>("set_mic_privacy", { allow })
        .then((s) => { setMicState(s as PrivacyState); showToast(allow ? "Mic unblocked" : "Mic blocked", true); })
        .catch((e: unknown) => showToast(String(e), false));
      return;
    }
    const cmd = COMMANDS[id];
    if (!cmd) { showToast("Coming soon", false); return; }
    invoke<string | null>(cmd)
      .then((result) => {
        const msg = typeof result === "string" && result.length ? result : "Done";
        showToast(msg, true);
      })
      .catch((err: unknown) => showToast(String(err), false));
  }, [showToast, camState, micState]);

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

  const privacyLabel = (id: "camera" | "mic", s: PrivacyState) => {
    if (s === "no_device") return id === "camera" ? "No Camera" : "No Mic";
    if (s === "denied")    return id === "camera" ? "Cam Off"   : "Mic Off";
    return id === "camera" ? "Camera" : "Mic On";
  };
  const privacyDesc = (id: "camera" | "mic", s: PrivacyState) => {
    if (s === "no_device") return `No ${id === "camera" ? "camera" : "microphone"} detected on this system.`;
    if (s === "denied")    return `${id === "camera" ? "Camera" : "Microphone"} is OS-blocked — no app can access it. Click to allow.`;
    return `${id === "camera" ? "Camera" : "Microphone"} is allowed. Click to block all apps (OS-level).`;
  };

  const actions = STATIC_ACTIONS.map((a) => {
    if (a.id === "camera") return { ...a, label: privacyLabel("camera", camState), description: privacyDesc("camera", camState) };
    if (a.id === "mic")    return { ...a, label: privacyLabel("mic", micState),    description: privacyDesc("mic", micState) };
    return a;
  });
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
                      (a.id === "mic"    && micState  === "denied")    ? "is-denied"    : "",
                      (a.id === "mic"    && micState  === "no_device") ? "is-no-device" : "",
                      (a.id === "camera" && camState  === "denied")    ? "is-denied"    : "",
                      (a.id === "camera" && camState  === "no_device") ? "is-no-device" : "",
                      a.id === "snippets" && showSnippets ? "is-active" : "",
                    a.id === "decision" && showDecision   ? "is-active" : "",
                    a.id === "sticky"   && showSticky    ? "is-active" : "",
                    a.id === "dropzone"  && (showDropZone || dropZoneFiles.length > 0) ? "is-active" : "",
                    a.id === "converter" && showConverter  ? "is-active" : "",
                    a.id === "shortcuts" && showShortcuts  ? "is-active" : "",
                    ].filter(Boolean).join(" ")}
                    onPointerDown={() => setPressed(a.id)}
                    onPointerUp={() => { setPressed(null); runCommand(a.id); }}
                    onPointerLeave={() => setPressed(null)}
                    onMouseEnter={() => setHovered(a.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span className="btn-icon">
                      {a.id === "camera"
                        ? <CameraIcon state={camState} />
                        : a.id === "mic"
                          ? <MicPrivacyIcon state={micState} />
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

              {/* ── Shortcuts drawer ── */}
              {showShortcuts && (
                <ShortcutsDrawer
                  shortcuts={shortcuts}
                  onChange={persistShortcuts}
                  showToast={showToast}
                />
              )}

              {/* ── Drop Zone drawer ── */}
              {showDropZone && (
                <DropZoneDrawer
                  files={dropZoneFiles}
                  setFiles={setDropZoneFiles}
                  showToast={showToast}
                />
              )}

              {/* ── Info bar (hover description) ── */}
              {!showSnippets && !showDecision && !showSticky && !showDropZone && !showConverter && !showShortcuts && (
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
  shortcuts: "⚡",
};

// ─── SVG icon components ──────────────────────────────────────────────────────

function CameraIcon({ state }: { state: PrivacyState }) {
  const opacity = state === "no_device" ? 0.28 : 1;
  const c = state === "denied" ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.88)";
  return (
    <svg width="16" height="14" viewBox="0 0 24 20" fill="none" aria-hidden style={{ display: "block", opacity }}>
      <rect x="1" y="5" width="22" height="14" rx="3" fill={c} />
      <circle cx="12" cy="12" r="4" fill={state === "denied" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.35)"} />
      <circle cx="12" cy="12" r="2.2" fill={state === "denied" ? "rgba(255,255,255,0.10)" : c} />
      <path d="M8 5V3.5A1.5 1.5 0 0 1 9.5 2h5A1.5 1.5 0 0 1 16 3.5V5" stroke={c} strokeWidth="1.5" fill="none"/>
      {state === "denied" && (
        <line x1="3" y1="3" x2="21" y2="19" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
      )}
    </svg>
  );
}

function MicPrivacyIcon({ state }: { state: PrivacyState }) {
  const opacity = state === "no_device" ? 0.28 : 1;
  const c = state === "denied" ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.88)";
  return (
    <svg width="14" height="16" viewBox="4 1 16 22" fill="none" aria-hidden style={{ display: "block", opacity }}>
      <rect x="9" y="2" width="6" height="12" rx="3" fill={c} />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="12" y1="18" x2="12" y2="21" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <line x1="8"  y1="21" x2="16" y2="21" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {state === "denied" && (
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
