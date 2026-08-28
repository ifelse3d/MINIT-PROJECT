import { describe, expect, it } from "vitest";
import { emptyMeetingNotesExtraction } from "@/lib/extraction";
import { cleanMinutesTitle, suggestMinutesTitle } from "@/lib/minutes-title";

function withFacts(over: {
  type?: string;
  typeLabel?: string;
  date?: string;
}) {
  const e = structuredClone(emptyMeetingNotesExtraction);
  if (over.type !== undefined) {
    e.meeting_type = {
      value: over.type as typeof e.meeting_type.value,
      confidence: "confirmed",
      source_ref: { location: "t", snippet: over.type },
    };
  }
  if (over.typeLabel !== undefined) e.meeting_type_label = over.typeLabel;
  if (over.date !== undefined) {
    e.meeting_date = {
      value: over.date,
      confidence: "confirmed",
      source_ref: { location: "t", snippet: over.date },
    };
  }
  return e;
}

describe("suggestMinutesTitle", () => {
  it("is type — date, in the document's language", () => {
    const e = withFacts({ type: "event", date: "2026-07-26" });
    expect(suggestMinutesTitle(e, "bm")).toBe(
      "Mesyuarat Program / Aktiviti — 2026-07-26",
    );
    expect(suggestMinutesTitle(e, "zh")).toBe("活动会议 — 2026-07-26");
  });

  it('uses the society\'s own label for an "other" meeting', () => {
    const e = withFacts({ type: "other", typeLabel: "青年组周会", date: "2026-07-26" });
    expect(suggestMinutesTitle(e, "bm")).toBe("青年组周会 — 2026-07-26");
  });

  it("degrades: type only, date only, nothing", () => {
    expect(suggestMinutesTitle(withFacts({ type: "agm" }), "bm")).toBe(
      "Mesyuarat Agung Tahunan (AGM)",
    );
    expect(suggestMinutesTitle(withFacts({ date: "2026-01-02" }))).toBe("2026-01-02");
    expect(suggestMinutesTitle(structuredClone(emptyMeetingNotesExtraction))).toBe("");
  });
});

describe("cleanMinutesTitle", () => {
  it("collapses whitespace and caps the length", () => {
    expect(cleanMinutesTitle("  a\n  b\t c  ")).toBe("a b c");
    expect(cleanMinutesTitle("x".repeat(500))).toHaveLength(200);
  });
});
