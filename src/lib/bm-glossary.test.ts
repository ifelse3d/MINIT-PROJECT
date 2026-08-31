import { describe, expect, it } from "vitest";
import { BM_GLOSSARY, glossaryTermSubstitutions } from "./bm-glossary";
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

  it("returns nothing for a page with no glossary vocabulary", () => {
    expect(glossaryTermSubstitutions("Mesyuarat bersurai pada 12.30pm")).toEqual([]);
  });

  it("has no duplicate Chinese terms in the table", () => {
    const froms = BM_GLOSSARY.map(([from]) => from);
    expect(new Set(froms).size).toBe(froms.length);
  });
});
