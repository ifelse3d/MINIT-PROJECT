import { describe, expect, it } from "vitest";
import {
  findAmbiguities,
  headcountQuestion,
  openAmbiguities,
  verbatimForAmbiguous,
  verbatimIndices,
} from "./minutes-ambiguity";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "./extraction";
import { minutesPlanSchema } from "./minutes-compose";

// ---------------------------------------------------------------------------
// 118 §3 — 看不懂的時候舉手，不要編一個. The acceptance is a FIXED input in the
// shape of J's committee note (fictional names, the prompt's fictional IC —
// A3): ③ and ④ MUST raise a hand, ① ② ⑤ MUST NOT (亂問一樣是病).
// ---------------------------------------------------------------------------

const NOTE = [
  "(1) 召开会议 8/7/26 发信",
  "(2) 订 mes. agung P.T. Sin Hup - 18/7/26",
  "(3) Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)",
  "(4) lanti AJK seorg. Tan Kim Loo 800101-07-1234. 8, Lrg 3 Tmn Aman,",
  "(5) usul pindaan alamat.",
];

function extractionOf(texts: string[], asWritten: number[] = []): MeetingNotesExtraction {
  return {
    ...emptyMeetingNotesExtraction,
    resolutions: texts.map((t, i) => ({
      text: { value: t, confidence: "confirmed" as const, source_ref: { location: "photo 1", snippet: t } },
      ...(asWritten.includes(i) ? { as_written: true } : {}),
    })),
  };
}

describe("🔴 §3 — the fixed input: ③ and ④ raise a hand, ① ② ⑤ do not", () => {
  const found = findAmbiguities(NOTE);

  it("raises exactly on ③ and ④", () => {
    expect(found.map((a) => a.index)).toEqual([2, 3]);
    expect(found.map((a) => a.kind)).toEqual(["replacement", "appointment"]);
  });

  it("④ offers the two readings as whole sentences, neither pre-chosen, and keeps the IC and address", () => {
    const four = found[1];
    expect(four.quote).toBe(NOTE[3]);
    expect(four.readings).toHaveLength(2);
    expect(four.readings[0].value).toBe(
      "(4) Melantik Tan Kim Loo sebagai seorang Ahli Jawatankuasa. 800101-07-1234. 8, Lrg 3 Tmn Aman,",
    );
    expect(four.readings[1].value).toBe(
      "(4) Tan Kim Loo diminta mencari seorang Ahli Jawatankuasa. 800101-07-1234. 8, Lrg 3 Tmn Aman,",
    );
    expect(four.readings[0].label.zh).toBe("委任 Tan Kim Loo 为理事一名");
    expect(four.readings[1].label.zh).toBe("请 Tan Kim Loo 去物色一名理事");
    for (const r of four.readings) {
      expect(r.label.bm).toBeTruthy();
      expect(r.label.en).toBeTruthy();
    }
  });

  it("③ offers both directions of the replacement, in plain words", () => {
    const three = found[0];
    expect(three.readings.map((r) => r.value)).toEqual([
      "(3) Agenda 2.1 Chan Mei menggantikan Ooi Bee Huar.",
      "(3) Agenda 2.1 Ooi Bee Huar menggantikan Chan Mei.",
    ]);
    expect(three.readings.map((r) => r.label.zh)).toEqual([
      "Chan Mei 接替 Ooi Bee Huar",
      "Ooi Bee Huar 接替 Chan Mei",
    ]);
  });

  it("🔴 the readings never carry 'ditugaskan untuk melantik' or 'digantikan kepada'", () => {
    for (const a of found) {
      for (const r of a.readings) {
        expect(r.value).not.toContain("ditugaskan");
        expect(r.value).not.toContain("digantikan kepada");
      }
    }
  });
});

describe("§3 — what is NOT a question (亂問一樣是病)", () => {
  it("a replacement that states its own direction is not asked about", () => {
    expect(findAmbiguities(["Puan Aminah binti Salleh menggantikan Puan Rosnah binti Omar sebagai Ahli Jawatankuasa."])).toEqual([]);
    expect(findAmbiguities(["Ooi Bee Huar digantikan oleh Chan Mei."])).toEqual([]);
    expect(findAmbiguities(["陈美 接替 黄美花 为理事"])).toEqual([]);
  });

  it("'ganti' with one name or three names is not the two-way shape", () => {
    expect(findAmbiguities(["Chan Mei ganti kerusi"])).toEqual([]);
    expect(findAmbiguities(["Tan Kim Loo ganti Chan Mei dan Ooi Bee Huar"])).toEqual([]);
  });

  it("an appointment with nobody named has one reading", () => {
    expect(findAmbiguities(["lanti AJK seorg."])).toEqual([]);
    expect(findAmbiguities(["Melantik seorang AJK baharu pada mesyuarat akan datang"])).toEqual([]);
  });

  it("④ as the reader actually spelled it — 'seong.' and a lowercase middle name — still asks", () => {
    const a = findAmbiguities(["4. lanti AJK seong. Tan kim Loo 800101 07 1234 . 8, Lrg 3 Tmn Aman,"]);
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("appointment");
    expect(a[0].readings[0].value).toBe(
      "4. Melantik Tan kim Loo sebagai seorang Ahli Jawatankuasa. 800101 07 1234 . 8, Lrg 3 Tmn Aman,",
    );
  });

  it("the other real shape from the printed page — 'A ganti - B' — IS asked about", () => {
    const a = findAmbiguities(["Ooi Bee Huay ganti - Chan Mei"]);
    expect(a).toHaveLength(1);
    expect(a[0].readings[0].value).toBe("Ooi Bee Huay menggantikan Chan Mei.");
    expect(a[0].readings[1].value).toBe("Chan Mei menggantikan Ooi Bee Huay.");
  });
});

describe("§3 — the person's answer settles it", () => {
  it("openAmbiguities maps to the review page's row numbers and skips missing rows", () => {
    const e = extractionOf(["", ...NOTE]);
    e.resolutions[0].text.confidence = "missing";
    const open = openAmbiguities(e);
    expect(open.map((o) => o.extractionIndex)).toEqual([3, 4]);
    expect(open.map((o) => o.ambiguity.index)).toEqual([2, 3]);
  });

  it("'keep it as written' closes the question and still keeps the line verbatim in the document", () => {
    const e = extractionOf(NOTE, [3]);
    expect(openAmbiguities(e).map((o) => o.extractionIndex)).toEqual([2]);
    expect(verbatimIndices(e)).toEqual([2, 3]);
  });

  it("a chosen reading (a rewritten line) is no longer a question", () => {
    const e = extractionOf([
      ...NOTE.slice(0, 3),
      "(4) Melantik Tan Kim Loo sebagai seorang Ahli Jawatankuasa. 800101-07-1234.",
      NOTE[4],
    ]);
    expect(openAmbiguities(e).map((o) => o.extractionIndex)).toEqual([2]);
  });
});

describe("🔴 §3 — until a person chooses, the document carries the line as written", () => {
  const plan = minutesPlanSchema.parse({
    sections: [
      {
        heading: "Perkara",
        items: [
          { source: 0, text: "Surat panggilan mesyuarat 8/7/26 dihantar." },
          { source: 2, kind: "keputusan", text: "Chan Mei menggantikan Ooi Bee Huar." },
          { source: [3, 4], kind: "tindakan", text: "Tan Kim Loo dilantik; usul pindaan alamat." },
        ],
      },
    ],
    unresolved: [{ source: 1, text: "Mesyuarat Agung pada 18/7/26?" }],
  });

  it("replaces the model's sentence with the original words and drops the label", () => {
    const out = verbatimForAmbiguous(plan, NOTE, [2, 3]);
    const items = out.sections[0].items;
    expect(items[0].text).toBe("Surat panggilan mesyuarat 8/7/26 dihantar.");
    expect(items[1].text).toBe(NOTE[2]);
    expect(items[1].kind).toBeUndefined();
    // A merged item covering a locked line falls back to ALL its lines.
    expect(items[2].text).toBe(`${NOTE[3]}\n${NOTE[4]}`);
    expect(items[2].kind).toBeUndefined();
    expect(out.unresolved[0].text).toBe("Mesyuarat Agung pada 18/7/26?");
  });

  it("with nothing locked the plan is returned untouched", () => {
    expect(verbatimForAmbiguous(plan, NOTE, [])).toBe(plan);
  });
});

// ---------------------------------------------------------------------------
// 125 §2 — the THIRD shape: the headcount line is a question until a person
// answers it. Fictional names (A3).
// ---------------------------------------------------------------------------

describe("🔴 125 §2 — shape 3: the headcount line", () => {
  const line = (value: string) => ({
    value,
    confidence: "check" as const,
    source_ref: { location: "photo 1, line 2", snippet: value },
  });

  it("a line code can count is asked as a confirmation, with the numbers", () => {
    const q = headcountQuestion({
      ...emptyMeetingNotesExtraction,
      attendance_count: line("理事12人,请假2人(张伟杰,王丽华),会员40人"),
    });
    expect(q?.quote).toBe("理事12人,请假2人(张伟杰,王丽华),会员40人");
    expect(q?.counted?.present).toBe(52);
    expect(q?.counted?.apologies).toBe(2);
  });

  it("a line code cannot count is asked as an open question — nothing pre-filled", () => {
    const q = headcountQuestion({
      ...emptyMeetingNotesExtraction,
      attendance_count: line("Semua AJK hadir"),
    });
    expect(q).toEqual({ quote: "Semua AJK hadir", counted: null });
  });

  it("once a person has confirmed a number, the question is closed", () => {
    expect(
      headcountQuestion({
        ...emptyMeetingNotesExtraction,
        attendance_count: line("理事12人,请假2人,会员40人"),
        attendance_confirmed: 52,
      }),
    ).toBeNull();
  });

  it("no headcount line, no question (亂問一樣是病)", () => {
    expect(headcountQuestion(emptyMeetingNotesExtraction)).toBeNull();
    expect(
      headcountQuestion({
        ...emptyMeetingNotesExtraction,
        attendance_count: { value: "", confidence: "missing", source_ref: null },
      }),
    ).toBeNull();
  });
});
