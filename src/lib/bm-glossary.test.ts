import { describe, expect, it } from "vitest";
import {
  BM_GLOSSARY,
  glossaryTermSubstitutions,
  looksLikeChineseName,
  splitFlaggedLines,
} from "./bm-glossary";
import { applyNameSubstitutions } from "./roster-names";

// §2 (work order 116): J's own AGM page. Nine flagged lines, not one a name.
const J_AGM = `## KEHADIRAN
出席：理事 12 人，请假 2 人
## 财政报告
- 上年结存: RM7,680.00
- 收入：乐捐: RM800.00
- 收入：晚宴: RM11,600.00
- 支出：礼堂: RM1,000.00
- 银行: RM11,590.00
- 助学金: RM3,000.00
散会 12.30pm`;

describe("glossaryTermSubstitutions", () => {
  it("covers every ordinary word the guard flagged on J's AGM page", () => {
    const subs = glossaryTermSubstitutions(J_AGM);
    const applied = applyNameSubstitutions(
      J_AGM,
      subs.map((s) => ({ ...s, count: 0 })),
    );
    for (const word of [
      "助学金", "上年结存", "收入", "乐捐", "晚宴",
      "支出", "礼堂", "银行", "散会",
    ]) {
      expect(applied, `${word} should be gone`).not.toContain(word);
    }
  });

  it("prefers the longer term — 上年结存 not 结存, 慈善晚宴 not 晚宴", () => {
    const subs = glossaryTermSubstitutions("上年结存 RM100，慈善晚宴 17/10/2026");
    const froms = subs.map((s) => s.from);
    expect(froms).toContain("上年结存");
    expect(froms).toContain("慈善晚宴");
    expect(froms).not.toContain("结存");
    expect(froms).not.toContain("晚宴");
  });

  it("NEVER touches a protected personal name, even one containing a term", () => {
    const text = "主席：林通过，记录：陈银行";
    const subs = glossaryTermSubstitutions(text, ["林通过", "陈银行"]);
    const applied = applyNameSubstitutions(
      text,
      subs.map((s) => ({ ...s, count: 0 })),
    );
    expect(applied).toContain("林通过");
    expect(applied).toContain("陈银行");
    expect(applied).toContain("Pengerusi");
  });

  it("leaves an unknown name flagged rather than guessing at it", () => {
    const subs = glossaryTermSubstitutions("动议 叶俊成，附议 何淑仪");
    const applied = applyNameSubstitutions(
      "动议 叶俊成，附议 何淑仪",
      subs.map((s) => ({ ...s, count: 0 })),
    );
    expect(applied).toContain("叶俊成");
    expect(applied).toContain("何淑仪");
    expect(applied).toContain("Usul");
  });

  it("tells a Malaysian Chinese name from ordinary words", () => {
    for (const name of ["叶俊成", "何淑仪", "苏明伟", "林志强", "陈秀玲", "黄明", "欧阳志伟"]) {
      expect(looksLikeChineseName(name), name).toBe(true);
    }
    for (const word of ["上届", "没变", "点开始", "感谢大家去年帮忙", "会议室", "银行", "原"]) {
      expect(looksLikeChineseName(word), word).toBe(false);
    }
  });

  it("returns nothing for a page with no glossary vocabulary", () => {
    expect(glossaryTermSubstitutions("Mesyuarat bersurai pada 12.30pm")).toEqual([]);
  });

  it("has no duplicate Chinese terms in the table", () => {
    const froms = BM_GLOSSARY.map(([from]) => from);
    expect(new Set(froms).size).toBe(froms.length);
  });
});

describe("splitFlaggedLines", () => {
  // J's real page, 8/31: money lines and real names in one flagged list.
  const LINES = [
    "· Tempat: 会议室",
    "- 助学金: RM3,000.00",
    "- 上年结存: RM7,680.00",
    "- 收入：会员: RM1,200.00",
    "Minit mesyuarat penggal lalu (15/3/2025) disahkan tanpa sebarang pindaan, dicadangkan oleh 叶俊成 dan disokong oleh 何淑仪.",
    "Pemeriksa kira-kira, 苏明伟, mengesahkan bahawa akaun tiada masalah.",
  ];
  const subs = glossaryTermSubstitutions(LINES.join("\n"));

  it("folds the ordinary-word lines away from the human's list", () => {
    const { termOnly, linesNeedingNames } = splitFlaggedLines(LINES, subs);
    expect(termOnly).toHaveLength(4);
    expect(linesNeedingNames).toHaveLength(2);
    expect(termOnly.join(" ")).toContain("助学金");
  });

  it("asks the human for the NAMES only, one row each", () => {
    const { nameTokens } = splitFlaggedLines(LINES, subs);
    expect(nameTokens).toEqual(["叶俊成", "何淑仪", "苏明伟"]);
  });

  // J's third screenshot: 上届, 原, 没变, 感谢大家去年帮忙, 点开始 were all
  // shown as names wanting an identity-card spelling. None is a person.
  it("never asks for the identity-card spelling of ordinary words", () => {
    const prose = ["上届", "原", "没变", "感谢大家去年帮忙", "点开始"];
    const { nameTokens, proseTokens } = splitFlaggedLines(
      prose.map((w) => `- ${w}`),
      [],
    );
    expect(nameTokens).toEqual([]);
    expect(proseTokens).toEqual(["上届", "原", "没变", "感谢大家去年帮忙", "点开始"]);
  });

  it("filling a name replaces the NAME, not the sentence it sits in", () => {
    const sentence = LINES[4];
    const out = applyNameSubstitutions(sentence, [
      { from: "叶俊成", to: "YAP CHOON SENG", count: 0 },
    ]);
    expect(out).toContain("YAP CHOON SENG");
    expect(out).toContain("disokong oleh 何淑仪");
    expect(out).toContain("Minit mesyuarat penggal lalu (15/3/2025)");
  });

  it("keeps a line in the human list when ANY Chinese survives the glossary", () => {
    const { termOnly, nameTokens } = splitFlaggedLines(["收入：陈大文 RM50"], subs);
    expect(termOnly).toHaveLength(0);
    expect(nameTokens).toContain("陈大文");
  });

  it("never puts the same name in the human list twice", () => {
    // Terms come from the same text in real use, so 主席 is covered here too.
    const text = ["主席 苏明伟", "Pemeriksa 苏明伟"];
    const { nameTokens } = splitFlaggedLines(
      text,
      glossaryTermSubstitutions(text.join(String.fromCharCode(10))),
    );
    expect(nameTokens).toEqual(["苏明伟"]);
  });
});
