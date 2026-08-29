import { describe, expect, it } from "vitest";
import {
  emptyMeetingNotesExtraction,
  parseMeetingNotesExtraction,
} from "@/lib/extraction";
import { countUnreviewed } from "@/lib/extraction-rows";

// G1 (work order 68): the extraction learns the standard minit's header and
// closing fields, plus document-structure markers on each resolution — so a
// printed formal document survives the pipeline with its shape intact.

const ref = (snippet: string) => ({ location: "page 1", snippet });
const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: ref(value),
});
const missing = () => ({
  value: "",
  confidence: "missing" as const,
  source_ref: null,
});

describe("G1 header/closing fields", () => {
  it("keeps the fields the page had, with the full Hard Rule 1 contract", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      meeting_time: confirmed("8.30 PM – 10.30 PM"),
      attendance_count: confirmed("AJK yang hadir : 21 orang"),
      adjournment: confirmed("Mesyuarat ditangguhkan pada 10.30 PM"),
      prepared_by: { position: confirmed("Setiausaha"), person_name: confirmed("SITI") },
      endorsed_by: { position: confirmed("Pengerusi"), person_name: confirmed("AHMAD") },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.meeting_time?.value).toBe("8.30 PM – 10.30 PM");
    expect(r.data.prepared_by?.person_name.value).toBe("SITI");
  });

  it("PRUNES the optional fields the model marked missing — no extra taps for a page that never had them", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      meeting_time: missing(),
      attendance_count: missing(),
      adjournment: missing(),
      prepared_by: { position: missing(), person_name: missing() },
      endorsed_by: { position: missing(), person_name: missing() },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.meeting_time).toBeUndefined();
    expect(r.data.attendance_count).toBeUndefined();
    expect(r.data.adjournment).toBeUndefined();
    expect(r.data.prepared_by).toBeUndefined();
    expect(r.data.endorsed_by).toBeUndefined();
  });

  it("keeps a human's 'not written down' verdict (confirmed empty, with provenance)", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      meeting_time: {
        value: "",
        confidence: "confirmed",
        source_ref: { location: "reviewed by you", snippet: "not in the notes" },
      },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.meeting_time).toBeDefined();
    expect(r.data.meeting_time?.confidence).toBe("confirmed");
  });

  it("a partly-present signature block survives (only both-missing is pruned)", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      prepared_by: { position: missing(), person_name: confirmed("SITI") },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.prepared_by?.person_name.value).toBe("SITI");
  });

  it("a value smuggled under a `missing` label is DISCARDED, never kept (G3-8)", () => {
    // Old behaviour: reject the whole read (which burned the retry and
    // surfaced as a timeout — J's create-org case). New behaviour: believe
    // the label — the value is erased, the field prunes away, the gap stays
    // a gap. Hard Rule 1 semantics, without the burnt read.
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      meeting_time: { value: "8.30 PM", confidence: "missing", source_ref: null },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.meeting_time).toBeUndefined();
  });
});

describe("G1 structure markers on resolutions", () => {
  it("keeps section_no / section_title / own_no through the parse", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      resolutions: [
        {
          text: confirmed("Pengerusi mengalu-alukan semua ahli."),
          kind: "info",
          section_no: "1",
          section_title: "Ucapan Pengerusi",
        },
        {
          text: confirmed("Puan Aminah menggantikan Puan Rosnah."),
          kind: "decision",
          section_no: "2",
          section_title: "Membentang minit yang lalu",
          own_no: "2.1",
        },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.resolutions[0].section_no).toBe("1");
    expect(r.data.resolutions[1].own_no).toBe("2.1");
  });

  it("drops a malformed marker without losing the line (catch → undefined)", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      resolutions: [
        {
          text: confirmed("Perkara A."),
          section_no: 42, // not a string — the marker goes, the line stays
        },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.resolutions[0].text.value).toBe("Perkara A.");
    expect(r.data.resolutions[0].section_no).toBeUndefined();
  });

  it("old documents without any of the new fields still parse unchanged", () => {
    const r = parseMeetingNotesExtraction(emptyMeetingNotesExtraction);
    expect(r.success).toBe(true);
  });
});

describe("coerceMissingFieldsEmpty — believe the label (G3-8)", () => {
  // The real root cause of J's "AI took too long": flash-lite fills a value
  // while labelling the field `missing`, the contract rejects the WHOLE
  // read, and the rule-7 retry no longer fits the route's time budget.
  it("erases the value and source_ref of a field labelled missing", async () => {
    const { coerceMissingFieldsEmpty } = await import("@/lib/extraction");
    const raw = {
      ...emptyMeetingNotesExtraction,
      meeting_venue: {
        value: "Dewan Contoh",
        confidence: "missing",
        source_ref: { location: "page 1", snippet: "Dewan" },
      },
    };
    const r = parseMeetingNotesExtraction(coerceMissingFieldsEmpty(raw));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.meeting_venue.value).toBe("");
    expect(r.data.meeting_venue.source_ref).toBeNull();
  });

  it("runs inside every parse — a missing-with-value nested field no longer kills the read", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      resolutions: [
        { text: confirmed("Perkara A.") },
      ],
      figures: [
        {
          description: confirmed("derma"),
          // number value + missing: empties to null, not ""
          amount_cents: { value: 12345, confidence: "missing", source_ref: null },
        },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.figures[0].amount_cents.value).toBeNull();
  });

  it("never touches confirmed or check fields", () => {
    const r = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      meeting_venue: confirmed("Dewan Contoh"),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.meeting_venue.value).toBe("Dewan Contoh");
  });
});

describe("countUnreviewed with the G1 fields", () => {
  it("counts the optional fields only when present", () => {
    expect(countUnreviewed(emptyMeetingNotesExtraction)).toBe(3); // type/date/venue missing

    const withTime = {
      ...emptyMeetingNotesExtraction,
      meeting_time: { value: "8.30 PM", confidence: "check" as const, source_ref: ref("8.30") },
    };
    expect(countUnreviewed(withTime)).toBe(4);

    const withSigners = {
      ...emptyMeetingNotesExtraction,
      prepared_by: { position: confirmed("Setiausaha"), person_name: { ...confirmed("SITI"), confidence: "check" as const } },
    };
    expect(countUnreviewed(withSigners)).toBe(4); // 3 + the unconfirmed name
  });
});
