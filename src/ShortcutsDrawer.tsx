import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icon";

export interface Shortcut {
  id: string;
  label: string;
  target: string;
  icon: string;
}

interface Props {
  shortcuts: Shortcut[];
  onChange: (shortcuts: Shortcut[]) => void;
  showToast: (msg: string, ok: boolean) => void;
}

export function ShortcutsDrawer({ shortcuts, onChange, showToast }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode]         = useState(false);
  const [newLabel, setNewLabel]         = useState("");
  const [newTarget, setNewTarget]       = useState("");

  const launch = (s: Shortcut) => {
    invoke("open_file", { path: s.target })
      .then(() => showToast(`Opened: ${s.label}`, true))
      .catch((e: unknown) => showToast(String(e), false));
  };

  const add = () => {
    if (!newLabel.trim() || !newTarget.trim()) return;
    onChange([
      ...shortcuts,
      {
        id: Date.now().toString(),
        label: newLabel.trim(),
        target: newTarget.trim(),
        icon: "shortcuts",
      },
    ]);
    setNewLabel("");
    setNewTarget("");
  };

  const remove = (id: string) => onChange(shortcuts.filter((s) => s.id !== id));

  if (showSettings) {
    return (
      <div className="snippets-drawer settings-panel">
        <div className="snippets-eyebrow-row">
          <button
            className="snippets-settings-btn"
            onPointerUp={() => { setShowSettings(false); setEditMode(false); }}
          >
            <Icon name="back" size={9} /> Back
          </button>
          <button
            className={`snippets-settings-btn${editMode ? " is-edit-active" : ""}`}
            onPointerUp={() => setEditMode((v) => !v)}
          >
            {editMode ? <Icon name="check" size={9} /> : <Icon name="pencil" size={9} />}
            {editMode ? " Done" : " Edit"}
          </button>
        </div>

        <div className="settings-snippet-list">
          {shortcuts.length === 0 && (
            <p className="snippet-empty">No shortcuts yet.</p>
          )}
          {shortcuts.map((s) => (
            <div key={s.id} className="settings-snippet-row">
              <span className="snippet-label">{s.label}</span>
              <span className="snippet-value sc-target">{s.target}</span>
              {editMode && (
                <button
                  className="settings-delete-btn"
                  onPointerUp={(e) => { e.stopPropagation(); remove(s.id); }}
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
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            className="settings-input"
            placeholder="URL · App path · ms-settings:display"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="settings-add-btn" onPointerUp={add}>
            <Icon name="plus" size={9} /> Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="snippets-drawer">
      <div className="snippets-eyebrow-row">
        <span className="snippets-eyebrow">Click to launch</span>
        <button
          className="snippets-settings-btn"
          onPointerUp={() => setShowSettings(true)}
          title="Manage shortcuts"
        >
          <Icon name="gear" size={10} />
        </button>
      </div>

      {shortcuts.length === 0 && (
        <p className="snippet-empty">No shortcuts yet — open settings to add one.</p>
      )}

      {shortcuts.length > 0 && (
        <div className="sc-grid">
          {shortcuts.map((s) => (
            <button
              key={s.id}
              className="sc-btn"
              onPointerUp={() => launch(s)}
              title={s.label}
            >
              <span className="sc-icon"><Icon name="shortcuts" size={16} /></span>
              <span className="sc-label">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
