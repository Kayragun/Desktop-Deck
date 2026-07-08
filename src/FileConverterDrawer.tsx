import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icon";

type TargetFmt = "png" | "jpg" | "webp" | "bmp";
type FileStatus = "pending" | "converting" | "done" | "error";

interface ConvertFile {
  path: string;
  name: string;
  basename: string;
  status: FileStatus;
  error?: string;
}

const FORMATS: TargetFmt[] = ["png", "jpg", "webp", "bmp"];
const SUPPORTED_EXTS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

function parseImagePath(path: string): { name: string; basename: string } | null {
  const name = path.replace(/\\/g, "/").split("/").pop() || path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) return null;
  return { name, basename: name.slice(0, dot) };
}

interface Props {
  showToast: (msg: string, ok: boolean) => void;
}

export function FileConverterDrawer({ showToast }: Props) {
  const [files, setFiles]           = useState<ConvertFile[]>([]);
  const [targetFmt, setTargetFmt]   = useState<TargetFmt>("png");
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setConverting] = useState(false);

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
        const unsupported: string[] = [];
        setFiles(prev => {
          const existing = new Set(prev.map(f => f.path));
          const fresh: ConvertFile[] = [];
          for (const p of paths) {
            if (existing.has(p)) continue;
            const parsed = parseImagePath(p);
            if (!parsed) {
              unsupported.push(p.replace(/\\/g, "/").split("/").pop() || p);
              continue;
            }
            fresh.push({ path: p, name: parsed.name, basename: parsed.basename, status: "pending" });
          }
          return [...prev, ...fresh];
        });
        if (unsupported.length > 0) {
          showToast(`Unsupported: ${unsupported.join(", ")}`, false);
        }
      }
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [showToast]);

  const handleConvert = async () => {
    const convertable = files.filter(f => f.status === "pending" || f.status === "error");
    if (convertable.length === 0 || isConverting) return;

    const folder = await invoke<string | null>("pick_output_folder");
    if (!folder) return;

    setConverting(true);
    let ok = 0;

    for (const file of convertable) {
      setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: "converting" } : f));
      const dst = `${folder}\\${file.basename}.${targetFmt}`;
      try {
        await invoke("convert_image_file", { src: file.path, dst });
        setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: "done" } : f));
        ok++;
      } catch (e) {
        setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: "error", error: String(e) } : f));
      }
    }

    setConverting(false);
    showToast(ok > 0 ? `${ok} file${ok > 1 ? "s" : ""} converted` : "Conversion failed", ok > 0);
  };

  const convertable = files.filter(f => f.status === "pending" || f.status === "error");
  const hasFiles = files.length > 0;

  return (
    <div className="fc-drawer">

      {/* Header */}
      <div className="fc-header-row">
        <span className="fc-eyebrow">Image Converter</span>
        {hasFiles && !isConverting && (
          <button className="fc-clear-btn" onPointerUp={() => setFiles([])}>
            Clear
          </button>
        )}
      </div>

      {/* Format selector */}
      <div className="fc-format-row">
        {FORMATS.map(fmt => (
          <button
            key={fmt}
            className={`fc-format-btn${targetFmt === fmt ? " is-active" : ""}`}
            onPointerUp={() => setTargetFmt(fmt)}
          >
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Drop target / file list */}
      <div className={[
        "fc-target",
        isDragging ? "fc-target--active" : "",
        hasFiles   ? "fc-target--has-files" : "",
      ].filter(Boolean).join(" ")}>
        {!hasFiles ? (
          <div className="fc-empty">
            <span className="fc-drop-icon"><Icon name="image" size={16} /></span>
            <span className="fc-hint">{isDragging ? "Release to add" : "Drop images here"}</span>
          </div>
        ) : (
          <div className="fc-list">
            {files.map(f => (
              <div key={f.path} className={`fc-row fc-row--${f.status}`} title={f.error}>
                <span className="fc-status-icon">
                  {f.status === "done"       ? <Icon name="check" size={9} />
                  : f.status === "error"     ? <Icon name="close" size={9} />
                  : f.status === "converting"? <Icon name="converter" size={9} />
                  : "·"}
                </span>
                <span className="fc-name" title={f.path}>{f.name}</span>
                <span className="fc-arrow">→ .{targetFmt}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Convert button */}
      {hasFiles && (
        <button
          className="fc-convert-btn"
          disabled={isConverting || convertable.length === 0}
          onPointerUp={handleConvert}
        >
          {isConverting
            ? "Converting…"
            : convertable.length === 0
              ? "All done"
              : `Convert ${convertable.length} file${convertable.length !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
