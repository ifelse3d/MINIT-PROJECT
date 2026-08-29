import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { needsCjkFont, subsetNotoFor, winAnsiSafe } from "@/lib/pdf-fonts";
import { PDF_PRODUCER } from "@/lib/brand";
import {
  attendanceSheetTitleBm,
  buildAgmNoticeBm,
  buildAttendanceRows,
  buildBankResolutionExtractBm,
  buildProxyFormBm,
  DRAFT_WATERMARK_BM,
  type AgmPackParams,
  type MinutesForExtract,
} from "@/lib/agm-pack";

// ---------------------------------------------------------------------------
// AGM PACK PDF — renders the deterministic BM documents from agm-pack.ts as
// one A4 pack: notice+agenda page(s), printable attendance sheet, proxy form.
// Layout only — every word comes from agm-pack.ts. Elder-friendly: 12pt body,
// generous leading, attendance rows tall enough to sign by hand.
// ---------------------------------------------------------------------------

const A4: [number, number] = [595, 842];
const MARGIN = 54;
const BODY = 12;
const LEAD = 18;

type Fonts = { helv: PDFFont; bold: PDFFont; noto: PDFFont | null };

const ink = rgb(0.08, 0.09, 0.12);
const grey = rgb(0.42, 0.44, 0.5);

function pick(fonts: Fonts, s: string, wantBold: boolean): { font: PDFFont; text: string } {
  if (needsCjkFont(s) && fonts.noto) return { font: fonts.noto, text: s };
  return { font: wantBold ? fonts.bold : fonts.helv, text: winAnsiSafe(s) };
}

function widthOf(fonts: Fonts, s: string, size: number, wantBold = false): number {
  const { font, text } = pick(fonts, s, wantBold);
  return font.widthOfTextAtSize(text, size);
}

function drawAt(
  page: PDFPage,
  fonts: Fonts,
  s: string,
  x: number,
  y: number,
  size: number,
  opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}
) {
  const { font, text } = pick(fonts, s, opts.bold ?? false);
  page.drawText(text, { x, y, size, font, color: opts.color ?? ink });
}

function wrapLine(fonts: Fonts, s: string, size: number, bold: boolean, maxWidth: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (widthOf(fonts, cand, size, bold) <= maxWidth || line === "") line = cand;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * "THIS IS A SAMPLE" — stamped on every page when the document's CONTENT is not
 * backed by the organisation's own records.
 *
 * WHY (2026-07-28 audit): /agm-pack builds its notice, agenda, attendance sheet,
 * proxy form and bank-resolution extract from `sample-roster.ts` — a fictional
 * committee, a meeting date nobody chose, a fictional venue and a fictional
 * bank-signatory change. Because doc-identity.ts (correctly) forces the REAL
 * organisation name onto the document, the result was an authentic-looking
 * certified extract, on a real temple's letterhead, resolving to appoint people
 * who do not exist. A bank acts on that document.
 *
 * Until there is a real ingestion path for the committee roster and the AGM
 * date, the routes pass `sample: true` and this mark makes the document unusable
 * as an official one — deliberately loud, on every page, at full opacity.
 */
function drawSampleWatermark(page: PDFPage, fonts: Fonts) {
  const label = "CONTOH / 示范 / SAMPLE — BUKAN DOKUMEN RASMI";
  const { font, text } = pick(fonts, label, true);
  page.drawText(text, {
    x: 46,
    y: 470,
    size: 19,
    font,
    color: rgb(0.72, 0.12, 0.12),
    rotate: degrees(30),
    opacity: 0.5,
  });
  const second = pick(fonts, "JANGAN GUNA / 请勿使用 / DO NOT USE", true);
  page.drawText(second.text, {
    x: 46,
    y: 300,
    size: 19,
    font: second.font,
    color: rgb(0.72, 0.12, 0.12),
    rotate: degrees(30),
    opacity: 0.5,
  });
}

function drawWatermark(page: PDFPage, fonts: Fonts) {
  const { font, text } = pick(fonts, DRAFT_WATERMARK_BM, true);
  page.drawText(text, {
    x: 90,
    y: 300,
    size: 32,
    font,
    color: rgb(0.78, 0.2, 0.2),
    rotate: degrees(35),
    opacity: 0.14,
  });
}

/**
 * Renders one plain-text document (from agm-pack.ts) as A4 page(s).
 * Styling heuristics: the first block (until the first blank line) is a
 * centered letterhead; ALL-CAPS lines become bold section titles.
 */
function renderTextDoc(
  doc: PDFDocument,
  fonts: Fonts,
  text: string,
  watermark: boolean,
  sample = false,
): void {
  const lines = text.split("\n");
  const maxWidth = A4[0] - MARGIN * 2;
  let page = doc.addPage(A4);
  if (watermark) drawWatermark(page, fonts);
  if (sample) drawSampleWatermark(page, fonts);
  let y = A4[1] - MARGIN;
  let inHeader = true;
  let headerLine = 0;

  const newPageIfNeeded = () => {
    if (y < MARGIN + LEAD) {
      page = doc.addPage(A4);
      if (watermark) drawWatermark(page, fonts);
  if (sample) drawSampleWatermark(page, fonts);
      y = A4[1] - MARGIN;
    }
  };

  for (const raw of lines) {
    if (inHeader && raw === "") {
      inHeader = false;
      // rule under the letterhead
      y -= 6;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: A4[0] - MARGIN, y },
        thickness: 1.2,
        color: ink,
      });
      y -= LEAD;
      continue;
    }
    if (!inHeader && raw === "") {
      y -= LEAD * 0.6; // blank lines breathe, but less than a full text line
      continue;
    }
    const isTitle =
      !inHeader && raw.length > 3 && raw === raw.toUpperCase() && /[A-Z]/.test(raw);
    const size = inHeader ? (headerLine === 0 ? 15 : 9) : isTitle ? 13 : BODY;
    const bold = (inHeader && headerLine === 0) || isTitle || raw.startsWith("⚠");
    const color = inHeader && headerLine > 0 ? grey : ink;
    // ⚠ has no glyph in Noto Sans SC — strip it for the PDF (UI keeps it).
    const display = raw.replace(/^⚠\s*/, "");
    // Only word-wrap when the line is too wide: wrapping collapses runs of
    // spaces, which would destroy side-by-side signature blocks.
    const segs =
      widthOf(fonts, display, size, bold) <= maxWidth
        ? [display]
        : wrapLine(fonts, display, size, bold, maxWidth);
    for (const seg of segs) {
      newPageIfNeeded();
      if (inHeader) {
        drawAt(page, fonts, seg, (A4[0] - widthOf(fonts, seg, size, bold)) / 2, y, size, {
          bold,
          color,
        });
      } else {
        drawAt(page, fonts, seg, MARGIN, y, size, { bold, color });
      }
      y -= isTitle ? LEAD + 4 : LEAD;
    }
    if (inHeader) headerLine++;
  }
}

/** Attendance sheet: a real table with rows tall enough to sign by hand. */
function renderAttendanceSheet(
  doc: PDFDocument,
  fonts: Fonts,
  p: AgmPackParams,
  watermark: boolean,
  sample = false,
): void {
  const rows = buildAttendanceRows(p.roster, 25);
  const cols = [
    { label: "Bil", w: 36 },
    { label: "Nama / 姓名", w: 215 },
    { label: "Jawatan", w: 120 },
    { label: "Tandatangan", w: 116 },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  const rowH = 26;
  let page = doc.addPage(A4);
  if (watermark) drawWatermark(page, fonts);
  if (sample) drawSampleWatermark(page, fonts);
  let y = A4[1] - MARGIN;

  const title = attendanceSheetTitleBm(p);
  drawAt(page, fonts, p.orgName, (A4[0] - widthOf(fonts, p.orgName, 13, true)) / 2, y, 13, { bold: true });
  y -= LEAD + 2;
  for (const seg of wrapLine(fonts, title, 11, true, A4[0] - MARGIN * 2)) {
    drawAt(page, fonts, seg, (A4[0] - widthOf(fonts, seg, 11, true)) / 2, y, 11, { bold: true });
    y -= LEAD;
  }
  y -= 8;

  const drawHeaderRow = () => {
    let x = MARGIN;
    page.drawRectangle({
      x: MARGIN, y: y - rowH + 6, width: tableW, height: rowH,
      color: rgb(0.93, 0.94, 0.95), borderColor: ink, borderWidth: 0.8,
    });
    for (const c of cols) {
      drawAt(page, fonts, c.label, x + 6, y - 12, 10, { bold: true });
      x += c.w;
    }
    y -= rowH;
  };
  drawHeaderRow();

  for (const r of rows) {
    if (y < MARGIN + rowH) {
      page = doc.addPage(A4);
      if (watermark) drawWatermark(page, fonts);
  if (sample) drawSampleWatermark(page, fonts);
      y = A4[1] - MARGIN;
      drawHeaderRow();
    }
    let x = MARGIN;
    page.drawRectangle({
      x: MARGIN, y: y - rowH + 6, width: tableW, height: rowH,
      borderColor: grey, borderWidth: 0.5,
    });
    const cells = [String(r.no), r.name, r.position, ""];
    for (let i = 0; i < cols.length; i++) {
      if (cells[i]) drawAt(page, fonts, cells[i], x + 6, y - 12, 10);
      x += cols[i].w;
      if (i < cols.length - 1)
        page.drawLine({
          start: { x, y: y + 6 }, end: { x, y: y - rowH + 6 }, thickness: 0.5, color: grey,
        });
    }
    y -= rowH;
  }
}

/** The full AGM pack: notice+agenda, attendance sheet, proxy form. */
export async function buildAgmPackPdf(
  p: AgmPackParams,
  /** `sample: true` stamps every page CONTOH / SAMPLE — see drawSampleWatermark. */
  { sample = false }: { sample?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Pek AGM ${p.year} — ${p.orgName}`);
  doc.setProducer(PDF_PRODUCER);

  const notice = buildAgmNoticeBm(p);
  const proxy = buildProxyFormBm(p);
  const allText =
    notice + proxy + attendanceSheetTitleBm(p) +
    p.roster.map((m) => m.personName + m.position).join("") +
    "Bil Nama / 姓名 Jawatan Tandatangan"; // attendance column labels
  let noto: PDFFont | null = null;
  if (winAnsiSafe(allText) !== allText) {
    const sub = await subsetNotoFor(allText);
    if (sub) {
      doc.registerFontkit(fontkit);
      noto = await doc.embedFont(sub, { subset: false });
    }
  }
  const fonts: Fonts = {
    helv: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    noto,
  };
  const watermark = !p.confirmed;
  renderTextDoc(doc, fonts, notice, watermark, sample);
  renderAttendanceSheet(doc, fonts, p, watermark, sample);
  renderTextDoc(doc, fonts, proxy, watermark, sample);
  return doc.save();
}

/**
 * One plain-text document as an A4 PDF — the renderer the AGM notice and the
 * bank extract already use, exported for other text documents (first use:
 * the Laporan Aktiviti, D2-3 work order 56). Layout heuristics as above:
 * first block = centred letterhead, ALL-CAPS lines = bold section titles.
 * `draftWatermark` stamps the DRAF diagonal (Hard Rule 8 — an unconfirmed
 * generated document must say so on its face).
 */
export async function buildTextDocPdf(
  text: string,
  { title, draftWatermark = false }: { title: string; draftWatermark?: boolean },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer(PDF_PRODUCER);
  let noto: PDFFont | null = null;
  if (winAnsiSafe(text) !== text) {
    const sub = await subsetNotoFor(text);
    if (sub) {
      doc.registerFontkit(fontkit);
      noto = await doc.embedFont(sub, { subset: false });
    }
  }
  const fonts: Fonts = {
    helv: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    noto,
  };
  renderTextDoc(doc, fonts, text, draftWatermark);
  return doc.save();
}

/** Bank-resolution extract as a single-page PDF. Throws when refused. */
export async function buildBankExtractPdf(
  m: MinutesForExtract,
  { sample = false }: { sample?: boolean } = {},
): Promise<Uint8Array> {
  const res = buildBankResolutionExtractBm(m);
  if (!res.ok) throw new Error(res.reason);
  const doc = await PDFDocument.create();
  doc.setTitle(`Petikan minit (bank) — ${m.orgName}`);
  doc.setProducer(PDF_PRODUCER);
  let noto: PDFFont | null = null;
  if (winAnsiSafe(res.text) !== res.text) {
    const sub = await subsetNotoFor(res.text);
    if (sub) {
      doc.registerFontkit(fontkit);
      noto = await doc.embedFont(sub, { subset: false });
    }
  }
  const fonts: Fonts = {
    helv: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    noto,
  };
  // Extracts only exist for confirmed minutes, so no DRAFT mark — but if the
  // content is fixture data the SAMPLE mark is mandatory.
  renderTextDoc(doc, fonts, res.text, false, sample);
  return doc.save();
}
