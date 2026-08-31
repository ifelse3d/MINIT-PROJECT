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
import type { ConstitutionExtraction } from "@/lib/extraction";

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
 * Extraction → confirmed clauses.
 *
 * Hard Rule 1: a clause whose TEXT the model could not read is DROPPED, not
 * guessed at. A constitution clause has legal meaning and must be verbatim, so
 * a half-read one is worse than an absent one — the refusal path already
 * handles "I cannot find that in your constitution" honestly.
 *
 * Lived inside constitution-review.tsx until §1 (work order 104) gave the
 * sign-up form a second reason to need it. CLAUDE.md rule 13: pure logic goes
 * to src/lib BEFORE the UI divides, or the next bug has to be fixed twice.
 */
export function clausesFromConstitutionExtraction(
  e: ConstitutionExtraction,
): ConfirmedClause[] {
  return e.clauses
    .filter(
      (c) =>
        c.clause_no.confidence !== "missing" &&
        c.clause_no.value !== "" &&
        c.text.confidence !== "missing" &&
        c.text.value !== "",
    )
    .map((c) => ({
      clause_no: c.clause_no.value,
      // 97 §3(a): the model was taught (until then) to write the literal word
      // "missing" as a heading value, and confidence stayed "confirmed" so the
      // confidence check alone let it through. cleanClauseField catches the
      // word itself, whatever the label says.
      heading: cleanClauseField(
        c.heading.confidence === "missing" ? "" : c.heading.value,
      ),
      text: c.text.value,
      page_ref: cleanClauseField(
        c.page_ref.confidence === "missing" ? "" : c.page_ref.value,
      ),
    }));
}

/**
 * (c) work order 97 §3, REVISED by §4 (work order 104): a page photographed
 * from the MIDDLE of a Fasal gives clauses numbered only "(3)"…"(10)" —
 * sub-clauses whose Fasal heading was never in frame.
 *
 * WHAT CHANGED AND WHY. 97 §3 moved those orphans to the END of the book to
 * get them off the top, where sortClauses had been putting them. J's verdict
 * on the result, 2026-08-31 evening: 「本意 good、觀感＝壞掉」— the reader now
 * met the book in the right order and then found a second, stray book after
 * it. The real cause was inside sortClauses (the label word "Fasal" sorting as
 * a WORD while a bare "8.2" sorted as a NUMBER, and numbers come first); that
 * is fixed at the root now, so an orphan sits WHERE ITS NUMBER SAYS IT
 * BELONGS and this function only reports WHICH clauses have no parent in the
 * book. The warning survives — a quiet tag beside the clause number, and one
 * line above the list — and the agent's "shall I slot these under Fasal X?"
 * proposal (§0-6, order 100) is untouched.
 *
 * Display-only: nothing here changes a stored byte (Hard Rule 1). A book
 * numbered entirely without "Fasal" (1, 8, 8.1…) has no orphans at all —
 * bare numbers ARE its style.
 */
export function markOrphanClauses(clauses: readonly ConfirmedClause[]): {
  /** Every clause, in the order it came in — nothing is moved. */
  clauses: ConfirmedClause[];
  /** The clause_nos (trimmed, as stored) whose parent is not in the book. */
  orphanNos: Set<string>;
} {
  const hasFasal = clauses.some((c) => /^\s*fasal\b/i.test(c.clause_no));
  if (!hasFasal) return { clauses: [...clauses], orphanNos: new Set() };

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

  const orphanNos = new Set<string>();
  for (const c of clauses) if (isOrphan(c)) orphanNos.add(c.clause_no.trim());
  return { clauses: [...clauses], orphanNos };
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

// ---------------------------------------------------------------------------
// §0-6 (work order 100): the agent PROPOSES a home for each orphan run —
// "these look like they belong under Fasal X" — instead of leaving
// re-photographing as the only road. Pure derivation, zero AI: the STORED
// array keeps the photographs' reading order, so an orphan's most likely
// parent is simply the last Fasal heading read before it. A proposal is a
// proposal — the person confirms, the rename is traced (agent_changes), and
// re-photographing remains the fallback the note still offers.
// ---------------------------------------------------------------------------

export type OrphanHomeProposal = {
  /** The proposed parent's clause_no as stored, e.g. "Fasal 8". */
  parentNo: string;
  parentHeading: string;
  /** The orphan clause_nos (in stored order) proposed to slot under it. */
  orphanNos: string[];
};

/** The same bare shapes markOrphanClauses treats as orphans. */
function isOrphanShape(no: string): boolean {
  return /^\(?\d+(\.\d+)?\)?$/.test(no.trim());
}

/**
 * Group the book's orphans under the Fasal each most likely belongs to,
 * from the STORED (reading-order) array — the sorted view has already
 * shuffled orphans to the top, so it cannot answer this question.
 * Orphans read before any Fasal heading get no proposal (nothing honest to
 * propose); a book that is not Fasal-style has no orphans at all.
 */
export function proposeOrphanHomes(
  stored: readonly ConfirmedClause[],
): OrphanHomeProposal[] {
  const hasFasal = stored.some((c) => /^\s*fasal\b/i.test(c.clause_no));
  if (!hasFasal) return [];
  const numbers = new Set(stored.map((c) => c.clause_no.trim().toLowerCase()));
  const hasParent = (no: string): boolean => {
    const parent = clauseParentNo(no.replace(/[()]/g, ""));
    if (parent === null) return false;
    return numbers.has(parent) || numbers.has(`fasal ${parent}`);
  };

  const byParent = new Map<string, OrphanHomeProposal>();
  let lastFasal: ConfirmedClause | null = null;
  for (const c of stored) {
    const no = c.clause_no.trim();
    if (/^\s*fasal\b/i.test(no)) {
      lastFasal = c;
      continue;
    }
    if (!isOrphanShape(no) || hasParent(no)) continue;
    if (!lastFasal) continue;
    const key = lastFasal.clause_no.trim();
    const entry = byParent.get(key) ?? {
      parentNo: key,
      parentHeading: lastFasal.heading,
      orphanNos: [],
    };
    entry.orphanNos.push(no);
    byParent.set(key, entry);
  }
  return [...byParent.values()];
}

/**
 * The clause_no an orphan gets when the person confirms its home:
 * "(3)" under "Fasal 8" → "Fasal 8(3)". sortClauses tokenises that as
 * [fasal, 8, 3], so it slots right after Fasal 8 — and it no longer matches
 * the orphan shape, so it never sinks again.
 */
export function reattachedClauseNo(orphanNo: string, parentNo: string): string {
  const bare = orphanNo.trim().replace(/^\(|\)$/g, "");
  return `${parentNo.trim()}(${bare})`;
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
