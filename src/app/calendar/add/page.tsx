"use client";

// ---------------------------------------------------------------------------
// /calendar/add — a page of its own for adding society events.
//
// It used to be a collapsed panel below the month grid, where nobody scrolled
// to find it. The calendar header now carries a primary "Add events" button
// that lands here; adding writes to the SAME localStorage key the calendar
// reads (src/lib/local-events.ts), so going back shows the new events.
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
import { EventsSection } from "../events-section";

export default function AddEventsPage() {
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [added, setAdded] = useState(0);

  useEffect(() => setEvents(loadEvents()), []);

  function addEvent(ev: SimpleEvent) {
    const next = sortedByDate([...events, ev]);
    setEvents(next);
    saveEvents(next);
    setAdded((n) => n + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
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
    </div>
  );
}
