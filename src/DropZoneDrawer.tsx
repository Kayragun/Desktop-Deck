import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icon";

export interface DroppedFile {
  path: string;
  name: string;
  ext: string;
}

interface DropZoneDrawerProps {
  files: DroppedFile[];
  setFiles: React.Dispatch<React.SetStateAction<DroppedFile[]>>;
  showToast: (msg: string, ok: boolean) => void;
}

function fileIconName(ext: string): string {
  const e = ext.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","bmp","svg","ico","avif","heic"].includes(e)) return "image";
  if (["mp3","wav","flac","aac","ogg","m4a","opus"].includes(e)) return "music";
  if (["mp4","avi","mkv","mov","wmv","flv","webm"].includes(e)) return "video";
  if (["zip","rar","7z","tar","gz","bz2","xz"].includes(e)) return "archive";
  if (["js","ts","jsx","tsx","py","rs","go","java","cpp","c","cs","html","css"].includes(e)) return "code";
  if (["exe","msi","bat","cmd","ps1","sh"].includes(e)) return "gear";
  if (["json","yaml","yml","toml","xml","ini","env"].includes(e)) return "gear";
  if (["docx","doc","pdf","md","txt","rtf","xlsx","xls","csv","ods"].includes(e)) return "file";
  return "file";
}

function parsePath(path: string): { name: string; ext: string } {
  const name = path.replace(/\\/g, "/").split("/").pop() || path;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  return { name, ext };
}

export function DropZoneDrawer({ files, setFiles, showToast }: DropZoneDrawerProps) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview().onDragDropEvent((event) => {
      const type = event.payload.type;
      if (type === "enter" || type === "over") {
        setIsDragging(true);
      } else if (type === "leave") {
        setIsDragging(false);
      } else if (type === "drop") {
        setIsDragging(false);
        const paths: string[] = (event.payload as { type: "drop"; paths: string[] }).paths ?? [];
        if (paths.length === 0) return;
        setFiles(prev => {
          const existing = new Set(prev.map(f => f.path));
          const fresh = paths
            .filter(p => !existing.has(p))
            .map(p => ({ path: p, ...parsePath(p) }));
          return [...prev, ...fresh];
        });
      }
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [setFiles]);

  const removeFile = (path: string) => setFiles(prev => prev.filter(f => f.path !== path));

  return (
    <div className="dz-drawer">
      <div className="dz-header-row">
        <span className="dz-eyebrow">Drop Zone</span>
        {files.length > 0 && (
          <button className="dz-clear-btn" onPointerUp={() => setFiles([])}>
            Clear all
          </button>
        )}
      </div>

      <div className={`dz-target${isDragging ? " dz-target--active" : ""}${files.length > 0 ? " dz-target--has-files" : ""}`}>
        {files.length === 0 ? (
          <div className="dz-empty">
            <span className="dz-drop-icon"><Icon name="dropzone" size={18} /></span>
            <span className="dz-hint">{isDragging ? "Release to add" : "Drop files here"}</span>
          </div>
        ) : (
          <div className="dz-list">
            {files.map(f => (
              <div key={f.path} className="dz-row">
                <span className="dz-file-icon"><Icon name={fileIconName(f.ext)} size={11} /></span>
                <span className="dz-name" title={f.path}>{f.name}</span>
                <div className="dz-actions">
                  <button
                    className="dz-act-btn"
                    title="Open file"
                    onPointerUp={() =>
                      invoke("open_file", { path: f.path })
                        .catch((e: unknown) => showToast(String(e), false))
                    }
                  ><Icon name="chevron" size={9} /></button>
                  <button
                    className="dz-act-btn"
                    title="Show in Explorer"
                    onPointerUp={() =>
                      invoke("open_file_location", { path: f.path })
                        .catch((e: unknown) => showToast(String(e), false))
                    }
                  ><Icon name="folder" size={9} /></button>
                  <button
                    className="dz-act-btn"
                    title="Copy path"
                    onPointerUp={() =>
                      invoke("copy_to_clipboard", { text: f.path })
                        .then(() => showToast("Path copied", true))
                        .catch((e: unknown) => showToast(String(e), false))
                    }
                  ><Icon name="copy" size={9} /></button>
                  <button
                    className="dz-act-btn dz-act-remove"
                    title="Remove"
                    onPointerUp={() => removeFile(f.path)}
                  ><Icon name="close" size={9} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
