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

import type { LedgerExtraction } from "@/lib/extraction";

type Row = LedgerExtraction["rows"][number];

/** Words that make a purpose a BALANCE, not a receipt of money. */
const BALANCE_WORDS =
  /(结存|結存|余额|餘額|结余|結餘|结馀|存款|银行|銀行|\bbaki\b|\bbalance\b|\bbank\b|\bb\/f\b|\bc\/f\b|brought forward|carried forward)/i;

/** True when the row's purpose reads as a balance (上年结存, 银行, Baki bank). */
export function looksLikeBalanceRow(purpose: string): boolean {
  return BALANCE_WORDS.test(purpose);
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
  const nextAdded = new Set<number>();
  for (const i of added) if (i !== index) nextAdded.add(shift(i));
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
