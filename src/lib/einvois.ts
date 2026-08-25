import { isInKind, parseReceiptNo, type RegisterDonation } from "@/lib/receipts";
import { formatRm } from "@/lib/minutes-draft";

// ---------------------------------------------------------------------------
// e-INVOIS — month-end consolidation (Phase 3, CLAUDE.md Hard Rule 2).
// v1 output = data for the MyInvois Portal **Batch Upload .xlsx** that the
// treasurer uploads manually. NO MyInvois API integration in v1.
//
// ┌─ [VERIFY against current LHDN template + guideline] ──────────────────────┐
// │ Before first real use, download the CURRENT Batch Upload template from    │
// │ the MyInvois Portal and check:                                            │
// │  1. Exact column headers + order (the keys of BatchUploadRow below).      │
// │  2. Consolidated buyer convention: buyer name "General Public" and buyer  │
// │     TIN "EI00000000010" per the LHDN e-Invoice Guideline (consolidated    │
// │     e-invoice), and the receipt-number range format in the description.   │
// │  3. The RM10,000 threshold for requiring an INDIVIDUAL e-invoice with     │
// │     donor identity fields (self-billed/donation treatment for societies). │
// │  4. Max docs per upload file: 100 CONFIRMED; file must be ≤ 25MB.         │
// │  5. Classification codes (verified against LHDN SDK list, 15 Jul 2026):   │
// │       004 = Consolidated e-Invoice  → the consolidated summary line.      │
// │       007 = Donation                → each individual (≥RM10k) donation.  │
// │  6. RM10,000 rule (in force since 1 Jan 2026): a single transaction of    │
// │     RM10,000+ CANNOT be consolidated — it needs its own e-invoice.        │
// │  7. Consolidated e-invoices are due within 7 CALENDAR DAYS after the      │
// │     end of the month.                                                     │
// │  8. Portal requires template "BatchSubmission-v1.xlsx" (11 sheets). Our   │
// │     .xlsx export is a PRE-FILL PACK: treasurer downloads the official     │
// │     template from the portal and copies these values across.              │
// └───────────────────────────────────────────────────────────────────────────┘
// ---------------------------------------------------------------------------

export const EINVOIS_MAX_DOCS_PER_FILE = 100;

/** RM 10,000 in sen — at/above this an individual e-invoice with donor identity is required (LHDN, since 1 Jan 2026). */
export const INDIVIDUAL_EINVOICE_THRESHOLD_CENTS = 1_000_000;

/** LHDN classification code for a consolidated e-invoice summary line. */
export const CLASS_CODE_CONSOLIDATED = "004";
/** LHDN classification code for a donation. */
export const CLASS_CODE_DONATION = "007";
/** Consolidated e-invoices must be submitted within this many days after month-end. */
export const CONSOLIDATED_SUBMISSION_DAYS = 7;

export class EInvoisError extends Error {}

/** One row of the Batch Upload sheet. Keys mirror the official template columns. [VERIFY] */
export type BatchUploadRow = {
  invoiceNo: string;
  invoiceDateIso: string;
  invoiceType: "consolidated" | "individual";
  buyerName: string;
  buyerTin: string;
  description: string;
  classificationCode: string;
  amountCents: number;
  currency: "MYR";
};

export type MonthEndPack = {
  /** "YYYY-MM" */
  month: string;
  /** Donations below threshold, rolled into ONE consolidated document. */
  consolidated: RegisterDonation[];
  consolidatedTotalCents: number;
  /** Donations at/above RM10,000 — each needs its own document + donor identity. */
  individual: RegisterDonation[];
  /** All rows, chunked into files of ≤ EINVOIS_MAX_DOCS_PER_FILE documents. */
  files: BatchUploadRow[][];
  grandTotalCents: number;
};

function assertMonth(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new EInvoisError(`Month must be "YYYY-MM", got "${month}"`);
  }
  // 2026-07-28 audit: the regex alone accepted "2026-13" and "2026-00", which
  // lastDayOfMonthIso() and consolidatedDeadlineIso() then silently resolved to
  // the WRONG month via Date's rollover — a tax deadline for a month that does
  // not exist.
  const m = Number(month.slice(5, 7));
  if (m < 1 || m > 12) {
    throw new EInvoisError(`Month must be 01-12, got "${month}"`);
  }
}

function lastDayOfMonthIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/** The LHDN deadline to submit a month's consolidated e-invoice: 7 days after month-end. */
export function consolidatedDeadlineIso(month: string): string {
  assertMonth(month);
  const [y, m] = month.split("-").map(Number);
  // Date.UTC(y, m, 0) = last day of month `m` (day 0 of the following month).
  const due = new Date(Date.UTC(y, m, 0));
  due.setUTCDate(due.getUTCDate() + CONSOLIDATED_SUBMISSION_DAYS);
  return due.toISOString().slice(0, 10);
}

/**
 * The receipt numbers covered by the consolidated document.
 *
 * 2026-07-28 AUDIT — this used to print a RANGE ("first – last") of the
 * consolidated subset. Two things were wrong with that:
 *
 *   1. Donations at/above RM10,000 are pulled OUT into their own documents, but
 *      their receipt numbers can sit numerically BETWEEN the consolidated ones.
 *      With receipts 0001–0005 where 0003 is RM20,000, the consolidated line
 *      claimed "resit MIN-2026-0001 – MIN-2026-0005 (4 resit)" while its amount
 *      excluded 0003 — which was ALSO filed separately. LHDN would see receipt
 *      0003 covered twice, and the stated range contradicted the stated count.
 *   2. `.sort()` is lexicographic, so it ordered correctly only while the
 *      sequence stayed 4 digits ("MIN-2026-10000" < "MIN-2026-9999").
 *
 * It now emits contiguous sub-ranges, in true numeric order, so the description
 * can never claim to cover a receipt that is filed elsewhere.
 */
function receiptCoverage(donations: RegisterDonation[]): string {
  const parsed = donations
    .map((d) => d.receiptNo)
    .filter((n): n is string => n !== null)
    .map((no) => {
      const parts = parseReceiptNo(no);
      return {
        no,
        seq: parts?.seq ?? null,
        // A receipt number is only "adjacent" to another within the same series.
        series: parts ? `${parts.prefix}-${parts.year}` : null,
      };
    });

  // Any number we cannot parse: list everything verbatim rather than guess an
  // order. Correctness beats brevity on a tax document.
  if (parsed.some((p) => p.seq === null)) {
    return parsed.map((p) => p.no).join(", ");
  }

  const sorted = parsed
    .map((p) => ({ no: p.no, seq: p.seq as number, series: p.series as string }))
    .sort((a, b) => (a.series === b.series ? a.seq - b.seq : a.series.localeCompare(b.series)));
  if (sorted.length === 0) return "";

  const groups: { first: (typeof sorted)[number]; last: (typeof sorted)[number] }[] = [];
  for (const item of sorted) {
    const open = groups[groups.length - 1];
    if (open && item.series === open.last.series && item.seq === open.last.seq + 1)
      open.last = item;
    else groups.push({ first: item, last: item });
  }

  return groups
    .map((g) => (g.first.seq === g.last.seq ? g.first.no : `${g.first.no} – ${g.last.no}`))
    .join(", ");
}

/**
 * Builds the month-end e-Invois pack from CONFIRMED, RECEIPTED donations.
 * All totals summed by this code — the AI never aggregates (Hard Rule 2).
 */
export function buildMonthEndPack(
  donations: RegisterDonation[],
  params: { month: string; orgName: string }
): MonthEndPack {
  assertMonth(params.month);

  // D-1 (拍板③): in-kind donations (Derma Barangan) are goods, not sales of
  // anything — they do not enter the e-Invois pack at all: not the
  // consolidated document, not the individual ≥RM10k documents, and their
  // missing receipt must not block a month-end either.
  const monetary = donations.filter((d) => !isInKind(d));
  const inMonth = monetary.filter(
    (d) => d.donatedAtIso.startsWith(params.month) && d.receiptNo !== null
  );
  const unreceipted = monetary.filter(
    (d) => d.donatedAtIso.startsWith(params.month) && d.receiptNo === null
  );
  if (unreceipted.length > 0) {
    throw new EInvoisError(
      `${unreceipted.length} donation(s) in ${params.month} have no receipt yet — issue receipts before the month-end pack.`
    );
  }

  const individual = inMonth.filter(
    (d) => d.amountCents >= INDIVIDUAL_EINVOICE_THRESHOLD_CENTS
  );
  const consolidated = inMonth.filter(
    (d) => d.amountCents < INDIVIDUAL_EINVOICE_THRESHOLD_CENTS
  );
  const consolidatedTotalCents = consolidated.reduce((s, d) => s + d.amountCents, 0);
  const invoiceDateIso = lastDayOfMonthIso(params.month);

  const rows: BatchUploadRow[] = [];
  if (consolidated.length > 0) {
    rows.push({
      invoiceNo: `CON-${params.month.replace("-", "")}`,
      invoiceDateIso,
      invoiceType: "consolidated",
      buyerName: "General Public", // [VERIFY] LHDN consolidated buyer convention
      buyerTin: "EI00000000010", // [VERIFY] LHDN general-public TIN
      description: `Derma terkumpul ${params.month} — resit ${receiptCoverage(consolidated)} (${consolidated.length} resit)`,
      classificationCode: CLASS_CODE_CONSOLIDATED, // 004 = Consolidated e-Invoice (LHDN SDK, 15 Jul 2026)
      amountCents: consolidatedTotalCents,
      currency: "MYR",
    });
  }
  for (const d of individual) {
    rows.push({
      invoiceNo: d.receiptNo as string,
      invoiceDateIso: d.donatedAtIso,
      invoiceType: "individual",
      buyerName: d.donorName, // individual path requires donor identity [VERIFY fields: TIN/IC]
      buyerTin: "", // completed by treasurer from donor's TIN/MyKad — never invented
      description: `Derma — resit ${d.receiptNo}${d.purpose ? ` (${d.purpose})` : ""}`,
      classificationCode: CLASS_CODE_DONATION, // 007 = Donation (LHDN SDK, 15 Jul 2026)
      amountCents: d.amountCents,
      currency: "MYR",
    });
  }

  const files: BatchUploadRow[][] = [];
  for (let i = 0; i < rows.length; i += EINVOIS_MAX_DOCS_PER_FILE) {
    files.push(rows.slice(i, i + EINVOIS_MAX_DOCS_PER_FILE));
  }

  return {
    month: params.month,
    consolidated,
    consolidatedTotalCents,
    individual,
    files,
    grandTotalCents: inMonth.reduce((s, d) => s + d.amountCents, 0),
  };
}

/** Human-readable month-end summary (BM + EN) for the treasurer. */
export function monthEndSummary(pack: MonthEndPack, orgName: string): string {
  const lines = [
    `Pek e-Invois hujung bulan ${pack.month} — ${orgName}`,
    `--------------------------------------------------`,
    `Derma terkumpul (consolidated): ${pack.consolidated.length} resit, jumlah ${formatRm(pack.consolidatedTotalCents)}`,
    `Derma individu ≥ RM10,000 (perlu identiti penderma): ${pack.individual.length}`,
    `Jumlah besar / Grand total: ${formatRm(pack.grandTotalCents)}`,
    `Fail muat naik / upload file(s): ${pack.files.length} (maks ${EINVOIS_MAX_DOCS_PER_FILE} dokumen sefail)`,
    `Tarikh akhir hantar / Submission deadline: ${consolidatedDeadlineIso(pack.month)} (7 hari selepas hujung bulan)`,
    ``,
    `Langkah / Steps: log masuk MyInvois Portal → Batch Upload → muat naik fail .xlsx → semak → hantar.`,
    `⚠ Semak templat LHDN semasa sebelum guna / verify against the current LHDN template before use.`,
  ];
  return lines.join("\n");
}
