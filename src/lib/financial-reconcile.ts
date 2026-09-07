import type { MeetingNotesExtraction } from "@/lib/extraction";
import { formatRm } from "@/lib/minit-format";
import type { MinutesLang } from "@/lib/minutes-lang";

// ---------------------------------------------------------------------------
// THE TREASURER'S REPORT ADDS ITSELF UP (work order 125 §4 — 8/31 real paper
// §1). J's AGM page: opening balance 7,680; income 13,600; expenses 10,150;
// bank balance 11,590. Every figure was read correctly. 7,680 + 13,600 −
// 10,150 = 11,130, not 11,590 — a 460 difference nobody mentioned, on a page
// that also says the auditor found no problem.
//
// Hard Rule 2: money math is TypeScript. This module does the one sum a
// reader would do in their head and reports whether the page balances. It
// changes NO figure — a mismatch is a QUESTION on the review step (misread,
// or the page really says so), and the answer is either the person's own
// edit or an acknowledgement that prints as one note line in the document.
// Silence on a balanced page: a card that cries wolf is worse than none.
// Integer sen throughout. Pure; fixed-input tested.
// ---------------------------------------------------------------------------

export const FIGURE_ROLES = ["opening", "income", "expense", "closing", "other"] as const;
export type FigureRole = (typeof FIGURE_ROLES)[number];

export type ReconcileInput = {
  openingCents: number | null;
  incomeCents: number[];
  expenseCents: number[];
  statedClosingCents: number | null;
};

export type ReconcileResult =
  /** One of the four parts is not on the page — nothing to check. */
  | { status: "not_applicable" }
  | { status: "balanced"; computedCents: number }
  | {
      status: "mismatch";
      computedCents: number;
      statedCents: number;
      /** stated − computed: positive when the page's closing is HIGHER
       *  than the sum, negative when lower. */
      diffCents: number;
    };

const isSen = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** opening + Σ income − Σ expense, against the stated closing. */
export function reconcileFigures(input: ReconcileInput): ReconcileResult {
  const { openingCents, incomeCents, expenseCents, statedClosingCents } = input;
  if (!isSen(openingCents) || !isSen(statedClosingCents)) return { status: "not_applicable" };
  if (incomeCents.length === 0 && expenseCents.length === 0) return { status: "not_applicable" };
  if (!incomeCents.every(isSen) || !expenseCents.every(isSen)) return { status: "not_applicable" };
  const income = incomeCents.reduce((s, n) => s + n, 0);
  const expense = expenseCents.reduce((s, n) => s + n, 0);
  const computedCents = openingCents + income - expense;
  const diffCents = statedClosingCents - computedCents;
  if (diffCents === 0) return { status: "balanced", computedCents };
  return { status: "mismatch", computedCents, statedCents: statedClosingCents, diffCents };
}

/**
 * The same check over an extraction's figures, using the `role` the reader
 * labelled each with (opening / income / expense / closing; anything else
 * is left out). A figure without an amount, or not yet non-missing, is
 * left out too — the check runs on what is actually on the page.
 */
export function reconcileExtraction(e: MeetingNotesExtraction): ReconcileResult {
  const usable = e.figures.filter(
    (f) => f.amount_cents.confidence !== "missing" && f.amount_cents.value !== null,
  );
  const of = (role: FigureRole) =>
    usable.filter((f) => (f.role ?? "other") === role).map((f) => f.amount_cents.value as number);
  const opening = of("opening");
  const closing = of("closing");
  // Exactly one opening and one closing, or the page's shape is not the
  // simple ledger this check understands.
  if (opening.length !== 1 || closing.length !== 1) return { status: "not_applicable" };
  return reconcileFigures({
    openingCents: opening[0],
    incomeCents: of("income"),
    expenseCents: of("expense"),
    statedClosingCents: closing[0],
  });
}

/**
 * 125 §4-3: the ONE note line a document carries when a person looked at a
 * mismatch and said "the figures are right, the page really says so" —
 * in the document's language (a BM filing copy carries no Chinese).
 */
export function mismatchNote(lang: MinutesLang, r: Extract<ReconcileResult, { status: "mismatch" }>): string {
  const diff = formatRm(Math.abs(r.diffCents));
  const computed = formatRm(r.computedCents);
  const stated = formatRm(r.statedCents);
  switch (lang) {
    case "zh":
      return `注：以上数字照原文抄录；算出的结存 ${computed} 与纸上所写 ${stated} 相差 ${diff}，已知悉。`;
    case "en":
      return `Note: the figures above are copied as written; the computed balance ${computed} differs from the stated ${stated} by ${diff}, and this has been noted.`;
    default:
      return `Nota: angka di atas disalin seperti tertulis; baki yang dikira ${computed} berbeza daripada baki tertulis ${stated} sebanyak ${diff}, dan perkara ini telah diambil maklum.`;
  }
}
