import { describe, expect, it } from "vitest";
import {
  eventsOnDay,
  isSimpleEvent,
  makeEvent,
  mergeEvents,
  sortedByDate,
  type SimpleEvent,
} from "@/lib/local-events";

const ev = (id: string, dateIso: string, over: Partial<SimpleEvent> = {}): SimpleEvent => ({
  id,
  title: `Event ${id}`,
  dateIso,
  timeText: "",
  ...over,
});

describe("sortedByDate", () => {
  it("puts the calendar in date order", () => {
    const out = sortedByDate([ev("c", "2026-09-01"), ev("a", "2026-08-01"), ev("b", "2026-08-15")]);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [ev("b", "2026-09-01"), ev("a", "2026-08-01")];
    sortedByDate(input);
    expect(input.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("eventsOnDay", () => {
  it("keeps the order things were added in, within one day", () => {
    const day = [ev("1", "2026-08-23"), ev("2", "2026-08-23")];
    expect(eventsOnDay([...day, ev("3", "2026-08-24")], "2026-08-23").map((e) => e.id)).toEqual([
      "1",
      "2",
    ]);
  });
});

// ---------------------------------------------------------------------------
// mergeEvents — J's UX list, root cause B: the calendar lived in one browser,
// so signing in on another computer showed a society with nothing in it.
// ---------------------------------------------------------------------------
describe("mergeEvents", () => {
  it("keeps what only this device has, and what only the organisation has", () => {
    const out = mergeEvents([ev("local", "2026-08-01")], [ev("remote", "2026-09-01")]);
    expect(out.map((e) => e.id)).toEqual(["local", "remote"]);
  });

  // Taking either side wholesale deletes the other's work, and a deleted event
  // is a meeting nobody turns up to.
  it("never drops an event that exists on only one side", () => {
    expect(mergeEvents([ev("a", "2026-08-01")], [])).toHaveLength(1);
    expect(mergeEvents([], [ev("a", "2026-08-01")])).toHaveLength(1);
  });

  it("lets the organisation's copy win a collision, so devices converge", () => {
    const out = mergeEvents(
      [ev("x", "2026-08-01", { title: "old title on this phone" })],
      [ev("x", "2026-08-02", { title: "corrected by the secretary" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("corrected by the secretary");
    expect(out[0].dateIso).toBe("2026-08-02");
  });

  it("returns the merged list in date order, not two lists stapled together", () => {
    const out = mergeEvents(
      [ev("l1", "2026-08-20"), ev("l2", "2026-10-01")],
      [ev("r1", "2026-09-01")],
    );
    expect(out.map((e) => e.id)).toEqual(["l1", "r1", "l2"]);
  });

  it("does not mutate either side", () => {
    const local = [ev("a", "2026-08-01")];
    const remote = [ev("b", "2026-09-01")];
    mergeEvents(local, remote);
    expect(local).toHaveLength(1);
    expect(remote).toHaveLength(1);
  });

  it("copes with both sides empty", () => {
    expect(mergeEvents([], [])).toEqual([]);
  });
});

describe("isSimpleEvent", () => {
  it("accepts an event made by makeEvent", () => {
    expect(isSimpleEvent(makeEvent({ title: "AGM", dateIso: "2026-08-23" }))).toBe(true);
  });

  it("accepts an event carrying a note", () => {
    expect(isSimpleEvent(ev("a", "2026-08-23", { note: "kena tempah kerusi" }))).toBe(true);
  });

  // The date drives which square of the calendar it lands in; a malformed one
  // would simply never appear, which looks exactly like a lost event.
  it("rejects a date that is not YYYY-MM-DD", () => {
    expect(isSimpleEvent(ev("a", "23/8/2026"))).toBe(false);
    expect(isSimpleEvent(ev("a", ""))).toBe(false);
  });

  it("rejects a row with no id — nothing could ever update or delete it", () => {
    expect(isSimpleEvent(ev("", "2026-08-23"))).toBe(false);
  });

  it("rejects anything that is not an event-shaped object", () => {
    expect(isSimpleEvent(null)).toBe(false);
    expect(isSimpleEvent("2026-08-23")).toBe(false);
    expect(isSimpleEvent({ id: "a", title: "x", dateIso: "2026-08-23" })).toBe(false);
    expect(isSimpleEvent({ ...ev("a", "2026-08-23"), note: 42 })).toBe(false);
  });
});
