import { describe, expect, it } from "vitest";
import {
  checkChineseNamesSurvive,
  checkInventedAgent,
  chineseNameRuns,
  droppedChineseNames,
  earnedKind,
  enforceKinds,
} from "./minutes-guards";
import { minutesPlanSchema } from "./minutes-compose";

// ---------------------------------------------------------------------------
// 118 §1 — the label is earned by the words on the page; a doer or a verdict
// the page never carried is invention. Names are FICTIONAL (A3: the repo is
// public; these are the stand-ins 119 chose, never the real sample's names).
// ---------------------------------------------------------------------------

/** The shape of J's committee note ④/③, with fictional names and a
 *  fictional IC (the prompt's own worked-example number). */
const APPOINT = "(4) lanti AJK seorg. Tan Kim Loo 800101-07-1234. 8, Lrg 3 Tmn Aman,";
const REPLACE = "(3) Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)";
const LETTER = "(1) 召开会议 8/7/26 发信";
const ADDRESS = "(5) usul pindaan alamat.";

describe("§1-1 the label is EARNED by the words on the page", () => {
  it("keputusan is earned by a decision word in the item", () => {
    expect(earnedKind("keputusan", ["2026年慈善晚宴 17/10/2026, 通过"])).toBe("keputusan");
    expect(earnedKind("keputusan", ["Cadangan diluluskan sebulat suara."])).toBe("keputusan");
  });

  it("keputusan is NOT earned by an appointment line or a shorthand replacement", () => {
    expect(earnedKind("keputusan", [APPOINT])).toBeUndefined();
    expect(earnedKind("keputusan", [REPLACE])).toBeUndefined();
    expect(earnedKind("keputusan", [ADDRESS])).toBeUndefined();
  });

  it("tindakan is earned only by WHO plus WHAT THEY ARE TO DO", () => {
    expect(earnedKind("tindakan", ["游行队伍带头：嘉益、柔依"])).toBe("tindakan");
    expect(earnedKind("tindakan", ["Ooi Bee Huang ditugaskan membawa kerusi"])).toBe("tindakan");
  });

  it("🔴 tindakan is NOT earned by 'lanti Ajk seorg. <name>' — an appointment names no task", () => {
    expect(earnedKind("tindakan", [APPOINT])).toBeUndefined();
  });

  it("tindakan is NOT earned by a task with nobody named, nor by a name with no task", () => {
    expect(earnedKind("tindakan", ["Bawa kerusi tambahan"])).toBeUndefined();
    expect(earnedKind("tindakan", [LETTER])).toBeUndefined();
    expect(earnedKind("tindakan", ["Chan Mei hadir."])).toBeUndefined();
  });

  it("there is no third label: perbincangan and anything unknown are dropped", () => {
    expect(earnedKind("perbincangan", ["Perkara A dibincangkan."])).toBeUndefined();
    expect(earnedKind(undefined, ["Perkara A"])).toBeUndefined();
    expect(earnedKind("nonsense", ["diluluskan"])).toBeUndefined();
  });

  it("enforceKinds strips the unearned labels and keeps the earned ones, text untouched", () => {
    const plan = minutesPlanSchema.parse({
      sections: [
        {
          heading: "Agenda",
          items: [
            { source: 0, kind: "tindakan", text: "Melantik Ajk seorang iaitu Tan Kim Loo." },
            { source: 1, kind: "keputusan", text: "Majlis makan malam amal 2026 pada 17/10/2026 diluluskan." },
            { source: 2, kind: "perbincangan", text: "Surat panggilan mesyuarat 8/7/26 dihantar." },
            { source: [3, 4], kind: "tindakan", text: "Barisan perarakan diketuai oleh 嘉益 dan 柔依." },
          ],
        },
      ],
      unresolved: [],
    });
    const texts = [APPOINT, "2026年慈善晚宴 17/10/2026, 通过", LETTER, "游行队伍带头：嘉益", "带队：柔依"];
    const out = enforceKinds(plan, texts);
    expect(out.sections[0].items.map((i) => i.kind)).toEqual([
      undefined,
      "keputusan",
      undefined,
      "tindakan",
    ]);
    expect(out.sections[0].items.map((i) => i.text)).toEqual(
      plan.sections[0].items.map((i) => i.text),
    );
  });
});

describe("🔴 §1-2 no doer the page did not name", () => {
  const one = (source: number | number[], text: string) => ({
    sections: [{ items: [{ source, text }] }],
    unresolved: [],
  });

  it("🔴 the sentence that started this: the appointee written as the appointer", () => {
    const r = checkInventedAgent(
      one(0, "Tan Kim Loo ditugaskan untuk melantik seorang Ahli Jawatankuasa."),
      [APPOINT],
    );
    expect(r).toEqual({ ok: false, invented: [0] });
  });

  it("the honest sentence for the same line passes", () => {
    expect(
      checkInventedAgent(one(0, "Melantik Ajk seorang iaitu Tan Kim Loo (No. K/P: 800101-07-1234), beralamat di 8, Lorong 3, Taman Aman."), [APPOINT]).ok,
    ).toBe(true);
  });

  it("🔴 'Mesyuarat memutuskan agar…' over a line that recorded no decision is invention", () => {
    const r = checkInventedAgent(
      one(0, "Mesyuarat memutuskan agar Agenda 2.1 digantikan kepada Chan Mei (Ooi Bee Huar)."),
      [REPLACE],
    );
    expect(r.ok).toBe(false);
  });

  it("a verdict IS allowed when the line carries one", () => {
    expect(
      checkInventedAgent(
        one(0, "Mesyuarat bersetuju mengadakan majlis makan malam amal 2026 pada 17/10/2026."),
        ["2026年慈善晚宴 17/10/2026, 通过"],
      ).ok,
    ).toBe(true);
  });

  it("a doer IS allowed when the line names one", () => {
    expect(
      checkInventedAgent(one(0, "Ooi Bee Huang ditugaskan membawa kerusi tambahan."), [
        "Ooi Bee Huang ditugaskan bawa kerusi tambahan",
      ]).ok,
    ).toBe(true);
    expect(
      checkInventedAgent(one(0, "嘉益负责带队。"), ["带队：嘉益"]).ok,
    ).toBe(true);
  });

  it("a plain expansion with no doer and no verdict passes", () => {
    expect(
      checkInventedAgent(one(0, "Surat panggilan mesyuarat bertarikh 8/7/26 dihantar."), [LETTER]).ok,
    ).toBe(true);
    expect(
      checkInventedAgent(one(0, "Usul pindaan alamat."), [ADDRESS]).ok,
    ).toBe(true);
  });

  it("🔴 a rejection or a deferral the page recorded may not vanish", () => {
    expect(
      checkInventedAgent(one(0, "Cadangan pembelian kerusi baharu."), [
        "购买椅子 不通过",
      ]),
    ).toEqual({ ok: false, invented: [0] });
    expect(
      checkInventedAgent(one(0, "Cadangan pembelian kerusi baharu ditolak."), [
        "购买椅子 不通过",
      ]).ok,
    ).toBe(true);
  });

  it("a merged item reports EVERY source it covers", () => {
    const r = checkInventedAgent(
      one([1, 2], "Chan Mei diminta menguruskan pengangkutan dan makanan."),
      ["x", "交通：Chan Mei", "早餐: 干捞面"],
    );
    // 交通：Chan Mei names somebody but assigns nothing in words; "diminta"
    // supplied the assignment.
    expect(r).toEqual({ ok: false, invented: [1, 2] });
  });

  it("English and Chinese doers are caught the same way", () => {
    expect(checkInventedAgent(one(0, "Tan Kim Loo is tasked to appoint a committee member."), [APPOINT]).ok).toBe(false);
    expect(checkInventedAgent(one(0, "Tan Kim Loo 被委派去委任一名理事。"), [APPOINT]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 125 §1 — a Chinese name survives in Chinese. J's AGM minutes, 2026-09-07 on
// the live site: "动议 张伟杰, 附议 王丽华" came out as "Cadangan oleh <pinyin>,
// disokong oleh <pinyin>". Fictional names throughout (A3).
// ---------------------------------------------------------------------------

describe("🔴 125 §1 — chineseNameRuns: what counts as a person", () => {
  it("finds the names after the motion words are blanked", () => {
    expect(chineseNameRuns("动议 张伟杰, 附议 王丽华")).toEqual(["张伟杰", "王丽华"]);
    expect(chineseNameRuns("查账员 刘国华 说没问题")).toEqual(["刘国华"]);
    expect(chineseNameRuns("主席：张伟杰　记录：王丽华")).toEqual(["张伟杰", "王丽华"]);
  });

  it("glossary vocabulary is never a person", () => {
    expect(chineseNameRuns("主席感谢大家")).toEqual([]);
    expect(chineseNameRuns("晚宴 RM9150")).toEqual([]);
    expect(chineseNameRuns("上年结存 7,680, 收入: 会费 13,600, 支出 10,150, 银行 11,590")).toEqual([]);
    expect(chineseNameRuns("查账员说没问题, 通过")).toEqual([]);
  });

  it("everyday words that open on a surname character are not people either", () => {
    expect(chineseNameRuns("游行队伍带头：嘉益、柔依")).toEqual([]);
    expect(chineseNameRuns("谢谢大家去年帮忙")).toEqual([]);
    expect(chineseNameRuns("顾问团 周年晚宴 余额 许多 曾经 董事会 马来西亚")).toEqual([]);
  });

  it("the organisation's own glossary terms are blanked too", () => {
    expect(chineseNameRuns("陈氏宗祠 会议", ["陈氏宗祠"])).toEqual([]);
    expect(chineseNameRuns("陈氏宗祠 会议")).toEqual(["陈氏宗祠"]);
  });
});

describe("🔴 125 §1 — checkChineseNamesSurvive", () => {
  const one = (source: number | number[], text: string) => ({
    sections: [{ items: [{ source, text }] }],
    unresolved: [],
  });
  const MOTION = "动议 张伟杰, 附议 王丽华";

  it("🔴 the sentence J saw: both names romanised → the index comes back", () => {
    expect(
      checkChineseNamesSurvive(one(0, "Cadangan oleh Tan Kim Loo, disokong oleh Chan Mei."), [MOTION]),
    ).toEqual({ ok: false, romanised: [0] });
  });

  it("the honest sentence keeps the characters → passes", () => {
    expect(
      checkChineseNamesSurvive(one(0, "Usul dicadangkan oleh 张伟杰, disokong oleh 王丽华."), [MOTION]).ok,
    ).toBe(true);
  });

  it("one of two names dropped is still a miss", () => {
    expect(
      checkChineseNamesSurvive(one(0, "Usul dicadangkan oleh 张伟杰 dan disokong."), [MOTION]).ok,
    ).toBe(false);
  });

  it("glossary words translated to BM are not names — fully BM output passes", () => {
    expect(
      checkChineseNamesSurvive(one(0, "Pengerusi mengucapkan terima kasih kepada semua."), ["主席感谢大家"]).ok,
    ).toBe(true);
    expect(
      checkChineseNamesSurvive(one(0, "Jamuan malam: RM9,150."), ["晚宴 RM9150"]).ok,
    ).toBe(true);
    expect(
      checkChineseNamesSurvive(one(0, "Juruaudit menyatakan tiada masalah; diluluskan."), ["查账员说没问题, 通过"]).ok,
    ).toBe(true);
  });

  it("a Latin name on the page is not this guard's business (checkLatinNames has it)", () => {
    expect(
      checkChineseNamesSurvive(one(0, "Melantik Tan Kim Loo sebagai AJK."), ["lanti AJK seorg. Tan Kim Loo"]).ok,
    ).toBe(true);
  });

  it("a two-character run is demanded only when a Latin name grew in its place", () => {
    // 周会 is a word; translating it is right.
    expect(checkChineseNamesSurvive(one(0, "Mesyuarat mingguan pada hari Sabtu."), ["周会 星期六"]).ok).toBe(true);
    // 陈明 is a person, and "Chen Ming" appeared from nowhere.
    expect(checkChineseNamesSurvive(one(0, "Chen Ming membawa kerusi."), ["陈明 带椅子"]).ok).toBe(false);
  });

  it("a merged item: the name may sit anywhere in the merged text; a source that lost its name is reported", () => {
    expect(
      checkChineseNamesSurvive(one([1, 2], "Pengangkutan: 张伟杰; sarapan: 王丽华."), ["x", "交通：张伟杰", "早餐：王丽华"]).ok,
    ).toBe(true);
    expect(
      checkChineseNamesSurvive(one([1, 2], "Pengangkutan: 张伟杰; sarapan: Chan Mei."), ["x", "交通：张伟杰", "早餐：王丽华"]),
    ).toEqual({ ok: false, romanised: [2] });
  });

  it("the org's glossary terms are blanked before the test", () => {
    expect(
      checkChineseNamesSurvive(one(0, "Mesyuarat di Tokong Chan."), ["陈氏宗祠 会议"], ["陈氏宗祠"]).ok,
    ).toBe(true);
  });
});

describe("125 §1-3 — droppedChineseNames, the document page's last net", () => {
  const SOURCES = ["动议 张伟杰, 附议 王丽华", "查账员 刘国华 说没问题"];

  it("lists the page's names the document no longer carries, once each, in page order", () => {
    const doc = "Cadangan oleh Tan Kim Loo, disokong oleh 王丽华.\nJuruaudit Ooi Bee Huang menyatakan tiada masalah.";
    expect(droppedChineseNames(SOURCES, doc)).toEqual(["张伟杰", "刘国华"]);
  });

  it("a document that kept every name lists nothing", () => {
    expect(droppedChineseNames(SOURCES, "Usul oleh 张伟杰, disokong oleh 王丽华. Juruaudit 刘国华.")).toEqual([]);
  });

  it("a name replaced by its KNOWN identity-card spelling is not a loss", () => {
    const doc = "Usul oleh TAN WEI JIE, disokong oleh 王丽华. Juruaudit 刘国华.";
    expect(droppedChineseNames(SOURCES, doc, [], (n) => (n === "张伟杰" ? "TAN WEI JIE" : ""))).toEqual([]);
    // …but a spelling that is NOT in the document does not excuse it.
    expect(droppedChineseNames(SOURCES, "Usul oleh Zhang W. J.", [], (n) => (n === "张伟杰" ? "TAN WEI JIE" : ""))).toEqual([
      "张伟杰", "王丽华", "刘国华",
    ]);
  });

  it("protected text (org name, roster, signer) is never a candidate", () => {
    expect(droppedChineseNames(["陈氏宗祠 主席致词"], "Ucapan Pengerusi.", ["陈氏宗祠"])).toEqual([]);
  });
});
