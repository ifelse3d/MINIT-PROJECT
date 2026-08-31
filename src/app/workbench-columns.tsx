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
  // §2 (work order 109, J: 「J 要的是聊天空間大」): FOLDED IS THE DEFAULT
  // now. 104 made the column foldable and left it open, so every visit still
  // opened with 21rem of the screen spent on dates that are usually months
  // away. A person who wants it open opens it once and this device remembers
  // — which is what the stored "0" below means. Only an explicit stored
  // choice can expand it; anything else (a new device, a private window,
  // storage refused) starts folded.
  //
  // Starts folded and corrects itself after mount: reading localStorage
  // during render would make the server and the client disagree about the
  // layout, and the FIRST paint being wrong is what the boot script in
  // layout.tsx exists to avoid elsewhere.
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setCollapsed(localStorage.getItem(STORE_KEY) !== "0");
      } catch {
        // Storage unavailable (private window) — the column stays folded and
        // the chip is still there to open it for this visit.
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
    // §1 (work order 109): the home page is one viewport tall now, so this
    // row has to PASS THAT HEIGHT ON rather than growing with its contents —
    // `min-h-0` at every level, or the conversation pane inside refuses to
    // shrink and pushes the composer off the bottom of the screen.
    // `items-stretch` (not the old `items-start`) is what lets the workbench
    // column be as tall as the row when the deadlines column is short.
    <div
      className={
        collapsed
          ? "flex min-h-0 flex-1 flex-col gap-8"
          : "flex min-h-0 flex-1 flex-col gap-8 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_21rem] @4xl:items-stretch @4xl:gap-6"
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* The chip lives above the workbench so it is on screen the moment
            the page opens — a way back that needs scrolling is not a way
            back. Desktop only; the phone has the bell.
            §2 (109): folded is the DEFAULT now, so this chip is the only way
            back and it is always here — 104's promise, and its probe, both
            say so. With nothing due it drops the number rather than
            announcing “⏰ 0”; the clock alone is a door, and a zero is a
            statistic nobody asked for. */}
        {collapsed && (
          <div className="mb-2 hidden justify-end @4xl:flex">
            <button
              type="button"
              data-probe="upcoming-reopen"
              onClick={() => set(false)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-[color:var(--v2-border)] bg-white/70 px-3 text-sm font-medium text-[color:var(--v2-text-soft)] hover:border-[color:var(--v2-primary)]/60 hover:text-[color:var(--v2-primary)] dark:bg-white/10"
              aria-label={
                count > 0
                  ? t(
                      `Buka semula «Akan datang» — ${count} perkara`,
                      `重新展开「即将到来」—— ${count} 项`,
                      `Show “Upcoming” again — ${count} item(s)`,
                    )
                  : t(
                      "Buka semula «Akan datang» — tiada apa-apa buat masa ini",
                      "重新展开「即将到来」—— 目前没有",
                      "Show “Upcoming” again — nothing due",
                    )
              }
            >
              ⏰ {count > 0 && <span className="tabular-nums">{count}</span>}
              <span className="sr-only">
                <Tri bm="Akan datang" zh="即将到来" en="Upcoming" />
              </span>
            </button>
          </div>
        )}
        {workbench}
      </div>

      {!collapsed && (
        // Its own scrollbar: the row is exactly one screen tall, and five
        // deadlines plus five events is taller than a laptop's remaining room.
        <div className="v2-scroll hidden min-h-0 overflow-y-auto @4xl:block">
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
