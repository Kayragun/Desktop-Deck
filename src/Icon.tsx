import React from "react";

/**
 * Desktop Deck — custom monoline icon set (design system).
 *
 * 24×24 grid, 1.7px stroke, round caps & joins. Every icon inherits
 * `currentColor`, so deck-key states (default / accent-active / red-denied /
 * load-colored) tint them for free. Never use emoji or icon fonts.
 *
 * Usage:  <Icon name="shortcuts" size={18} />
 */

// ── Path geometry, one entry per icon ──────────────────────────────────────
// Each value is the inner markup of a 0 0 24 24 SVG. Strokes use currentColor.
export const ICON_PATHS: Record<string, string> = {
  // ── Brand ──────────────────────────────────────────────────────────────
  // The product mark: a 2×2 deck of keycaps, one key "lit". Filled, not stroked.
  deck:
    '<rect x="3.5" y="3.5" width="7.4" height="7.4" rx="2.2" fill="currentColor" opacity="0.22"/>' +
    '<rect x="13.1" y="3.5" width="7.4" height="7.4" rx="2.2" fill="currentColor"/>' +
    '<rect x="3.5" y="13.1" width="7.4" height="7.4" rx="2.2" fill="currentColor" opacity="0.22"/>' +
    '<rect x="13.1" y="13.1" width="7.4" height="7.4" rx="2.2" fill="currentColor" opacity="0.22"/>',

  // ── Deck actions ───────────────────────────────────────────────────────
  recycle:
    '<path d="M4 7h16"/><path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7"/>' +
    '<path d="M6.4 7l.9 11.7A1.4 1.4 0 0 0 8.7 20h6.6a1.4 1.4 0 0 0 1.4-1.3L17.6 7"/>' +
    '<path d="M10 11v5"/><path d="M14 11v5"/>',
  folder:
    '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l1.8 2h7A1.5 1.5 0 0 1 19 8.5"/>' +
    '<path d="M3 6.8v9.7A1.5 1.5 0 0 0 4.5 18h13a1.5 1.5 0 0 0 1.5-1.5V9.2A1.5 1.5 0 0 0 17.5 7.7H3"/>' +
    '<path d="M11 11v4"/><path d="M9 13h4"/>',
  clipboard:
    '<rect x="6" y="4.5" width="12" height="16" rx="1.8"/>' +
    '<path d="M9.2 4.5V3.7A1.2 1.2 0 0 1 10.4 2.5h3.2a1.2 1.2 0 0 1 1.2 1.2v.8"/>' +
    '<path d="M9 9.5h6"/><path d="M9 13h6"/><path d="M9 16.5h3.5"/>',
  display:
    '<rect x="2.5" y="4.5" width="19" height="12" rx="1.8"/>' +
    '<path d="M9 20h6"/><path d="M12 16.5V20"/><path d="M8 9.5l3 2.5l-3 2.5"/><path d="M13.5 14.5h3"/>',
  panic:
    '<path d="M12 2.8l7 2.6v5.2c0 4.3-3 7.2-7 8.6c-4-1.4-7-4.3-7-8.6V5.4Z"/>' +
    '<path d="M9 11l3 3l3-3"/>',
  camera:
    '<rect x="3" y="6" width="18" height="13" rx="2"/>' +
    '<circle cx="12" cy="12.5" r="3.2"/><circle cx="17.3" cy="9.4" r="0.9" fill="currentColor" stroke="none"/>',
  mic:
    '<rect x="9" y="3" width="6" height="11" rx="3"/>' +
    '<path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3.2"/><path d="M9 20.5h6"/>',
  ram:
    '<rect x="3" y="8" width="18" height="8" rx="1.4"/>' +
    '<rect x="7" y="10.5" width="3.2" height="3" rx="0.6"/><rect x="13.8" y="10.5" width="3.2" height="3" rx="0.6"/>' +
    '<path d="M6 16v2.2"/><path d="M9.5 16v2.2"/><path d="M14.5 16v2.2"/><path d="M18 16v2.2"/>',
  cpu:
    '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>' +
    '<path d="M9.5 3.5V6.5"/><path d="M14.5 3.5V6.5"/><path d="M9.5 17.5V20.5"/><path d="M14.5 17.5V20.5"/>' +
    '<path d="M3.5 9.5H6.5"/><path d="M3.5 14.5H6.5"/><path d="M17.5 9.5H20.5"/><path d="M17.5 14.5H20.5"/>' +
    '<rect x="10" y="10" width="4" height="4" rx="0.8"/>',
  snippets:
    '<rect x="9" y="9" width="10.5" height="10.5" rx="2"/>' +
    '<path d="M14.5 9V6.5A1.5 1.5 0 0 0 13 5H6A1.5 1.5 0 0 0 4.5 6.5v7A1.5 1.5 0 0 0 6 15h2.5"/>' +
    '<path d="M12 13h4.5"/><path d="M12 16h4.5"/>',
  cleaner:
    '<rect x="3" y="6.5" width="18" height="11" rx="2"/>' +
    '<path d="M6.5 10h.01"/><path d="M9.5 10h.01"/><path d="M12.5 10h.01"/><path d="M15.5 10h.01"/>' +
    '<path d="M8 14h8"/><path d="M18 4.5l.7 1.4l1.4.7l-1.4.7l-.7 1.4l-.7-1.4l-1.4-.7l1.4-.7Z" fill="currentColor" stroke="none"/>',
  decision:
    '<rect x="4.5" y="4.5" width="15" height="15" rx="3.2"/>' +
    '<circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>',
  sticky:
    '<path d="M5 4.8A1.8 1.8 0 0 1 6.8 3h8.4L20 7.8V19.2A1.8 1.8 0 0 1 18.2 21H6.8A1.8 1.8 0 0 1 5 19.2Z"/>' +
    '<path d="M15 3v3.2A1.6 1.6 0 0 0 16.6 7.8H20"/>' +
    '<path d="M8.5 12h7"/><path d="M8.5 15.5h4.5"/>',
  dropzone:
    '<path d="M4 13.5v3A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5v-3"/>' +
    '<path d="M12 3.5v9"/><path d="M8.5 9l3.5 3.5L15.5 9"/>',
  converter:
    '<path d="M5 9a7 7 0 0 1 11.5-3.2L19 8"/><path d="M19 4.5V8h-3.5"/>' +
    '<path d="M19 15a7 7 0 0 1-11.5 3.2L5 16"/><path d="M5 19.5V16h3.5"/>',
  shortcuts:
    '<path d="M13.5 2.5L5.5 13h5l-1 8.5L18 11h-5Z"/>',
  speaker:
    '<path d="M11.5 5.7L7.3 9.5H4.5v5h2.8l4.2 3.8Z"/>' +
    '<path d="M14.8 9.3a4 4 0 0 1 0 5.4"/><path d="M17.6 6.7a7.6 7.6 0 0 1 0 10.6"/>',

  // ── Utility / chrome ───────────────────────────────────────────────────
  close:    '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
    '<path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7"/>',
  plus:     '<path d="M12 5v14"/><path d="M5 12h14"/>',
  pencil:
    '<path d="M14.5 5.5l4 4"/><path d="M4.5 19.5l1-4L16 5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L8.5 18.5Z"/>',
  pin:
    '<path d="M9 3.5h6l-.7 5.2l2.7 2.3v1.5H7v-1.5l2.7-2.3Z"/><path d="M12 12.5V20"/>',
  back:     '<path d="M14 6l-6 6l6 6"/>',
  chevron:  '<path d="M9 6l6 6l-6 6"/>',
  file:
    '<path d="M6 3.5h7L18 8.5V20.5H6Z"/><path d="M13 3.5V8.5H18"/>',
  search:   '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>',
  trash:
    '<path d="M5 7h14"/><path d="M10 7V5.5A1.3 1.3 0 0 1 11.3 4.2h1.4A1.3 1.3 0 0 1 14 5.5V7"/>' +
    '<path d="M6.8 7l.8 11A1.3 1.3 0 0 0 8.9 19.2h6.2a1.3 1.3 0 0 0 1.3-1.2L17.2 7"/>',
  power:    '<path d="M12 3v8"/><path d="M7 6.2a7 7 0 1 0 10 0"/>',

  // ── App-specific additions (same grid / stroke / cap language) ──────────
  coin:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.3"/>',
  wheel:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/>' +
    '<path d="M12 3.5V10"/><path d="M4.6 16.25L10.25 13"/><path d="M19.4 16.25L13.75 13"/>',
  opacity:
    '<circle cx="12" cy="12" r="8.5"/>' +
    '<path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" opacity="0.55"/>',
  image:
    '<rect x="3.5" y="5" width="17" height="14" rx="2"/>' +
    '<circle cx="8.6" cy="9.6" r="1.4"/><path d="M4.5 16.5l4.3-4.3l3.4 3.4l2.4-2.4l4.9 4.9"/>',
  music:
    '<path d="M9 17.5V6.5l9-2v11"/><circle cx="6.8" cy="17.5" r="2.2"/><circle cx="15.8" cy="15.5" r="2.2"/>',
  video:
    '<rect x="3" y="5.5" width="13" height="13" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  archive:
    '<rect x="3.5" y="4.5" width="17" height="5" rx="1.2"/>' +
    '<path d="M5 9.5v9A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-9"/><path d="M10 13h4"/>',
  code:
    '<path d="M8 7.5L3.5 12L8 16.5"/><path d="M16 7.5L20.5 12L16 16.5"/><path d="M13.5 5l-3 14"/>',
  eye:
    '<path d="M3.5 12C5.6 7.9 8.4 5.9 12 5.9s6.4 2 8.5 6.1c-2.1 4.1-4.9 6.1-8.5 6.1s-6.4-2-8.5-6.1Z"/>' +
    '<circle cx="12" cy="12" r="2.6"/>',
  eyeoff:
    '<path d="M4.5 4.5l15 15"/>' +
    '<path d="M9.9 6.3c0.67-0.26 1.37-0.4 2.1-0.4c3.6 0 6.4 2 8.5 6.1c-0.74 1.44-1.57 2.61-2.5 3.51"/>' +
    '<path d="M7 7.95c-1.36 0.96-2.53 2.31-3.5 4.05c2.1 4.1 4.9 6.1 8.5 6.1c1.34 0 2.58-0.28 3.72-0.84"/>' +
    '<path d="M10.16 10.18a2.6 2.6 0 0 0 3.66 3.66"/>',
};

export const ICON_NAMES = Object.keys(ICON_PATHS);

// Icons drawn with fills (no stroke) — they carry their own fills, so don't
// apply a global stroke to them.
const FILLED = new Set(["deck"]);

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  title?: string;
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.7,
  color = "currentColor",
  className = "",
  title,
  ...rest
}: IconProps) {
  const markup = ICON_PATHS[name];
  if (!markup) {
    if (typeof console !== "undefined") console.warn(`Icon: unknown name "${name}"`);
    return null;
  }
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={filled ? "none" : color}
      strokeWidth={filled ? undefined : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : "") + markup }}
      {...rest}
    />
  );
}
