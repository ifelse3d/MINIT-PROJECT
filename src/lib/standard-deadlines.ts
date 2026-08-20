// ---------------------------------------------------------------------------
// STANDARD DEADLINES — the one place that decides which compliance deadlines
// every surface (home dashboard, /calendar sidebar, /filings) shows.
// Pure logic (no AI, no I/O), unit-tested.
//
// 2026-07-28 AUDIT FIX — this file used to INVENT a compliance deadline.
//
// It derived the ROS annual-return due date from `sampleConfirmedMinutes`, a
// FICTIONAL AGM held by a fictional temple on 2026-06-14 and confirmed by a
// fictional secretary. Every organisation therefore saw the same fake deadline,
// and `deadlines.ts` wrote that fictional provenance into `d.source`
// ("Minit AGM 2026-06-14 disahkan oleh Lim Bee Hoon (Setiausaha) pada …"),
// which /filings rendered verbatim under the caption "Computed by the system,
// not the AI" — with no sample-data badge. A real committee could have missed a
// real 60-day deadline because this one looked authoritative.
//
// Now the annual return is only produced when the caller supplies a REAL
// confirmed AGM. `agm: null` (no confirmed AGM in the database yet) yields no
// annual-return row at all, and the UI says so instead of showing a number
// nobody can act on. Callers pass `agm: sampleConfirmedMinutes` ONLY on
// surfaces that also carry a visible "sample data" badge.
// ---------------------------------------------------------------------------

import {
  annualReturnDeadline,
  sortDeadlines,
  upcomingEinvoisDeadlines,
  type Deadline,
} from "./deadlines";
import type { SimpleEvent } from "./local-events";

/** The confirmed AGM that starts the 60-day annual-return clock. */
export type ConfirmedAgm = {
  meetingDateIso: string;
  confirmedBy: string | null;
  confirmedOnIso: string | null;
};

export type StandardDeadlineOptions = {
  /**
   * The organisation's most recent CONFIRMED AGM minutes, or null when it has
   * none. Null means no annual-return deadline is emitted — we do not guess.
   */
  agm?: ConfirmedAgm | null;
  einvoisCount?: number;
};

/**
 * The compliance deadlines to show: the annual return for a real confirmed AGM
 * (when one exists) plus the next `einvoisCount` e-Invois month-ends,
 * urgency-sorted.
 */
export function computeStandardDeadlines(
  todayIso: string,
  options: StandardDeadlineOptions = {},
): Deadline[] {
  const { agm = null, einvoisCount = 3 } = options;

  const einvois = upcomingEinvoisDeadlines(todayIso, einvoisCount);
  if (!agm) return sortDeadlines(einvois, todayIso);

  const annual = annualReturnDeadline(
    agm.meetingDateIso,
    agm.confirmedBy ?? "AJK",
    agm.confirmedOnIso ?? agm.meetingDateIso,
  );
  return sortDeadlines([annual, ...einvois], todayIso);
}

/** One row of the home "Akan datang / Upcoming" list. */
export type UpcomingItem =
  | { type: "deadline"; dateIso: string; deadline: Deadline }
  | { type: "event"; dateIso: string; event: SimpleEvent };

/**
 * Merge open deadlines with future society events into one chronological
 * list, capped at `limit`. Overdue deadlines carry past dates, so plain
 * date order naturally surfaces them first; past events are dropped and
 * `done` deadlines are excluded. Same-day ties show deadlines before events.
 */
export function mergeUpcoming(
  deadlines: Deadline[],
  events: SimpleEvent[],
  todayIso: string,
  limit: number,
): UpcomingItem[] {
  const items: UpcomingItem[] = [
    ...deadlines
      .filter((d) => d.status !== "done")
      .map((d): UpcomingItem => ({ type: "deadline", dateIso: d.dueDateIso, deadline: d })),
    ...events
      .filter((ev) => ev.dateIso >= todayIso)
      .map((ev): UpcomingItem => ({ type: "event", dateIso: ev.dateIso, event: ev })),
  ];
  return items
    .sort((a, b) => {
      if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
      if (a.type !== b.type) return a.type === "deadline" ? -1 : 1;
      return 0;
    })
    .slice(0, Math.max(0, limit));
}
