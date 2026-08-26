import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CATEGORIES,
  HISTORY_CATEGORIES,
  bucketByDay,
  dayCategories,
  dayIsoMalaysia,
  formatMytDateTime,
  todayIsoMalaysia,
  daySummary,
  feedDays,
  filterByCategory,
  futureRecordFromDeadline,
  futureRecordFromEvent,
  mergeRecords,
  monthGrid,
  monthRange,
  monthUtcWindow,
  nextMonth,
  prevMonth,
  recentRows,
  type ActivityRecord,
} from "./history";

// ---------------------------------------------------------------------------
// UTC+8 bucketing — a receipt issued late evening Malaysia time is stored as
// a UTC timestamp on the "previous" UTC day; it must still land on the
// Malaysian calendar day.
// ---------------------------------------------------------------------------
describe("dayIsoMalaysia", () => {
  it("shifts UTC timestamps into the Malaysian (UTC+8) day", () => {
    expect(dayIsoMalaysia("2026-07-18T17:30:00Z")).toBe("2026-07-19"); // 01:30 MYT
    expect(dayIsoMalaysia("2026-07-18T15:59:00Z")).toBe("2026-07-18"); // 23:59 MYT
    expect(dayIsoMalaysia("2026-07-18T16:00:00Z")).toBe("2026-07-19"); // midnight MYT
  });

  it("crosses month and year boundaries", () => {
    expect(dayIsoMalaysia("2026-06-30T16:00:00Z")).toBe("2026-07-01");
    expect(dayIsoMalaysia("2025-12-31T16:00:00Z")).toBe("2026-01-01");
  });

  it("accepts Supabase timestamptz format with offset", () => {
    expect(dayIsoMalaysia("2026-07-18T23:30:00+08:00")).toBe("2026-07-18");
  });

  it("returns null instead of crashing on garbage", () => {
    expect(dayIsoMalaysia("not a date")).toBeNull();
  });
});

describe("month math", () => {
  it("prev/next month including year rollover", () => {
    expect(prevMonth("2026-07")).toBe("2026-06");
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(nextMonth("2026-07")).toBe("2026-08");
    expect(nextMonth("2026-12")).toBe("2027-01");
  });

  it("monthRange handles short and leap months", () => {
    expect(monthRange("2026-07")).toEqual({ firstIso: "2026-07-01", lastIso: "2026-07-31" });
    expect(monthRange("2026-02")).toEqual({ firstIso: "2026-02-01", lastIso: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ firstIso: "2028-02-01", lastIso: "2028-02-29" });
  });

  it("monthUtcWindow is the Malaysian month shifted back 8 hours", () => {
    expect(monthUtcWindow("2026-07")).toEqual({
      startUtc: "2026-06-30T16:00:00.000Z",
      endUtc: "2026-07-31T16:00:00.000Z",
    });
  });

  it("rejects malformed months", () => {
    expect(() => prevMonth("2026-13")).toThrow();
    expect(() => nextMonth("July 2026")).toThrow();
  });
});

describe("monthGrid (Sunday-start, like Google Calendar)", () => {
  it("July 2026 starts on a Wednesday → 3 leading days, 5 weeks", () => {
    const weeks = monthGrid("2026-07");
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ dayIso: "2026-06-28", dayNum: 28, inMonth: false });
    expect(weeks[0][3]).toEqual({ dayIso: "2026-07-01", dayNum: 1, inMonth: true });
    expect(weeks[4][6]).toEqual({ dayIso: "2026-08-01", dayNum: 1, inMonth: false });
  });

  it("February 2026 starts on a Sunday with 28 days → exactly 4 full weeks", () => {
    const weeks = monthGrid("2026-02");
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toEqual({ dayIso: "2026-02-01", dayNum: 1, inMonth: true });
    expect(weeks[3][6]).toEqual({ dayIso: "2026-02-28", dayNum: 28, inMonth: true });
  });

  it("December rolls trailing cells into January of the next year", () => {
    const weeks = monthGrid("2026-12");
    const last = weeks[weeks.length - 1][6];
    expect(last.inMonth).toBe(false);
    expect(last.dayIso.startsWith("2027-01")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bucketing + summaries — money is summed HERE, in TypeScript (Hard Rule 2)
// ---------------------------------------------------------------------------
const day = "2026-07-15";
const records: ActivityRecord[] = [
  { category: "money", kind: "receipt", dayIso: day, href: "/money/history#receipt-1", amountCents: 10000, detail: "A*** b. R***" },
  { category: "money", kind: "receipt", dayIso: day, href: "/money/history#receipt-2", amountCents: 25000, detail: "T*** C***" },
  { category: "money", kind: "receipt", dayIso: day, href: "/money/history#receipt-3", amountCents: 10000, detail: "L*** M***" },
  { category: "money", kind: "expense", dayIso: day, href: "/money/history", amountCents: 4550 },
  { category: "minutes", kind: "minutes", dayIso: day, href: "/minutes/history#minutes-7" },
  { category: "uploads", kind: "upload", dayIso: "2026-07-16", href: "/inbox" },
];

describe("bucketByDay / dayCategories", () => {
  it("groups records per Malaysian day", () => {
    const map = bucketByDay(records);
    expect(map.get(day)).toHaveLength(5);
    expect(map.get("2026-07-16")).toHaveLength(1);
    expect(map.get("2026-07-17")).toBeUndefined();
  });

  it("lists distinct categories in fixed dot order", () => {
    expect(dayCategories(bucketByDay(records).get(day)!)).toEqual(["minutes", "money"]);
  });

  it("rejects malformed day keys", () => {
    expect(() =>
      bucketByDay([{ category: "qa", kind: "qa", dayIso: "15/07/2026", href: "/constitution" }]),
    ).toThrow();
  });
});

describe("daySummary", () => {
  it("sums RM totals per line in TypeScript and keeps masked details", () => {
    const lines = daySummary(bucketByDay(records).get(day)!);
    expect(lines.map((l) => `${l.category}/${l.kind}`)).toEqual([
      "minutes/minutes",
      "money/expense",
      "money/receipt",
    ]);
    const receipts = lines.find((l) => l.kind === "receipt")!;
    expect(receipts.count).toBe(3);
    expect(receipts.totalCents).toBe(45000); // RM450.00
    expect(receipts.details).toEqual(["A*** b. R***", "T*** C***", "L*** M***"]);
    const minutes = lines.find((l) => l.kind === "minutes")!;
    expect(minutes.totalCents).toBeUndefined();
  });
});

describe("future records", () => {
  it("wraps deadlines and events as future items", () => {
    expect(futureRecordFromDeadline({ kind: "annual_return_60d", dueDateIso: "2026-08-13" })).toEqual({
      category: "deadline",
      kind: "annual_return_60d",
      dayIso: "2026-08-13",
      href: "/calendar",
    });
    expect(futureRecordFromEvent({ title: "Makan malam tahunan", dateIso: "2026-09-12" }).detail).toBe(
      "Makan malam tahunan",
    );
  });

  // Google Calendar rule: once a date has passed, the entry is history, not
  // something upcoming. Same split db/activity.ts applies to stored meetings.
  it("reclassifies an event that has already happened as history", () => {
    const today = "2026-07-27";
    const past = futureRecordFromEvent({ title: "Gotong-royong", dateIso: "2026-07-19" }, today);
    expect(past.category).toBe("calendar");
    const onToday = futureRecordFromEvent({ title: "Kelas", dateIso: today }, today);
    expect(onToday.category).toBe("calendar");
    const soon = futureRecordFromEvent({ title: "AGM", dateIso: "2026-08-02" }, today);
    expect(soon.category).toBe("event");
  });

  it("still treats every event as future when no today is supplied", () => {
    expect(futureRecordFromEvent({ title: "Lama", dateIso: "2020-01-01" }).category).toBe("event");
  });

  it("rejects a malformed todayIso rather than silently mis-sorting", () => {
    expect(() =>
      futureRecordFromEvent({ title: "X", dateIso: "2026-07-19" }, "27/07/2026"),
    ).toThrow();
  });

  it("mergeRecords dedupes identical future items from two sources", () => {
    const fromClient = futureRecordFromDeadline({ kind: "einvois_monthend", dueDateIso: "2026-07-31" });
    const fromDb = futureRecordFromDeadline({ kind: "einvois_monthend", dueDateIso: "2026-07-31" });
    const merged = mergeRecords([records[0]], [fromClient, fromDb]);
    expect(merged).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// /history feed helpers
// ---------------------------------------------------------------------------
describe("filterByCategory", () => {
  const mixed: ActivityRecord[] = [
    { category: "minutes", kind: "minutes", dayIso: "2026-07-10", href: "/minutes/history#minutes-1" },
    { category: "money", kind: "receipt", dayIso: "2026-07-10", href: "/money/history#receipt-1", amountCents: 5000 },
    { category: "agm", kind: "agm", dayIso: "2026-07-12", href: "/agm-pack", detail: "Mesyuarat Agung 2026" },
    { category: "constitution", kind: "constitution", dayIso: "2026-07-12", href: "/constitution" },
    { category: "calendar", kind: "event", dayIso: "2026-07-13", href: "/calendar", detail: "Gotong-royong" },
    { category: "qa", kind: "qa", dayIso: "2026-07-11", href: "/constitution" },
    { category: "deadline", kind: "annual_return_60d", dayIso: "2026-07-31", href: "/calendar" },
    { category: "event", kind: "event", dayIso: "2026-07-20", href: "/calendar", detail: "AGM" },
  ];

  it('"all" keeps every HISTORY category but always drops future items', () => {
    const out = filterByCategory(mixed, "all");
    expect(out).toHaveLength(5);
    expect(out.every((r) => r.category !== "deadline" && r.category !== "event")).toBe(true);
  });

  // qa still gets a dot on /calendar, so it stays in ACTIVITY_CATEGORIES — but
  // it is no longer a chip on /history and "all" must not let it through.
  it("drops qa from the history feed while keeping it a valid category", () => {
    expect(filterByCategory(mixed, "all").some((r) => r.category === "qa")).toBe(false);
    expect(HISTORY_CATEGORIES).not.toContain("qa");
    expect(ACTIVITY_CATEGORIES).toContain("qa");
  });

  it("a specific chip keeps only that category", () => {
    const out = filterByCategory(mixed, "money");
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("receipt");
  });

  it.each(["agm", "constitution", "calendar"] as const)(
    "the new %s chip filters to just its own rows",
    (cat) => {
      const out = filterByCategory(mixed, cat);
      expect(out).toHaveLength(1);
      expect(out[0].category).toBe(cat);
    },
  );

  it("every history chip is a real activity category", () => {
    for (const c of HISTORY_CATEGORIES) expect(ACTIVITY_CATEGORIES).toContain(c);
  });
});

describe("feedDays", () => {
  it("groups newest day first; rows within a day follow category then kind order", () => {
    const recs: ActivityRecord[] = [
      { category: "qa", kind: "qa", dayIso: "2026-07-05", href: "/constitution" },
      { category: "money", kind: "receipt", dayIso: "2026-07-18", href: "/money/history#receipt-9" },
      { category: "minutes", kind: "minutes", dayIso: "2026-07-18", href: "/minutes/history#minutes-3" },
      { category: "money", kind: "expense", dayIso: "2026-07-18", href: "/money" },
    ];
    const days = feedDays(recs);
    expect(days.map((d) => d.dayIso)).toEqual(["2026-07-18", "2026-07-05"]);
    // minutes before money (ACTIVITY_CATEGORIES order); expense before receipt (alphabetical kind)
    expect(days[0].records.map((r) => `${r.category}/${r.kind}`)).toEqual([
      "minutes/minutes",
      "money/expense",
      "money/receipt",
    ]);
  });

  it("returns an empty feed for no records", () => {
    expect(feedDays([])).toEqual([]);
  });

  it("keeps actor values intact on the records", () => {
    const days = feedDays([
      { category: "minutes", kind: "minutes", dayIso: "2026-07-01", href: "#", actor: "Lim Ah Kow" },
    ]);
    expect(days[0].records[0].actor).toBe("Lim Ah Kow");
  });
});

describe("recentRows (home dashboard slice)", () => {
  const recs: ActivityRecord[] = [
    { category: "constitution", kind: "constitution", dayIso: "2026-07-05", href: "/constitution" },
    { category: "money", kind: "receipt", dayIso: "2026-07-18", href: "/money/history#receipt-9" },
    { category: "minutes", kind: "minutes", dayIso: "2026-07-18", href: "/minutes/history#minutes-3" },
    { category: "money", kind: "expense", dayIso: "2026-07-18", href: "/money" },
  ];

  it("flattens newest-day-first with feedDays ordering inside a day", () => {
    const rows = recentRows(recs, 10);
    expect(rows.map((r) => `${r.dayIso} ${r.record.category}/${r.record.kind}`)).toEqual([
      "2026-07-18 minutes/minutes",
      "2026-07-18 money/expense",
      "2026-07-18 money/receipt",
      "2026-07-05 constitution/constitution",
    ]);
  });

  // The home preview must show exactly what the /history feed would: no qa,
  // no future deadlines/events leaking onto the dashboard.
  it("hides the categories the history feed hides", () => {
    const rows = recentRows(
      [
        ...recs,
        { category: "qa", kind: "qa", dayIso: "2026-07-19", href: "/constitution" },
        { category: "deadline", kind: "annual_return_60d", dayIso: "2026-07-31", href: "/calendar" },
        { category: "event", kind: "event", dayIso: "2026-07-20", href: "/calendar" },
      ],
      20,
    );
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.record.category)).not.toContain("qa");
  });

  it("caps at limit", () => {
    expect(recentRows(recs, 2)).toHaveLength(2);
  });

  it("handles empty input and a zero limit", () => {
    expect(recentRows([], 7)).toEqual([]);
    expect(recentRows(recs, 0)).toEqual([]);
  });
});

// 2026-08-23: moved here from money-review.tsx (the /money split). Every
// receipt date and every month-end boundary is stamped with this, so "it is
// the Malaysian day, not the UTC day" is worth a test rather than a comment.
describe("todayIsoMalaysia", () => {
  it("is a YYYY-MM-DD day", () => {
    expect(todayIsoMalaysia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("agrees with dayIsoMalaysia on the current instant", () => {
    const now = new Date().toISOString();
    expect(todayIsoMalaysia()).toBe(dayIsoMalaysia(now));
  });

  it("is UTC+8, so 00:30 UTC is already the NEXT day in Malaysia", () => {
    // The eight-hour window that made a 1am receipt carry yesterday's date —
    // and, on the 1st, the previous month's e-Invois pack.
    expect(dayIsoMalaysia("2026-08-23T00:30:00Z")).toBe("2026-08-23");
    expect(dayIsoMalaysia("2026-08-22T17:30:00Z")).toBe("2026-08-23");
    expect(dayIsoMalaysia("2026-08-22T15:30:00Z")).toBe("2026-08-22");
  });
});

// P-3 (work order 31): timestamps printed for humans are Malaysian time and
// SAY so. The bugs this pins down: /admin printed raw UTC dressed as local
// ("slice(0,16)"), and two pages used toLocaleString with no timeZone — the
// server's zone, which on Vercel is UTC again. Both were 8 hours off for
// every reader in Malaysia.
describe("formatMytDateTime", () => {
  it("shifts UTC to UTC+8 and labels it", () => {
    expect(formatMytDateTime("2026-08-27T06:05:00Z")).toBe("2026-08-27 14:05 MYT");
  });

  it("crosses the date line correctly (UTC evening = MYT next morning)", () => {
    expect(formatMytDateTime("2026-08-26T18:30:00Z")).toBe("2026-08-27 02:30 MYT");
  });

  it("answers an em-dash, never a crash, for missing or bad input", () => {
    expect(formatMytDateTime(null)).toBe("—");
    expect(formatMytDateTime(undefined)).toBe("—");
    expect(formatMytDateTime("not a timestamp")).toBe("—");
  });

  it("agrees with dayIsoMalaysia about which day it is", () => {
    const ts = "2026-08-22T17:30:00Z"; // 01:30 on the 23rd in Malaysia
    expect(formatMytDateTime(ts).slice(0, 10)).toBe(dayIsoMalaysia(ts));
  });
});
