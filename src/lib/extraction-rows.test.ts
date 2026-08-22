import { describe, expect, it } from "vitest";
import {
  ROW_LISTS,
  addRow,
  removeRow,
  rowHasContent,
  type RowList,
} from "@/lib/extraction-rows";
import {
  emptyMeetingNotesExtraction,
  meetingNotesExtractionSchema,
} from "@/lib/extraction";
import { sampleMeetingExtraction } from "@/lib/sample-data";

// J's UX list, root cause A: "没有任何地方可以自己打字、自己加一行". These four
// functions are that missing direction of travel, so they get real coverage —
// including the Hard Rule 1 provenance, which is the part that would rot first.
describe("addRow", () => {
  it.each(ROW_LISTS)("appends one blank row to %s", (list) => {
    const before = emptyMeetingNotesExtraction;
    const after = addRow(before, list);
    expect(after[list]).toHaveLength(before[list].length + 1);
    // Still a legal extraction — this thing feeds minutes-draft and the DB.
    expect(meetingNotesExtractionSchema.safeParse(after).success).toBe(true);
  });

  it("does not mutate the extraction it was given", () => {
    const before = sampleMeetingExtraction;
    const count = before.resolutions.length;
    addRow(before, "resolutions");
    expect(before.resolutions).toHaveLength(count);
  });

  it("appends, so the existing rows keep their order and their index", () => {
    const after = addRow(sampleMeetingExtraction, "attendees");
    sampleMeetingExtraction.attendees.forEach((a, i) => {
      expect(after.attendees[i].name.value).toBe(a.name.value);
    });
  });

  // The provenance rule: a row nobody has filled in yet is `missing` with NO
  // source_ref. A pre-confirmed blank row would sail through the outstanding
  // count and put an empty line into a document carrying the audit line.
  it("starts every new field missing, empty, and without a source", () => {
    const fieldsOf = (list: RowList) => {
      const e = addRow(emptyMeetingNotesExtraction, list);
      const row = e[list][0] as Record<string, { value: unknown; confidence: string; source_ref: unknown }>;
      return Object.values(row);
    };
    for (const list of ROW_LISTS) {
      for (const f of fieldsOf(list)) {
        expect(f.confidence).toBe("missing");
        expect(f.source_ref).toBeNull();
        // amount_cents is a number-or-null field; every other one is a string.
        expect(f.value === "" || f.value === null).toBe(true);
      }
    }
  });

  it("gives a figure both a description and an amount", () => {
    const e = addRow(emptyMeetingNotesExtraction, "figures");
    expect(e.figures[0].description.value).toBe("");
    expect(e.figures[0].amount_cents.value).toBeNull();
  });

  it("gives an office bearer both a position and a person", () => {
    const e = addRow(emptyMeetingNotesExtraction, "office_bearers");
    expect(e.office_bearers[0].position.value).toBe("");
    expect(e.office_bearers[0].person_name.value).toBe("");
  });
});

describe("removeRow", () => {
  it("removes exactly the row asked for", () => {
    const three = ["A", "B", "C"].reduce(
      (e, name, i) => {
        const next = addRow(e, "attendees");
        next.attendees[i].name.value = name;
        return next;
      },
      emptyMeetingNotesExtraction,
    );
    const after = removeRow(three, "attendees", 1);
    expect(after.attendees.map((a) => a.name.value)).toEqual(["A", "C"]);
  });

  it("does not mutate the extraction it was given", () => {
    const before = sampleMeetingExtraction;
    const count = before.attendees.length;
    removeRow(before, "attendees", 0);
    expect(before.attendees).toHaveLength(count);
  });

  // The double-tap race: the second tap runs against a list that is already one
  // shorter. Doing nothing is right; deleting a DIFFERENT row would not be.
  it("leaves the extraction alone for an index that is not there", () => {
    const e = addRow(emptyMeetingNotesExtraction, "resolutions");
    expect(removeRow(e, "resolutions", 1)).toBe(e);
    expect(removeRow(e, "resolutions", -1)).toBe(e);
    expect(removeRow(e, "resolutions", 1.5)).toBe(e);
    expect(removeRow(emptyMeetingNotesExtraction, "attendees", 0)).toBe(
      emptyMeetingNotesExtraction,
    );
  });

  it("leaves a legal extraction behind", () => {
    const after = removeRow(sampleMeetingExtraction, "resolutions", 0);
    expect(meetingNotesExtractionSchema.safeParse(after).success).toBe(true);
  });
});

describe("rowHasContent", () => {
  it("is false for a row that was just added", () => {
    const e = addRow(emptyMeetingNotesExtraction, "attendees");
    expect(rowHasContent(e, "attendees", 0)).toBe(false);
  });

  it("is false for whitespace only — nobody minds losing that", () => {
    const e = addRow(emptyMeetingNotesExtraction, "resolutions");
    e.resolutions[0].text.value = "   ";
    expect(rowHasContent(e, "resolutions", 0)).toBe(false);
  });

  it("is true once any field in the row has something in it", () => {
    const e = addRow(emptyMeetingNotesExtraction, "office_bearers");
    e.office_bearers[0].person_name.value = "Encik Rahman";
    expect(rowHasContent(e, "office_bearers", 0)).toBe(true);
  });

  it("counts an amount of zero as content", () => {
    // RM 0.00 is a real thing to have written down, and it is not the same as
    // never having filled the row in.
    const e = addRow(emptyMeetingNotesExtraction, "figures");
    e.figures[0].amount_cents.value = 0;
    expect(rowHasContent(e, "figures", 0)).toBe(true);
  });

  it("is false for a row that is not there", () => {
    expect(rowHasContent(emptyMeetingNotesExtraction, "attendees", 0)).toBe(false);
  });
});
