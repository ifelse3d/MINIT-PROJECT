import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildTemplateXlsx, xlsxToPasteText } from "@/lib/roster-xlsx";
import { parseCommitteePaste, parseGlossaryPaste } from "@/lib/bulk-paste";

// A template nobody can upload again is a form, not a workflow — so the tests
// go all the way round: build it, fill it, read it back, parse it.

async function sheetOf(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buffer).buffer as ArrayBuffer);
  return wb.worksheets[0];
}

describe("buildTemplateXlsx", () => {
  it("gives the committee form the columns the parser expects", async () => {
    const ws = await sheetOf(await buildTemplateXlsx("committee"));
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header[0]).toContain("职位");
    expect(header[1]).toContain("姓名");
    // B-1 (work order 51): four columns — the "term end" column is gone;
    // the date column is the eROSES appointment date.
    expect(header).toHaveLength(4);
    expect(header[2]).toContain("IC");
    expect(header[3]).toContain("任命日期");
  });

  it("ships an instructions sheet, not just a grid", async () => {
    const wb = new ExcelJS.Workbook();
    const buf = await buildTemplateXlsx("glossary");
    await wb.xlsx.load(new Uint8Array(buf).buffer as ArrayBuffer);
    expect(wb.worksheets).toHaveLength(2);
    expect(wb.worksheets[1].name).toContain("说明");
  });
});

describe("xlsxToPasteText", () => {
  const roundTrip = async (rows: string[][], header?: string[]) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    if (header) ws.addRow(header);
    for (const r of rows) ws.addRow(r);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return xlsxToPasteText(new Uint8Array(buf).buffer as ArrayBuffer);
  };

  it("feeds a filled-in committee form straight into the paste parser", async () => {
    const text = await roundTrip(
      [
        ["主席", "陈大明", "TAN TAI BENG", "2026-01-01", "2027-12-31"],
        ["Setiausaha", "林小美", "", "", ""],
      ],
      ["Jawatan / 职位 / Position", "Nama / 姓名 / Name", "Nama dalam IC", "Mula", "Tamat"],
    );
    const { rows, bad } = parseCommitteePaste(text);
    expect(bad).toEqual([]);
    expect(rows.map((r) => r.row)).toEqual([
      {
        position: "主席",
        personName: "陈大明",
        nameOfficial: "TAN TAI BENG",
        termStart: "2026-01-01",
        termEnd: "2027-12-31",
      },
      {
        position: "Setiausaha",
        personName: "林小美",
        nameOfficial: null,
        termStart: null,
        termEnd: null,
      },
    ]);
  });

  it("does the same for the glossary form, empty column meaning keep", async () => {
    const text = await roundTrip(
      [
        ["崇德", "", "ajaran"],
        ["家长班", "Kelas Ibu Bapa", "kelas"],
      ],
      ["Perkataan / 那个词 / The word", "Tulis sebagai", "Ia apa"],
    );
    const { rows } = parseGlossaryPaste(text);
    expect(rows[0].row).toEqual({ term: "崇德", action: "keep", translation: null, note: "ajaran" });
    expect(rows[1].row).toEqual({
      term: "家长班",
      action: "translate",
      translation: "Kelas Ibu Bapa",
      note: "kelas",
    });
  });

  it("keeps a first row that is real data, not our header", async () => {
    const text = await roundTrip([["主席", "陈大明"], ["财政", "王小强"]]);
    expect(parseCommitteePaste(text).rows).toHaveLength(2);
  });
});
