import { describe, expect, it } from "vitest";
import {
  annotateClauseHierarchy,
  clauseParentNo,
  shortPageRef,
  splitClauseText,
} from "@/lib/constitution-display";
import type { ConfirmedClause } from "@/lib/constitution";

// ① (work order 89): fixtures shaped like org 197's real book — the three
// forms J's screenshot showed side by side:
//   * "1.2 Tempat urusan…" written INSIDE Fasal 1's body (no card of its own)
//   * 8.1 stored as its own clause WITH a heading
//   * 13.2 stored as its own clause WITHOUT a heading (and no 13.1 — the
//     original printed Fasal 13's first paragraph unnumbered)
const clause = (
  clause_no: string,
  heading: string,
  text: string,
  page_ref = "muka surat 2 daripada 8",
): ConfirmedClause => ({ clause_no, heading, text, page_ref });

const ORG197_SHAPE: ConfirmedClause[] = [
  clause(
    "1",
    "NAMA DAN TEMPAT URUSAN",
    "1.1 Pertubuhan ini dikenali dengan nama Persatuan Contoh. " +
      "1.2 Tempat urusan pertubuhan ialah No. 12, Jalan Contoh, 41100 Klang.",
    "muka surat 1 daripada 8",
  ),
  clause("8", "MESYUARAT AGUNG", "Mesyuarat agung diadakan setiap tahun."),
  clause("8.1", "Kuorum", "Kuorum mesyuarat ialah satu perdua daripada ahli."),
  clause("13", "PINDAAN", "Undang-undang ini tidak boleh diubah sesuka hati."),
  clause("13.2", "", "Pindaan berkuat kuasa selepas diluluskan oleh Pendaftar."),
];

describe("clauseParentNo", () => {
  it("reads a dotted number's parent", () => {
    expect(clauseParentNo("8.1")).toBe("8");
    expect(clauseParentNo("12.10")).toBe("12");
    expect(clauseParentNo(" 13.2 ")).toBe("13");
  });
  it("answers null for anything else", () => {
    expect(clauseParentNo("8")).toBeNull();
    expect(clauseParentNo("Fasal 3(a)")).toBeNull();
    expect(clauseParentNo("8.1.2")).toBeNull();
    expect(clauseParentNo("")).toBeNull();
  });
});

describe("annotateClauseHierarchy (org 197's shapes)", () => {
  const annotated = annotateClauseHierarchy(ORG197_SHAPE);
  const byNo = (no: string) => annotated.find((a) => a.clause.clause_no === no)!;

  it("8.1 (own card, own heading) hangs under 8", () => {
    expect(byNo("8.1").child).toBe(true);
  });
  it("13.2 (own card, NO heading) hangs under 13", () => {
    expect(byNo("13.2").child).toBe(true);
  });
  it("top-level clauses are never children", () => {
    expect(byNo("1").child).toBe(false);
    expect(byNo("8").child).toBe(false);
    expect(byNo("13").child).toBe(false);
  });
  it("an orphan sub-clause stays top-level (nothing to hang it under)", () => {
    const orphan = annotateClauseHierarchy([clause("12.2", "Yuran", "…")]);
    expect(orphan[0].child).toBe(false);
  });
  it("never touches the clause objects themselves", () => {
    expect(annotated.map((a) => a.clause)).toEqual(ORG197_SHAPE);
  });
});

describe("splitClauseText (the inline 1.2 sentences)", () => {
  it("breaks Fasal 1's inline 1.1/1.2 into their own paragraphs, verbatim", () => {
    const parts = splitClauseText("1", ORG197_SHAPE[0].text);
    expect(parts).toHaveLength(2);
    expect(parts[0].label).toBe("1.1");
    expect(parts[0].text.startsWith("1.1 Pertubuhan")).toBe(true);
    expect(parts[1].label).toBe("1.2");
    expect(parts[1].text).toBe(
      "1.2 Tempat urusan pertubuhan ialah No. 12, Jalan Contoh, 41100 Klang.",
    );
    // Nothing lost, nothing rewritten: joining the parts restores the text.
    expect(parts.map((p) => p.text).join(" ")).toBe(ORG197_SHAPE[0].text);
  });

  it("keeps an opening unnumbered run as its own part", () => {
    const parts = splitClauseText(
      "13",
      "Perkara am tentang pindaan.\n13.2 Pindaan berkuat kuasa selepas kelulusan.",
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].label).toBeNull();
    expect(parts[1].label).toBe("13.2");
  });

  it("never splits on money decimals", () => {
    const parts = splitClauseText("2", "Yuran ialah RM 2.50 sebulan. Bayar awal.");
    expect(parts).toHaveLength(1);
    expect(parts[0].label).toBeNull();
  });

  it("never splits on a mid-sentence cross-reference", () => {
    const parts = splitClauseText(
      "8",
      "Tertakluk kepada fasal 8.2 di atas, mesyuarat diteruskan. 8.3 Notis diberi awal.",
    );
    // "fasal 8.2 di atas" stays put; "8.3 Notis…" after the full stop splits.
    expect(parts).toHaveLength(2);
    expect(parts[0].label).toBeNull();
    expect(parts[1].label).toBe("8.3");
  });

  it("only the clause's OWN sub-numbers count", () => {
    const parts = splitClauseText("1", "Rujuk perkara lain. 12.2 Yuran dibayar.");
    expect(parts).toHaveLength(1);
  });

  it("splits on 中文 sub-sentences too", () => {
    const parts = splitClauseText("3", "3.1 本会会员分两种。3.2 普通会员须年满十八岁。");
    expect(parts).toHaveLength(2);
    expect(parts[1].text).toBe("3.2 普通会员须年满十八岁。");
  });

  it("a clause number it cannot read means no splitting at all", () => {
    const parts = splitClauseText("Fasal 3(a)", "3.1 Ini ayat. 3.2 Ini lagi.");
    expect(parts).toHaveLength(1);
  });
});

describe("shortPageRef", () => {
  it("shortens the printed 'muka surat X daripada Y' line", () => {
    expect(shortPageRef("muka surat 3 daripada 8")).toBe("m/s 3");
  });
  it("shortens a bare 'muka surat X' too", () => {
    expect(shortPageRef("muka surat 4")).toBe("m/s 4");
  });
  it("passes anything else through verbatim", () => {
    expect(shortPageRef("halaman 3")).toBe("halaman 3");
    expect(shortPageRef("")).toBe("");
  });
});
