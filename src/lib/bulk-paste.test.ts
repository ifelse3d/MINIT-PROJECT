import { describe, expect, it } from "vitest";
import { parseCommitteePaste, parseGlossaryPaste } from "@/lib/bulk-paste";

describe("parseCommitteePaste", () => {
  it("reads what Excel puts on the clipboard", () => {
    const { rows, bad } = parseCommitteePaste(
      "主席\t陈大明\t2026-01-01\t2027-12-31\nSetiausaha\t林小美",
    );
    expect(bad).toEqual([]);
    expect(rows.map((r) => r.row)).toEqual([
      { position: "主席", personName: "陈大明", nameOfficial: null, termStart: "2026-01-01", termEnd: "2027-12-31" },
      { position: "Setiausaha", personName: "林小美", nameOfficial: null, termStart: null, termEnd: null },
    ]);
  });

  it("reads the separators people actually type", () => {
    const { rows } = parseCommitteePaste("财政, 王小强\n秘书：李美玲\nAJK - 陈志强");
    expect(rows.map((r) => r.row.personName)).toEqual(["王小强", "李美玲", "陈志强"]);
  });

  it("reports a line it cannot read instead of dropping it", () => {
    const { rows, bad } = parseCommitteePaste("主席, 陈大明\n陈志强\n财政, 王小强");
    expect(rows).toHaveLength(2);
    expect(bad).toEqual([{ lineNumber: 2, text: "陈志强" }]);
  });

  it("takes a third non-date field as the name on the identity card", () => {
    const { rows } = parseCommitteePaste("主席, 陈大明, TAN TAI BENG, 2026-01-01");
    expect(rows[0].row.nameOfficial).toBe("TAN TAI BENG");
    expect(rows[0].row.termStart).toBe("2026-01-01");
  });

  it("still refuses when there is more than it can place", () => {
    const { rows, bad } = parseCommitteePaste("主席, 陈大明, TAN TAI BENG, 012-3456789");
    expect(rows).toHaveLength(0);
    expect(bad).toHaveLength(1);
  });
});

describe("parseGlossaryPaste", () => {
  it("treats a bare word as keep-exactly — the safe default", () => {
    const { rows } = parseGlossaryPaste("崇德\n点传师");
    expect(rows.map((r) => r.row)).toEqual([
      { term: "崇德", action: "keep", translation: null, note: null },
      { term: "点传师", action: "keep", translation: null, note: null },
    ]);
  });

  it("reads a translation however it was written", () => {
    const { rows } = parseGlossaryPaste("家长班 = Kelas Ibu Bapa\n青班 → Kelas Qing\n少班\tKelas Shao");
    expect(rows.map((r) => r.row.translation)).toEqual([
      "Kelas Ibu Bapa",
      "Kelas Qing",
      "Kelas Shao",
    ]);
    expect(rows.every((r) => r.row.action === "translate")).toBe(true);
  });

  it("understands 'keep' spelled out in any of the three languages", () => {
    const { rows } = parseGlossaryPaste("崇德 = 保持原字\n余老师 = keep\n点传师 = kekal");
    expect(rows.every((r) => r.row.action === "keep")).toBe(true);
  });
});
