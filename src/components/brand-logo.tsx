// ---------------------------------------------------------------------------
// The brand mark as an inline SVG (redesign spec §2.6): the violet gradient
// tile with the white "M formed by two people". The supplied asset is a
// raster; this vector redraw keeps the mark sharp at the 28 px collapsed
// rail. Raster copies (favicon, PWA, apple-touch) still come from
// scripts/brand-icons.mjs — same mark, two renderers.
//
// The tile is the ONE place the brand gradient runs light→dark
// (--v2-grad-logo direction, #C47CF9 top-left → #7029E5 bottom-right);
// every other brand gradient runs dark→light so text can sit on the dark
// end (§2.2 rule 4).
//
// `white` variant: monochrome white mark, no tile — for the sign-in brand
// panel and dark surfaces (§2.6).
// ---------------------------------------------------------------------------

import { useId } from "react";

export function BrandLogo({
  size = 36,
  white = false,
  className,
}: {
  size?: number;
  white?: boolean;
  className?: string;
}) {
  // Unique gradient id per instance — two logos on one page (rail + login)
  // must not fight over one <defs> id. useId is hydration-safe; a module
  // counter is not (server and client would count independently).
  const gid = `brand-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Tile radius per spec: 12px at 40px tile → 30% of the edge ≈ matches the
  // supplied asset's corner.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className={className}
      focusable="false"
    >
      {!white && (
        <>
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C47CF9" />
              <stop offset="52%" stopColor="#8B3FEE" />
              <stop offset="100%" stopColor="#7029E5" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" rx="24" fill={`url(#${gid})`} />
        </>
      )}
      {/* The two-people M: heads + round-capped strokes. */}
      <g fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round">
        <path d="M33 47 L33 79" />
        <path d="M67 47 L67 79" />
        <path d="M33 47 L50 61 L67 47" strokeLinejoin="round" />
      </g>
      <circle cx="33" cy="28" r="8" fill="#fff" />
      <circle cx="67" cy="28" r="8" fill="#fff" />
    </svg>
  );
}
