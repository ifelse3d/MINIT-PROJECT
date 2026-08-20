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
// treasurer must key into the official template, one row per document, plus a
// step-by-step instruction sheet. All totals are summed HERE in TypeScript
// (CLAUDE.md Hard Rule 2) — never by a spreadsheet formula the user can break,
// and never by the LLM.
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

function addInstructionSheet(wb: ExcelJS.Workbook, pack: MonthEndPack, fileNo: number): void {
  const ws = wb.addWorksheet("Arahan - Instructions");
  ws.getColumn(1).width = 110;
  const lines = [
    `PEK PRA-ISI e-INVOIS — ${pack.month} (fail ${fileNo} dari ${pack.files.length})`,
    "",
    "PENTING / IMPORTANT:",
    "1. Log masuk MyInvois Portal (myinvois.hasil.gov.my) → Batch Upload.",
    "2. Muat turun templat rasmi semasa (BatchSubmission-v1.xlsx) dari portal.",
    "3. Salin nilai dari helaian 'Dokumen' fail ini ke dalam templat rasmi itu.",
    "   / Copy the values from the 'Dokumen' sheet into the official template.",
    "4. Had portal: maksimum 100 dokumen sefail, saiz fail <= 25MB.",
    "5. Semak setiap nilai sebelum hantar. / Verify every value before submitting.",
    "",
    "Nota: Kod klasifikasi 004 = e-Invois Disatukan (Consolidated), 007 = Derma (Donation). TIN 'EI00000000010' = General Public",
    "untuk dokumen terkumpul (consolidated). Bagi dokumen INDIVIDU (derma >= RM10,000),",
    "TIN pembeli sengaja DIBIARKAN KOSONG — bendahari mesti isi dari TIN/MyKad penderma",
    "sebenar. Sistem tidak sekali-kali mereka-reka identiti. / For INDIVIDUAL documents",
    "the buyer TIN is intentionally BLANK — the treasurer fills it from the donor's real",
    "TIN/MyKad. The system never invents identity data.",
    "",
    "DRAF — semak sebelum guna / DRAFT — review before use.",
  ];
  lines.forEach((text, i) => {
    const cell = ws.getCell(i + 1, 1);
    cell.value = text;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
}

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
    wb.creator = "Minit";
    addInstructionSheet(wb, pack, f + 1);

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
