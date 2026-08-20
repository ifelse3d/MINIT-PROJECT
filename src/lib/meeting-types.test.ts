import { describe, expect, it } from "vitest";
import {
  EROSES_FILEABLE_MEETING_TYPES,
  MEETING_TYPES,
  MEETING_TYPE_LABEL,
  isErosesFileable,
  meetingTypeLabel,
  normaliseMeetingType,
} from "@/lib/meeting-types";
import { meetingNotesExtractionSchema } from "@/lib/extraction";
import { sampleMeetingExtraction } from "@/lib/sample-data";

const LANGUAGE_KEYS = ["bm", "zh", "en"] as const;

describe("the list of meeting types", () => {
  it("covers the kinds of meeting a society actually holds", () => {
    expect(MEETING_TYPES).toContain("planning");
    expect(MEETING_TYPES).toContain("event");
    expect(MEETING_TYPES).toContain("other");
  });

  it("keeps eROSES to the two meetings the Annual Return knows", () => {
    expect([...EROSES_FILEABLE_MEETING_TYPES]).toEqual(["agm", "egm"]);
    expect(isErosesFileable("agm")).toBe(true);
    expect(isErosesFileable("egm")).toBe(true);
    for (const t of ["committee", "planning", "event", "other", ""]) {
      expect(isErosesFileable(t)).toBe(false);
    }
  });

  it("has a label in every language for every type — no screen falls back to a code", () => {
    for (const type of MEETING_TYPES) {
      for (const lang of LANGUAGE_KEYS) {
        expect(MEETING_TYPE_LABEL[type][lang].length).toBeGreaterThan(0);
      }
    }
  });

  // J, 2026-08-20: "有很多人不懂 SHORTFORM". The abbreviation may appear, but
  // never on its own.
  it("writes AGM and EGM out in full, with the short form in brackets", () => {
    expect(MEETING_TYPE_LABEL.agm.bm).toContain("Mesyuarat Agung Tahunan");
    expect(MEETING_TYPE_LABEL.agm.zh).toContain("常年大会");
    expect(MEETING_TYPE_LABEL.agm.en).toContain("Annual General Meeting");
    expect(MEETING_TYPE_LABEL.egm.en).toContain("Extraordinary General Meeting");
  });
});

describe("naming a meeting", () => {
  it("uses the society's own name only for 'other'", () => {
    expect(meetingTypeLabel("other", "zh", "青年组周会")).toBe("青年组周会");
    // A custom label left over from a previous choice must not leak onto a
    // meeting that now has a real type.
    expect(meetingTypeLabel("agm", "zh", "青年组周会")).toBe("常年大会（AGM）");
  });

  it("says a gap is a gap rather than inventing a type", () => {
    expect(meetingTypeLabel("", "zh")).toBe("笔记里没写");
    expect(meetingTypeLabel("other", "zh", "   ")).toBe("其他 —— 自己写名称");
  });

  it("prints an unknown stored value as written instead of guessing", () => {
    expect(meetingTypeLabel("mesyuarat khas 2019", "bm")).toBe("mesyuarat khas 2019");
  });
});

describe("what goes into minutes_docs.meeting_type", () => {
  it("passes the six real types straight through", () => {
    for (const type of MEETING_TYPES) {
      expect(normaliseMeetingType(type)).toBe(type);
    }
  });

  // 🔴 It used to return "committee" for an empty value. That put a meeting
  // type nobody wrote down onto a record the Registrar can be shown.
  it("never invents 'committee' for a meeting type nobody wrote down", () => {
    expect(normaliseMeetingType("")).toBe("other");
    expect(normaliseMeetingType("   ")).toBe("other");
  });

  it("still recognises the words a person or the model might use", () => {
    expect(normaliseMeetingType("Mesyuarat Agung Tahunan")).toBe("agm");
    expect(normaliseMeetingType("EGM")).toBe("egm");
    expect(normaliseMeetingType("mesyuarat jawatankuasa")).toBe("committee");
    expect(normaliseMeetingType("event meeting")).toBe("event");
    expect(normaliseMeetingType("planning session")).toBe("planning");
  });
});

describe("the schema and the list stay in step", () => {
  it("accepts every type in the list — the screen cannot offer one the schema refuses", () => {
    for (const type of MEETING_TYPES) {
      const e = structuredClone(sampleMeetingExtraction);
      e.meeting_type = {
        value: type,
        confidence: "confirmed",
        source_ref: { location: "photo 1", snippet: "x" },
      };
      expect(meetingNotesExtractionSchema.safeParse(e).success).toBe(true);
    }
  });

  it("still refuses a value that is not on the list", () => {
    const e = structuredClone(sampleMeetingExtraction);
    // The literal string J typed. It must still be refused — the fix is the
    // dropdown that cannot produce it, not a schema that accepts anything.
    (e.meeting_type as { value: string }).value = "event meeting";
    expect(meetingNotesExtractionSchema.safeParse(e).success).toBe(false);
  });

  it("carries the society's own name through the schema, and caps its length", () => {
    const e = structuredClone(sampleMeetingExtraction);
    e.meeting_type_label = "青年组周会";
    expect(meetingNotesExtractionSchema.safeParse(e).success).toBe(true);

    e.meeting_type_label = "x".repeat(121);
    expect(meetingNotesExtractionSchema.safeParse(e).success).toBe(false);
  });

  it("parses a document written before the label existed", () => {
    const e = structuredClone(sampleMeetingExtraction);
    delete (e as { meeting_type_label?: string }).meeting_type_label;
    expect(meetingNotesExtractionSchema.safeParse(e).success).toBe(true);
  });
});
