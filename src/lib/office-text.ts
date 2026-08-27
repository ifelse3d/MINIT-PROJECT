// ---------------------------------------------------------------------------
// WORD / EXCEL → TEXT (F-10, work order 31, 拍板 41 second half).
//
// The AI reading path takes photos and PDFs. Committees, however, keep last
// year's minutes in .docx and the donation list in .xlsx — and "save it as a
// PDF first" (the D-6 hint) is a real hurdle on a phone. These two files are
// zip archives of XML, so the text can be pulled out DETERMINISTICALLY on the
// server — no AI call, no quota — and then handed to the existing extract
// prompts as labelled text instead of an image.
//
// Dependencies, deliberately: xlsx via exceljs (already a direct dependency,
// used by einvois-xlsx.ts) and docx via jszip 3.10.1 — which was ALREADY in
// the tree as exceljs's own unzip engine, so promoting it to a direct
// dependency added zero new code to install and nothing new to audit
// (jszip < 3.8 had a prototype-pollution advisory; 3.10.1 is past it).
// PPT is not handled (拍板 41: not until someone asks).
//
// Everything here is pure bytes-in/text-out and unit-tested. Output is capped:
// a 200-sheet workbook pasted into a prompt is a month's tokens in one tap,
// and the page-count guard (pdf-pages.ts) cannot see inside a zip.
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import ExcelJS from "exceljs";

/** Above this the file is refused, not truncated — silently reading half a
 *  document and calling it "read" is how a treasurer misses rows. */
export const OFFICE_TEXT_MAX_CHARS = 40_000;

export type OfficeTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unreadable" | "empty" | "too_long" };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** MIME first, extension as fallback — phone browsers sometimes send an empty
 *  or generic type for Office files. */
export function isDocxFile(name: string, mime: string): boolean {
  return mime === DOCX_MIME || /\.docx$/i.test(name);
}

export function isXlsxFile(name: string, mime: string): boolean {
  return mime === XLSX_MIME || /\.xlsx$/i.test(name);
}

export function isOfficeFile(name: string, mime: string): boolean {
  return isDocxFile(name, mime) || isXlsxFile(name, mime);
}

/** The few entities WordprocessingML actually emits in text runs. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/**
 * word/document.xml → plain text. Paragraphs (`</w:p>`) become newlines, tabs
 * (`<w:tab/>`) become tabs, table cells get a separator; every other tag is
 * stripped. Not a full OOXML renderer on purpose: the AI needs the words in
 * order, not the formatting.
 */
export async function docxToText(bytes: ArrayBuffer): Promise<OfficeTextResult> {
  let xml: string;
  try {
    const zip = await JSZip.loadAsync(bytes);
    const doc = zip.file("word/document.xml");
    if (!doc) return { ok: false, reason: "unreadable" };
    xml = await doc.async("string");
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const text = decodeXmlEntities(
    xml
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, "\t") // table cell boundary reads as a column gap
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (text.length > OFFICE_TEXT_MAX_CHARS) return { ok: false, reason: "too_long" };
  return { ok: true, text };
}

/** One ExcelJS cell → the text a person would read in it. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text); // hyperlinks
    if ("result" in v) return v.result == null ? "" : String(v.result); // formulas
    if ("error" in v) return String(v.error);
    return String(v);
  }
  return String(v);
}

/**
 * Workbook → tab-separated text, one block per sheet with the sheet name as a
 * heading. Tab-separated because that is what the ledger prompt already reads
 * best from the typed-in path.
 */
export async function xlsxToText(bytes: ArrayBuffer): Promise<OfficeTextResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const blocks: string[] = [];
  let total = 0;
  for (const ws of wb.worksheets) {
    const lines: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(cellText(cell).replace(/[\t\n]+/g, " ").trim());
      });
      const line = cells.join("\t").replace(/\t+$/g, "");
      if (line.trim() !== "") lines.push(line);
    });
    if (lines.length === 0) continue;
    const block = `=== ${ws.name} ===\n${lines.join("\n")}`;
    total += block.length;
    if (total > OFFICE_TEXT_MAX_CHARS) return { ok: false, reason: "too_long" };
    blocks.push(block);
  }
  if (blocks.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, text: blocks.join("\n\n") };
}

/** Route the bytes by file identity. Callers check isOfficeFile first. */
export async function officeFileToText(
  name: string,
  mime: string,
  bytes: ArrayBuffer,
): Promise<OfficeTextResult> {
  if (isDocxFile(name, mime)) return docxToText(bytes);
  if (isXlsxFile(name, mime)) return xlsxToText(bytes);
  return { ok: false, reason: "unreadable" };
}
