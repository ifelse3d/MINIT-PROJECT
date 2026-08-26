import type { LedgerExtraction } from "@/lib/extraction";
import { formatRm } from "@/lib/minutes-draft";

// ---------------------------------------------------------------------------
// RECEIPTS — deterministic money logic (CLAUDE.md Hard Rule 2).
// The LLM extracts what it sees; THIS file numbers receipts (sequential,
// gap-free, per org), detects duplicates, builds wa.me links and decides the
// tax wording (Hard Rule 3). No AI anywhere in this file.
// ---------------------------------------------------------------------------

// ----- Receipt numbering ----------------------------------------------------

export type ReceiptNoParts = { prefix: string; year: number; seq: number };

/** MIN-2026-0001 style. seq is 1-based and zero-padded to 4 (grows past 9999 naturally). */
export function formatReceiptNo({ prefix, year, seq }: ReceiptNoParts): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new ReceiptNumberingError(`Receipt sequence must be a positive integer, got ${seq}`);
  }
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export function parseReceiptNo(no: string): ReceiptNoParts | null {
  const m = /^([A-Z][A-Z0-9]*)-(\d{4})-(\d{4,})$/.exec(no);
  if (!m) return null;
  return { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) };
}

export class ReceiptNumberingError extends Error {}

/**
 * Finds gaps in an org's existing receipt numbers for one prefix+year.
 * Receipts are non-editable and gap-free: a gap means something was deleted
 * or issued outside the system — surface it, never silently renumber.
 */
export function findSequenceGaps(existing: string[], prefix: string, year: number): number[] {
  const seqs = existing
    .map(parseReceiptNo)
    .filter((p): p is ReceiptNoParts => p !== null && p.prefix === prefix && p.year === year)
    .map((p) => p.seq)
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  let expected = 1;
  for (const s of seqs) {
    if (s === expected - 1) {
      throw new ReceiptNumberingError(`Duplicate receipt number sequence ${s} for ${prefix}-${year}`);
    }
    while (expected < s) gaps.push(expected++);
    expected = s + 1;
  }
  return gaps;
}

/**
 * Allocates the next `count` receipt numbers. Throws if the existing series
 * has gaps or duplicates — the treasurer must resolve those first.
 */
export function allocateReceiptNos(
  existing: string[],
  count: number,
  { prefix, year }: { prefix: string; year: number }
): string[] {
  const gaps = findSequenceGaps(existing, prefix, year);
  if (gaps.length > 0) {
    throw new ReceiptNumberingError(
      `Receipt series ${prefix}-${year} has gaps at sequence(s) ${gaps.join(", ")} — resolve before issuing new receipts.`
    );
  }
  const seqs = existing
    .map(parseReceiptNo)
    .filter((p): p is ReceiptNoParts => p !== null && p.prefix === prefix && p.year === year)
    .map((p) => p.seq);
  const start = (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
  return Array.from({ length: count }, (_, i) => formatReceiptNo({ prefix, year, seq: start + i }));
}

// ----- The confirmed donation register --------------------------------------

/** A CONFIRMED register row — post-review, plain values (no AI uncertainty left). */
export type RegisterDonation = {
  id: string;
  donorName: string;
  donorPhone: string | null;
  /** 🔴 In-kind rows carry 0 here BY CONVENTION (D-1, 拍板③): goods are not
   *  money, and any money path that forgets to exclude them then adds zero
   *  instead of a fictional value. The estimate lives in estValueCents. */
  amountCents: number;
  purpose: string;
  /** YYYY-MM-DD */
  donatedAtIso: string;
  collector: string;
  receiptNo: string | null;
  custodyStatus: "collected" | "pending_remittance" | "settled";
  /** How this row entered the register. Absent = read from a ledger photo. */
  source?: "ledger" | "manual";
  /** D-1 (拍板③): 'in_kind' = goods (Derma Barangan). Absent = cash. */
  kind?: "cash" | "in_kind";
  /** In-kind only: what was donated. Printed on the receipt instead of money. */
  itemDesc?: string | null;
  /** In-kind only, OPTIONAL: the human's estimated value in cents — ledger
   *  and statement ONLY. Never on the receipt, never e-Invois, never custody. */
  estValueCents?: number | null;
  /** D19 (拍板 34): how the money arrived. Absent = 'cash'. Transfer rows
   *  went straight into the bank account — they NEVER enter cash custody:
   *  not in anyone's hands, never in a remittance batch. */
  paymentMethod?: "cash" | "transfer";
  /** Transfer only, OPTIONAL: Storage path of the transfer screenshot the
   *  member attached. Storage, never AI. */
  transferProofPath?: string | null;
};

/** True for a goods (Derma Barangan) row — the one question money code asks. */
export function isInKind(d: Pick<RegisterDonation, "kind">): boolean {
  return d.kind === "in_kind";
}

/** D19: true for a bank-transfer row. Absent paymentMethod = cash — every row
 *  recorded before migration 26 was recorded on the cash flow, so that is the
 *  only honest default. */
export function isTransfer(d: Pick<RegisterDonation, "paymentMethod">): boolean {
  return d.paymentMethod === "transfer";
}

/** The one question the CASH paths ask: is this row physical money that is
 *  (or was) in somebody's hands? Goods are not cash (D-1); transfers went
 *  straight to the bank (D19). Both are excluded from hand-overs, from
 *  per-collector balances and from "cash not yet at HQ". */
export function holdsCash(
  d: Pick<RegisterDonation, "kind" | "paymentMethod">,
): boolean {
  return !isInKind(d) && !isTransfer(d);
}

/**
 * Shape guard for a register read back out of localStorage.
 *
 * usePersistentState's try/catch only handles MALFORMED json, not
 * WRONG-SHAPED json — a blob written by an older build parses fine and then
 * the money code reads `undefined.amountCents` and produces NaN totals. This
 * is the validator that stops it.
 *
 * Moved out of money-review.tsx on 2026-08-23: the register now lives in a
 * provider shared by four pages (src/app/money/register-store.tsx), and the
 * guard belongs next to the type it guards.
 */
export function isRegisterDonationArray(parsed: unknown): boolean {
  if (!Array.isArray(parsed)) return false;
  return parsed.every((d) => {
    if (typeof d !== "object" || d === null) return false;
    const r = d as Record<string, unknown>;
    return (
      typeof r.id === "string" &&
      typeof r.donorName === "string" &&
      typeof r.amountCents === "number" &&
      Number.isFinite(r.amountCents) &&
      typeof r.donatedAtIso === "string" &&
      (r.custodyStatus === "collected" ||
        r.custodyStatus === "pending_remittance" ||
        r.custodyStatus === "settled")
    );
  });
}

/**
 * Builds register rows from a fully human-confirmed ledger extraction.
 * Rows still carrying "check"/"missing" name, amount or date are NOT eligible:
 * a receipt is a legal-ish document — no receipt without confirmed facts.
 */
export function eligibleForReceipt(row: LedgerExtraction["rows"][number]): boolean {
  return (
    row.donor_name.confidence === "confirmed" &&
    row.amount_cents.confidence === "confirmed" &&
    row.amount_cents.value !== null &&
    row.donated_at.confidence === "confirmed"
  );
}

/**
 * 0-1 (26 号报告 2-1): is this ledger review FINISHED — every row that could
 * go into the register has gone in, and at least one actually did?
 *
 * This is the money-side analogue of the minutes' "already saved to History":
 * once it is true, the next photo gets asked "another page of this ledger, or
 * a new one?" instead of silently appending under rows that were already
 * turned into receipts — which is how one donation ends up with two serial
 * numbers. `addedRows` is index-based, matching the register store.
 */
export function ledgerPageFullyRecorded(
  rows: LedgerExtraction["rows"],
  addedRows: ReadonlySet<number>,
): boolean {
  return (
    rows.length > 0 &&
    addedRows.size > 0 &&
    rows.every((r, i) => !eligibleForReceipt(r) || addedRows.has(i))
  );
}

// ----- Manual amount entry (RM string → cents) -------------------------------

/**
 * Parses a human-typed ringgit amount into integer cents. The LLM never words
 * or sums money (Hard Rule 2) and neither does the form: this deterministic
 * parser is the single place a typed "RM 1,234.50" becomes 123450 cents.
 * Returns null for anything that is not a clean, non-negative RM amount so the
 * form can refuse it instead of storing a wrong figure.
 */
export function parseRmToCents(input: string): number | null {
  const cleaned = input.replace(/rm/i, "").replace(/,/g, "").replace(/\s/g, "").trim();
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const ringgit = Number(cleaned);
  if (!Number.isFinite(ringgit) || ringgit < 0) return null;
  return Math.round(ringgit * 100);
}

// ----- Duplicate warning -----------------------------------------------------

/**
 * Same donor + same day + same amount ⇒ possible double entry.
 * Returns groups of row indexes (length ≥ 2). Comparison is case- and
 * whitespace-insensitive on the name.
 */
export function findDuplicateDonations(
  rows: { donorName: string; donatedAtIso: string; amountCents: number }[]
): number[][] {
  const byKey = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const key = `${r.donorName.trim().toLowerCase().replace(/\s+/g, " ")}|${r.donatedAtIso}|${r.amountCents}`;
    const list = byKey.get(key) ?? [];
    list.push(i);
    byKey.set(key, list);
  });
  return [...byKey.values()].filter((g) => g.length >= 2);
}

// ----- WhatsApp click-to-send (v1 rule: wa.me deep links ONLY) ---------------

/**
 * Normalises a Malaysian phone number to international digits for wa.me.
 * "012-345 6789" → "60123456789"; "+60 12 345 6789" → "60123456789".
 * Returns null when it cannot be a valid MY mobile number — caller shows
 * "no phone on record" instead of a broken link.
 */
export function normalizeMyPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  let msisdn: string;
  if (digits.startsWith("60")) msisdn = digits;
  else if (digits.startsWith("0")) msisdn = `6${digits}`;
  else return null;
  // MY mobiles: 60 + 1X + 7–8 digits ⇒ 11–12 digits total.
  if (!/^601\d{8,9}$/.test(msisdn)) return null;
  return msisdn;
}

export function buildWaMeLink(phone: string | null | undefined, message: string): string | null {
  const msisdn = normalizeMyPhone(phone);
  if (!msisdn) return null;
  return `https://wa.me/${msisdn}?text=${encodeURIComponent(message)}`;
}

// ----- Tax-deductibility wording (CLAUDE.md Hard Rule 3) ----------------------

export type TaxExemptStatus = "none" | "s44_6" | "pure_religious";

/**
 * The line printed on every receipt. ONLY an approved s.44(6) org may imply
 * deductibility; everyone else gets an explicit NOT-deductible line, so a
 * donor can never be misled.
 */
export function taxDeductibilityLineBm(status: TaxExemptStatus): string {
  if (status === "s44_6") {
    return "Derma ini layak mendapat pelepasan cukai di bawah subseksyen 44(6) Akta Cukai Pendapatan 1967. / This donation is tax-deductible under s.44(6) Income Tax Act 1967.";
  }
  return "Resit ini BUKAN resit pelepasan cukai pendapatan. / This is NOT an income-tax-deductible receipt.";
}

// ----- Amount in words (BM) — printed on the PDF receipt ----------------------

const BM_UNITS = [
  "kosong", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "lapan", "sembilan",
];

/** 0–999 in Malay. */
function belowThousandBm(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(h === 1 ? "seratus" : `${BM_UNITS[h]} ratus`);
  if (rest > 0) {
    if (rest < 10) parts.push(BM_UNITS[rest]);
    else if (rest === 10) parts.push("sepuluh");
    else if (rest === 11) parts.push("sebelas");
    else if (rest < 20) parts.push(`${BM_UNITS[rest % 10]} belas`);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(`${BM_UNITS[t]} puluh`);
      if (u > 0) parts.push(BM_UNITS[u]);
    }
  }
  return parts.join(" ");
}

/** Whole number 0–999,999,999 in Malay ("seribu dua ratus", "dua belas ribu"…). */
export function numberToWordsBm(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) {
    throw new RangeError(`numberToWordsBm supports integers 0–999,999,999, got ${n}`);
  }
  if (n === 0) return "kosong";
  const juta = Math.floor(n / 1_000_000);
  const ribu = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (juta > 0) parts.push(`${belowThousandBm(juta)} juta`);
  if (ribu > 0) parts.push(ribu === 1 ? "seribu" : `${belowThousandBm(ribu)} ribu`);
  if (rest > 0) parts.push(belowThousandBm(rest));
  return parts.join(" ");
}

/**
 * "Ringgit Malaysia: lima puluh sahaja" / "…dua belas ribu dan lima puluh sen".
 * Deterministic TypeScript — the LLM never words an amount (Hard Rule 2).
 */
export function amountInWordsBm(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new RangeError(`amountCents must be a non-negative integer, got ${amountCents}`);
  }
  const rm = Math.floor(amountCents / 100);
  const sen = amountCents % 100;
  const rmWords = numberToWordsBm(rm);
  return sen === 0
    ? `Ringgit Malaysia: ${rmWords} sahaja`
    : `Ringgit Malaysia: ${rmWords} dan ${numberToWordsBm(sen)} sen`;
}

// ----- Receipt WhatsApp message ----------------------------------------------

export function receiptWhatsAppMessageBm(params: {
  orgName: string;
  receiptNo: string;
  donorName: string;
  amountCents: number;
  dateIso: string;
  purpose: string;
  taxStatus: TaxExemptStatus;
}): string {
  const { orgName, receiptNo, donorName, amountCents, dateIso, purpose, taxStatus } = params;
  return [
    `Resit Rasmi ${receiptNo} — ${orgName}`,
    ``,
    `Terima kasih ${donorName} atas derma anda.`,
    `Jumlah: ${formatRm(amountCents)}`,
    `Tarikh: ${dateIso}`,
    purpose ? `Tujuan: ${purpose}` : ``,
    ``,
    taxDeductibilityLineBm(taxStatus),
    // S0-6 honesty fix (2026-08-25): a wa.me link can only carry TEXT — it
    // cannot attach a file, so the old "(PDF receipt attached)" line was
    // simply false. Tell the sender what actually has to happen instead.
    `(Resit PDF: muat turun dari Minit, kemudian lampirkan dalam WhatsApp / PDF receipt: download it from Minit, then attach it in WhatsApp)`,
  ]
    .filter((line, i, arr) => !(line === `` && arr[i - 1] === ``))
    .join("\n");
}
