// ---------------------------------------------------------------------------
// The brand mark as an inline SVG (redesign spec §2.6): the violet gradient
// tile with the white "M formed by two people". Vector, so it stays sharp at
// the 28px collapsed rail and at the 64px sign-in tile alike.
//
// 🔴 The geometry is NOT written here — it lives in src/lib/brand-mark.ts, and
// scripts/brand-icons.ts rasterises the same numbers into the favicon, the PWA
// icons and the iOS icon. Before 2026-08-28 those rasters came from a
// different drawing (J's supplied PNG, a visibly paler gradient), which is why
// the browser tab did not match the logo inside the app. One mark, two
// renderers: change brand-mark.ts, then `npm run icons`.
// ---------------------------------------------------------------------------

import { useId } from "react";
import { BRAND_MARK } from "@/lib/brand-mark";

export function BrandLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Unique gradient id per instance — two logos on one page (rail + login)
  // must not fight over one <defs> id. useId is hydration-safe; a module
  // counter is not (server and client would count independently).
  const gid = `brand-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const box = BRAND_MARK.viewBox;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      aria-hidden
      className={className}
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          {BRAND_MARK.gradient.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        width={box}
        height={box}
        rx={BRAND_MARK.tileRadius}
        fill={`url(#${gid})`}
      />
      {/* The two-people M: heads + round-capped strokes. */}
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={BRAND_MARK.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {[...BRAND_MARK.legs, BRAND_MARK.chevron].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {BRAND_MARK.heads.map((head) => (
        <circle key={head.cx} cx={head.cx} cy={head.cy} r={head.r} fill="#fff" />
      ))}
    </svg>
  );
}
