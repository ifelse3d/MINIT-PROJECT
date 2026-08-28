import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  OFFICE_TEXT_MAX_CHARS,
  docxToText,
  isDocxFile,
  isLegacyOfficeFile,
  isOfficeFile,
  isPptxFile,
  isXlsxFile,
  officeFileToText,
  pptxToText,
  xlsxToText,
} from "./office-text";

// Real files, built with the same libraries that read them — no fixture blobs
// checked into the repo, and the round trip proves the toolchain itself.

async function makeDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join("");
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );
  const u8 = await zip.generateAsync({ type: "uint8array" });
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

async function makeXlsx(rows: (string | number)[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Derma");
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

async function makePptx(slides: string[][]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  slides.forEach((paras, i) => {
    const body = paras
      .map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`)
      .join("");
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
        ` xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
        `<p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  });
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );
  const u8 = await zip.generateAsync({ type: "uint8array" });
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe("file identity", () => {
  it("recognises docx/xlsx by MIME and by extension fallback", () => {
    const docxMime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const xlsxMime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    expect(isDocxFile("minit.docx", "")).toBe(true);
    expect(isDocxFile("whatever.bin", docxMime)).toBe(true);
    expect(isXlsxFile("senarai.XLSX", "")).toBe(true);
    expect(isXlsxFile("whatever.bin", xlsxMime)).toBe(true);
    expect(isOfficeFile("a.pdf", "application/pdf")).toBe(false);
    // 拍板 3 (work order 51, 2026-08-29) overturned 拍板 41's "no PPT".
    expect(isOfficeFile("a.pptx", "")).toBe(true);
    expect(
      isPptxFile(
        "whatever.bin",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe(true);
  });

  it("flags the pre-2007 binary formats, and ONLY those", () => {
    expect(isLegacyOfficeFile("laporan.doc", "")).toBe(true);
    expect(isLegacyOfficeFile("slide.PPT", "")).toBe(true);
    expect(isLegacyOfficeFile("akaun.xls", "")).toBe(true);
    expect(isLegacyOfficeFile("x.bin", "application/msword")).toBe(true);
    expect(isLegacyOfficeFile("x.bin", "application/vnd.ms-powerpoint")).toBe(true);
    // The modern formats must NOT be caught — .docx does not end in .doc.
    expect(isLegacyOfficeFile("laporan.docx", "")).toBe(false);
    expect(isLegacyOfficeFile("slide.pptx", "")).toBe(false);
    expect(isLegacyOfficeFile("akaun.xlsx", "")).toBe(false);
    expect(isLegacyOfficeFile("a.pdf", "application/pdf")).toBe(false);
  });
});

describe("docxToText", () => {
  it("extracts paragraphs in order, mixed languages intact", async () => {
    const bytes = await makeDocx([
      "Mesyuarat AJK 2026",
      "第三次会议记录",
      "Decision: buy 10 chairs &amp; 2 tables",
    ]);
    const r = await docxToText(bytes);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.text).toContain("Mesyuarat AJK 2026");
      expect(r.text).toContain("第三次会议记录");
      // entity decoded, paragraph order preserved
      expect(r.text).toContain("buy 10 chairs & 2 tables");
      expect(r.text.indexOf("Mesyuarat")).toBeLessThan(r.text.indexOf("第三次"));
    }
  });

  it("refuses non-docx bytes as unreadable, never throws", async () => {
    const junk = new TextEncoder().encode("this is not a zip").buffer as ArrayBuffer;
    expect(await docxToText(junk)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("refuses an over-long document instead of truncating it", async () => {
    const para = "x".repeat(1000);
    const bytes = await makeDocx(Array(OFFICE_TEXT_MAX_CHARS / 1000 + 2).fill(para));
    expect(await docxToText(bytes)).toEqual({ ok: false, reason: "too_long" });
  });

  it("calls an empty document empty", async () => {
    const bytes = await makeDocx([]);
    expect(await docxToText(bytes)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("xlsxToText", () => {
  it("renders rows as tab-separated lines under the sheet name", async () => {
    const bytes = await makeXlsx([
      ["Nama", "RM", "Tarikh"],
      ["Tan Ah Kow", 50, "2026-08-01"],
      ["陈大明", 100.5, "2026-08-02"],
    ]);
    const r = await xlsxToText(bytes);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.text).toContain("=== Derma ===");
      expect(r.text).toContain("Tan Ah Kow\t50\t2026-08-01");
      expect(r.text).toContain("陈大明\t100.5\t2026-08-02");
    }
  });

  it("refuses non-xlsx bytes as unreadable, never throws", async () => {
    const junk = new TextEncoder().encode("nope").buffer as ArrayBuffer;
    expect(await xlsxToText(junk)).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("pptxToText", () => {
  it("extracts slides in deck order with slide headings", async () => {
    const bytes = await makePptx([
      ["Mesyuarat Agung 2026", "Agenda"],
      ["第二张：活动报告", "Belanja: RM 1,200"],
    ]);
    const r = await pptxToText(bytes);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.text).toContain("=== Slide 1 ===");
      expect(r.text).toContain("Mesyuarat Agung 2026");
      expect(r.text).toContain("=== Slide 2 ===");
      expect(r.text).toContain("第二张：活动报告");
      expect(r.text.indexOf("Agenda")).toBeLessThan(r.text.indexOf("第二张"));
    }
  });

  it("refuses non-pptx bytes as unreadable, never throws", async () => {
    const junk = new TextEncoder().encode("not a zip").buffer as ArrayBuffer;
    expect(await pptxToText(junk)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("calls a deck with no words empty", async () => {
    const bytes = await makePptx([[]]);
    expect(await pptxToText(bytes)).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses an over-long deck instead of truncating it", async () => {
    const para = "y".repeat(1000);
    const bytes = await makePptx([Array(OFFICE_TEXT_MAX_CHARS / 1000 + 2).fill(para)]);
    expect(await pptxToText(bytes)).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("officeFileToText", () => {
  it("routes by identity", async () => {
    const doc = await makeDocx(["hello"]);
    const r = await officeFileToText("a.docx", "", doc);
    expect(r.ok).toBe(true);
    const deck = await makePptx([["hello deck"]]);
    const p = await officeFileToText("a.pptx", "", deck);
    expect(p.ok).toBe(true);
  });
});
