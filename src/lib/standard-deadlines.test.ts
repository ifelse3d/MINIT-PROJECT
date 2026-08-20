import { describe, expect, it } from "vitest";
import type { Deadline } from "./deadlines";
import type { SimpleEvent } from "./local-events";
import {
  computeStandardDeadlines,
  mergeUpcoming,
  type ConfirmedAgm,
} from "./standard-deadlines";

// ---------------------------------------------------------------------------
// computeStandardDeadlines — an AGM on 2026-06-14 confirmed 2026-06-20
// + 60 days = annual return due 2026-08-13; e-Invois recurs at month-end.
// ---------------------------------------------------------------------------
const agm: ConfirmedAgm = {
  meetingDateIso: "2026-06-14",
  confirmedBy: "Setiausaha",
  confirmedOnIso: "2026-06-20",
};

describe("computeStandardDeadlines", () => {
  it("returns the annual return plus the next 3 month-ends, urgency-sorted", () => {
    const out = computeStandardDeadlines("2026-07-19", { agm });
    expect(out.map((d) => `${d.kind}:${d.dueDateIso}`)).toEqual([
      "einvois_monthend:2026-07-31", // 12 days left → due_soon, ranks first
      "annual_return_60d:2026-08-13", // 25 days left → ok
      "einvois_monthend:2026-08-31",
      "einvois_monthend:2026-09-30",
    ]);
  });

  it("respects einvoisCount", () => {
    const out = computeStandardDeadlines("2026-07-19", { agm, einvoisCount: 1 });
    expect(out.filter((d) => d.kind === "einvois_monthend")).toHaveLength(1);
  });

  it("ranks the annual return first once it is overdue", () => {
    const out = computeStandardDeadlines("2026-08-20", { agm });
    expect(out[0]).toMatchObject({ kind: "annual_return_60d", dueDateIso: "2026-08-13" });
  });

  // 2026-07-28 audit: the annual-return deadline used to be derived from
  // FICTIONAL sample minutes, so every organisation saw the same invented due
  // date attributed to an invented secretary. With no confirmed AGM we must
  // emit no annual-return row at all rather than guess one.
  it("emits NO annual return when the org has no confirmed AGM", () => {
    const out = computeStandardDeadlines("2026-07-19", { agm: null });
    expect(out.some((d) => d.kind === "annual_return_60d")).toBe(false);
    expect(out.every((d) => d.kind === "einvois_monthend")).toBe(true);
  });

  it("defaults to no AGM when the caller says nothing", () => {
    const out = computeStandardDeadlines("2026-07-19");
    expect(out.some((d) => d.kind === "annual_return_60d")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergeUpcoming — one chronological list for the home dashboard
// ---------------------------------------------------------------------------
const today = "2026-07-19";

function deadline(dueDateIso: string, status: Deadline["status"] = "open"): Deadline {
  return { kind: "einvois_monthend", dueDateIso, source: "test", status };
}

function event(id: string, dateIso: string): SimpleEvent {
  return { id, title: `Acara ${id}`, dateIso, timeText: "" };
}

describe("mergeUpcoming", () => {
  it("interleaves deadlines and events chronologically", () => {
    const out = mergeUpcoming(
      [deadline("2026-07-31")],
      [event("a", "2026-07-25"), event("b", "2026-08-02")],
      today,
      5,
    );
    expect(out.map((i) => i.dateIso)).toEqual(["2026-07-25", "2026-07-31", "2026-08-02"]);
  });

  it("drops past events but keeps today's", () => {
    const out = mergeUpcoming([], [event("past", "2026-07-18"), event("now", today)], today, 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "event", dateIso: today });
  });

  it("keeps overdue deadlines (they sort first) and excludes done ones", () => {
    const out = mergeUpcoming(
      [deadline("2026-07-10"), deadline("2026-06-30", "done"), deadline("2026-07-31")],
      [],
      today,
      5,
    );
    expect(out.map((i) => i.dateIso)).toEqual(["2026-07-10", "2026-07-31"]);
  });

  it("caps at limit", () => {
    const out = mergeUpcoming(
      [deadline("2026-07-31"), deadline("2026-08-31")],
      [event("a", "2026-07-20"), event("b", "2026-07-21")],
      today,
      3,
    );
    expect(out).toHaveLength(3);
    expect(out.map((i) => i.dateIso)).toEqual(["2026-07-20", "2026-07-21", "2026-07-31"]);
  });

  it("shows the deadline before the event on a same-day tie", () => {
    const out = mergeUpcoming([deadline("2026-07-31")], [event("a", "2026-07-31")], today, 5);
    expect(out.map((i) => i.type)).toEqual(["deadline", "event"]);
  });
});
