// ---------------------------------------------------------------------------
// 135 (J 9/9 afternoon, live site): J photographed the AGM's handwritten
// notes into "Record income". The reader did what it was asked — one row per
// amount it could see — and the review then offered seven "donations": last
// year's balance, membership fees, the dinner takings, the hall, the dinner
// COST and the bank balance, none with a donor. J:「這個報告總的，所以沒辦法知道
// 個人」「銀行有多少錢，結果這裏是加進去」「要刪除也沒辦法」.
//
// Three deterministic helpers, no AI, no invention:
//   * looksLikeSummaryPage — not one row names a donor: the page is a
//     financial summary (a report's KEWANGAN block, a column of totals), not a
//     ledger of who gave what. The screen says so and points at the right
//     door instead of offering receipts.
//   * looksLikeBalanceRow  — the purpose is a BALANCE word (结存 / baki /
//     bank). A balance is a state, not money received; the row is tagged, not
//     removed — the person decides.
//   * dropLedgerRow        — remove a review row and keep the index-keyed
//     answers (added, cash/transfer) pointing at the same rows.
//
// Deciding income vs spending for the OTHER rows (the dinner's takings versus
// the dinner's cost) is the reader's job — a `kind` on the row contract, with
// an eval — and is listed in the 135 work order, not guessed here.
// ---------------------------------------------------------------------------

import type { LedgerExtraction, LedgerRowKind } from "@/lib/extraction";

type Row = LedgerExtraction["rows"][number];

/**
 * 136: what the review and the receipt gate treat a row AS. Three answers:
 *   * the reader labelled it (`row.kind` with a real value) → that label,
 *     with its confidence, `inferred: false`;
 *   * no label, but the purpose reads as a balance word → `balance`,
 *     `inferred: true` (the 135 word-list stands in for a silent model);
 *   * nothing → `kind: null` — unknown, NOT income. Nothing here promotes a
 *     line to income; only the reader or a person does that.
 */
export type RowKindReading = {
  kind: LedgerRowKind | null;
  confidence: "confirmed" | "check" | null;
  /** True when code (the balance word-list), not the reader, said so. */
  inferred: boolean;
};

export function rowKindOf(row: Pick<Row, "purpose"> & { kind?: Row["kind"] }): RowKindReading {
  const k = row.kind;
  if (k && k.confidence !== "missing" && k.value !== "") {
    return { kind: k.value, confidence: k.confidence, inferred: false };
  }
  const purpose = row.purpose.value;
  if (looksLikeBalanceRow(purpose)) {
    return { kind: "balance", confidence: null, inferred: true };
  }
  // Only a ONE-SIDED hit is a guess. "Derma pembaikan bumbung dewan" is a
  // donation FOR the hall — an income word and an expense word together —
  // and code must not call that either way; the person decides.
  const expense = looksLikeExpenseRow(purpose);
  const income = looksLikeIncomeRow(purpose);
  if (expense && !income) {
    return { kind: "expense", confidence: null, inferred: true };
  }
  if (income && !expense) {
    return { kind: "income", confidence: null, inferred: true };
  }
  return { kind: null, confidence: null, inferred: false };
}

/**
 * 136: may this row become a RECEIPT, as far as its kind goes? Only money
 * received does: a reader-labelled `income` that is confirmed, or an
 * unlabelled row that does not read as a balance (a reading from before
 * today, where the person is the only judge). A "check" label is not yet
 * income — a person has to press the badge first.
 */
export function kindAllowsReceipt(row: Pick<Row, "purpose"> & { kind?: Row["kind"] }): boolean {
  const r = rowKindOf(row);
  if (r.kind === null) return true;
  // A code-guessed income is an unlabelled row with a hint, not a verdict —
  // it passes like one (every other field still has to be confirmed).
  if (r.inferred) return r.kind === "income";
  return r.kind === "income" && r.confidence === "confirmed";
}

/** 136: true when the review holds rows the reader never labelled — a reading from before today. */
export function readingHasNoKinds(rows: readonly Row[]): boolean {
  return rows.length > 0 && rows.every((r) => !r.kind || r.kind.confidence === "missing" || r.kind.value === "");
}

/**
 * 136: re-key an index set after row `index` was removed — the same shift
 * dropLedgerRow applies to `added`, exported for the other per-row marks the
 * store keeps (rows handed to the expenses page).
 */
export function reindexAfterDrop(set: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set<number>();
  for (const i of set) {
    if (i === index) continue;
    next.add(i > index ? i - 1 : i);
  }
  return next;
}

/** Words that make a purpose a BALANCE, not a receipt of money. */
const BALANCE_WORDS =
  /(结存|結存|余额|餘額|结余|結餘|结馀|存款|银行|銀行|\bbaki\b|\bbalance\b|\bbank\b|\bb\/f\b|\bc\/f\b|brought forward|carried forward)/i;

/** True when the row's purpose reads as a balance (上年结存, 银行, Baki bank). */
export function looksLikeBalanceRow(purpose: string): boolean {
  return BALANCE_WORDS.test(purpose);
}

/**
 * 136 (J, live, 5 PM): a reading stored BEFORE today has no kind at all, so
 * every line showed "Row type?" — including 礼堂 and 晚宴开销. Two more
 * word-lists stand in for a silent reader, the same way the balance list
 * does: expense words → expense, income words → income. Both are shown as
 * "(code guess)"; a guessed expense never reaches a receipt, a guessed
 * income is treated like an unlabelled row (a person still confirms every
 * field). Neither list is consulted when the reader DID label the row.
 */
const EXPENSE_WORDS =
  /(礼堂|禮堂|租金|开销|開銷|支出|费用|費用|开支|開支|付款|\bsewa\b|\bdewan\b|\bkos\b|perbelanjaan|belanja|\bbil\b|bayaran|\bexpense|\brent\b|\bcost\b|\bpaid\b)/i;
const INCOME_WORDS =
  /(会费|會費|乐捐|樂捐|捐款|捐|香油|收入|奉献|奉獻|\byuran\b|\bderma\b|kutipan|sumbangan|\bhasil\b|\bpendapatan\b|\bdonation|\bincome\b|\bfees?\b)/i;

export function looksLikeExpenseRow(purpose: string): boolean {
  return EXPENSE_WORDS.test(purpose);
}
export function looksLikeIncomeRow(purpose: string): boolean {
  return INCOME_WORDS.test(purpose);
}

/**
 * True when the page has rows but not ONE donor name — the shape of a
 * financial summary, never of a donation ledger (a ledger's whole point is
 * who gave). A page with a single named donor is a ledger with gaps.
 */
export function looksLikeSummaryPage(rows: readonly Row[]): boolean {
  if (rows.length === 0) return false;
  return rows.every(
    (r) => r.donor_name.confidence === "missing" || r.donor_name.value.trim() === "",
  );
}

/**
 * Remove row `index` from a review and re-key the per-row answers so they
 * still describe the same rows. Pure — returns new values, touches nothing.
 */
export function dropLedgerRow<T>(
  rows: readonly T[],
  added: ReadonlySet<number>,
  payments: Readonly<Record<number, "cash" | "transfer">>,
  index: number,
): { rows: T[]; added: Set<number>; payments: Record<number, "cash" | "transfer"> } {
  if (index < 0 || index >= rows.length) {
    return { rows: [...rows], added: new Set(added), payments: { ...payments } };
  }
  const shift = (i: number) => (i > index ? i - 1 : i);
  const nextAdded = reindexAfterDrop(added, index);
  const nextPayments: Record<number, "cash" | "transfer"> = {};
  for (const [k, v] of Object.entries(payments)) {
    const i = Number(k);
    if (i === index) continue;
    nextPayments[shift(i)] = v;
  }
  return {
    rows: rows.filter((_, i) => i !== index),
    added: nextAdded,
    payments: nextPayments,
  };
}
