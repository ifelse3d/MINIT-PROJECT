"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/v3/surfaces";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// PAGE SECTION — what a StepCard becomes once the step is its own page.
//
// StepCard's whole job was to keep eight things on one screen bearable: it
// collapsed, it locked, it opened exactly one of itself. A page does not need
// any of that — it is already the only thing you are looking at. What survives
// is the part that was actually useful: a number, a plain-language title, one
// sentence saying what this screen is for, and a way onward.
//
// (2026-08-23, user: "不要所有功能都在一頁，很難看".)
// ---------------------------------------------------------------------------

export function PageSection({
  // Kept in the signature (see the note in the heading below) but not rendered.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  step,
  titleBm,
  titleZh,
  titleEn,
  summary,
  children,
}: {
  /** Position in the flow, matching the tab rail above. */
  step?: number;
  titleBm: string;
  titleZh: string;
  titleEn: string;
  /** One sentence: what this screen is for, in the reader's language. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <GlassCard as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        {/* Stage R (2026-08-25, "兩套編號只留分頁軌"): the in-page step number
            is gone — the tab rail above already says where you are, and two
            numbering systems on one screen was one too many. The `step` prop
            is kept so call sites need no change; it is simply not rendered. */}
        <h2 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
          <Tri bm={titleBm} zh={titleZh} en={titleEn} />
        </h2>
        {summary && <p className="text-base text-muted-foreground">{summary}</p>}
      </div>
      {children}
    </GlassCard>
  );
}

/**
 * The way onward at the foot of a page.
 *
 * A "locked" step used to be a StepCard that refused to open and explained
 * why. Here the next page is always reachable — but when there is genuinely
 * nothing to do there yet, `blockedReason` says so BEFORE the tap, in the same
 * words the locked card used.
 */
export function NextStepLink({
  href,
  labelBm,
  labelZh,
  labelEn,
  blockedReason,
  back,
}: {
  href: string;
  labelBm: string;
  labelZh: string;
  labelEn: string;
  blockedReason?: ReactNode;
  /** Renders as a quiet "go back" link instead of the forward call to action. */
  back?: boolean;
}) {
  if (blockedReason) {
    return (
      <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
        {blockedReason}
      </p>
    );
  }
  return (
    <Link
      href={href}
      className={
        back
          ? "inline-flex items-center gap-2 self-start text-base text-muted-foreground underline underline-offset-4"
          : "inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-primary px-5 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 active:scale-95"
      }
    >
      {back && <ArrowLeft aria-hidden className="size-4" strokeWidth={2.4} />}
      <Tri bm={labelBm} zh={labelZh} en={labelEn} />
      {!back && <ArrowRight aria-hidden className="size-5" strokeWidth={2.4} />}
    </Link>
  );
}
