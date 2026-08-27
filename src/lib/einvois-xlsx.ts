import ExcelJS from "exceljs";
import {
  EINVOIS_MAX_DOCS_PER_FILE,
  type BatchUploadRow,
  type MonthEndPack,
} from "@/lib/einvois";

// ---------------------------------------------------------------------------
// e-INVOIS .xlsx EXPORT (stack decision: exceljs, locked).
//
// The MyInvois Portal now requires its own template ("BatchSubmission-v1.xlsx",
// 11 sheets, ≤100 docs, ≤25MB — verified 10 Jul 2026). We do NOT try to forge
// that template blind. This export is a PRE-FILL PACK: every value the
// treasurer must key into the official template, one row per document. All
// totals are summed HERE in TypeScript (CLAUDE.md Hard Rule 2) — never by a
// spreadsheet formula the user can break, and never by the LLM.
//
// D21 (拍板 37, 2026-08-27): the file must be "directly submittable" — the
// DATA sheet ("Dokumen") comes first and is the ONLY sheet. The old
// "Arahan - Instructions" worksheet moved OUT of the upload file and onto the
// /money/einvois page as step cards; instructions inside an upload file are
// exactly what makes a portal reject it. Until J supplies the official
// template for column-by-column alignment, the sheet keeps its one-line
// "DRAF — semak sebelum guna" verify warning (D21 says keep it).
// ---------------------------------------------------------------------------

export type EInvoisXlsxFile = {
  filename: string;
  /** Raw .xlsx bytes. */
  bytes: Uint8Array;
};

const HEADERS = [
  "Bil / No.",
  "No. Dokumen / Invoice No.",
  "Tarikh / Date",
  "Jenis / Type",
  "Nama Pembeli / Buyer Name",
  "TIN Pembeli / Buyer TIN",
  "No. Pendaftaran Pembeli / Buyer Reg. No.",
  "Keterangan / Description",
  "Kod Klasifikasi / Classification Code",
  "Jumlah (RM) / Amount (RM)",
  "Mata Wang / Currency",
] as const;

/**
 * Builds one .xlsx per ≤100-document chunk of the month-end pack.
 * Amounts are written as RM decimals computed from cents in code.
 */
export async function buildEInvoisXlsxFiles(
  pack: MonthEndPack,
  params: { orgName: string }
): Promise<EInvoisXlsxFile[]> {
  const out: EInvoisXlsxFile[] = [];

  for (let f = 0; f < pack.files.length; f++) {
    const rows: BatchUploadRow[] = pack.files[f];
    if (rows.length > EINVOIS_MAX_DOCS_PER_FILE) {
      throw new Error(
        `File chunk ${f + 1} has ${rows.length} documents — exceeds the ${EINVOIS_MAX_DOCS_PER_FILE}-doc portal limit.`
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "MinitAI";

    // D21: the data sheet is FIRST and ONLY. Instructions live on the page.
    const ws = wb.addWorksheet("Dokumen");
    ws.addRow([`${params.orgName} — pek e-Invois ${pack.month} (DRAF — semak sebelum guna)`]);
    ws.getRow(1).font = { bold: true, size: 12 };
    ws.addRow([]);
    const header = ws.addRow([...HEADERS]);
    header.font = { bold: true };

    let fileTotalCents = 0;
    rows.forEach((r, i) => {
      fileTotalCents += r.amountCents;
      ws.addRow([
        i + 1,
        r.invoiceNo,
        r.invoiceDateIso,
        r.invoiceType === "consolidated" ? "Terkumpul / Consolidated" : "Individu / Individual",
        r.buyerName,
        r.buyerTin, // blank on individual rows — treasurer completes, never invented
        r.invoiceType === "consolidated" ? "NA" : "",
        r.description,
        r.classificationCode,
        r.amountCents / 100, // computed in code, not by formula
        r.currency,
      ]);
    });

    ws.addRow([]);
    const totalRow = ws.addRow([
      "", "", "", "", "", "", "", "JUMLAH FAIL / FILE TOTAL", "", fileTotalCents / 100, "MYR",
    ]);
    totalRow.font = { bold: true };

    // Readable column widths + 2-dp money format.
    const widths = [8, 18, 12, 24, 30, 16, 22, 46, 12, 14, 10];
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(10).numFmt = "#,##0.00";

    const buffer = await wb.xlsx.writeBuffer();
    out.push({
      filename: `einvois-${pack.month}-fail-${f + 1}-dari-${pack.files.length}.xlsx`,
      bytes: new Uint8Array(buffer as ArrayBuffer),
    });
  }

  return out;
}
