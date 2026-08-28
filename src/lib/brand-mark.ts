// ---------------------------------------------------------------------------
// THE BRAND MARK, ONCE — the violet rounded tile with the white "M formed by
// two people".
//
// 🔴 WHY THIS FILE EXISTS (J, 2026-08-28: 「上面TAB那邊有問題，不是最新LOGO」).
// There used to be two marks. The app drew a vector redraw (brand-logo.tsx)
// while every raster — the browser tab, the PWA icon, the iOS home-screen
// icon — was generated from the supplied PNG, whose gradient is visibly paler.
// Nobody had changed the wrong one; they were never the same drawing.
//
// So the geometry lives here, and BOTH renderers read it: brand-logo.tsx
// renders it as JSX, scripts/brand-icons.ts rasterises the same string with
// sharp. Changing the mark is now one edit, then `npm run icons`.
//
// The tile is the ONE place the brand gradient runs light→dark (§2.2 rule 4:
// every other brand gradient runs dark→light so text can sit on the dark end).
// ---------------------------------------------------------------------------

/** Everything is expressed in a 0–100 viewBox, so one number scales the lot. */
export const BRAND_MARK = {
  viewBox: 100,
  /** 24% of the edge — the corner of the supplied tile, measured. */
  tileRadius: 24,
  gradient: [
    { offset: "0%", color: "#C47CF9" },
    { offset: "52%", color: "#8B3FEE" },
    { offset: "100%", color: "#7029E5" },
  ],
  strokeWidth: 13,
  /** The two bodies and the chevron between them. */
  legs: ["M33 47 L33 79", "M67 47 L67 79"],
  chevron: "M33 47 L50 61 L67 47",
  heads: [
    { cx: 33, cy: 28, r: 8 },
    { cx: 67, cy: 28, r: 8 },
  ],
} as const;

/**
 * The mark as a standalone SVG document — what the icon generator rasterises.
 * Not used by the React component (which needs a per-instance gradient id so
 * two logos on one page cannot fight over one <defs>), but it draws the exact
 * same shapes from the exact same numbers.
 */
export function brandMarkSvg(size: number): string {
  const m = BRAND_MARK;
  const stops = m.gradient
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join("");
  const legs = [...m.legs, m.chevron]
    .map((d) => `<path d="${d}"/>`)
    .join("");
  const heads = m.heads
    .map((h) => `<circle cx="${h.cx}" cy="${h.cy}" r="${h.r}" fill="#fff"/>`)
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${m.viewBox} ${m.viewBox}">`,
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient></defs>`,
    `<rect x="0" y="0" width="${m.viewBox}" height="${m.viewBox}" rx="${m.tileRadius}" fill="url(#g)"/>`,
    `<g fill="none" stroke="#fff" stroke-width="${m.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${legs}</g>`,
    heads,
    `</svg>`,
  ].join("");
}
