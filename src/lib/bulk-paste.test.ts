import { describe, expect, it } from "vitest";
import { parseCommitteePaste, parseGlossaryPaste } from "@/lib/bulk-paste";

/** The optional fields, all absent — most lines are just position + name. */
const blank = {
  nameOfficial: null,
  termStart: null,
  termEnd: null,
  honorific: null,
  note: null,
  email: null,
  state: null,
};

describe("parseCommitteePaste", () => {
  it("reads what Excel puts on the clipboard", () => {
    const { rows, bad } = parseCommitteePaste(
      "主席\t陈大明\t2026-01-01\t2027-12-31\nSetiausaha\t林小美",
    );
    expect(bad).toEqual([]);
    expect(rows.map((r) => r.row)).toEqual([
      { ...blank, position: "主席", personName: "陈大明", termStart: "2026-01-01", termEnd: "2027-12-31" },
      { ...blank, position: "Setiausaha", personName: "林小美" },
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

  // H1 (work order 69): the eROSES AJK columns travel through a paste too.
  it("recognises an email and a Malaysian state wherever they sit", () => {
    const { rows, bad } = parseCommitteePaste(
      "AJK, 李美玲, mei@contoh.my, Selangor\n财政, 王小强, WONG SIEW KEONG, wong@contoh.my, WP Kuala Lumpur, 2026-01-01",
    );
    expect(bad).toEqual([]);
    expect(rows[0].row.email).toBe("mei@contoh.my");
    expect(rows[0].row.state).toBe("Selangor");
    expect(rows[0].row.nameOfficial).toBeNull();
    expect(rows[1].row).toMatchObject({
      nameOfficial: "WONG SIEW KEONG",
      email: "wong@contoh.my",
      state: "WP Kuala Lumpur",
      termStart: "2026-01-01",
    });
  });

  it("does not mistake a person's name for a state", () => {
    // The state check is whole-value equality — "Sabariah" is not "Sabah",
    // so the leftover field stays what it is: the IC name.
    const { rows } = parseCommitteePaste("Setiausaha, Sabariah, SABARIAH BINTI ALI");
    expect(rows[0].row.nameOfficial).toBe("SABARIAH BINTI ALI");
    expect(rows[0].row.state).toBeNull();
  });

  // H1: the template's own header row turns the parse positional — that is
  // how Gelaran/E-mel/Negeri/Nota land in the right fields, empties and all.
  it("reads our template header as a column map", () => {
    const text = [
      "Jawatan / 职位 / Position\tNama / 姓名 / Name\tGelaran / 称呼职衔 / Title (optional)\tNama seperti dalam IC / 身份证上的名字 / Name as on IC\tE-mel / 电邮 / Email\tNegeri / 州属 / State\tNota / 备注 / Note\tTarikh perlantikan / 任命日期 / Appointed (YYYY-MM-DD)",
      "Pengerusi / 主席\t陈大明\tDato'\tTAN TAI BENG\ttaitb@contoh.my\tSelangor\t\t2026-01-01",
      "Bendahari / 财政\t王小强\t\t\t\t\t（大）\t",
    ].join("\n");
    const { rows, bad } = parseCommitteePaste(text);
    expect(bad).toEqual([]);
    expect(rows[0].row).toEqual({
      position: "Pengerusi / 主席",
      personName: "陈大明",
      honorific: "Dato'",
      nameOfficial: "TAN TAI BENG",
      email: "taitb@contoh.my",
      state: "Selangor",
      note: null,
      termStart: "2026-01-01",
      termEnd: null,
    });
    // An empty cell is a position, not an absence — the note lands in note.
    expect(rows[1].row.note).toBe("（大）");
    expect(rows[1].row.honorific).toBeNull();
  });

  it("reads the OLD four-column template by its header too", () => {
    const text = [
      "Jawatan / 职位 / Position\tNama / 姓名 / Name\tNama seperti dalam IC / 马来文姓名（如 IC）/ Name as on IC\tTarikh perlantikan / 任命日期 / Appointed (YYYY-MM-DD)",
      "Setiausaha / 秘书\t林小美\tLIM SIEW MEI\t2026-01-01",
    ].join("\n");
    const { rows, bad } = parseCommitteePaste(text);
    expect(bad).toEqual([]);
    expect(rows[0].row).toMatchObject({
      position: "Setiausaha / 秘书",
      personName: "林小美",
      nameOfficial: "LIM SIEW MEI",
      termStart: "2026-01-01",
    });
  });

  it("refuses an ambiguous date under a header rather than filing a guess", () => {
    const text = [
      "Jawatan / 职位 / Position\tNama / 姓名 / Name\tTarikh perlantikan / 任命日期 / Appointed (YYYY-MM-DD)",
      "主席\t陈大明\t1/1/2026",
    ].join("\n");
    const { rows, bad } = parseCommitteePaste(text);
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

  it("consumes our own template header instead of treating it as a word", () => {
    const { rows } = parseGlossaryPaste(
      "Perkataan / 那个词 / The word\tTulis sebagai\tIa apa\n崇德\t\tajaran",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].row.term).toBe("崇德");
  });
});
