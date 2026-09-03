import { describe, expect, it } from "vitest";
import {
  buildTidyDocument,
  checkDecisionPolarity,
  checkKeptFacts,
  checkNumbers,
  parseTidyPlan,
  tidySourceItems,
  type TidyPlan,
} from "./tidy-minutes";
import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// §2 (work order 105) — the tidy pass's deterministic half.
//
// 🔴 Nothing in this file touches extract-meeting-notes.ts. The tidy pass
// reads text that was already extracted, so the extractor's eval baseline
// (93.6%, invented = 0) cannot move because of anything measured here.
// ---------------------------------------------------------------------------

const field = (value: string) => ({
  value,
  confidence: value === "" ? ("missing" as const) : ("confirmed" as const),
  source_ref: value === "" ? null : { location: "photo 1", snippet: value },
});

function extractionOf(texts: string[]): MeetingNotesExtraction {
  return {
    meeting_type: field("committee"),
    meeting_date: field("2026-05-20"),
    meeting_venue: field("Dewan"),
    attendees: [],
    resolutions: texts.map((t) => ({ text: field(t) })),
    figures: [],
    office_bearers: [],
  } as unknown as MeetingNotesExtraction;
}

const plan = (
  items: { source: number | number[]; text: string }[],
  unresolved: { source: number | number[]; text: string }[] = [],
): TidyPlan => ({ sections: [{ heading: "Agenda", items }], unresolved });

// --- 1. put them in order ----------------------------------------------------

describe("§2-2 #1 — the order is the model's to choose", () => {
  it("keeps the arrangement the plan asked for, not the reading order", () => {
    const e = extractionOf(["3. Lantikan AJK", "1. Ucapan Pengerusi", "2. Kutipan"]);
    const doc = buildTidyDocument(
      plan([
        { source: 1, text: "1. Ucapan Pengerusi" },
        { source: 2, text: "2. Kutipan" },
        { source: 0, text: "3. Lantikan AJK" },
      ]),
      e,
    )!;
    expect(doc.sections[0].items.map((i) => i.source[0])).toEqual([1, 2, 0]);
  });

  it("🔴 an arrangement that LOSES a line is refused outright", () => {
    // A reading copy missing one of a society's decisions is not a document
    // with a small problem — there is nothing to fall back to per item,
    // because the item is simply absent.
    const e = extractionOf(["satu", "dua", "tiga"]);
    expect(buildTidyDocument(plan([{ source: 0, text: "satu" }]), e)).toBeNull();
  });
});

// --- 2. merge the same item told twice ---------------------------------------

describe("§2-2 #2 — two tellings of one item become one paragraph", () => {
  it("counts what merging folded away", () => {
    const e = extractionOf([
      "3 Agenda 2.1 diganti Chan Mei",
      "Chan Mei ganti",
      "Pindaan alamat",
    ]);
    const doc = buildTidyDocument(
      plan([
        { source: [0, 1], text: "3 Agenda 2.1 diganti Chan Mei" },
        { source: 2, text: "Pindaan alamat" },
      ]),
      e,
    )!;
    expect(doc.merged).toBe(1);
    expect(doc.sections[0].items[0].source).toEqual([0, 1]);
  });

  it("🔴 a merge that drops one side's fact falls back to BOTH lines verbatim", () => {
    const e = extractionOf(["宏道 10位", "同安 2位"]);
    const doc = buildTidyDocument(
      plan([{ source: [0, 1], text: "宏道 10位出席" }]),
      e,
    )!;
    expect(doc.sections[0].items[0].verbatimFallback).toBe(true);
    expect(doc.sections[0].items[0].text).toContain("同安");
    expect(doc.fallbacks).toBe(1);
  });
});

// --- 3. finish the sentence --------------------------------------------------

describe("§2-2 #3 — shorthand becomes a sentence, in its own language", () => {
  it("accepts a finished Malay sentence that keeps every name", () => {
    const e = extractionOf(["lanti Ajk seong. Tan Kim Loo"]);
    const doc = buildTidyDocument(
      plan([
        {
          source: 0,
          text: "Mesyuarat melantik Tan Kim Loo sebagai seorang Ahli Jawatankuasa.",
        },
      ]),
      e,
    )!;
    expect(doc.sections[0].items[0].verbatimFallback).toBe(false);
    expect(doc.fallbacks).toBe(0);
  });

  it("🔴 a finished sentence that respells a name falls back to the line", () => {
    // A changed character is a different person, and this document names who
    // is responsible for what.
    const e = extractionOf(["lanti Ajk seong. Tan Kim Loo"]);
    const doc = buildTidyDocument(
      plan([{ source: 0, text: "Mesyuarat melantik Tan Kim Looi sebagai AJK." }]),
      e,
    )!;
    expect(doc.sections[0].items[0].verbatimFallback).toBe(true);
  });

  it("🔴 a Chinese line keeps its Chinese name characters", () => {
    const e = extractionOf(["小小班主持：嘉益"]);
    const bad = buildTidyDocument(
      plan([{ source: 0, text: "小小小班的主持由嘉益负责。" }]),
      e,
    )!;
    expect(bad.sections[0].items[0].verbatimFallback).toBe(true);
    const good = buildTidyDocument(
      plan([{ source: 0, text: "小小班主持由嘉益负责。" }]),
      e,
    )!;
    expect(good.sections[0].items[0].verbatimFallback).toBe(false);
  });
});

// --- 4. the gaps stay gaps ---------------------------------------------------

describe("§2-2 #4 — finishing a sentence is not adding a fact", () => {
  it("🔴 refuses a sentence that decided something the line did not", () => {
    const e = extractionOf(["Bincang pindaan alamat"]);
    const doc = buildTidyDocument(
      plan([{ source: 0, text: "Mesyuarat bersetuju meminda alamat." }]),
      e,
    )!;
    expect(doc.sections[0].items[0].verbatimFallback).toBe(true);
  });

  it("keeps an open item open", () => {
    const e = extractionOf(["Pindaan alamat ditangguhkan"]);
    const doc = buildTidyDocument(
      plan([{ source: 0, text: "Pindaan alamat ditangguhkan ke mesyuarat akan datang." }]),
      e,
    )!;
    expect(doc.sections[0].items[0].verbatimFallback).toBe(false);
  });
});

// --- the locked list ---------------------------------------------------------

describe("🔴 the locked list — money, dates, IC and receipt numbers", () => {
  const sources = ["Derma RM 3,500.00 pada 12/5/2026", "K/P 880101-14-5501"];

  it("a number the line never had is refused", () => {
    expect(checkNumbers({ source: 0, text: "Derma RM 4,500.00 pada 12/5/2026" }, sources)).toBe(false);
  });

  it("a number the line HAD and the sentence dropped is refused", () => {
    expect(checkNumbers({ source: 0, text: "Derma diterima pada 12/5/2026" }, sources)).toBe(false);
  });

  it("the same numbers, re-worded around, are fine", () => {
    expect(
      checkNumbers(
        { source: 0, text: "Mesyuarat mencatat derma RM 3,500.00 yang diterima pada 12/5/2026." },
        sources,
      ),
    ).toBe(true);
  });

  it("an IC number must survive digit for digit", () => {
    expect(checkNumbers({ source: 1, text: "K/P 880101-14-5501" }, sources)).toBe(true);
    expect(checkNumbers({ source: 1, text: "K/P 880101-14-5502" }, sources)).toBe(false);
  });

  it("the printed enumerator is typography, not a fact", () => {
    const s = ["3. Kutipan RM120"];
    expect(checkNumbers({ source: 0, text: "Kutipan RM120 dicatat." }, s)).toBe(true);
  });

  it("🔴 feeding a whole verbatim document through unchanged changes nothing", () => {
    // §2-4's own test: hand the tidy layer a verbatim JSON carrying amounts
    // and names, tidy it to ITSELF, and assert every character survives.
    const texts = [
      "Derma RM 3,500.00 daripada 陈明发 pada 12/5/2026",
      "Resit no. R-000241 dikeluarkan",
      "K/P 880101-14-5501 direkodkan untuk Tan Kim Loo",
    ];
    const e = extractionOf(texts);
    const doc = buildTidyDocument(
      plan(texts.map((t, i) => ({ source: i, text: t }))),
      e,
    )!;
    expect(doc.fallbacks).toBe(0);
    expect(doc.sections[0].items.map((i) => i.text)).toEqual(texts);
  });
});

describe("🔴 the locked list — the substance of a decision", () => {
  const sources = [
    "Bajet RM500 tidak diluluskan",
    "Cadangan itu ditangguhkan",
    "Bajet diluluskan sebulat suara",
  ];

  it("a rejection may not become an approval", () => {
    expect(checkDecisionPolarity({ source: 0, text: "Bajet RM500 diluluskan" }, sources)).toBe(false);
  });
  it("a deferral may not be resolved", () => {
    expect(checkDecisionPolarity({ source: 1, text: "Cadangan itu diluluskan" }, sources)).toBe(false);
  });
  it("an approval may not be softened away", () => {
    expect(checkDecisionPolarity({ source: 2, text: "Bajet dibincangkan" }, sources)).toBe(false);
  });
  it("the same verdict, said as a full sentence, is fine", () => {
    expect(
      checkDecisionPolarity(
        { source: 2, text: "Mesyuarat meluluskan bajet itu, diluluskan sebulat suara." },
        sources,
      ),
    ).toBe(true);
  });
  it("reads Chinese and English verdicts too", () => {
    const zh = ["经费不通过", "议决通过"];
    expect(checkDecisionPolarity({ source: 0, text: "经费通过" }, zh)).toBe(false);
    expect(checkDecisionPolarity({ source: 1, text: "议决通过该项经费。" }, zh)).toBe(true);
  });
});

describe("checkKeptFacts", () => {
  it("lets a sentence grow around the facts", () => {
    expect(checkKeptFacts({ source: 0, text: "主席报告了宏道 10位的出席人数。" }, ["宏道 10位"])).toBe(true);
  });
  it("catches a fact quietly left behind", () => {
    expect(checkKeptFacts({ source: 0, text: "主席报告了出席人数。" }, ["宏道 10位"])).toBe(false);
  });
});

describe("plumbing", () => {
  it("tidySourceItems numbers the usable lines from zero, skipping missing ones", () => {
    const e = extractionOf(["satu", "", "tiga"]);
    expect(tidySourceItems(e).map((i) => [i.index, i.text])).toEqual([
      [0, "satu"],
      [1, "tiga"],
    ]);
  });

  it("parseTidyPlan accepts both the single and the merged source shape", () => {
    const ok = parseTidyPlan({
      sections: [{ heading: "A", items: [{ source: 0, text: "x" }, { source: [1, 2], text: "y" }] }],
    });
    expect(ok.success).toBe(true);
  });

  it("an unplaceable line lands in 'unresolved' rather than nowhere", () => {
    const e = extractionOf(["satu", "dua"]);
    const doc = buildTidyDocument(
      plan([{ source: 0, text: "satu" }], [{ source: 1, text: "dua" }]),
      e,
    )!;
    expect(doc.unresolved).toHaveLength(1);
    expect(doc.unresolved[0].source).toEqual([1]);
  });

  it("a meeting with no usable lines has no reading copy to build", () => {
    expect(buildTidyDocument(plan([]), extractionOf([]))).toBeNull();
  });
});
