"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import type { ActivityRecord } from "@/lib/history";
import type { ConfirmedAgm } from "@/lib/standard-deadlines";
import { loadEvents, saveEvents, sortedByDate, type SimpleEvent } from "@/lib/local-events";
import { ActivityCalendar } from "./activity-calendar";
import { UpcomingSidebar } from "./upcoming-sidebar";

// ---------------------------------------------------------------------------
// /calendar shell — ONE full-width page (no tabs). Month grid centre-left,
// "Akan datang / Upcoming" sidebar right (stacks below on mobile). Adding
// events happens on its own page (/calendar/add), reached from the primary
// button in the header — it used to be a panel collapsed below the grid, which
// nobody scrolled to. This component owns the localStorage events so the grid
// and the sidebar always agree.
// ---------------------------------------------------------------------------

export function CalendarShell({
  records,
  month,
  todayIso,
  orgName,
  agm,
}: {
  records: ActivityRecord[];
  month: string;
  todayIso: string;
  orgName: string | null;
  /** This org's latest confirmed AGM, or null. Drives the annual-return date. */
  agm: ConfirmedAgm | null;
}) {
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  useEffect(() => setEvents(loadEvents()), []);

  function persist(next: SimpleEvent[]) {
    const sorted = sortedByDate(next);
    setEvents(sorted);
    saveEvents(sorted);
  }

  /**
   * Functional update, not `persist([...events, ev])`.
   *
   * The closure form reads `events` as it was at render time, so two adds before a
   * re-render silently lose one — the same stale-closure class of bug the money
   * page builds refs to avoid. (Found in review, 2026-07-28.)
   */
  function addEvent(ev: SimpleEvent) {
    setEvents((prev) => {
      const sorted = sortedByDate([...prev, ev]);
      saveEvents(sorted);
      return sorted;
    });
  }

  function removeEvent(id: string) {
    setEvents((prev) => {
      const sorted = sortedByDate(prev.filter((e) => e.id !== id));
      saveEvents(sorted);
      return sorted;
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-8">
      {/* Page header — the primary action sits HERE, not below the grid */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100/80 text-2xl ring-1 ring-white/60 backdrop-blur dark:bg-rose-400/15 dark:ring-white/10">
            🗓️
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Kalendar" zh="日历" en="Calendar" />
            </span>
          </h1>
          {/* The "Data contoh" badge used to show permanently, even once real
              records existed, which teaches people to ignore warnings. The
              deadlines here are now computed from this organisation's own
              confirmed AGM and the statutory month-ends. (2026-07-28 audit.) */}
        </div>
        <Button asChild size="lg">
          <Link href="/calendar/add">
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            <Tri bm="Tambah acara" zh="添加活动" en="Add events" />
          </Link>
        </Button>
      </div>

      {/* Grid + sidebar fill the width; sidebar stacks below on mobile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <ActivityCalendar
          serverRecords={records}
          month={month}
          todayIso={todayIso}
          orgName={orgName}
          agm={agm}
          localEvents={events}
          onAddEvent={addEvent}
          onRemoveEvent={removeEvent}
        />
        <UpcomingSidebar todayIso={todayIso} agm={agm} orgName={orgName} events={events} onRemove={(id) => persist(events.filter((e) => e.id !== id))} />
      </div>

    </div>
  );
}
