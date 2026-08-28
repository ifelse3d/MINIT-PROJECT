"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import type { StepStatus } from "@/components/step-card";

// ---------------------------------------------------------------------------
// SECTION TABS — the progress rail, for a job that spans several PAGES.
//
// StepProgress (step-card.tsx) is the same idea for a job that lives on one
// page: tap a pill, that card opens and scrolls into view. When /money and
// /minutes were split (2026-08-23, user: "不要所有功能都在一頁，很難看"), the
// steps became routes, so the pills had to become links — same shape, same
// colours, same "you are here", but the browser's back button now works and
// each step has an address you can bookmark or send to somebody.
//
// A "locked" tab is still a LINK, not a disabled control. The page it leads to
// explains why there is nothing to do there yet; a dead pill would just leave
// the person tapping something that does not respond. The padlock sets the
// expectation before the tap.
// ---------------------------------------------------------------------------

export type SectionTab = {
  href: string;
  labelBm: string;
  labelZh: string;
  labelEn: string;
  status: StepStatus;
  /** Shown as a badge when the step needs the person: how many things wait. */
  count?: number;
};

// The `records`/`extras` side entries (History, Manage receipts, Cash
// custody, Tax file) were REMOVED on 2026-08-28 (J review 27-evening
// #12/#16): every one of them is a sidebar row, and repeating them here was
// the duplication J listed. The rail carries the job's numbered steps only.

export function SectionTabs({
  tabs,
  ariaLabelBm = "Langkah",
  ariaLabelZh = "步骤",
  ariaLabelEn = "Steps",
}: {
  tabs: SectionTab[];
  ariaLabelBm?: string;
  ariaLabelZh?: string;
  ariaLabelEn?: string;
}) {
  const t = useTriText();
  const pathname = usePathname();

  return (
    // #11 (J review 27-evening, 2026-08-28): the rail used to stick at top-0
    // and slide UNDER the taller top bar (z-40) — "滑下會不見". It now sticks
    // just below the bar, wraps instead of scrolling sideways, and the pills
    // are a size smaller on desktop (phones keep the 44px touch floor).
    <nav
      aria-label={t(ariaLabelBm, ariaLabelZh, ariaLabelEn)}
      className="sticky top-14 z-20 py-2"
    >
      {/* #27 (J, 2026-08-28 screenshot): w-fit — the glass backing hugs the
          pills instead of running a full-width white strip behind two of them.
          max-w-full keeps the wrap behaviour when there are many. */}
      <ol className="v2-glass flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md px-2 py-1.5">
        {tabs.map((tab, i) => {
          const here = pathname === tab.href;
          const tone =
            tab.status === "done"
              ? "border-green-400 bg-green-100 text-green-900"
              : tab.status === "needs-you"
                ? "border-amber-400 bg-amber-100 text-amber-900"
                : tab.status === "example"
                  ? "border-violet-400 bg-violet-100 text-violet-900"
                  : "border-slate-300 bg-slate-100 text-slate-600";
          return (
            <li key={tab.href} className="flex shrink-0 items-center gap-1">
              {i > 0 && (
                <span aria-hidden className="h-0.5 w-2 shrink-0 rounded-full bg-slate-300" />
              )}
              <Link
                href={tab.href}
                aria-current={here ? "page" : undefined}
                // F-3 (2026-08-25): min-h-11 = the app's 44px touch-target
                // floor. These pills are the PRIMARY step navigation on a
                // phone; 36px was below the floor everything else keeps.
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xs border-2 px-3 text-base font-medium md:min-h-9 md:px-2.5 md:text-sm ${tone} ${
                  // The page you are ON is the one thing this rail must make
                  // unmissable — colour alone cannot do it, because two tabs can
                  // legitimately share a colour.
                  here
                    ? "ring-2 ring-slate-900/70 ring-offset-1 dark:ring-white/80"
                    : "hover:brightness-95 active:scale-95"
                }`}
              >
                <span className="font-bold">{i + 1}</span>
                <Tri bm={tab.labelBm} zh={tab.labelZh} en={tab.labelEn} />
                {tab.status === "done" && (
                  <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} />
                )}
                {tab.status === "locked" && (
                  <Lock aria-hidden className="size-4 shrink-0" strokeWidth={2.4} />
                )}
                {tab.status === "needs-you" && typeof tab.count === "number" && tab.count > 0 && (
                  // D-4 (work order 31, 客⑩): a solid badge that SAYS what the
                  // number is. The old faint circle with a bare digit read as
                  // decoration, not as "3 things are waiting for you".
                  <span className="rounded-xs bg-amber-700 px-2 py-0.5 text-sm font-bold text-white dark:bg-amber-400 dark:text-black">
                    {t(
                      `${tab.count} untuk disemak`,
                      `${tab.count} 项待核对`,
                      `${tab.count} to check`,
                    )}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
