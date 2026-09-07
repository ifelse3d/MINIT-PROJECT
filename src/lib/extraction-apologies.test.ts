import { describe, expect, it } from "vitest";
import { emptyMeetingNotesExtraction, parseMeetingNotesExtraction } from "./extraction";

// ---------------------------------------------------------------------------
// 125 §2 — ON LEAVE IS NOT PRESENT, by code. On 2026-08-31 the reader listed
// the two people in the headcount line's 请假 bracket as the ONLY two
// attendees of J's AGM. The contract now moves them: the bracketed names of
// a leave count go to `apologies`, and anybody on leave is struck from
// `attendees`. Fictional names (A3).
// ---------------------------------------------------------------------------

const LINE = "理事12人,请假2人(张伟杰,王丽华),会员40人";
const field = (value: string) => ({
  value,
  confidence: "check" as const,
  source_ref: { location: "photo 1, line 2", snippet: value },
});

describe("🔴 125 §2 — the fixed input: the leave bracket's names are not attendees", () => {
  it("the 8/31 failure: attendees = the two on leave → attendees empty, apologies the two, count 52", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      attendance_count: field(LINE),
      attendees: [{ name: field("张伟杰") }, { name: field("王丽华") }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.attendees).toEqual([]);
    expect(parsed.data.apologies?.map((a) => a.name.value)).toEqual(["张伟杰", "王丽华"]);
    // Marked for a glance, sourced to the line they were read off.
    expect(parsed.data.apologies?.[0].name.confidence).toBe("check");
    expect(parsed.data.apologies?.[0].name.source_ref?.snippet).toBe(LINE);
    // The count itself is not in the contract — code counts the line on demand.
    expect(parsed.data.attendance_confirmed).toBeUndefined();
  });

  it("a real attendee list is untouched; only the people on leave are struck", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      attendance_count: field(LINE),
      attendees: [{ name: field("刘国华") }, { name: field("王丽华") }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.attendees.map((a) => a.name.value)).toEqual(["刘国华"]);
  });

  it("apologies the reader filled itself are kept and not duplicated by the line", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      attendance_count: field(LINE),
      attendees: [],
      apologies: [{ name: { ...field("张伟杰"), confidence: "confirmed" } }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.apologies?.map((a) => a.name.value)).toEqual(["张伟杰", "王丽华"]);
    expect(parsed.data.apologies?.[0].name.confidence).toBe("confirmed");
  });

  it("old data with no apologies key and no headcount line parses unchanged", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      attendees: [{ name: field("Tan Kim Loo") }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.apologies).toBeUndefined();
    expect(parsed.data.attendees).toHaveLength(1);
  });

  it("a malformed apologies array costs only itself; attendance_confirmed is never read from the model", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      apologies: "nonsense",
      attendance_confirmed: "52",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.apologies).toEqual([]);
    expect(parsed.data.attendance_confirmed).toBeUndefined();
  });
});
