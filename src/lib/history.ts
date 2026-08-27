// ---------------------------------------------------------------------------
// ACTIVITY HISTORY CALENDAR — pure logic (no AI, no I/O). Groups the org's
// recorded activity into calendar days, builds the month grid, and sums the
// per-day money totals in TypeScript (CLAUDE.md Hard Rule 2 — no LLM is
// involved anywhere in this feature).
//
// Timezone: Malaysia is UTC+8 with no daylight saving, so bucketing a
// timestamptz into a Malaysian calendar day is a fixed +8h shift — fully
// deterministic and unit-testable. Plain `date` columns (meeting_date,
// donated_at, spent_at) are already calendar days and pass through as-is.
// ---------------------------------------------------------------------------

import { assertIsoDate } from "./deadlines";

export const MALAYSIA_UTC_OFFSET_HOURS = 8;

/** Categories that appear as dots on the month grid. `deadline` and `event`
 *  are FUTURE items (outlined dots); the rest are recorded history (filled).
 *
 *  `agm` / `calendar` vs `event`: all three come from the same
 *  `events_meetings` table, split by WHEN. A meeting that has already happened
 *  is history (filled dot, appears in /history); one still to come is a future
 *  item (outlined dot, /calendar only). AGM meetings get their own category
 *  because they are the filing-critical ones. See db/activity.ts. */
export const ACTIVITY_CATEGORIES = [
  "minutes",
  "money",
  "filings",
  "uploads",
  "agm",
  "constitution",
  "calendar",
  "qa",
  "deadline",
  "event",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export type ActivityRecord = {
  category: ActivityCategory;
  /** Which kind of row inside the category, e.g. "receipt" | "expense". */
  kind: string;
  /** Malaysian calendar day YYYY-MM-DD. */
  dayIso: string;
  /** Where the bullet links to, e.g. "/money/history#receipt-12". */
  href: string;
  /** Money rows only — summed in TypeScript, never by an LLM. */
  amountCents?: number;
  /** D18 + §1-10 (work order 32): the display value MAY be the full donor
   *  name — in-app views show whose record it is; masking belongs to the
   *  moments data leaves the app. Still NEVER an IC number or document
   *  contents, and none of this ever reaches an AI model or a log. */
  detail?: string;
  /** §1-11 (work order 32): the record's full timestamp, when its table has
   *  one, so the feed can print the TIME as well as the day. Optional —
   *  date-only tables (donated_at, spent_at) may have nothing better. */
  atIso?: string;
  /** WHO did it, where the table records it (confirmed_by, collector name,
   *  confirmed_by_hq). Committee/office-bearer names only — never donors. */
  actor?: string;
};

/** One bullet line in the day panel: "3 resit dikeluarkan · RM450.00". */
export type SummaryLine = {
  category: ActivityCategory;
  kind: string;
  count: number;
  /** Present when at least one record in the group carries an amount. */
  totalCents?: number;
  href: string;
  /** Masked details, first few only (e.g. donor_masked values). */
  details: string[];
};

// --- timezone bucketing ------------------------------------------------------

/**
 * The Malaysian (UTC+8) calendar day containing a timestamptz.
 * Accepts anything Date.parse understands (Supabase returns ISO 8601).
 * Returns null for unparseable input — a bad timestamp must never crash
 * the whole calendar.
 */
export function dayIsoMalaysia(timestamp: string): string | null {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return null;
  const shifted = new Date(ms + MALAYSIA_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Today's calendar day in Malaysia (UTC+8), never UTC.
 *
 * Every receipt date, hand-over date and month-end boundary in /money is
 * stamped with this. Using `new Date().toISOString().slice(0,10)` instead is
 * wrong for eight hours a day: between midnight and 8am Malaysian time UTC is
 * still on YESTERDAY, so a receipt issued at 1am carries the previous day —
 * and, on the 1st of a month, the previous MONTH's e-Invois pack.
 *
 * Moved out of money-review.tsx on 2026-08-23 when that page was split into
 * four; three of the four need it.
 */
export function todayIsoMalaysia(): string {
  return dayIsoMalaysia(new Date().toISOString()) as string;
}

/**
 * P-3 (work order 31): a timestamptz printed FOR A HUMAN, in Malaysian time,
 * saying so — "2026-08-27 14:05 MYT".
 *
 * Why this exists: pages were printing `created_at.slice(0, 16)` (raw UTC
 * dressed up as local time — off by 8 hours for every Malaysian reader) and
 * `toLocaleString("ms-MY")` with no timeZone (the SERVER's zone, which on
 * Vercel is UTC again). Malaysia is UTC+8 with no DST, so the fixed shift is
 * exact, deterministic and unit-testable — same reasoning as dayIsoMalaysia
 * above. The label is printed because a bare time invites the reader to guess.
 *
 * Returns "—" for null/absent/unparseable input: a bad timestamp must never
 * crash a page, and an em-dash is honest about "we do not know when".
 */
export function formatMytDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return "—";
  const shifted = new Date(ms + MALAYSIA_UTC_OFFSET_HOURS * 3_600_000);
  return `${shifted.toISOString().slice(0, 16).replace("T", " ")} MYT`;
}

/**
 * §1-11 (work order 32): just the CLOCK TIME of a timestamptz, Malaysian,
 * "14:05" — for lists already grouped under a day heading, where repeating
 * the date on every row is noise. Returns null when there is no usable
 * timestamp, so callers can simply not render anything.
 */
export function timeMytOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return null;
  const shifted = new Date(ms + MALAYSIA_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(11, 16);
}

// --- month math (all UTC, deterministic) --------------------------------------

const MONTH_RE = /^\d{4}-\d{2}$/;

export function assertYearMonth(ym: string): void {
  if (!MONTH_RE.test(ym)) throw new Error(`Not a valid YYYY-MM month: "${ym}"`);
  const m = Number(ym.slice(5, 7));
  if (m < 1 || m > 12) throw new Error(`Not a valid YYYY-MM month: "${ym}"`);
}

/** "2026-07" → "2026-06"; handles January → previous December. */
export function prevMonth(ym: string): string {
  assertYearMonth(ym);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "2026-12" → "2027-01". */
export function nextMonth(ym: string): string {
  assertYearMonth(ym);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** First and last day of the month, e.g. "2026-07" → 2026-07-01 / 2026-07-31. */
export function monthRange(ym: string): { firstIso: string; lastIso: string } {
  assertYearMonth(ym);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last of this
  return {
    firstIso: `${ym}-01`,
    lastIso: last.toISOString().slice(0, 10),
  };
}

/**
 * UTC time window covering the Malaysian calendar month, for querying
 * timestamptz columns. Malaysian 2026-07-01 00:00 is 2026-06-30T16:00:00Z.
 */
export function monthUtcWindow(ym: string): { startUtc: string; endUtc: string } {
  const { firstIso } = monthRange(ym);
  const startMs =
    Date.parse(`${firstIso}T00:00:00Z`) - MALAYSIA_UTC_OFFSET_HOURS * 3_600_000;
  const nextFirst = `${nextMonth(ym)}-01`;
  const endMs =
    Date.parse(`${nextFirst}T00:00:00Z`) - MALAYSIA_UTC_OFFSET_HOURS * 3_600_000;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
  };
}

export type DayCell = {
  dayIso: string;
  /** Day-of-month number, 1–31 (of its own month, even when outside). */
  dayNum: number;
  /** False for the leading/trailing days that pad the first/last week. */
  inMonth: boolean;
};

/**
 * Sunday-start month grid (matches Google Calendar), as whole weeks of 7
 * cells. Leading/trailing cells come from the neighbouring months with
 * inMonth=false. 4–6 weeks depending on the month.
 */
export function monthGrid(ym: string): DayCell[][] {
  const { firstIso, lastIso } = monthRange(ym);
  const first = new Date(`${firstIso}T00:00:00Z`);
  const daysInMonth = Number(lastIso.slice(8, 10));
  const leading = first.getUTCDay(); // 0 = Sunday, so this IS the pad count
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: DayCell[][] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + (i - leading));
    const dayIso = d.toISOString().slice(0, 10);
    const cell: DayCell = {
      dayIso,
      dayNum: d.getUTCDate(),
      inMonth: i >= leading && i < leading + daysInMonth,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

// --- bucketing + summaries -----------------------------------------------------

export function bucketByDay(records: ActivityRecord[]): Map<string, ActivityRecord[]> {
  const map = new Map<string, ActivityRecord[]>();
  for (const r of records) {
    assertIsoDate(r.dayIso);
    const list = map.get(r.dayIso);
    if (list) list.push(r);
    else map.set(r.dayIso, [r]);
  }
  return map;
}

/** Distinct categories present on a day, in ACTIVITY_CATEGORIES order —
 *  drives the dots in the grid cell. */
export function dayCategories(records: ActivityRecord[]): ActivityCategory[] {
  const present = new Set(records.map((r) => r.category));
  return ACTIVITY_CATEGORIES.filter((c) => present.has(c));
}

const MAX_DETAILS_PER_LINE = 5;

/**
 * Group one day's records into bullet lines: one line per (category, kind),
 * counting rows and summing amount_cents in TypeScript. Line order follows
 * ACTIVITY_CATEGORIES, then kind alphabetically.
 */
export function daySummary(records: ActivityRecord[]): SummaryLine[] {
  const groups = new Map<string, SummaryLine>();
  for (const r of records) {
    const key = `${r.category}|${r.kind}`;
    let line = groups.get(key);
    if (!line) {
      line = { category: r.category, kind: r.kind, count: 0, href: r.href, details: [] };
      groups.set(key, line);
    }
    line.count++;
    if (typeof r.amountCents === "number") {
      line.totalCents = (line.totalCents ?? 0) + r.amountCents;
    }
    if (r.detail && line.details.length < MAX_DETAILS_PER_LINE) {
      line.details.push(r.detail);
    }
  }
  const catRank = new Map(ACTIVITY_CATEGORIES.map((c, i) => [c, i]));
  return [...groups.values()].sort((a, b) => {
    const ca = catRank.get(a.category) ?? 99;
    const cb = catRank.get(b.category) ?? 99;
    if (ca !== cb) return ca - cb;
    return a.kind.localeCompare(b.kind);
  });
}

// --- future items (deadlines + events) ----------------------------------------

/** A deadline plotted on the grid as a FUTURE (outlined) item. */
export function futureRecordFromDeadline(d: {
  kind: string;
  dueDateIso: string;
}): ActivityRecord {
  assertIsoDate(d.dueDateIso);
  return {
    category: "deadline",
    kind: d.kind,
    dayIso: d.dueDateIso,
    href: "/calendar", // detail lives on the Deadlines tab
  };
}

/**
 * A society event plotted on the grid. FUTURE (outlined) by default; pass
 * `todayIso` and an event on or before that day becomes recorded history
 * (`calendar`, filled dot) instead — the same past/future rule db/activity.ts
 * applies to DB-stored meetings, so a locally added event that has already
 * happened does not keep looking upcoming.
 */
export function futureRecordFromEvent(
  e: { title: string; dateIso: string },
  todayIso?: string,
): ActivityRecord {
  assertIsoDate(e.dateIso);
  if (todayIso !== undefined) assertIsoDate(todayIso);
  const past = todayIso !== undefined && e.dateIso <= todayIso;
  return {
    category: past ? "calendar" : "event",
    kind: "event",
    dayIso: e.dateIso,
    href: "/calendar",
    detail: e.title,
  };
}

// --- /history feed (pure, unit-tested) ----------------------------------------

/** Categories that are recorded history (filled dots) — the /history feed
 *  shows ONLY these; future items (deadline/event) belong to /calendar.
 *
 *  `qa` is deliberately ABSENT: constitution questions still get a dot on
 *  /calendar, but they are lookups rather than things the org did, so they no
 *  longer clutter the history feed. */
export const HISTORY_CATEGORIES = [
  "minutes",
  "money",
  "filings",
  "uploads",
  "agm",
  "constitution",
  "calendar",
] as const satisfies readonly ActivityCategory[];

export type HistoryFilter = "all" | (typeof HISTORY_CATEGORIES)[number];

/**
 * Apply a /history filter chip. "all" means every HISTORY category — future
 * items (deadline/event) are always excluded, whatever the chip.
 */
export function filterByCategory(
  records: ActivityRecord[],
  filter: HistoryFilter,
): ActivityRecord[] {
  const allowed: readonly ActivityCategory[] =
    filter === "all" ? HISTORY_CATEGORIES : [filter];
  return records.filter((r) => allowed.includes(r.category));
}

export type FeedDay = { dayIso: string; records: ActivityRecord[] };

/**
 * Group records into a newest-day-first feed. Within a day, rows follow
 * ACTIVITY_CATEGORIES order, then kind alphabetically — same ordering rule
 * as daySummary so the feed and the calendar day panel never disagree.
 */
export function feedDays(records: ActivityRecord[]): FeedDay[] {
  const buckets = bucketByDay(records);
  const catRank = new Map(ACTIVITY_CATEGORIES.map((c, i) => [c, i]));
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dayIso, list]) => ({
      dayIso,
      records: [...list].sort((a, b) => {
        const ca = catRank.get(a.category) ?? 99;
        const cb = catRank.get(b.category) ?? 99;
        if (ca !== cb) return ca - cb;
        return a.kind.localeCompare(b.kind);
      }),
    }));
}

export type RecentRow = { dayIso: string; record: ActivityRecord };

/**
 * The home dashboard's "Baru-baru ini / Recent activity" slice: feedDays()
 * flattened newest-day-first and capped at `limit`, so the preview always
 * agrees with the full /history feed. It runs the same HISTORY_CATEGORIES
 * filter the feed's "all" chip does — otherwise categories the feed hides
 * (future items, qa) would leak onto the home page.
 */
/**
 * NOTE (2026-07-28): currently used only by its own unit tests. It existed for a
 * "recent activity" block on the home page that was never wired up; that file has
 * been deleted, and the home page now leads with the AI intake box instead.
 * Kept because it is small, pure and tested — if a recent-activity strip comes
 * back, this is the shape it needs.
 */
export function recentRows(records: ActivityRecord[], limit: number): RecentRow[] {
  return feedDays(filterByCategory(records, "all"))
    .flatMap((d) => d.records.map((record) => ({ dayIso: d.dayIso, record })))
    .slice(0, Math.max(0, limit));
}

/**
 * Merge history + future records, dropping duplicate future items (same
 * category+kind+day) that arrive from both the client-computed deadlines and
 * the DB `deadlines` table.
 */
export function mergeRecords(
  history: ActivityRecord[],
  future: ActivityRecord[],
): ActivityRecord[] {
  const seen = new Set<string>();
  const out = [...history];
  for (const f of future) {
    const key = `${f.category}|${f.kind}|${f.dayIso}|${f.detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
