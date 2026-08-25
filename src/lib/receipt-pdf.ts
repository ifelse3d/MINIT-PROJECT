import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { needsCjkFont, subsetNotoFor, winAnsiSafe } from "@/lib/pdf-fonts";

export { needsCjkFont, winAnsiSafe };
import { formatRm } from "@/lib/minutes-draft";
import {
  amountInWordsBm,
  taxDeductibilityLineBm,
  type TaxExemptStatus,
} from "@/lib/receipts";

// ---------------------------------------------------------------------------
// RECEIPT PDF — server-side generation with pdf-lib (stack decision: pdf-lib,
// locked per CLAUDE.md "pick one and stay with it").
//
// CJK SUPPORT: Latin text uses the built-in Helvetica fonts (small output).
// Any string containing non-WinAnsi characters (Chinese donor names, 香油钱
// purposes, …) is drawn with Noto Sans SC. The full font is ~10MB, and
// pdf-lib's own subset:true is broken for this font (glyphs go missing —
// verified 10 Jul 2026), so we pre-subset per receipt with subset-font
// (HarfBuzz wasm, pure JS) down to only the characters actually printed
// (~20KB), then embed WITHOUT pdf-lib subsetting. If the font file or the
// subsetter fails at runtime we fall back to the old behaviour: non-Latin
// characters print as "?" — the PDF must never fail to generate.
// ---------------------------------------------------------------------------

export type ReceiptPdfParams = {
  orgName: string;
  /** ROS registration no. — printed under the org name when present. */
  orgRegistrationNo?: string;
  orgAddress?: string;
  receiptNo: string;
  donorName: string;
  amountCents: number;
  /** YYYY-MM-DD */
  dateIso: string;
  purpose: string;
  collector: string;
  taxStatus: TaxExemptStatus;
  /** Audit line (CLAUDE.md Hard Rule 8): who confirmed, when. */
  confirmedBy: string;
  /** YYYY-MM-DD */
  confirmedOnIso: string;
  /**
   * D-1 (拍板③): 'in_kind' = a goods donation (Derma Barangan). The receipt
   * carries the SAME serial series, is titled as an in-kind receipt, and the
   * amount box prints the ITEMS — never money. The estimated value, if any,
   * stays in the ledger; a number on this paper would read as cash received.
   */
  kind?: "cash" | "in_kind";
  /** In-kind only: what was donated. */
  itemDesc?: string;
};

/**
 * What the big box on the receipt holds — the ONE decision D-1 must never get
 * wrong: money receipts print ringgit (figure + words); in-kind receipts
 * print the ITEMS and no ringgit anywhere, because an estimated value on the
 * paper would read as cash received (拍板③). Pure and exported so the test
 * pins it directly (the PDF content stream is compressed and ungreppable).
 */
export function receiptBoxContent(
  params: Pick<ReceiptPdfParams, "kind" | "itemDesc" | "amountCents">,
):
  | { box: "money"; label: string; figure: string; words: string }
  | { box: "items"; label: string; items: string } {
  if (params.kind === "in_kind") {
    return {
      box: "items",
      label: "Barangan diterima / Items received",
      items: params.itemDesc?.trim() || "-",
    };
  }
  return {
    box: "money",
    label: "Jumlah / Amount",
    figure: formatRm(params.amountCents),
    words: amountInWordsBm(params.amountCents),
  };
}

/** Greedy word-wrap for a given font/size/width. */
function wrap(
  text: string,
  widthOf: (s: string) => number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (widthOf(candidate) <= maxWidth || line === "") line = candidate;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Builds one official receipt as an A4 portrait PDF. Returns the raw bytes.
 * All values are printed verbatim — nothing is computed here except layout;
 * amounts/words come from the deterministic lib functions.
 *
 * Layout goals: large type and generous spacing (many treasurers and donors
 * are elderly), the amount in its own box, receipt number impossible to miss.
 */
export async function buildReceiptPdf(params: ReceiptPdfParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Resit ${params.receiptNo} — ${params.orgName}`);
  doc.setProducer("Minit");

  const inKind = params.kind === "in_kind";

  // Collect every string that will appear on the page; if any needs CJK,
  // build a per-receipt subset font covering exactly those characters.
  const allText = [
    params.orgName,
    params.orgRegistrationNo ?? "",
    params.orgAddress ?? "",
    params.receiptNo,
    params.donorName,
    params.dateIso,
    params.purpose,
    params.collector,
    params.confirmedBy,
    params.confirmedOnIso,
    inKind ? `${params.itemDesc ?? ""} Derma Barangan 实物捐赠` : "",
  ].join(" ");
  let noto: PDFFont | null = null;
  if (winAnsiSafe(allText) !== allText) {
    const subBytes = await subsetNotoFor(allText);
    if (subBytes) {
      doc.registerFontkit(fontkit);
      // subset:false — the font is already minimal; pdf-lib's subsetter is
      // broken for Noto Sans SC (see header comment).
      noto = await doc.embedFont(subBytes, { subset: false });
    }
  }

  // A4 portrait: 595.28 × 841.89 pt — prints on a normal office sheet.
  const pageW = 595.28;
  const pageH = 841.89;
  const page = doc.addPage([pageW, pageH]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.09, 0.12);
  const grey = rgb(0.42, 0.44, 0.5);
  const accent = rgb(0.55, 0.09, 0.09); // deep red — reads "official chop"
  const faint = rgb(0.85, 0.86, 0.88);
  const margin = 48;
  const width = pageW - margin * 2;

  // Picks the right font for a string: CJK-capable when needed & available.
  const pick = (s: string, wantBold: boolean): { font: PDFFont; text: string } => {
    if (needsCjkFont(s) && noto) return { font: noto, text: s };
    return { font: wantBold ? helvBold : helv, text: winAnsiSafe(s) };
  };
  const widthOf = (s: string, size: number, wantBold = false): number => {
    const { font, text } = pick(s, wantBold);
    return font.widthOfTextAtSize(text, size);
  };
  const drawAt = (
    s: string,
    x: number,
    y: number,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const { font, text } = pick(s, opts.bold ?? false);
    page.drawText(text, { x, y, size, font, color: opts.color ?? ink });
  };
  const drawCentered = (
    s: string,
    y: number,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) => drawAt(s, (pageW - widthOf(s, size, opts.bold)) / 2, y, size, opts);

  let y = pageH - margin - 16;

  // ---- Header: org identity, centered like a letterhead. -------------------
  drawCentered(params.orgName, y, 22, { bold: true });
  y -= 22;
  if (params.orgRegistrationNo) {
    drawCentered(`No. Pendaftaran (ROS): ${params.orgRegistrationNo}`, y, 11, { color: grey });
    y -= 16;
  }
  if (params.orgAddress) {
    drawCentered(params.orgAddress, y, 11, { color: grey });
    y -= 16;
  }
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1.6, color: ink });
  page.drawLine({ start: { x: margin, y: y - 3 }, end: { x: pageW - margin, y: y - 3 }, thickness: 0.7, color: ink });
  y -= 44;

  // ---- Title + receipt number (the legally important bit). -----------------
  drawAt("RESIT RASMI / OFFICIAL RECEIPT", margin, y, 16, { bold: true });
  const noText = `No. ${params.receiptNo}`;
  drawAt(noText, pageW - margin - widthOf(noText, 18, true), y, 18, {
    bold: true,
    color: accent,
  });
  y -= 24;
  if (inKind) {
    // D-1: an in-kind receipt SAYS it is one, right under the title — the
    // reader must never mistake goods for cash received.
    drawAt("DERMA BARANGAN / 实物捐赠 / IN-KIND DONATION", margin, y, 12, {
      bold: true,
      color: accent,
    });
  }
  y -= 24;

  // ---- Detail rows: big values, clear label column. ------------------------
  const labelX = margin;
  const valueX = margin + 200;
  const row = (label: string, value: string, size = 14, bold = false) => {
    drawAt(label, labelX, y, 11, { color: grey });
    drawAt(value, valueX, y, size, { bold });
    y -= 38;
  };
  row("Tarikh / Date", params.dateIso);
  row("Diterima daripada / Received from", params.donorName, 15, true);
  row("Tujuan / Purpose", params.purpose || "-");
  row("Pemungut / Collector", params.collector);
  y -= 10;

  // ---- Amount box: the number nobody should have to squint at. -------------
  // D-1: on an in-kind receipt this box holds the ITEMS, never money — an
  // estimated value printed here would read as cash received (拍板③).
  const boxH = 84;
  page.drawRectangle({
    x: margin,
    y: y - boxH,
    width,
    height: boxH,
    borderColor: ink,
    borderWidth: 1,
    color: rgb(0.97, 0.97, 0.98),
  });
  const box = receiptBoxContent(params);
  if (box.box === "items") {
    drawAt(box.label, margin + 18, y - 24, 11, { color: grey });
    const itemLines = wrap(box.items, (s) => widthOf(s, 18, true), width - 36).slice(0, 2);
    let iy = y - 52;
    for (const line of itemLines) {
      drawAt(line, margin + 18, iy, 18, { bold: true });
      iy -= 24;
    }
  } else {
    drawAt(box.label, margin + 18, y - 24, 11, { color: grey });
    drawAt(box.figure, margin + 18, y - 62, 30, { bold: true });
    drawAt(box.words, pageW - margin - 18 - widthOf(box.words, 11), y - 62, 11, { color: grey });
  }
  y -= boxH + 28;

  // ---- Tax-deductibility line (Hard Rule 3) — wrapped, never truncated. ----
  for (const line of wrap(
    taxDeductibilityLineBm(params.taxStatus),
    (s) => widthOf(s, 11, true),
    width
  )) {
    drawAt(line, margin, y, 11, { bold: true });
    y -= 15;
  }

  // ---- Audit line (Hard Rule 8), anchored near the bottom of the page. -----
  const audit = `Drafted by Minit, confirmed by ${params.confirmedBy} on ${params.confirmedOnIso}. Resit dijana komputer, tiada tandatangan diperlukan / computer-generated, no signature required.`;
  const auditLines = wrap(audit, (s) => widthOf(s, 9), width);
  let ay = margin + (auditLines.length - 1) * 12;
  page.drawLine({
    start: { x: margin, y: ay + 18 },
    end: { x: pageW - margin, y: ay + 18 },
    thickness: 0.6,
    color: faint,
  });
  for (const line of auditLines) {
    drawAt(line, margin, ay, 9, { color: grey });
    ay -= 12;
  }

  return doc.save();
}
