"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import type { Deadline } from "@/lib/deadlines";
import { HomeUpcoming, useUpcomingItems } from "./home-upcoming";

// ---------------------------------------------------------------------------
// §9 (work order 104), J: 「home 的 upcoming 做成可以收起來，然後 CHAT 的空間
// 要大」.
//
// On a desktop the workbench shares the row with "Upcoming" (102 §0-3, a
// 21rem right column). J wants that column foldable, and the conversation to
// take the width when it is folded.
//
// 🔴 FOLDED IS NOT HIDDEN. A deadline you cannot find is worse than one you
// did not want to look at, so folding leaves a small chip — "⏰ 1" — in the
// same corner, and pressing it puts the column back. The choice is remembered
// on this device (localStorage), which is what "收起來" means to somebody who
// folds it once and does not want to fold it every morning.
//
// Phones never see any of this: there the list is the notification bell
// (UpcomingBell), and this component renders one column.
// ---------------------------------------------------------------------------

/** Per-device, not per-account: it is a preference about this screen. */
const STORE_KEY = "minit.home.upcoming.collapsed.v1";

export function WorkbenchColumns({
  workbench,
  deadlines,
  todayIso,
}: {
  workbench: ReactNode;
  deadlines: Deadline[];
  todayIso: string;
}) {
  const t = useTriText();
  // The same merge the column and the phone bell use — one list, three
  // readers, so the chip's number can never disagree with the column.
  const count = useUpcomingItems(deadlines, todayIso).length;
  // Starts OPEN and corrects itself after mount: reading localStorage during
  // render would make the server and the client disagree about the layout.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setCollapsed(localStorage.getItem(STORE_KEY) === "1");
      } catch {
        // Storage unavailable (private window) — the column simply stays open.
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function set(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(STORE_KEY, next ? "1" : "0");
    } catch {
      // Remembering failed; the fold still works for this visit.
    }
  }

  return (
    <div
      className={
        collapsed
          ? "flex flex-col gap-8"
          : "flex flex-col gap-8 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_21rem] @4xl:items-start @4xl:gap-6"
      }
    >
      <div className="min-w-0">
        {/* The chip lives above the workbench so it is on screen the moment
            the page opens — a way back that needs scrolling is not a way
            back. Desktop only; the phone has the bell. */}
        {collapsed && (
          <div className="mb-3 hidden justify-end @4xl:flex">
            <button
              type="button"
              data-probe="upcoming-reopen"
              onClick={() => set(false)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-[color:var(--v2-border)] bg-white/70 px-3 text-sm font-medium text-[color:var(--v2-text-soft)] hover:border-[color:var(--v2-primary)]/60 hover:text-[color:var(--v2-primary)] dark:bg-white/10"
              aria-label={t(
                `Buka semula «Akan datang» — ${count} perkara`,
                `重新展开「即将到来」—— ${count} 项`,
                `Show “Upcoming” again — ${count} item(s)`,
              )}
            >
              ⏰ <span className="tabular-nums">{count}</span>
              <span className="sr-only">
                <Tri bm="Akan datang" zh="即将到来" en="Upcoming" />
              </span>
            </button>
          </div>
        )}
        {workbench}
      </div>

      {!collapsed && (
        <div className="hidden @4xl:block">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              data-probe="upcoming-collapse"
              onClick={() => set(true)}
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-[color:var(--v2-text-soft)] hover:text-[color:var(--v2-primary)]"
            >
              <Tri bm="Lipat" zh="收起" en="Collapse" />
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
          <HomeUpcoming deadlines={deadlines} todayIso={todayIso} />
        </div>
      )}
    </div>
  );
}
