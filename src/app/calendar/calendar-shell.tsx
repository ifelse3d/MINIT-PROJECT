"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import type { ActivityRecord } from "@/lib/history";
import type { ConfirmedAgm } from "@/lib/standard-deadlines";
import {
  loadEvents,
  mergeEvents,
  saveEvents,
  sortedByDate,
  type SimpleEvent,
} from "@/lib/local-events";
import { deleteEvent, loadOrgEvents, saveEvent } from "./actions";
import { ActivityCalendar } from "./activity-calendar";
import { UpcomingSidebar } from "./upcoming-sidebar";

// ---------------------------------------------------------------------------
// /calendar shell — ONE full-width page (no tabs). Month grid centre-left,
// "Akan datang / Upcoming" sidebar right (stacks below on mobile). Adding
// events happens on its own page (/calendar/add), reached from the primary
// button in the header — it used to be a panel collapsed below the grid, which
// nobody scrolled to. This component owns the events so the grid and the
// sidebar always agree.
//
// 2026-08-23 — the events now also reach the DATABASE (J's UX list, root cause
// B: "换一台电脑登入，这个组织什么都没有"). The order of operations matters and
// is deliberate:
//
//   1. localStorage first, always. It is instant, it works with no signal, and
//      it is what makes an added event appear the moment it is typed.
//   2. The database second, in the background. If it fails — no organisation
//      chosen yet, no signal, or migration 20260825000000 not applied — the
//      event is still on screen and still saved on this device.
//   3. The failure is SAID, once, in one line. Silently not syncing is how you
//      end up with a committee that thinks the calendar is shared when it is
//      not, which is worse than not syncing at all.
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
  /**
   * Why the organisation's copy could not be written, or null. Told, not
   * swallowed — and told TRUTHFULLY: "permission" means a read-only account
   * was refused by the role check, which no amount of retrying fixes, so it
   * gets the "whose job is this" sentence instead of "try again later".
   */
  const [syncIssue, setSyncIssue] = useState<"permission" | "other" | null>(null);

  useEffect(() => {
    // The device's list goes up immediately; the organisation's is merged in
    // when it arrives. A union, never a replace — see mergeEvents for why
    // taking either side wholesale deletes somebody's meeting.
    const local = loadEvents();
    setEvents(sortedByDate(local));
    let cancelled = false;
    void loadOrgEvents().then((remote) => {
      if (cancelled || remote.length === 0) return;
      const merged = mergeEvents(local, remote);
      setEvents(merged);
      saveEvents(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Fire-and-forget: the event is already on screen and already on this device. */
  function syncSave(ev: SimpleEvent) {
    void saveEvent(ev).then((r) =>
      setSyncIssue(r.ok ? null : r.reason === "permission" ? "permission" : "other"),
    );
  }
  function syncDelete(id: string) {
    void deleteEvent(id).then((r) =>
      setSyncIssue(r.ok ? null : r.reason === "permission" ? "permission" : "other"),
    );
  }

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
    syncSave(ev);
  }

  function removeEvent(id: string) {
    setEvents((prev) => {
      const sorted = sortedByDate(prev.filter((e) => e.id !== id));
      saveEvents(sorted);
      return sorted;
    });
    syncDelete(id);
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
        <UpcomingSidebar
          todayIso={todayIso}
          agm={agm}
          orgName={orgName}
          events={events}
          onRemove={(id) => {
            persist(events.filter((e) => e.id !== id));
            syncDelete(id);
          }}
        />
      </div>

      {/* One line, at the bottom, never a blocking dialog: the calendar itself
          is working. What is NOT working is the part the committee cannot see,
          which is exactly the part that has to be said out loud. */}
      {syncIssue === "permission" && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Akaun anda baca sahaja, jadi acara ini tidak dimasukkan ke rekod pertubuhan — ia kekal pada peranti ini sahaja. Minta mana-mana ahli jawatankuasa (kecuali juruaudit) menambahnya."
            zh="您的账号是只读（审计）账号，这个活动进不了机构的记录 —— 只存在这台设备上。要让其他委员看到，请找除审计外的任何成员来添加。"
            en="Your account is read-only, so this event was not added to the organisation's records — it stays on this device only. Ask any committee member (except the auditor) to add it."
          />
        </p>
      )}
      {syncIssue === "other" && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Acara ini disimpan pada peranti ini sahaja — ia belum sampai ke rekod pertubuhan, jadi ahli jawatankuasa lain tidak akan melihatnya. Pilih pertubuhan anda, atau cuba lagi apabila ada talian."
            zh="这些活动只存在这台设备上 —— 还没有进到机构的记录里，所以其他委员看不到。请选好您的机构，或者等有网络时再试。"
            en="These events are on this device only — they have not reached the organisation's records, so other committee members will not see them. Choose your organisation, or try again when you have a signal."
          />
        </p>
      )}
    </div>
  );
}
