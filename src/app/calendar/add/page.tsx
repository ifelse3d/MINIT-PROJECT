"use client";

// ---------------------------------------------------------------------------
// /calendar/add — a page of its own for adding society events.
//
// It used to be a collapsed panel below the month grid, where nobody scrolled
// to find it. The calendar header now carries a primary "Add events" button
// that lands here; adding writes to the SAME localStorage key the calendar
// reads (src/lib/local-events.ts), so going back shows the new events.
//
// 2026-08-23: and to the organisation's records, so the OTHER committee members
// see them too. Device first, database second, failure said out loud — the same
// three rules as calendar-shell.tsx, which explains why.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  loadEvents,
  saveEvents,
  sortedByDate,
  type SimpleEvent,
} from "@/lib/local-events";
import { saveEvent } from "../actions";
import { EventsSection } from "../events-section";
import { FromAiNote } from "@/components/from-ai-note";

export default function AddEventsPage() {
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [added, setAdded] = useState(0);
  /** Why the organisation's copy could not be written, or null. Told, not
   *  swallowed — "permission" gets the "whose job is this" sentence, because
   *  a role refusal recurs on every retry (26 号报告 2-4). */
  const [syncIssue, setSyncIssue] = useState<"permission" | "other" | null>(null);

  useEffect(() => setEvents(loadEvents()), []);

  function addEvent(ev: SimpleEvent) {
    const next = sortedByDate([...events, ev]);
    setEvents(next);
    saveEvents(next);
    setAdded((n) => n + 1);
    // Fire-and-forget: the event is already on screen and already on this
    // device, so a failed sync costs reach, not the person's typing.
    void saveEvent(ev).then((r) =>
      setSyncIssue(r.ok ? null : r.reason === "permission" ? "permission" : "other"),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
      {/* F-6: the assistant's "add an event" button lands here with ?dari=ai. */}
      <FromAiNote
        bm="di sinilah anda menambah acara ke kalendar. Isi borang di bawah."
        zh="在这里把活动加进日历，填下面的表格就行。"
        en="this is where you add events to the calendar. Fill in the form below."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/calendar"
            aria-label="Kalendar"
            className="v2-glass flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--v2-text)] transition-transform hover:scale-105"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Tambah acara" zh="添加活动" en="Add events" />
            </span>
          </h1>
        </div>
        {added > 0 && (
          <Button asChild size="lg">
            <Link href="/calendar">
              <Tri bm="Selesai" zh="完成" en="Done" /> ({added}) →
            </Link>
          </Button>
        )}
      </div>

      <EventsSection onAdd={addEvent} />

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
