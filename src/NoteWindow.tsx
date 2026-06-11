import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";

interface Note {
  id: string;
  content: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  font_size: number;
}

const NOTE_COLORS: Record<string, string> = {
  yellow: "#fbbf24",
  green:  "#34d399",
  purple: "#3b76f5",
  pink:   "#f472b6",
  slate:  "#94a3b8",
};

export function NoteWindow() {
  const id = getCurrentWindow().label.startsWith("note-")
    ? getCurrentWindow().label.slice(5)
    : "";

  const [note, setNote]               = useState<Note | null>(null);
  const [opacity, setOpacity]         = useState(0.92);
  const [fontSize, setFontSize]       = useState(11.5);
  const [editing, setEditing]         = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const opacityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    invoke<Note | null>("get_note", { id }).then((n) => {
      if (n) {
        setNote(n);
        setOpacity(Math.max(0.25, n.opacity ?? 0.92));
        setFontSize(n.font_size ?? 11.5);
        setEditContent(n.content);
      }
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (editing && textareaRef.current) textareaRef.current.focus();
  }, [editing]);

  const handleFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = Math.min(20, Math.max(9, Math.round((prev + delta) * 2) / 2));
      if (fontTimer.current) clearTimeout(fontTimer.current);
      fontTimer.current = setTimeout(() => {
        invoke("save_note_font_size", { id, fontSize: next }).catch(() => {});
      }, 300);
      return next;
    });
  }, [id]);

  const handleOpacity = useCallback((val: number) => {
    setOpacity(val);
    if (opacityTimer.current) clearTimeout(opacityTimer.current);
    opacityTimer.current = setTimeout(() => {
      invoke("save_note_opacity", { id, opacity: val }).catch(() => {});
    }, 300);
  }, [id]);

  const handleSaveEdit = useCallback(() => {
    if (!editContent.trim()) return;
    invoke("update_note_content", { id, content: editContent.trim() }).catch(() => {});
    setNote((prev) => prev ? { ...prev, content: editContent.trim() } : prev);
    setEditing(false);
  }, [id, editContent]);

  // ── Drag: identical to main Desktop Deck window ────────────────────────────
  const handleDragStart = useCallback(async (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType !== "mouse") return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button,textarea,input")) return;
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
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      if (rafId !== null) cancelAnimationFrame(rafId);
      
      // Removed save_note_position here because main.rs handles WindowEvent::Moved automatically
    }, { once: true });
  }, []);

  const handleResizeStart = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const el        = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX    = e.screenX;
    const startY    = e.screenY;
    el.setPointerCapture(pointerId);

    const win = getCurrentWindow();
    const dpr = window.devicePixelRatio || 1;
    const { width: initW, height: initH } = await win.outerSize();

    const minW = Math.round(200 * dpr);
    const minH = Math.round(160 * dpr);
    let newW = initW, newH = initH;

    const onMove = (ev: PointerEvent) => {
      newW = Math.max(minW, Math.round(initW + (ev.screenX - startX) * dpr));
      newH = Math.max(minH, Math.round(initH + (ev.screenY - startY) * dpr));
      invoke("resize_note_window", { width: newW, height: newH }).catch(() => {});
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", () => {
      el.removeEventListener("pointermove", onMove);
      invoke("save_note_size", {
        id,
        w: Math.round(newW / dpr),
        h: Math.round(newH / dpr),
      }).catch(() => {});
    }, { once: true });
  }, [id]);

  if (!note) return null;

  const accent = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;

  return (
    <div className="nw-root" style={{ opacity, borderTopColor: accent }}>

      {/* Header — drag handle */}
      <div className="nw-header" onPointerDown={handleDragStart}>
        <div className="nw-accent-pill" style={{ background: accent }} />
        <span className="nw-drag-hint">· · ·</span>
      </div>

      {/* Body */}
      <div className="nw-body">
        {editing ? (
          <>
            <textarea
              ref={textareaRef}
              className="nw-textarea"
              style={{ fontSize: `${fontSize}px` }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setEditContent(note.content); setEditing(false); }
                if (e.key === "Enter" && e.ctrlKey) handleSaveEdit();
              }}
            />
            <div className="nw-edit-row">
              <button className="nw-save-btn" onPointerUp={(e) => { e.stopPropagation(); handleSaveEdit(); }}>Save</button>
              <button className="nw-cancel-btn" onPointerUp={(e) => { e.stopPropagation(); setEditing(false); }}>Cancel</button>
            </div>
          </>
        ) : (
          <p
            className="nw-content"
            style={{ fontSize: `${fontSize}px` }}
            onDoubleClick={() => { setEditContent(note.content); setEditing(true); }}
            title="Double-click to edit"
          >
            {note.content}
          </p>
        )}
      </div>

      {/* Settings panel — kalem butonuyla açılır */}
      {showSettings && (
        <div className="nw-settings-panel">
          <div className="nw-settings-row">
            <span className="nw-settings-label">Aa</span>
            <button className="nw-font-btn" onPointerUp={() => handleFontSize(-0.5)}>−</button>
            <span className="nw-font-val">{fontSize % 1 === 0 ? fontSize : fontSize.toFixed(1)}</span>
            <button className="nw-font-btn" onPointerUp={() => handleFontSize(+0.5)}>+</button>
            <div className="nw-settings-spacer" />
            <button
              className="nw-settings-done"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => { e.stopPropagation(); setShowSettings(false); }}
            ><Icon name="check" size={10} /></button>
          </div>
          <div className="nw-settings-row">
            <span className="nw-settings-label"><Icon name="opacity" size={10} /></span>
            <input
              type="range"
              className="nw-opacity-slider"
              min={0.25}
              max={1.0}
              step={0.05}
              value={opacity}
              onChange={(e) => handleOpacity(parseFloat(e.target.value))}
              title={`Opacity: ${Math.round(opacity * 100)}%`}
            />
            <span className="nw-opacity-val">{Math.round(opacity * 100)}%</span>
          </div>
        </div>
      )}

      {/* Footer — sadece kalem butonu */}
      <div className="nw-footer">
        <button
          className={`nw-pencil-btn${showSettings ? " is-open" : ""}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => { e.stopPropagation(); setShowSettings(v => !v); }}
          title="Appearance settings"
        >
          <Icon name="pencil" size={11} />
        </button>
      </div>

      {/* Resize handle */}
      <div className="nw-resize-handle" onPointerDown={handleResizeStart} title="Resize">
        <NwResizeCorner />
      </div>
    </div>
  );
}

function NwResizeCorner() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <line x1="10" y1="2"  x2="2"  y2="10"/>
      <line x1="10" y1="6"  x2="6"  y2="10"/>
      <line x1="10" y1="10" x2="10" y2="10"/>
    </svg>
  );
}
