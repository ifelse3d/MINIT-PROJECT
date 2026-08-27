"use client";

import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

// ---------------------------------------------------------------------------
// THE tooltip primitive (violet redesign spec §4) — ONE app-wide.
//
// Client rule, quoted: 「只要是 icon 而已，没有看到字体的时候，当 user 碰到
// icon 就要有 tips 跳出来。」 Any control whose visible content is only an
// icon must show a text tooltip on hover AND keyboard focus.
//
// - Provider mounts once in the shell (§4.4), 300ms first-open delay, 0ms
//   when hopping between neighbours (skipDelayDuration).
// - Radix does not open tooltips on touch — which is the §4.1 behaviour
//   (the <1024px drawer is label-visible instead).
// - Never combined with title="" (the browser would render a second,
//   unstyled tooltip underneath); aria-label stays the accessible name.
// ---------------------------------------------------------------------------

export function AppTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/** Wrap an icon-only control: `<IconTip label="…"><button aria-label="…"/></IconTip>`. */
export function IconTip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  /** §4.1: right for rail items, bottom for top-bar items, top for row actions. */
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className="z-[60] max-w-[260px] rounded-xs bg-[#15121f] px-2.5 py-1.5 text-xs font-medium text-white shadow-[var(--v2-shadow-md)] dark:bg-[#e9e7f2] dark:text-[#15121f]"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[#15121f] dark:fill-[#e9e7f2]" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
