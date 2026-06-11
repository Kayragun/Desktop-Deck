import { useState, useCallback, useEffect, useRef } from "react";
import { DecisionDrawer } from "./DecisionDrawer";
import { StickyNotesDrawer } from "./StickyNotesDrawer";
import { DropZoneDrawer, DroppedFile } from "./DropZoneDrawer";
import { FileConverterDrawer } from "./FileConverterDrawer";
import { ShortcutsDrawer, Shortcut } from "./ShortcutsDrawer";
import { QuickAddDrawer, DeckKey } from "./QuickAddDrawer";
import { Icon } from "./Icon";
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
  cpu:       "open_task_manager",
};

// Window size limits in CSS px (× devicePixelRatio before IPC).
// Keep in sync with resize_window in src-tauri/src/commands.rs.
const MIN_W = 350, MIN_H = 580;
const MAX_W = 640, MAX_H = 960;

const STATIC_ACTIONS: Action[] = [
  { id: "recycle",   label: "Recycle Bin", description: "Empties the Windows Recycle Bin. A confirmation dialog will appear." },
  { id: "folder",    label: "New Folder",   description: "Creates a new empty folder on your Desktop." },
  { id: "clipboard", label: "Clipboard",    description: "Clears the entire Windows clipboard. Useful after copying sensitive data." },
  { id: "display",   label: "Display",      description: "Opens Windows display projection settings (Win+P)." },
  { id: "panic",     label: "Panic",        description: "Minimizes all open windows and mutes audio. Mute stays until you restore it." },
  { id: "camera",    label: "Camera",       description: "Camera access is allowed. Click to block all apps (OS-level)." },
  { id: "mic",       label: "Mic On",       description: "Microphone is allowed. Click to block all apps (OS-level)." },
  { id: "ram",       label: "RAM Flush",    description: "Flushes working set memory across all processes to free up RAM." },
  { id: "cpu",       label: "Task Manager", description: "Monitors CPU usage in real time. Click to open Task Manager." },
  { id: "snippets",  label: "Snippets",     description: "Click any snippet to copy it to clipboard." },
  { id: "cleaner",   label: "Cleaner",      description: "Locks keyboard for physical cleaning. Click 'Stop Cleaning' or wait 60s to unlock." },
  { id: "decision",  label: "Decision",     description: "Can't decide? Flip a coin, roll a dice, or spin the wheel." },
  { id: "sticky",    label: "Sticky Notes", description: "Floating notes on your desktop. Drag, resize, adjust opacity and font size per note." },
  { id: "dropzone",  label: "Drop Zone",    description: "Drag files here to stage them temporarily. Open, copy path, or reveal in Explorer." },
  { id: "converter", label: "Converter",    description: "Convert images between PNG, JPG, WEBP and BMP formats. Drop images, pick output folder." },
  { id: "shortcuts", label: "Shortcuts",    description: "Launch websites, apps, or Windows settings with one click. Manage them in settings." },
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
  const [cpuUsage, setCpuUsage]           = useState<number | null>(null);
  const [gpuUsage, setGpuUsage]           = useState<number | null>(null);
  const [ramUsage, setRamUsage]           = useState<number | null>(null);
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
  const [showQuickAdd, setShowQuickAdd]     = useState(false);
  const [deckKeys, setDeckKeys]             = useState<DeckKey[]>([]);
  const [inactiveOpacity, setInactiveOpacity] = useState(() =>
    Math.max(0.25, parseFloat(localStorage.getItem("dd-opacity") ?? "0.25"))
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<string>("get_camera_privacy_state").then((s) => setCamState(s as PrivacyState)).catch(() => {});
    invoke<string>("get_mic_privacy_state").then((s) => setMicState(s as PrivacyState)).catch(() => {});
    invoke<Snippet[]>("get_snippets").then(setSnippets).catch(() => {});
    invoke<Shortcut[]>("get_shortcuts").then(setShortcuts).catch(() => {});
    invoke<DeckKey[]>("get_deck_keys").then(setDeckKeys).catch(() => {});
    invoke("get_cpu_usage").catch(() => {}); // set baseline for first delta
    invoke("get_gpu_usage").catch(() => {}); // prime GPU PDH query
    invoke<number | null>("get_ram_usage").then((v) => { if (v !== null) setRamUsage(v); }).catch(() => {});
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

  useEffect(() => {
    const id = setInterval(async () => {
      const [cpu, gpu, ram] = await Promise.allSettled([
        invoke<number | null>("get_cpu_usage"),
        invoke<number | null>("get_gpu_usage"),
        invoke<number | null>("get_ram_usage"),
      ]);
      if (cpu.status === "fulfilled" && cpu.value !== null) setCpuUsage(cpu.value);
      if (gpu.status === "fulfilled" && gpu.value !== null) setGpuUsage(gpu.value);
      if (ram.status === "fulfilled" && ram.value !== null) setRamUsage(ram.value);
    }, 2000);
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

  const persistDeckKeys = useCallback((updated: DeckKey[]) => {
    setDeckKeys(updated);
    invoke("save_deck_keys", { keys: updated }).catch(() => {});
  }, []);

  const launchDeckKey = useCallback((k: DeckKey) => {
    invoke("open_file", { path: k.target })
      .then(() => showToast(`Opened: ${k.label}`, true))
      .catch((e: unknown) => showToast(String(e), false));
  }, [showToast]);

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
    // Drawers are mutually exclusive: toggling one closes the rest.
    const drawers: Record<string, [boolean, (v: boolean) => void]> = {
      snippets:  [showSnippets,  setShowSnippets],
      decision:  [showDecision,  setShowDecision],
      sticky:    [showSticky,    setShowSticky],
      dropzone:  [showDropZone,  setShowDropZone],
      converter: [showConverter, setShowConverter],
      shortcuts: [showShortcuts, setShowShortcuts],
      quickadd:  [showQuickAdd,  setShowQuickAdd],
    };
    if (id in drawers) {
      const wasOpen = drawers[id][0];
      Object.values(drawers).forEach(([, set]) => set(false));
      setShowSettings(false);
      if (!wasOpen) drawers[id][1](true);
      return;
    }
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
  }, [
    showToast, camState, micState,
    showSnippets, showDecision, showSticky, showDropZone,
    showConverter, showShortcuts, showQuickAdd,
  ]);

  // JS-based drag
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType !== "mouse") return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const target = e.target as HTMLElement;
    const pointerId = e.pointerId;
    const dpr = window.devicePixelRatio || 1;
    const startX = e.screenX;
    const startY = e.screenY;
    // Listeners must attach synchronously: awaiting before attaching lets a
    // fast click release before pointerup is registered, leaving onMove stuck.
    let initPos: { x: number; y: number } | null = null;
    getCurrentWindow().outerPosition().then((p) => { initPos = p; }).catch(() => {});
    try { target.setPointerCapture(pointerId); } catch { /* target may be gone */ }
    let rafId: number | null = null;
    let moveX = 0, moveY = 0;
    const apply = () => {
      rafId = null;
      if (initPos) invoke("move_window", { x: initPos.x + moveX, y: initPos.y + moveY }).catch(() => {});
    };
    const onMove = (ev: PointerEvent) => {
      moveX = Math.round((ev.screenX - startX) * dpr);
      moveY = Math.round((ev.screenY - startY) * dpr);
      if (rafId === null) rafId = requestAnimationFrame(apply);
    };
    const finish = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (rafId !== null) cancelAnimationFrame(rafId);
      apply(); // commit the final position the cancelled frame would have sent
      try { target.releasePointerCapture(pointerId); } catch { /* already released */ }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
  }, []);

  // Resize handle
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.screenX;
    const startY = e.screenY;
    const dpr = window.devicePixelRatio || 1;
    let initSize: { width: number; height: number } | null = null;
    getCurrentWindow().outerSize().then((s) => { initSize = s; }).catch(() => {});
    try { target.setPointerCapture(pointerId); } catch { /* target may be gone */ }
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const onMove = (ev: PointerEvent) => {
      if (!initSize) return;
      const newW = Math.round(clamp(initSize.width  + (ev.screenX - startX) * dpr, MIN_W * dpr, MAX_W * dpr));
      const newH = Math.round(clamp(initSize.height + (ev.screenY - startY) * dpr, MIN_H * dpr, MAX_H * dpr));
      invoke("resize_window", { width: newW, height: newH }).catch(() => {});
    };
    const finish = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      try { target.releasePointerCapture(pointerId); } catch { /* already released */ }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
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
    if (a.id === "cpu")    return { ...a, description: cpuUsage !== null ? `CPU usage: ${Math.round(cpuUsage)}% — Click to open Task Manager.` : "Monitors CPU usage in real time. Click to open Task Manager." };
    return a;
  });
  const hoveredAction = actions.find((a) => a.id === hovered);
  const hoveredDeckKey = deckKeys.find((k) => hovered === `dk-${k.id}`);
  const hoverInfo =
    hovered === "quickadd"
      ? "Pin an installed app or a website to the deck."
      : hoveredDeckKey
        ? hoveredDeckKey.kind === "url"
          ? `Opens ${hoveredDeckKey.target} in your browser.`
          : `Launches ${hoveredDeckKey.target}`
        : hoveredAction?.description ?? "";

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

        {/* ── Sysmon strip ── */}
        <SysMonStrip cpu={cpuUsage} gpu={gpuUsage} ram={ramUsage} onPointerDown={handleDragStart} />

        {/* ── Header ── */}
        <header className="panel-header" onPointerDown={handleDragStart}>
          <div className="header-brand">
            <div className="brand-badge"><Icon name="deck" size={14} /></div>
            <span className="brand-name">Desktop Deck</span>
          </div>
          <button
            className="hide-btn"
            title="Hide panel"
            onPointerUp={(e) => { e.stopPropagation(); invoke("hide_window"); }}
          >
            <Icon name="close" size={12} />
          </button>
        </header>

        <div className="panel-rule" />

        {/* ── Grid ── */}
        <div className="grid-section">

          {/* ── Cleaner mode overlay ── */}
          {cleanerActive ? (
            <div className="cleaner-overlay">
              <div className="cleaner-icon"><Icon name="cleaner" size={36} /></div>
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
                      {a.id === "cpu" ? <CpuIcon usage={cpuUsage} /> : BTN_ICONS[a.id]}
                    </span>
                    <span className="btn-label">{a.label}</span>
                  </button>
                ))}

                {/* ── User-pinned deck keys (dynamic shortcuts) ── */}
                {deckKeys.map((k) => (
                  <button
                    key={`dk-${k.id}`}
                    className={["action-btn", pressed === `dk-${k.id}` ? "is-pressed" : ""].filter(Boolean).join(" ")}
                    title={k.target}
                    onPointerDown={() => setPressed(`dk-${k.id}`)}
                    onPointerUp={() => { setPressed(null); launchDeckKey(k); }}
                    onPointerLeave={() => setPressed(null)}
                    onMouseEnter={() => setHovered(`dk-${k.id}`)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span className="btn-icon">
                      {k.icon
                        ? <img className="deckkey-img" src={k.icon} alt="" draggable={false} />
                        : <Icon name={k.kind === "url" ? "shortcuts" : "file"} size={18} />}
                    </span>
                    <span className="btn-label">{k.label}</span>
                  </button>
                ))}

                {/* ── Quick Add tile ── */}
                <button
                  className={[
                    "action-btn",
                    "action-btn--add",
                    pressed === "quickadd" ? "is-pressed" : "",
                    showQuickAdd ? "is-active" : "",
                  ].filter(Boolean).join(" ")}
                  onPointerDown={() => setPressed("quickadd")}
                  onPointerUp={() => { setPressed(null); runCommand("quickadd"); }}
                  onPointerLeave={() => setPressed(null)}
                  onMouseEnter={() => setHovered("quickadd")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span className="btn-icon"><Icon name="plus" size={18} /></span>
                  <span className="btn-label">Add Key</span>
                </button>
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
                      <Icon name="gear" size={10} />
                    </button>
                  </div>
                  {snippets.length === 0 && (
                    <p className="snippet-empty">No snippets yet — open settings to add one.</p>
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
                      <Icon name="back" size={9} /> Back
                    </button>
                    <button
                      className={`snippets-settings-btn${editMode ? " is-edit-active" : ""}`}
                      onPointerUp={(e) => { e.stopPropagation(); setEditMode((v) => !v); }}
                    >
                      {editMode ? <Icon name="check" size={9} /> : <Icon name="pencil" size={9} />}
                      {editMode ? " Done" : " Edit"}
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
                            <Icon name="close" size={9} />
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
                      <Icon name="plus" size={9} /> Add
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

              {/* ── Quick Add drawer (pin apps / URLs to the deck) ── */}
              {showQuickAdd && (
                <QuickAddDrawer
                  deckKeys={deckKeys}
                  onChange={persistDeckKeys}
                  showToast={showToast}
                />
              )}

              {/* ── Info bar (hover description) ── */}
              {!showSnippets && !showDecision && !showSticky && !showDropZone && !showConverter && !showShortcuts && !showQuickAdd && (
                <div className={`info-bar${hoverInfo ? " info-bar--visible" : ""}`}>
                  <span className="info-text">{hoverInfo}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Opacity control ── */}
        <div className="opacity-bar">
          <span className="opacity-icon"><Icon name="opacity" size={11} /></span>
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
          <span className="status-copy">{actions.length + deckKeys.length} actions ready</span>
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
  recycle:   <Icon name="recycle"   size={18} />,
  folder:    <Icon name="folder"    size={18} />,
  clipboard: <Icon name="clipboard" size={18} />,
  display:   <Icon name="display"   size={18} />,
  panic:     <Icon name="panic"     size={18} />,
  ram:       <Icon name="ram"       size={18} />,
  camera:    <Icon name="camera"    size={18} />,
  mic:       <Icon name="mic"       size={18} />,
  snippets:  <Icon name="snippets"  size={18} />,
  cleaner:   <Icon name="cleaner"   size={18} />,
  decision:  <Icon name="decision"  size={18} />,
  sticky:    <Icon name="sticky"    size={18} />,
  dropzone:  <Icon name="dropzone"  size={18} />,
  converter: <Icon name="converter" size={18} />,
  shortcuts: <Icon name="shortcuts" size={18} />,
};

// ─── System Monitor Strip ─────────────────────────────────────────────────────

function SysMonStrip({
  cpu, gpu, ram, onPointerDown,
}: {
  cpu: number | null; gpu: number | null; ram: number | null;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div className="sysmon-strip" onPointerDown={onPointerDown}>
      <SysMonItem label="CPU" value={cpu} color={gaugeColor(cpu)} />
      <div className="sysmon-sep" />
      <SysMonItem label="GPU" value={gpu} color={gaugeColor(gpu)} />
      <div className="sysmon-sep" />
      <SysMonItem label="RAM" value={ram} color={gaugeColor(ram)} />
    </div>
  );
}

/** Map a 0–100 load value to its semantic gauge color. null = no data. */
function gaugeColor(v: number | null): string {
  if (v === null) return "var(--dd-gauge-idle)";
  if (v > 80) return "var(--dd-gauge-crit)";
  if (v > 50) return "var(--dd-gauge-warn)";
  return "var(--dd-gauge-ok)";
}

function SysMonItem({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value ?? 0;
  return (
    <div className="sysmon-item">
      <span className="sysmon-label">{label}</span>
      <div className="sysmon-bar-wrap">
        <div className="sysmon-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="sysmon-pct" style={{ color }}>{value !== null ? `${Math.round(pct)}%` : "—"}</span>
    </div>
  );
}

// The "dynamic icon" the spec calls for: the design-system CPU frame carrying
// its live percentage, recolored by load.
function CpuIcon({ usage }: { usage: number | null }) {
  const color = gaugeColor(usage);
  const label = usage !== null ? `${Math.round(usage)}` : "--";
  const fontSize = label.length > 2 ? "4.5" : "5.5";
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block" }}
    >
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M9.5 3.5V6.5M14.5 3.5V6.5M9.5 17.5V20.5M14.5 17.5V20.5M3.5 9.5H6.5M3.5 14.5H6.5M17.5 9.5H20.5M17.5 14.5H20.5" />
      <text
        x="12" y="12.3" textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} stroke="none" style={{ fill: color }}
        fontFamily="ui-monospace,Menlo,Consolas,monospace" fontWeight="700"
      >
        {label}
      </text>
    </svg>
  );
}

function CopyIcon() {
  return <Icon name="copy" size={11} style={{ opacity: 0.45 }} />;
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
