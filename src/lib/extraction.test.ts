import { describe, expect, it } from "vitest";
import {
  meetingNotesExtractionSchema,
  parseMeetingNotesExtraction,
  textFieldSchema,
  type MeetingNotesExtraction,
} from "@/lib/extraction";
import { sampleMeetingExtraction } from "@/lib/sample-data";
import { DRAFT_WATERMARK, formatRm, renderMinutesDraftBm } from "@/lib/minutes-draft";
import { buildPastePack, isAnnualReturnMeeting } from "@/lib/paste-pack";

describe("extraction data contract (Hard Rule 1)", () => {
  it("accepts the realistic sample extraction", () => {
    const result = meetingNotesExtractionSchema.safeParse(sampleMeetingExtraction);
    expect(result.success).toBe(true);
  });

  it("rejects a 'missing' field that carries a value (the AI never invents)", () => {
    const bad = textFieldSchema.safeParse({
      value: "invented name",
      confidence: "missing",
      source_ref: null,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a non-missing field without a source_ref", () => {
    const bad = textFieldSchema.safeParse({
      value: "Tan Ah Kow",
      confidence: "confirmed",
      source_ref: null,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects malformed dates", () => {
    const bad = parseMeetingNotesExtraction({
      ...sampleMeetingExtraction,
      meeting_date: {
        value: "14/6/26",
        confidence: "confirmed",
        source_ref: { location: "photo 1", snippet: "14/6/26" },
      },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects non-integer money amounts (money is integer sen)", () => {
    const clone = structuredClone(sampleMeetingExtraction);
    clone.figures[0].amount_cents.value = 1248.5 as unknown as number;
    expect(meetingNotesExtractionSchema.safeParse(clone).success).toBe(false);
  });
});

describe("deterministic minutes draft (no LLM)", () => {
  it("renders RM amounts from integer sen without floating-point drift", () => {
    expect(formatRm(1248050)).toBe("RM12,480.50");
    expect(formatRm(350000)).toBe("RM3,500.00");
    expect(formatRm(5)).toBe("RM0.05");
  });

  it("carries the DRAFT watermark until confirmed, then the audit line", () => {
    const draft = renderMinutesDraftBm(sampleMeetingExtraction, {
      orgName: "Persatuan Ujian",
    });
    expect(draft).toContain(DRAFT_WATERMARK);

    const confirmed = renderMinutesDraftBm(sampleMeetingExtraction, {
      orgName: "Persatuan Ujian",
      confirmedBy: { name: "Ali", dateIso: "2026-07-10" },
    });
    expect(confirmed).not.toContain(DRAFT_WATERMARK);
    expect(confirmed).toContain("disahkan oleh Ali pada 2026-07-10");
  });

  it("never renders missing fields (honest gaps stay gaps)", () => {
    const draft = renderMinutesDraftBm(sampleMeetingExtraction, {
      orgName: "Persatuan Ujian",
    });
    // The treasurer's name is missing in the sample; the position must not
    // appear with an invented name.
    expect(draft).not.toMatch(/Bendahari:/);
    // Confirmed facts DO appear.
    expect(draft).toContain("Setiausaha: Lim Bee Hoon");
    expect(draft).toContain("RM12,480.50");
  });
});

describe("eROSES paste-pack (deterministic, Hard Rule 2)", () => {
  /**
   * The shipped sample is a COMMITTEE meeting, and from 2026-08-20 a committee
   * meeting is not what the Annual Return asks about — so the pack for it is
   * deliberately empty (see the "not the annual return meeting" block below).
   * These three tests are about counting, confidence and honest gaps, so they
   * use the same sample declared as the general meeting it would have to be.
   */
  const asAgm = (): MeetingNotesExtraction => {
    const e = structuredClone(sampleMeetingExtraction);
    e.meeting_type = {
      value: "agm",
      confidence: "confirmed",
      source_ref: { location: "photo 1, heading", snippet: "Mesyuarat Agung Tahunan" },
    };
    return e;
  };

  it("counts attendees by code, not by the AI", () => {
    const rows = buildPastePack(asAgm());
    const attendeeRow = rows.find((r) => r.erosesField === "Bilangan Ahli Hadir");
    expect(attendeeRow?.value).toBe("3");
  });

  it("propagates the worst confidence into each row", () => {
    const rows = buildPastePack(asAgm());
    // One attendee is smudged ("check") => the count row must demand review.
    expect(rows.find((r) => r.erosesField === "Bilangan Ahli Hadir")?.confidence).toBe("check");
    // G-1 (work order 27): the committee row no longer reads the page at all —
    // it files from committee_roster. With no roster passed, it is BLOCKED,
    // not filled from what the AI read (lib/paste-pack.test.ts pins the
    // roster-driven shapes).
    const bearers = rows.find((r) => r.erosesField === "Senarai Ahli Jawatankuasa");
    expect(bearers?.confidence).toBe("missing");
    expect(bearers?.value).toBe("—");
  });

  it("emits an em-dash, not an invented value, when data is missing", () => {
    const empty = asAgm();
    empty.meeting_date = { value: "", confidence: "missing", source_ref: null };
    const rows = buildPastePack(empty);
    const dateRow = rows.find((r) => r.erosesField === "Tarikh Mesyuarat Agung");
    expect(dateRow?.value).toBe("—");
    expect(dateRow?.confidence).toBe("missing");
  });

  it("writes the meeting type out in full for the government form", () => {
    const rows = buildPastePack(asAgm());
    expect(rows.find((r) => r.erosesField === "Jenis Mesyuarat")?.value).toBe(
      "Mesyuarat Agung Tahunan (AGM)",
    );
  });

  // -- the 2026-08-20 defect ------------------------------------------------
  // A planning meeting used to be printed straight into "Jenis Mesyuarat" and
  // marked Confirmed. A wrong value in that box is a false declaration, so a
  // meeting that is not an AGM or an EGM now yields nothing to paste at all.
  it.each(["committee", "planning", "event", "other"] as const)(
    "gives a %s meeting nothing to paste into the Annual Return",
    (type) => {
      const e = structuredClone(sampleMeetingExtraction);
      e.meeting_type = {
        value: type,
        confidence: "confirmed",
        source_ref: { location: "photo 1", snippet: "x" },
      };
      const rows = buildPastePack(e);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.value).toBe("—");
        expect(r.confidence).toBe("missing");
        expect(r.note).toContain("tidak masuk Penyata Tahunan");
        expect(r.note).toContain("不进年报");
      }
    },
  );

  it("never prints a raw meeting-type code into a government field", () => {
    for (const type of ["committee", "planning", "event", "other"] as const) {
      const e = structuredClone(sampleMeetingExtraction);
      e.meeting_type = {
        value: type,
        confidence: "confirmed",
        source_ref: { location: "photo 1", snippet: "x" },
      };
      const typeRow = buildPastePack(e).find(
        (r) => r.erosesField === "Jenis Mesyuarat",
      );
      expect(typeRow?.value).not.toContain(type);
    }
  });

  it("still counts an EGM as filable", () => {
    const e = asAgm();
    e.meeting_type = {
      value: "egm",
      confidence: "confirmed",
      source_ref: { location: "photo 1", snippet: "Mesyuarat Agung Khas" },
    };
    expect(isAnnualReturnMeeting(e)).toBe(true);
    expect(
      buildPastePack(e).find((r) => r.erosesField === "Bilangan Ahli Hadir")?.value,
    ).toBe("3");
  });
});
