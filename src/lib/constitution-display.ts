// ---------------------------------------------------------------------------
// HOW A STORED CONSTITUTION IS DISPLAYED (①, work order 89, J 8/30:
// 「開了看起來很亂」).
//
// The data is right and stays untouched. A real constitution mixes two ways
// of writing sub-clauses — some have their own heading (8.1, 12.2, 13.2 in
// org 197's book) and were stored as their own clauses; others are numbered
// sentences INSIDE a parent clause's body ("1.2 Tempat urusan…" inside
// Fasal 1). The AI copied both faithfully (Hard Rule 1 — the verbatim copy
// IS the evidence), so `clauses_json` keeps the mess exactly as printed.
//
// This module is the comb: pure, display-only helpers the reading screens
// use to hang sub-clauses under their parent, break inline "N.M" sentences
// into paragraphs, and shorten a page ref like "muka surat 3 daripada 8".
// Nothing here ever writes back; nothing here changes a single stored byte.
// ---------------------------------------------------------------------------

import type { ConfirmedClause } from "@/lib/constitution";

/**
 * (a) work order 97 §3: the model was TAUGHT (extract-constitution.ts, until
 * tonight) to write the English word "missing" as a heading value, and some
 * stored books carry it (org 197's real book). The stored bytes stay exactly
 * as they are (Hard Rule 1) — but no screen prints the word "missing" as if
 * the constitution said it. Trimmed, case-insensitive; applied at the
 * flatten layer AND at the display layer, so old stored books heal too.
 */
export function cleanClauseField(value: string): string {
  const v = value.trim();
  return v.toLowerCase() === "missing" ? "" : value;
}

/**
 * (c) work order 97 §3: a page photographed from the MIDDLE of a Fasal gives
 * clauses numbered only "(3)"…"(10)" — sub-clauses whose Fasal heading was
 * never in frame. sortClauses puts numbers before words, so those orphans
 * used to sit ABOVE Fasal 1 at the very top of the book.
 *
 * Display-only: when the book is Fasal-style (any clause_no says "Fasal"),
 * bare-number / "(N)"-style clauses with no parent in the book sink to the
 * END, where the screens hang an honest note under them ("these belong to
 * some Fasal — re-photograph the page with the heading and they slot in").
 * A book numbered entirely without "Fasal" (org 197's fixture shape: 1, 8,
 * 8.1…) is left exactly as sorted — bare numbers ARE its style.
 */
export function sinkOrphanClauses(clauses: readonly ConfirmedClause[]): {
  main: ConfirmedClause[];
  orphans: ConfirmedClause[];
} {
  const hasFasal = clauses.some((c) => /^\s*fasal\b/i.test(c.clause_no));
  if (!hasFasal) return { main: [...clauses], orphans: [] };

  const numbers = new Set(clauses.map((c) => c.clause_no.trim().toLowerCase()));
  const hasParent = (no: string): boolean => {
    const parent = clauseParentNo(no.replace(/[()]/g, ""));
    if (parent === null) return false;
    return numbers.has(parent) || numbers.has(`fasal ${parent}`);
  };
  const isOrphan = (c: ConfirmedClause): boolean => {
    const no = c.clause_no.trim();
    // Bare "(3)" / "3" / "3.1" shapes only — anything wordier keeps its place.
    if (!/^\(?\d+(\.\d+)?\)?$/.test(no)) return false;
    return !hasParent(no);
  };

  const main: ConfirmedClause[] = [];
  const orphans: ConfirmedClause[] = [];
  for (const c of clauses) (isOrphan(c) ? orphans : main).push(c);
  return { main, orphans };
}

/**
 * "8.1" → "8", "12.10" → "12". Only plain dotted numbers have a parent —
 * "Fasal 3(a)" or a top-level "12" answer null, and so does anything this
 * cannot read with certainty (a wrong indent is worse than none).
 */
export function clauseParentNo(clauseNo: string): string | null {
  const m = /^\s*(\d+)\.\d+\s*$/.exec(clauseNo);
  return m ? m[1] : null;
}

export type DisplayClause = {
  clause: ConfirmedClause;
  /** True = this is a sub-clause whose PARENT is also in the list — the
   *  reading screens indent it under that parent. A sub-clause whose parent
   *  was never stored stays at the top level (nothing to hang it under). */
  child: boolean;
};

/** Which clauses should render indented, given the (sorted) list itself. */
export function annotateClauseHierarchy(
  clauses: readonly ConfirmedClause[],
): DisplayClause[] {
  const numbers = new Set(clauses.map((c) => c.clause_no.trim()));
  return clauses.map((clause) => {
    const parent = clauseParentNo(clause.clause_no);
    return { clause, child: parent !== null && numbers.has(parent) };
  });
}

export type ClauseTextPart = {
  /** The inline sub-number ("1.2") when this part starts with one; null for
   *  the opening run of text. The number is PART OF the verbatim text — the
   *  renderer prints it, just on its own line with an indent. */
  label: string | null;
  text: string;
};

/** True when `ch` can start a sub-clause sentence (the guard against
 *  splitting on decimals like "RM 1.50" or cross-references mid-sentence). */
function startsSentence(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  if (/[A-ZÀ-ÞĀ-Ž]/.test(ch)) return true;
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9fff; // CJK
}

/**
 * Split a clause body at the inline "N.M " markers the original document
 * itself printed — Fasal 1 whose text runs "…didaftarkan. 1.2 Tempat
 * urusan…" reads as two paragraphs, each keeping its own number verbatim.
 *
 * Deliberately conservative — a marker only splits when ALL of these hold:
 *   * its integer part equals the clause's OWN number (inside Fasal 1 only
 *     "1.x" counts — "RM 2.50" or a reference to "8.1" never splits);
 *   * it sits at the start of the text, after a line break, or after a
 *     sentence end (. 。 ; ； ! ? ？ : ：), so "seperti 1.2 di atas"
 *     mid-sentence stays where it is;
 *   * what follows looks like a sentence (capital letter or CJK), so a
 *     decimal number is never mistaken for a sub-clause.
 * When in doubt the text stays as one paragraph — unsplit is always safe.
 */
export function splitClauseText(
  clauseNo: string,
  text: string,
): ClauseTextPart[] {
  const major = /^\s*(\d+)(?:\.\d+)?\s*$/.exec(clauseNo)?.[1];
  if (!major) return [{ label: null, text }];

  const marker = new RegExp(`${major}\\.(\\d{1,2})[.)]?\\s+`, "g");
  const cuts: { index: number; label: string; bodyStart: number }[] = [];
  for (let m = marker.exec(text); m !== null; m = marker.exec(text)) {
    // What comes before the marker decides whether it starts a sentence.
    let i = m.index - 1;
    while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
    const before = i < 0 ? null : text[i];
    const atSentenceStart =
      before === null || before === "\n" || /[.。;；!?？:：”」』)]/.test(before);
    if (!atSentenceStart) continue;
    if (!startsSentence(text[m.index + m[0].length])) continue;
    cuts.push({
      index: m.index,
      label: m[0].trim().replace(/\s+$/, ""),
      bodyStart: m.index,
    });
  }
  if (cuts.length === 0) return [{ label: null, text }];

  const parts: ClauseTextPart[] = [];
  const head = text.slice(0, cuts[0].index).replace(/\s+$/, "");
  if (head !== "") parts.push({ label: null, text: head });
  for (let c = 0; c < cuts.length; c++) {
    const end = c + 1 < cuts.length ? cuts[c + 1].index : text.length;
    const body = text.slice(cuts[c].index, end).replace(/\s+$/, "");
    parts.push({ label: cuts[c].label, text: body });
  }
  return parts;
}

/**
 * (c) the top-right page line, shortened for display. The stored page_ref is
 * verbatim off the paper ("muka surat 3 daripada 8") and stays stored that
 * way; on a card that whole sentence crowds the heading, so the card shows
 * "m/s 3" and keeps the full text in the title/tooltip. Anything that is not
 * the muka-surat shape passes through untouched.
 */
export function shortPageRef(pageRef: string): string {
  const m = /^\s*muka\s*surat\s+(\S+?)(?:\s+daripada\s+\S+)?\s*$/i.exec(pageRef);
  return m ? `m/s ${m[1]}` : pageRef;
}
