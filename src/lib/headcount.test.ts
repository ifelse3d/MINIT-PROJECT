import { describe, expect, it } from "vitest";
import { absenceIsExcused, headcountLineBm, parseHeadcount } from "./headcount";

// 125 §2 — the headcount line is counted by code, the people on leave are
// counted out. Fictional names throughout (A3).

describe("🔴 125 §2 — parseHeadcount, the fixed input from J's AGM page", () => {
  it("理事12人,请假2人(甲,乙),会员40人 → 52 present, 2 on leave, their names kept aside", () => {
    expect(parseHeadcount("理事12人,请假2人(张伟杰,王丽华),会员40人")).toEqual({
      present: 52,
      apologies: 2,
      excused: true,
      names: ["张伟杰", "王丽华"],
      parts: [
        { label: "理事", n: 12 },
        { label: "会员", n: 40 },
      ],
    });
  });

  it("the same line with fullwidth punctuation and 、 reads the same", () => {
    expect(parseHeadcount("出席人数：理事12人、会员40人、请假2人（张伟杰、王丽华）")).toEqual({
      present: 52,
      apologies: 2,
      excused: true,
      names: ["张伟杰", "王丽华"],
      parts: [
        { label: "理事", n: 12 },
        { label: "会员", n: 40 },
      ],
    });
  });

  it("a single Chinese total", () => {
    expect(parseHeadcount("出席人数：52人")?.present).toBe(52);
    expect(parseHeadcount("出席 52 位")?.present).toBe(52);
  });
});

describe("125 §2 — BM and English shapes", () => {
  it("the printed standard form: AJK yang hadir : 33 orang", () => {
    expect(parseHeadcount("AJK yang hadir : 33 orang")).toEqual({
      present: 33,
      apologies: 0,
      excused: false,
      names: [],
      parts: [{ label: "AJK yang hadir", n: 33 }],
    });
  });

  it("groups and a leave count in BM", () => {
    const r = parseHeadcount(
      "Hadir: 12 orang AJK, 40 orang ahli; tidak hadir: 2 orang (Tan Kim Loo, Chan Mei)",
    );
    expect(r?.present).toBe(52);
    expect(r?.apologies).toBe(2);
    expect(r?.names).toEqual(["Tan Kim Loo", "Chan Mei"]);
    expect(r?.parts).toEqual([
      { label: "AJK", n: 12 },
      { label: "ahli", n: 40 },
    ]);
  });

  it("English: members present and apologies", () => {
    const r = parseHeadcount("33 members present, 2 apologies (Tan Kim Loo and Chan Mei)");
    expect(r?.present).toBe(33);
    expect(r?.apologies).toBe(2);
    expect(r?.names).toEqual(["Tan Kim Loo", "Chan Mei"]);
    expect(parseHeadcount("Present: 33")?.present).toBe(33);
  });
});

describe("125 §2 — the people on leave are NEVER present", () => {
  it("a line that only records leave has no present count → null (ask)", () => {
    expect(parseHeadcount("请假2人(张伟杰,王丽华)")).toBeNull();
    expect(parseHeadcount("tidak hadir: 2 orang")).toBeNull();
  });

  it("absent / 缺席 counts are excluded too", () => {
    expect(parseHeadcount("出席 30 人, 缺席 5 人")).toEqual({
      present: 30,
      apologies: 5,
      excused: false,
      names: [],
      parts: [{ label: "出席", n: 30 }],
    });
    expect(parseHeadcount("30 present, 5 absent")?.present).toBe(30);
  });
});

describe("125 §2 — shapes this code does not know return null, never a guess", () => {
  it("prose without a number", () => {
    expect(parseHeadcount("Semua AJK hadir")).toBeNull();
    expect(parseHeadcount("ramai yang hadir")).toBeNull();
    expect(parseHeadcount("全体理事出席")).toBeNull();
  });

  it("a number that is a time or a date is not a headcount", () => {
    expect(parseHeadcount("Masa: 8.30 PM")).toBeNull();
    expect(parseHeadcount("Tarikh 15/3/2026")).toBeNull();
  });

  it("a bare number with no unit and no headcount word is not trusted", () => {
    expect(parseHeadcount("Bil. 52")).toBeNull();
  });
});

describe("127 — headcountLineBm", () => {
  const bm = (zh: string) => ({ 理事: "Ahli Jawatankuasa", 会员: "ahli" })[zh] ?? zh;
  it("rebuilds the Chinese line from the parsed counts, in BM", () => {
    expect(headcountLineBm("出席:理事12人,请假2人(甲,乙),会员40人", bm)).toBe(
      "12 orang Ahli Jawatankuasa, 40 orang ahli; tidak hadir: 2 orang",
    );
    expect(headcountLineBm("出席:理事12人,请假2人(甲,乙),会员40人", bm, { includeNames: true })).toBe(
      "12 orang Ahli Jawatankuasa, 40 orang ahli; tidak hadir: 2 orang (甲, 乙)",
    );
  });
  it("a line without Chinese, or one it cannot parse, is left to print as written", () => {
    expect(headcountLineBm("AJK yang hadir : 33 orang", bm)).toBeNull();
    expect(headcountLineBm("大家都来了", bm)).toBeNull();
  });
});

// 134 (J 9/9, live site) — the paper wrote 缺席 and the document printed
// "(DENGAN MAAF)": an apology nobody recorded. The word on the page decides.
describe("🔴 134 — excused (请假) versus merely absent (缺席)", () => {
  const bm = (zh: string) => (zh === "理事" ? "Ahli Jawatankuasa" : zh === "会员" ? "ahli" : zh);

  it("缺席 is not excused: the BM line says 'tidak hadir', no 'dengan maaf'", () => {
    expect(parseHeadcount("理事12人,缺席2人(张伟杰,王丽华),会员40人")?.excused).toBe(false);
    expect(headcountLineBm("出席:理事12人,缺席2人(甲,乙),会员40人", bm)).toBe(
      "12 orang Ahli Jawatankuasa, 40 orang ahli; tidak hadir: 2 orang",
    );
  });

  // 136 (J, 9/9 5 PM, decided — overrides 134): the DOCUMENT never says
  // "dengan maaf", whatever the page said. `excused` is still parsed.
  it("请假 on the page: excused is parsed, but the BM line still prints plain 'tidak hadir'", () => {
    const line = "理事12人,请假2人(甲,乙),会员40人";
    expect(parseHeadcount(line)?.excused).toBe(true);
    const bm = headcountLineBm(line, (z) => z, { includeNames: true }) ?? "";
    expect(bm).toContain("tidak hadir: 2 orang");
    expect(bm.toLowerCase()).not.toContain("dengan maaf");
  });

  it("请假 / apologies / dengan maaf are excused", () => {
    expect(parseHeadcount("理事12人,请假2人,会员40人")?.excused).toBe(true);
    expect(parseHeadcount("30 present, 2 apologies")?.excused).toBe(true);
    expect(parseHeadcount("Hadir: 30 orang; tidak hadir dengan maaf: 2 orang")?.excused).toBe(true);
    expect(parseHeadcount("Hadir: 30 orang; tidak hadir: 2 orang")?.excused).toBe(false);
  });

  it("absenceIsExcused reads the page's own words — the line, or the snippet an on-leave name came from", () => {
    const ref = (snippet: string) => ({ location: "photo 1", snippet });
    expect(
      absenceIsExcused({
        attendance_count: { value: "理事12人,缺席2人(甲,乙),会员40人", confidence: "confirmed" },
        apologies: [{ name: { value: "甲", source_ref: ref("缺席2人(甲,乙)") } }],
      }),
    ).toBe(false);
    expect(
      absenceIsExcused({
        attendance_count: { value: "理事12人,请假2人(甲,乙),会员40人", confidence: "confirmed" },
      }),
    ).toBe(true);
    expect(absenceIsExcused({ apologies: [{ name: { value: "甲", source_ref: ref("请假: 甲") } }] })).toBe(true);
    // No evidence either way = no apology is invented.
    expect(absenceIsExcused({ apologies: [{ name: { value: "甲", source_ref: null } }] })).toBe(false);
    expect(absenceIsExcused({})).toBe(false);
  });
});
