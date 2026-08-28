// ---------------------------------------------------------------------------
// WORD / EXCEL / POWERPOINT → TEXT (F-10, work order 31; PPT added by 拍板 3
// of work order 51, 2026-08-29 — which OVERTURNS 拍板 41's "no PPT": a temple
// committee's briefing deck is real paperwork, and "save it as a PDF first"
// was exactly the hurdle that broke for the tester).
//
// The AI reading path takes photos and PDFs. Committees, however, keep last
// year's minutes in .docx and the donation list in .xlsx — and "save it as a
// PDF first" (the D-6 hint) is a real hurdle on a phone. These files are
// zip archives of XML, so the text can be pulled out DETERMINISTICALLY on the
// server — no AI call, no quota — and then handed to the existing extract
// prompts as labelled text instead of an image.
//
// Dependencies, deliberately: xlsx via exceljs (already a direct dependency,
// used by einvois-xlsx.ts) and docx/pptx via jszip 3.10.1 — which was ALREADY
// in the tree as exceljs's own unzip engine, so promoting it to a direct
// dependency added zero new code to install and nothing new to audit
// (jszip < 3.8 had a prototype-pollution advisory; 3.10.1 is past it).
//
// The pre-2007 binary formats (.doc/.ppt/.xls) are NOT zip+XML and cannot be
// read this way — isLegacyOfficeFile() lets the doors refuse them with "save
// it as .docx/.pptx" instead of the generic unsupported-file sentence.
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
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** MIME first, extension as fallback — phone browsers sometimes send an empty
 *  or generic type for Office files. */
export function isDocxFile(name: string, mime: string): boolean {
  return mime === DOCX_MIME || /\.docx$/i.test(name);
}

export function isXlsxFile(name: string, mime: string): boolean {
  return mime === XLSX_MIME || /\.xlsx$/i.test(name);
}

export function isPptxFile(name: string, mime: string): boolean {
  return mime === PPTX_MIME || /\.pptx$/i.test(name);
}

export function isOfficeFile(name: string, mime: string): boolean {
  return (
    isDocxFile(name, mime) || isXlsxFile(name, mime) || isPptxFile(name, mime)
  );
}

/**
 * The pre-2007 binary formats. They cannot be refused by silence: a person who
 * uploads their 2009-era .doc deserves "save it as .docx" (a menu item they
 * can find), not "unsupported file". The extension check deliberately does not
 * match .docx/.pptx/.xlsx — the x does not fit the `$` anchor.
 */
export function isLegacyOfficeFile(name: string, mime: string): boolean {
  return (
    mime === "application/msword" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.ms-excel" ||
    /\.(doc|ppt|xls)$/i.test(name)
  );
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

/**
 * ppt/slides/slideN.xml → plain text, slides in deck order. DrawingML wraps
 * every visible string in `<a:t>` runs; paragraphs (`</a:p>`) become newlines.
 * Speaker notes are deliberately left out — they are the presenter's own
 * asides, not the document the committee saw.
 */
export async function pptxToText(bytes: ArrayBuffer): Promise<OfficeTextResult> {
  let slides: { n: number; xml: string }[];
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.keys(zip.files)
      .map((path) => {
        const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path);
        return m ? { n: Number(m[1]), path } : null;
      })
      .filter((e): e is { n: number; path: string } => e !== null)
      .sort((a, b) => a.n - b.n);
    if (entries.length === 0) return { ok: false, reason: "unreadable" };
    slides = await Promise.all(
      entries.map(async (e) => ({
        n: e.n,
        xml: await zip.file(e.path)!.async("string"),
      })),
    );
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const blocks: string[] = [];
  let total = 0;
  for (const slide of slides) {
    // Same move as docxToText: in slide XML the only bare text BETWEEN tags
    // is what sits inside <a:t> runs (everything else lives in attributes,
    // inside the tags themselves), so stripping every tag leaves exactly the
    // visible words. Line breaks and paragraph ends become newlines first.
    const text = decodeXmlEntities(
      slide.xml
        .replace(/<a:br[^>]*\/>/g, "\n")
        .replace(/<\/a:p>/g, "\n")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text === "") continue;
    const block = `=== Slide ${slide.n} ===\n${text}`;
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
  if (isPptxFile(name, mime)) return pptxToText(bytes);
  return { ok: false, reason: "unreadable" };
}
