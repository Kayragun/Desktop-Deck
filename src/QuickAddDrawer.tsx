import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icon";

export interface DeckKey {
  id: string;
  label: string;
  target: string;
  kind: "app" | "url";
  icon: string; // data:image/png;base64,… or ""
}

interface InstalledApp {
  name: string;
  path: string;
}

interface Props {
  deckKeys: DeckKey[];
  onChange: (keys: DeckKey[]) => void;
  showToast: (msg: string, ok: boolean) => void;
}

type Mode = "apps" | "url";

const LIST_LIMIT = 40;
const ICON_PREFETCH = 12;

export function QuickAddDrawer({ deckKeys, onChange, showToast }: Props) {
  const [mode, setMode]         = useState<Mode>("apps");
  const [apps, setApps]         = useState<InstalledApp[] | null>(null);
  const [query, setQuery]       = useState("");
  const [urlLabel, setUrlLabel] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [iconCache, setIconCache] = useState<Record<string, string>>({});
  const pendingIcons = useRef<Set<string>>(new Set());

  useEffect(() => {
    invoke<InstalledApp[]>("list_installed_apps")
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (apps ?? [])
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .slice(0, LIST_LIMIT);

  // Lazily pull real exe icons for the visible top of the list.
  useEffect(() => {
    for (const app of filtered.slice(0, ICON_PREFETCH)) {
      if (iconCache[app.path] !== undefined || pendingIcons.current.has(app.path)) continue;
      pendingIcons.current.add(app.path);
      invoke<string | null>("get_file_icon", { path: app.path })
        .then((url) => setIconCache((prev) => ({ ...prev, [app.path]: url ?? "" })))
        .catch(() => setIconCache((prev) => ({ ...prev, [app.path]: "" })));
    }
  }, [filtered, iconCache]);

  const isAdded = (target: string) =>
    deckKeys.some((k) => k.target.toLowerCase() === target.toLowerCase());

  const addApp = async (app: InstalledApp) => {
    if (isAdded(app.path)) { showToast("Already on the deck", false); return; }
    const icon =
      iconCache[app.path] ||
      (await invoke<string | null>("get_file_icon", { path: app.path }).catch(() => null)) ||
      "";
    onChange([
      ...deckKeys,
      { id: Date.now().toString(), label: app.name, target: app.path, kind: "app", icon },
    ]);
    showToast(`Added: ${app.name}`, true);
  };

  const addUrl = async () => {
    const raw = urlValue.trim();
    if (!raw) return;
    const target = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (isAdded(target)) { showToast("Already on the deck", false); return; }
    let label = urlLabel.trim();
    if (!label) {
      try { label = new URL(target).hostname.replace(/^www\./, ""); }
      catch { label = target; }
    }
    const icon = (await invoke<string | null>("get_url_icon").catch(() => null)) || "";
    onChange([
      ...deckKeys,
      { id: Date.now().toString(), label, target, kind: "url", icon },
    ]);
    setUrlLabel("");
    setUrlValue("");
    showToast(`Added: ${label}`, true);
  };

  const removeKey = (id: string) => onChange(deckKeys.filter((k) => k.id !== id));

  return (
    <div className="qa-drawer">
      <div className="snippets-eyebrow-row">
        <span className="snippets-eyebrow">Add Key</span>
        <div className="qa-mode-row">
          <button
            className={`fc-format-btn qa-mode-btn${mode === "apps" ? " is-active" : ""}`}
            onPointerUp={() => setMode("apps")}
          >
            Apps
          </button>
          <button
            className={`fc-format-btn qa-mode-btn${mode === "url" ? " is-active" : ""}`}
            onPointerUp={() => setMode("url")}
          >
            URL
          </button>
        </div>
      </div>

      {mode === "apps" && (
        <>
          <input
            className="settings-input"
            placeholder="Search installed apps…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="qa-list">
            {apps === null && <p className="snippet-empty">Scanning installed apps…</p>}
            {apps !== null && filtered.length === 0 && (
              <p className="snippet-empty">
                {q ? `No apps match “${query}”.` : "No apps found."}
              </p>
            )}
            {filtered.map((app) => (
              <button
                key={app.path}
                className="qa-row"
                title={app.path}
                onPointerUp={() => addApp(app)}
              >
                {iconCache[app.path] ? (
                  <img className="qa-ico" src={iconCache[app.path]} alt="" />
                ) : (
                  <span className="qa-ico-fallback"><Icon name="file" size={12} /></span>
                )}
                <span className="qa-name">{app.name}</span>
                <span className="qa-add-glyph"><Icon name="plus" size={10} /></span>
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "url" && (
        <div className="qa-url-form">
          <input
            className="settings-input"
            placeholder="Label (optional)"
            value={urlLabel}
            onChange={(e) => setUrlLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUrl()}
          />
          <input
            className="settings-input"
            placeholder="https://example.com"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUrl()}
            autoFocus
          />
          <button className="settings-add-btn" onPointerUp={addUrl}>
            <Icon name="plus" size={9} /> Add
          </button>
        </div>
      )}

      {deckKeys.length > 0 && (
        <div className="qa-mykeys">
          <span className="qa-mykeys-eyebrow">Your Keys</span>
          {deckKeys.map((k) => (
            <div key={k.id} className="qa-row qa-row--static" title={k.target}>
              {k.icon ? (
                <img className="qa-ico" src={k.icon} alt="" />
              ) : (
                <span className="qa-ico-fallback">
                  <Icon name={k.kind === "url" ? "shortcuts" : "file"} size={12} />
                </span>
              )}
              <span className="qa-name">{k.label}</span>
              <button
                className="qa-remove-btn"
                title="Remove from deck"
                onPointerUp={(e) => { e.stopPropagation(); removeKey(k.id); }}
              >
                <Icon name="close" size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
