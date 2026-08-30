import { describe, expect, it } from "vitest";
import {
  erosesCommitteeRefusal,
  erosesGapList,
  missingErosesCommitteeFields,
} from "@/lib/eroses-committee";

// ⑦ (work order 89, D48): the one list all three gates read.

describe("missingErosesCommitteeFields", () => {
  it("a complete row has no gaps", () => {
    expect(
      missingErosesCommitteeFields({
        person_name: "陈大明",
        name_official: "TAN TAI BENG",
        state: "Selangor",
        term_start: "2026-01-01",
      }),
    ).toEqual([]);
  });

  it("names every gap, in display order", () => {
    expect(
      missingErosesCommitteeFields({
        person_name: "林小美",
        name_official: "",
        state: "  ",
        term_start: null,
      }),
    ).toEqual(["nameOfficial", "state", "termStart"]);
  });

  it("a seeded position row (no name at all) is all gaps", () => {
    expect(missingErosesCommitteeFields({ person_name: "" })).toEqual([
      "personName",
      "nameOfficial",
      "state",
      "termStart",
    ]);
  });

  it("D8 fail-open: a column the DB never returned cannot block", () => {
    // Behind migration 37 there is no `state` column — the caller says which
    // fields were actually readable, and only those may gate.
    expect(
      missingErosesCommitteeFields(
        { person_name: "林小美", name_official: "LIM SIEW MEI", term_start: null },
        ["personName", "nameOfficial", "termStart"],
      ),
    ).toEqual(["termStart"]);
  });
});

describe("erosesGapList / erosesCommitteeRefusal", () => {
  it("joins the reader's own language with its own separator", () => {
    expect(erosesGapList(["nameOfficial", "state"], "zh")).toBe(
      "身份证上的名字、州属",
    );
    expect(erosesGapList(["nameOfficial", "state"], "bm")).toBe(
      "Nama dalam IC, Negeri",
    );
  });

  it("the refusal is three lines, names the gaps, and repeats the never-transliterate warning", () => {
    const msg = erosesCommitteeRefusal(["nameOfficial", "termStart"]);
    const lines = msg.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Nama dalam IC");
    expect(lines[1]).toContain("任命日期");
    expect(lines[1]).toContain("不要自己音译");
    expect(lines[2]).toContain("never transliterate");
  });
});
