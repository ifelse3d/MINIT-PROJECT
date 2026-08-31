"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import type { Deadline } from "@/lib/deadlines";
import { HomeUpcoming, useUpcomingItems } from "./home-upcoming";

// ---------------------------------------------------------------------------
// §0-3 (work order 102, J's ruling): on a PHONE, "Upcoming" is a notification
// bell, not a block of cards — the workbench gets the whole screen. The bell
// wears a count badge; tapping it unfolds the SAME list the desktop right
// column shows (HomeUpcoming — one component, two doors), inline below the
// header, and tapping again folds it away. No portal, no overlay: an inline
// fold cannot be swallowed by the backdrop-filter containing-block trap.
// ---------------------------------------------------------------------------

export function UpcomingBell({
  deadlines,
  todayIso,
  className = "",
}: {
  deadlines: Deadline[];
  todayIso: string;
  className?: string;
}) {
  const t = useTriText();
  const [open, setOpen] = useState(false);
  const items = useUpcomingItems(deadlines, todayIso);

  return (
    <div className={className}>
      <div className="flex justify-end">
      <button
        type="button"
        data-probe="upcoming-bell"
        aria-expanded={open}
        aria-label={
          open
            ? t("Tutup senarai akan datang", "收起即将到来", "Close upcoming list")
            : t(
                `Akan datang: ${items.length} perkara`,
                `即将到来：${items.length} 项`,
                `Upcoming: ${items.length} item(s)`,
              )
        }
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-[color:var(--v2-border)] bg-white/70 text-[color:var(--v2-text-soft)] hover:border-[color:var(--v2-primary)]/60 hover:text-[color:var(--v2-primary)] dark:bg-white/10"
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2.2} />
        ) : (
          <Bell className="h-5 w-5" strokeWidth={2.2} />
        )}
        {!open && items.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--v2-primary-fill)] px-1 text-xs font-bold text-white">
            {items.length}
          </span>
        )}
      </button>
      </div>
      {open && (
        <div className="mt-3">
          <HomeUpcoming deadlines={deadlines} todayIso={todayIso} />
          <p className="mt-2 text-sm text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Tekan loceng sekali lagi untuk menutup."
              zh="再按一次铃铛即可收起。"
              en="Tap the bell again to close."
            />
          </p>
        </div>
      )}
    </div>
  );
}
