import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { needsCjkFont, subsetNotoFor, winAnsiSafe } from "@/lib/pdf-fonts";
import { formatRm } from "@/lib/minutes-draft";
import { PDF_PRODUCER, draftedByLine } from "@/lib/brand";
import type { FinancialStatement } from "@/lib/financial-statement";

// ---------------------------------------------------------------------------
// PENYATA PENERIMAAN DAN PEMBAYARAN — the statement as an A4 PDF (Stage F).
// Same stack and CJK strategy as receipt-pdf.ts (pdf-lib + per-document Noto
// subset; a failing subsetter degrades to "?" rather than failing the PDF).
// Every figure arrives pre-computed from lib/financial-statement.ts — this
// file does LAYOUT ONLY (Hard Rule 2 lives upstream).
// ---------------------------------------------------------------------------

export type StatementPdfParams = {
  orgName: string;
  /** ROS registration no. — printed under the org name when present. */
  orgRegistrationNo?: string;
  statement: FinancialStatement;
  /** Audit line (Hard Rule 8): who generated/confirmed, when (YYYY-MM-DD). */
  confirmedBy: string;
  confirmedOnIso: string;
};

export async function buildStatementPdf(params: StatementPdfParams): Promise<Uint8Array> {
  const s = params.statement;
  const doc = await PDFDocument.create();
  doc.setTitle(`Penyata ${s.fromIso} – ${s.toIso} — ${params.orgName}`);
  doc.setProducer(PDF_PRODUCER);

  const allText = [
    params.orgName,
    params.orgRegistrationNo ?? "",
    params.confirmedBy,
    ...s.income.map((l) => l.category),
    ...s.payments.map((l) => l.category),
    ...s.inKind.map((g) => g.itemDesc),
  ].join(" ");
  let noto: PDFFont | null = null;
  if (winAnsiSafe(allText) !== allText) {
    const subBytes = await subsetNotoFor(allText);
    if (subBytes) {
      doc.registerFontkit(fontkit);
      noto = await doc.embedFont(subBytes, { subset: false });
    }
  }

  const pageW = 595.28;
  const pageH = 841.89;
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.09, 0.12);
  const grey = rgb(0.42, 0.44, 0.5);
  const faint = rgb(0.85, 0.86, 0.88);
  const margin = 48;
  const width = pageW - margin * 2;

  let page: PDFPage = doc.addPage([pageW, pageH]);
  let y = pageH - margin - 16;

  const pick = (str: string, wantBold: boolean): { font: PDFFont; text: string } => {
    if (needsCjkFont(str) && noto) return { font: noto, text: str };
    return { font: wantBold ? helvBold : helv, text: winAnsiSafe(str) };
  };
  const widthOf = (str: string, size: number, wantBold = false): number => {
    const { font, text } = pick(str, wantBold);
    return font.widthOfTextAtSize(text, size);
  };
  const drawAt = (
    str: string,
    x: number,
    yy: number,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const { font, text } = pick(str, opts.bold ?? false);
    page.drawText(text, { x, y: yy, size, font, color: opts.color ?? ink });
  };
  const drawCentered = (
    str: string,
    yy: number,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => drawAt(str, (pageW - widthOf(str, size, opts.bold)) / 2, yy, size, opts);

  /** Starts a fresh page when fewer than `need` points remain. */
  const ensureRoom = (need: number) => {
    if (y - need < margin + 60) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin - 16;
    }
  };

  // ---- Letterhead ----------------------------------------------------------
  drawCentered(params.orgName, y, 20, { bold: true });
  y -= 20;
  if (params.orgRegistrationNo) {
    drawCentered(`No. Pendaftaran (ROS): ${params.orgRegistrationNo}`, y, 11, { color: grey });
    y -= 16;
  }
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1.6, color: ink });
  page.drawLine({ start: { x: margin, y: y - 3 }, end: { x: pageW - margin, y: y - 3 }, thickness: 0.7, color: ink });
  y -= 40;

  drawCentered("PENYATA PENERIMAAN DAN PEMBAYARAN", y, 15, { bold: true });
  y -= 20;
  drawCentered("Receipts and Payments Statement", y, 10, { color: grey });
  y -= 18;
  drawCentered(`${s.fromIso}  hingga / to  ${s.toIso}`, y, 11);
  y -= 36;

  const amountX = pageW - margin;
  const rowLine = (label: string, cents: number | null, opts: { bold?: boolean; indent?: number } = {}) => {
    ensureRoom(22);
    drawAt(label, margin + (opts.indent ?? 0), y, 11.5, { bold: opts.bold });
    if (cents !== null) {
      const val = formatRm(cents);
      drawAt(val, amountX - widthOf(val, 11.5, opts.bold), y, 11.5, { bold: opts.bold });
    }
    y -= 20;
  };
  const sectionRule = () => {
    page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: pageW - margin, y: y + 6 }, thickness: 0.6, color: faint });
    y -= 8;
  };

  // ---- PENERIMAAN ----------------------------------------------------------
  rowLine("PENERIMAAN / Receipts", null, { bold: true });
  if (s.income.length === 0) {
    rowLine("— tiada / none —", null, { indent: 16 });
  }
  for (const line of s.income) {
    rowLine(`${line.category} (${line.count})`, line.totalCents, { indent: 16 });
  }
  sectionRule();
  rowLine("JUMLAH PENERIMAAN / Total receipts", s.incomeTotalCents, { bold: true });
  y -= 12;

  // ---- PEMBAYARAN ----------------------------------------------------------
  rowLine("PEMBAYARAN / Payments", null, { bold: true });
  if (s.payments.length === 0) {
    rowLine("— tiada / none —", null, { indent: 16 });
  }
  for (const line of s.payments) {
    rowLine(`${line.category} (${line.count})`, line.totalCents, { indent: 16 });
  }
  sectionRule();
  rowLine("JUMLAH PEMBAYARAN / Total payments", s.paymentsTotalCents, { bold: true });
  y -= 12;

  // ---- NET -----------------------------------------------------------------
  ensureRoom(30);
  const netLabel =
    s.netCents >= 0
      ? "LEBIHAN / Surplus (penerimaan - pembayaran)"
      : "KURANGAN / Deficit (penerimaan - pembayaran)";
  rowLine(netLabel, Math.abs(s.netCents), { bold: true });
  y -= 16;

  // ---- In-kind schedule ----------------------------------------------------
  if (s.inKind.length > 0) {
    ensureRoom(60);
    rowLine("LAMPIRAN: DERMA BARANGAN / In-kind donations (bukan wang / not money)", null, { bold: true });
    for (const g of s.inKind) {
      const est = g.estValueCents === null ? "" : `anggaran ${formatRm(g.estValueCents)}`;
      ensureRoom(22);
      drawAt(`${g.dateIso}  ${g.itemDesc}`, margin + 16, y, 11);
      if (est) {
        drawAt(est, amountX - widthOf(est, 11), y, 11, { color: grey });
      }
      y -= 18;
    }
    if (s.inKindEstTotalCents > 0) {
      sectionRule();
      rowLine("Jumlah anggaran (bukan penerimaan tunai / not cash receipts)", s.inKindEstTotalCents);
    }
    y -= 10;
  }

  // ---- Signature blocks (formality pass, J 8/27: 「所有報告都要正式些」) ----
  // The preparer is the signed-in person; the endorser is a LABELLED BLANK —
  // Minit does not know who audits/chairs and must not guess (Hard Rule 1;
  // same rule as the minutes' PENUTUP block).
  ensureRoom(120);
  y -= 24;
  const colW = (width - 40) / 2;
  const sigLineY = y - 42;
  drawAt("Disediakan oleh / Prepared by,", margin, y, 10.5);
  drawAt("Disahkan oleh / Verified by,", margin + colW + 40, y, 10.5);
  page.drawLine({
    start: { x: margin, y: sigLineY },
    end: { x: margin + colW - 20, y: sigLineY },
    thickness: 0.8,
    color: ink,
  });
  page.drawLine({
    start: { x: margin + colW + 40, y: sigLineY },
    end: { x: margin + colW * 2 + 20, y: sigLineY },
    thickness: 0.8,
    color: ink,
  });
  drawAt(`( ${params.confirmedBy} )`, margin, sigLineY - 14, 10.5);
  drawAt("Bendahari / Treasurer", margin, sigLineY - 28, 9, { color: grey });
  drawAt("(                                )", margin + colW + 40, sigLineY - 14, 10.5);
  drawAt("Pengerusi / Juruaudit", margin + colW + 40, sigLineY - 28, 9, { color: grey });
  y = sigLineY - 44;

  // ---- Audit line (Hard Rule 8) --------------------------------------------
  const audit = `${draftedByLine.en(params.confirmedBy, params.confirmedOnIso)}. Angka dikira oleh sistem daripada rekod yang disimpan / figures computed by the system from stored records.`;
  const wrapAudit = (text: string): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (widthOf(candidate, 9) <= width || line === "") line = candidate;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const auditLines = wrapAudit(audit);
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
