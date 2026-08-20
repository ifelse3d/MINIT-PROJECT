"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tri, useTriText } from "@/components/language-provider";
import { URGENCY_BADGE, URGENCY_CARD } from "@/lib/activity-labels";
import {
  daysBetween,
  daysLeftParts,
  deadlineUrgency,
  DEADLINE_LABELS,
  type Deadline,
} from "@/lib/deadlines";
import { loadEvents, type SimpleEvent } from "@/lib/local-events";
import { mergeUpcoming } from "@/lib/standard-deadlines";

// ---------------------------------------------------------------------------
// Home "Akan datang / Upcoming" — the next few deadlines + society events,
// read-only, every row linking to /calendar (where the WhatsApp-copy and
// export buttons live). Deadlines arrive server-computed (first paint shows
// them immediately); localStorage events splice in after mount, exactly like
// the calendar shell. Client component ONLY because of localStorage.
// ---------------------------------------------------------------------------

const UPCOMING_LIMIT = 5;

export function HomeUpcoming({ deadlines, todayIso }: { deadlines: Deadline[]; todayIso: string }) {
  const t = useTriText();
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  useEffect(() => setEvents(loadEvents()), []);

  const items = useMemo(
    () => mergeUpcoming(deadlines, events, todayIso, UPCOMING_LIMIT),
    [deadlines, events, todayIso],
  );

  return (
    <section aria-label={t("Akan datang", "即将到来", "Upcoming")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">
          ⏰ <Tri bm="Akan datang" zh="即将到来" en="Upcoming" />
        </h2>
        {/* The "sample data" badge used to be permanent, which trains people to
            ignore it. Deadlines are now computed from THIS organisation's own
            confirmed AGM plus the statutory e-Invois month-ends, so there is
            nothing fictional left to warn about. (2026-07-28 audit.) */}
        <Link
          href="/calendar"
          className="ml-auto text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          <Tri bm="Lihat kalendar" zh="看日历" en="See calendar" /> →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="v2-glass rounded-2xl p-4 text-sm text-[color:var(--v2-text-soft)]">
          <Link href="/calendar" className="underline underline-offset-4">
            <Tri
              bm="Tiada tarikh akhir atau acara buat masa ini — lihat kalendar."
              zh="目前没有截止日期或活动——看看日历。"
              en="No deadlines or events right now — see the calendar."
            />
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            if (item.type === "deadline") {
              const d = item.deadline;
              const u = deadlineUrgency(d, todayIso);
              const s = URGENCY_BADGE[u];
              const label = DEADLINE_LABELS[d.kind];
              return (
                <li key={`d-${d.kind}-${d.dueDateIso}`}>
                  <Link
                    href="/calendar"
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 p-3 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-foreground/30 ${URGENCY_CARD[u]}`}
                  >
                    <span className="text-base font-bold tabular-nums">{d.dueDateIso}</span>
                    <span className="min-w-40 flex-1 text-sm font-medium leading-snug">
                      <Tri bm={label.bm} zh={label.zh} en={label.en} sep=" " />
                    </span>
                    <span className="shrink-0 text-sm">
                      <Tri {...daysLeftParts(d, todayIso)} />
                    </span>
                    <Badge variant="outline" className={`shrink-0 text-sm ${s.cls}`}>
                      {s.icon} <Tri bm={s.bm} zh={s.zh} en={s.en} />
                    </Badge>
                  </Link>
                </li>
              );
            }
            const ev = item.event;
            const left = daysBetween(todayIso, ev.dateIso);
            return (
              <li key={`e-${ev.id}`}>
                <Link
                  href="/calendar"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-sky-300 bg-sky-50/80 p-3 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-sky-400"
                >
                  <span className="text-base font-bold tabular-nums">{ev.dateIso}</span>
                  <span className="min-w-40 flex-1 text-sm font-medium leading-snug">
                    {ev.title}
                    {ev.timeText && <span className="text-muted-foreground"> · {ev.timeText}</span>}
                  </span>
                  <span className="shrink-0 text-sm">
                    {left === 0
                      ? t("HARI INI", "今天", "TODAY")
                      : t(`${left} hari lagi`, `还有${left}天`, `${left} days left`)}
                  </span>
                  <Badge variant="outline" className="shrink-0 border-sky-300 bg-white text-sm text-sky-900 dark:bg-white/10">
                    🎉 <Tri bm="Acara" zh="活动" en="Event" />
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
