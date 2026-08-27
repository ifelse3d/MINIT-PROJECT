"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, History, Lock } from "lucide-react";
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

/**
 * E-1 (2026-08-25, J #18): the section's RECORDS — history is not a step.
 * It used to be the last numbered ring of the chain, which said "after you
 * finish, you do History", and it wore a number and could sit next to a
 * padlock. Looking back is not part of doing the job: it gets its own fixed
 * entry at the far end of the rail — no number, no connector, never locked.
 */
export type SectionRecords = {
  href: string;
  labelBm: string;
  labelZh: string;
  labelEn: string;
  /** Optional emoji in place of the History icon (extras use this). */
  iconEmoji?: string;
};

export function SectionTabs({
  tabs,
  records,
  extras = [],
  ariaLabelBm = "Langkah",
  ariaLabelZh = "步骤",
  ariaLabelEn = "Steps",
}: {
  tabs: SectionTab[];
  /** The section's records page — rendered apart from the numbered steps. */
  records?: SectionRecords;
  /**
   * B-3 (D19): pages that belong to the section but are NOT steps of the job —
   * the cash-custody record, the month-end tax file. Rendered like `records`
   * (no number, no connector, never locked), before it.
   */
  extras?: SectionRecords[];
  ariaLabelBm?: string;
  ariaLabelZh?: string;
  ariaLabelEn?: string;
}) {
  const t = useTriText();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t(ariaLabelBm, ariaLabelZh, ariaLabelEn)}
      className="sticky top-0 z-20 py-2"
    >
      <ol className="v2-glass v2-scroll flex items-center gap-1 overflow-x-auto rounded-md px-2 py-2">
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
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xs border-2 px-3 text-base font-medium ${tone} ${
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
        {[...extras, ...(records ? [records] : [])].map((entry, i) => (
          <li
            key={entry.href}
            className={`flex shrink-0 items-center ${i === 0 ? "ml-auto pl-2" : "pl-1"}`}
          >
            <Link
              href={entry.href}
              aria-current={pathname === entry.href ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xs border-2 border-dashed border-slate-300 px-3 text-base font-medium text-slate-600 dark:border-slate-500 dark:text-slate-300 ${
                pathname === entry.href
                  ? "ring-2 ring-slate-900/70 ring-offset-1 dark:ring-white/80"
                  : "hover:brightness-95 active:scale-95"
              }`}
            >
              {entry.iconEmoji ? (
                <span aria-hidden>{entry.iconEmoji}</span>
              ) : (
                <History aria-hidden className="size-4 shrink-0" strokeWidth={2.2} />
              )}
              <Tri bm={entry.labelBm} zh={entry.labelZh} en={entry.labelEn} />
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
