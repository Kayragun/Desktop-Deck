import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Note {
  id: string;
  content: string;
  color: string;
}

interface Props {
  showToast: (msg: string, ok: boolean) => void;
}

const NOTE_COLORS: Record<string, string> = {
  yellow: "#fbbf24",
  green:  "#34d399",
  purple: "#7c6af7",
  pink:   "#f472b6",
  slate:  "#94a3b8",
};

export function StickyNotesDrawer({ showToast }: Props) {
  const [notes, setNotes]           = useState<Note[]>([]);
  const [adding, setAdding]         = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor]     = useState("yellow");
  const [editing, setEditing]       = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const addRef  = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    invoke<Note[]>("get_notes").then(setNotes).catch(() => {});
  }, []);

  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const persist = (updated: Note[]) => {
    setNotes(updated);
    invoke("save_notes", { notes: updated }).catch(() => {});
  };

  const addNote = () => {
    if (!newContent.trim()) return;
    const note: Note = { id: Date.now().toString(), content: newContent.trim(), color: newColor };
    persist([note, ...notes]);
    setNewContent("");
    setNewColor("yellow");
    setAdding(false);
    showToast("Note added", true);
  };

  const deleteNote = (id: string) => {
    persist(notes.filter((n) => n.id !== id));
  };

  const startEdit = (note: Note) => {
    setEditing(note.id);
    setEditContent(note.content);
  };

  const saveEdit = (id: string) => {
    if (!editContent.trim()) { deleteNote(id); setEditing(null); return; }
    persist(notes.map((n) => n.id === id ? { ...n, content: editContent.trim() } : n));
    setEditing(null);
  };

  const toggleAdd = () => {
    setAdding((v) => !v);
    setNewContent("");
    setEditing(null);
  };

  return (
    <div className="sticky-drawer">
      <div className="snippets-eyebrow-row">
        <span className="snippets-eyebrow">Sticky Notes</span>
        <button className="snippets-settings-btn" onPointerUp={(e) => { e.stopPropagation(); toggleAdd(); }}>
          {adding ? "✕ Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <div className="sticky-add-panel">
          <textarea
            ref={addRef}
            className="sticky-textarea"
            placeholder="Write a note… (Ctrl+Enter to save)"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) addNote(); }}
            rows={3}
          />
          <div className="sticky-add-footer">
            <div className="sticky-colors">
              {Object.entries(NOTE_COLORS).map(([key, hex]) => (
                <button
                  key={key}
                  className={`sticky-color-dot${newColor === key ? " is-selected" : ""}`}
                  style={{ background: hex }}
                  onPointerUp={(e) => { e.stopPropagation(); setNewColor(key); }}
                />
              ))}
            </div>
            <button className="settings-add-btn" onPointerUp={(e) => { e.stopPropagation(); addNote(); }}>
              Save
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 && !adding && (
        <p className="snippet-empty">No notes yet — click + Add.</p>
      )}

      <div className="sticky-list">
        {notes.map((note) => (
          <div
            key={note.id}
            className="sticky-card"
            style={{ borderLeftColor: NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow }}
          >
            {editing === note.id ? (
              <>
                <textarea
                  ref={editRef}
                  className="sticky-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) saveEdit(note.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  rows={3}
                />
                <div className="sticky-edit-footer">
                  <button className="sticky-edit-save" onPointerUp={(e) => { e.stopPropagation(); saveEdit(note.id); }}>✓ Save</button>
                  <button className="sticky-edit-cancel" onPointerUp={(e) => { e.stopPropagation(); setEditing(null); }}>✕</button>
                </div>
              </>
            ) : (
              <>
                <p className="sticky-content" onPointerUp={() => startEdit(note)}>{note.content}</p>
                <button
                  className="sticky-delete-btn"
                  title="Delete note"
                  onPointerUp={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
