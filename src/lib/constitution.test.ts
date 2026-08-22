import { describe, expect, it } from "vitest";
import {
  buildClauseAnswerBm,
  buildRefusalBm,
  citedClauseNos,
  expandWithSynonyms,
  filterClauses,
  findNoticePeriodDays,
  isConfirmedClauseArray,
  MAX_CANDIDATE_CLAUSES,
  mergeClauses,
  QA_DISCLAIMER_BM,
  tokenise,
  type ConfirmedClause,
} from "./constitution";
import { searchClauses, sortClauses } from "./constitution";
import { sampleClauses } from "./sample-constitution";

describe("tokenise", () => {
  it("keeps meaningful latin words, drops stopwords and short words", () => {
    const t = tokenise("Berapa hari notis untuk AGM di persatuan kita?");
    expect(t).toContain("notis");
    expect(t).toContain("agm");
    expect(t).toContain("hari");
    expect(t).not.toContain("untuk");
    expect(t).not.toContain("di");
  });

  it("produces CJK bigrams and single chars", () => {
    const t = tokenise("大会通知");
    expect(t).toContain("大会");
    expect(t).toContain("通知");
    expect(t).toContain("会通"); // bigrams are cheap; scoring handles noise
  });
});

describe("expandWithSynonyms", () => {
  it("bridges languages: 'quorum' reaches 'kuorum'", () => {
    const t = expandWithSynonyms(tokenise("What is the quorum?"));
    expect(t).toContain("kuorum");
  });

  it("bridges Chinese: 支票/签名 question reaches 'bank' clause terms", () => {
    const t = expandWithSynonyms(tokenise("谁可以签名银行支票"));
    expect(t).toContain("tandatangan");
  });
});

describe("filterClauses", () => {
  it("finds the AGM notice clause for a BM question", () => {
    const m = filterClauses("Berapa hari notis untuk AGM?", sampleClauses);
    expect(m.length).toBeGreaterThan(0);
    expect(m[0].clause.clause_no).toBe("Fasal 8");
  });

  it("finds the cheque-signing clause for an English question", () => {
    const m = filterClauses("Who can sign cheques?", sampleClauses);
    expect(m.map((x) => x.clause.clause_no)).toContain("Fasal 12");
  });

  it("finds the quorum clause for a Chinese question", () => {
    const m = filterClauses("大会的法定人数是多少？", sampleClauses);
    expect(m.map((x) => x.clause.clause_no)).toContain("Fasal 8.2");
  });

  it("returns [] for a question the constitution does not cover", () => {
    const m = filterClauses("Boleh persatuan beli kereta Ferrari?", sampleClauses);
    expect(m).toEqual([]);
  });

  it("returns [] for an empty/stopword-only question", () => {
    expect(filterClauses("yang untuk dengan", sampleClauses)).toEqual([]);
    expect(filterClauses("   ", sampleClauses)).toEqual([]);
  });

  it(`caps candidates at ${MAX_CANDIDATE_CLAUSES}`, () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      clause_no: `Fasal ${i}`,
      heading: "Mesyuarat",
      text: "mesyuarat agung tahunan notis",
      page_ref: "",
    }));
    expect(filterClauses("notis mesyuarat agung", many).length).toBe(MAX_CANDIDATE_CLAUSES);
  });
});

describe("answers and refusals", () => {
  it("refusal names the question, never guesses, carries the disclaimer", () => {
    const r = buildRefusalBm("Boleh beli Ferrari?");
    expect(r).toContain("Boleh beli Ferrari?");
    expect(r).toContain(QA_DISCLAIMER_BM);
    expect(r.toLowerCase()).not.toContain("fasal"); // no clause invented
  });

  it("answer quotes clauses verbatim with clause_no + page_ref and disclaimer", () => {
    const m = filterClauses("Berapa hari notis untuk AGM?", sampleClauses);
    const a = buildClauseAnswerBm(m);
    expect(a).toContain("Fasal 8");
    expect(a).toContain("14 hari"); // verbatim from the clause
    expect(a).toContain("muka surat 4");
    expect(a).toContain(QA_DISCLAIMER_BM);
  });

  it("buildClauseAnswerBm throws on zero matches (must refuse instead)", () => {
    expect(() => buildClauseAnswerBm([])).toThrow();
  });

  it("citedClauseNos lists exactly the matched clause numbers", () => {
    const m = filterClauses("kuorum", sampleClauses);
    expect(citedClauseNos(m)).toContain("Fasal 8.2");
  });
});

describe("findNoticePeriodDays", () => {
  it("reads 14 days from the sample AGM clause, citing it", () => {
    const hit = findNoticePeriodDays(sampleClauses);
    expect(hit).not.toBeNull();
    expect(hit!.days).toBe(14);
    expect(hit!.clause.clause_no).toBe("Fasal 8");
  });

  it("returns null when no clause states a number of days", () => {
    const clauses = [
      {
        clause_no: "Fasal 1",
        heading: "Mesyuarat Agung",
        text: "Notis mesyuarat hendaklah dihantar kepada semua ahli.",
        page_ref: "",
      },
    ];
    expect(findNoticePeriodDays(clauses)).toBeNull();
  });

  it("ignores absurd day counts", () => {
    const clauses = [
      {
        clause_no: "Fasal 1",
        heading: "Mesyuarat Agung Tahunan",
        text: "Notis mesyuarat agung hendaklah dihantar 500 hari sebelum mesyuarat.",
        page_ref: "",
      },
    ];
    expect(findNoticePeriodDays(clauses)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mergeClauses / isConfirmedClauseArray — extracted from constitution-review.tsx
// on 2026-08-05 when the constitution gained a durable copy in Postgres. These
// guard a legal document: a merge bug drops a clause, and a shape bug quotes
// `undefined` back as verbatim constitution text.
// ---------------------------------------------------------------------------

const clause = (over: Partial<ConfirmedClause> = {}): ConfirmedClause => ({
  clause_no: "Fasal 1",
  heading: "Nama",
  text: "Pertubuhan ini dikenali dengan nama…",
  page_ref: "m/s 1",
  ...over,
});

describe("mergeClauses", () => {
  it("adds a new page instead of replacing the pages already read", () => {
    const page1 = [clause({ clause_no: "Fasal 1" }), clause({ clause_no: "Fasal 2" })];
    const page2 = [clause({ clause_no: "Fasal 3" })];
    const merged = mergeClauses(page1, page2);
    expect(merged.map((c) => c.clause_no)).toEqual(["Fasal 1", "Fasal 2", "Fasal 3"]);
  });

  it("lets a re-photographed page fix a clause that was read badly", () => {
    const bad = [clause({ clause_no: "Fasal 7", text: "kurang jelas" })];
    const good = [clause({ clause_no: "Fasal 7", text: "Kuorum ialah 30 orang ahli." })];
    const merged = mergeClauses(bad, good);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("Kuorum ialah 30 orang ahli.");
  });

  it("keeps the order clauses were first seen in", () => {
    const merged = mergeClauses(
      [clause({ clause_no: "Fasal 5" }), clause({ clause_no: "Fasal 2" })],
      [clause({ clause_no: "Fasal 5", heading: "diperbaiki" })],
    );
    expect(merged.map((c) => c.clause_no)).toEqual(["Fasal 5", "Fasal 2"]);
    expect(merged[0].heading).toBe("diperbaiki");
  });

  it("mutates neither input", () => {
    const previous = [clause({ clause_no: "Fasal 1" })];
    const incoming = [clause({ clause_no: "Fasal 2" })];
    mergeClauses(previous, incoming);
    expect(previous).toHaveLength(1);
    expect(incoming).toHaveLength(1);
  });

  it("handles both sides being empty", () => {
    expect(mergeClauses([], [])).toEqual([]);
  });
});

describe("isConfirmedClauseArray", () => {
  it("accepts a well-formed array, including an empty one", () => {
    expect(isConfirmedClauseArray([clause()])).toBe(true);
    expect(isConfirmedClauseArray([])).toBe(true);
  });

  it("rejects anything that is not an array", () => {
    expect(isConfirmedClauseArray(null)).toBe(false);
    expect(isConfirmedClauseArray({ clauses: [clause()] })).toBe(false);
    expect(isConfirmedClauseArray("Fasal 1")).toBe(false);
  });

  it("rejects a clause with a missing or wrongly-typed field", () => {
    const noText: Record<string, unknown> = { ...clause() };
    delete noText.text;
    expect(isConfirmedClauseArray([noText])).toBe(false);
    expect(isConfirmedClauseArray([{ ...clause(), clause_no: 1 }])).toBe(false);
    expect(isConfirmedClauseArray([{ ...clause(), page_ref: null }])).toBe(false);
  });

  it("rejects the whole array when a single element is bad", () => {
    expect(isConfirmedClauseArray([clause(), { clause_no: "Fasal 2" }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reading the constitution end to end, rather than asking it a question.
// (docs/界面重做-计划.md §2 item 6 — the clauses were in the database with no
// screen to read them on.)
// ---------------------------------------------------------------------------

const numbered = (clause_no: string, heading = "", text = "") => ({
  clause_no,
  heading,
  text,
  page_ref: "",
});

describe("sortClauses", () => {
  // Plain string sort puts 12.10 before 12.2, which is the wrong order for a
  // legal document and the reason this exists at all.
  it("orders sub-clauses numerically, not alphabetically", () => {
    const out = sortClauses([numbered("12.10"), numbered("12.2"), numbered("12.1")]);
    expect(out.map((c) => c.clause_no)).toEqual(["12.1", "12.2", "12.10"]);
  });

  it("orders top-level clauses numerically", () => {
    const out = sortClauses([numbered("10"), numbered("9"), numbered("2")]);
    expect(out.map((c) => c.clause_no)).toEqual(["2", "9", "10"]);
  });

  // A constitution arrives as a stack of photos in whatever order they were
  // taken; mergeClauses preserves first appearance, which is right for merging
  // and wrong for reading.
  it("puts a book photographed out of order back in order", () => {
    const out = sortClauses([numbered("Fasal 7"), numbered("Fasal 2"), numbered("Fasal 15")]);
    expect(out.map((c) => c.clause_no)).toEqual(["Fasal 2", "Fasal 7", "Fasal 15"]);
  });

  it("puts a bare number before the same number with a letter", () => {
    const out = sortClauses([numbered("12a"), numbered("12")]);
    expect(out.map((c) => c.clause_no)).toEqual(["12", "12a"]);
  });

  it("puts a shorter number before its own sub-clauses", () => {
    const out = sortClauses([numbered("12.1"), numbered("12")]);
    expect(out.map((c) => c.clause_no)).toEqual(["12", "12.1"]);
  });

  it("keeps an unnumbered clause at the end instead of in the middle", () => {
    const out = sortClauses([numbered("3"), numbered(""), numbered("1")]);
    expect(out.map((c) => c.clause_no)).toEqual(["1", "3", ""]);
  });

  it("does not mutate the array it was given", () => {
    const input = [numbered("3"), numbered("1")];
    sortClauses(input);
    expect(input.map((c) => c.clause_no)).toEqual(["3", "1"]);
  });
});

describe("searchClauses", () => {
  const book = [
    numbered("3", "Keahlian", "Ahli mesti berumur 18 tahun."),
    numbered("12", "Mesyuarat Agung Tahunan", "Notis 14 hari diperlukan."),
    numbered("12.3", "Kuorum", "Sekurang-kurangnya 30 ahli."),
  ];

  it("returns the whole book for an empty query — a reading page shows the book", () => {
    expect(searchClauses(book, "")).toHaveLength(3);
    expect(searchClauses(book, "   ")).toHaveLength(3);
  });

  // The thing filterClauses cannot do: somebody types a clause number and wants
  // that clause.
  it("finds a clause by its number", () => {
    expect(searchClauses(book, "12.3").map((c) => c.clause_no)).toEqual(["12.3"]);
  });

  it("finds a clause by its heading, ignoring case", () => {
    expect(searchClauses(book, "kuorum").map((c) => c.clause_no)).toEqual(["12.3"]);
  });

  it("finds a clause by words in its body", () => {
    expect(searchClauses(book, "14 hari").map((c) => c.clause_no)).toEqual(["12"]);
  });

  // filterClauses caps at MAX_CANDIDATE_CLAUSES and reorders by score. For
  // somebody reading their own constitution, dropping the seventh match and
  // shuffling the rest would be a bug, not a feature.
  it("returns EVERY match, in the order of the book", () => {
    const out = searchClauses(book, "a");
    expect(out.length).toBeGreaterThan(2);
    expect(out.map((c) => c.clause_no)).toEqual(
      book.filter((c) => out.includes(c)).map((c) => c.clause_no),
    );
  });

  it("returns nothing when nothing matches, rather than a best guess", () => {
    expect(searchClauses(book, "zzzz")).toEqual([]);
  });

  it("does not mutate the array it was given", () => {
    const input = [...book];
    searchClauses(input, "kuorum");
    expect(input).toHaveLength(3);
  });
});
