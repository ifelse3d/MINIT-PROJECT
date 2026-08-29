import { describe, expect, it } from "vitest";
import {
  committeeRequirementFromClauses,
  countRosterAgainstRequirement,
} from "@/lib/constitution-committee";

const clause = (text: string, over: Partial<{ clause_no: string; heading: string }> = {}) => ({
  clause_no: over.clause_no ?? "Fasal 9",
  heading: over.heading ?? "Jawatankuasa",
  text,
  page_ref: "m/s 4",
});

// The CONTOH constitution's own composition sentence, verbatim — the one
// known-answer sample the repo ships (docs/contoh-undang-undang-tubuh.md).
const CONTOH =
  "Jawatankuasa hendaklah terdiri daripada seorang Pengerusi, seorang Timbalan Pengerusi, seorang Setiausaha, seorang Bendahari dan tujuh orang Ahli Jawatankuasa Biasa, yang dipilih dalam Mesyuarat Agung Tahunan setiap dua tahun sekali.";

describe("committeeRequirementFromClauses", () => {
  it("reads the CONTOH composition sentence exactly", () => {
    const req = committeeRequirementFromClauses([clause(CONTOH)]);
    expect(req).not.toBeNull();
    expect(req!.positions).toEqual([
      { title: "Pengerusi", count: 1 },
      { title: "Timbalan Pengerusi", count: 1 },
      { title: "Setiausaha", count: 1 },
      { title: "Bendahari", count: 1 },
      { title: "Ahli Jawatankuasa Biasa", count: 7 },
    ]);
    expect(req!.total).toBe(11);
    expect(req!.clauseNo).toBe("Fasal 9");
  });

  it("does not read 'dua tahun' in the next sentence as two more people", () => {
    const req = committeeRequirementFromClauses([
      clause(
        "Jawatankuasa hendaklah terdiri daripada seorang Pengerusi dan seorang Setiausaha. Mereka dipilih setiap dua tahun oleh tiga orang pemilih.",
      ),
    ]);
    expect(req!.total).toBe(2);
  });

  it("answers null rather than guess — no composition clause", () => {
    expect(
      committeeRequirementFromClauses([
        clause("Jawatankuasa boleh menolak sesuatu permohonan tanpa memberi sebab.", {
          heading: "Keahlian",
        }),
      ]),
    ).toBeNull();
  });

  it("answers null when only ONE position parses — one match could be prose", () => {
    expect(
      committeeRequirementFromClauses([
        clause("Jawatankuasa hendaklah terdiri daripada seorang Pengerusi."),
      ]),
    ).toBeNull();
  });

  it("reads digits too — '2 orang AJK'", () => {
    const req = committeeRequirementFromClauses([
      clause(
        "Jawatankuasa hendaklah terdiri daripada seorang Pengerusi dan 2 orang AJK.",
      ),
    ]);
    expect(req!.positions).toEqual([
      { title: "Pengerusi", count: 1 },
      { title: "AJK", count: 2 },
    ]);
  });
});

describe("countRosterAgainstRequirement", () => {
  it("matches roster rows by title, longest first, either wording", () => {
    const req = committeeRequirementFromClauses([clause(CONTOH)])!;
    const lines = countRosterAgainstRequirement(req, [
      "Pengerusi / 主席",
      "Timbalan Pengerusi / 副主席",
      "Ahli Jawatankuasa Biasa",
      "Ahli Jawatankuasa Biasa",
      "Juruaudit Dalam", // not a required title — counted nowhere
    ]);
    const by = Object.fromEntries(lines.map((l) => [l.title, l.have]));
    // A "Timbalan Pengerusi" row never also counts as "Pengerusi".
    expect(by["Pengerusi"]).toBe(1);
    expect(by["Timbalan Pengerusi"]).toBe(1);
    expect(by["Ahli Jawatankuasa Biasa"]).toBe(2);
    expect(by["Setiausaha"]).toBe(0);
  });
});
