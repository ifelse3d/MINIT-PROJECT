// ---------------------------------------------------------------------------
// 134 (J 9/9 afternoon, live site): a book read page by page came out with
// stray cards between its Fasal — "(3) lanjutan Fasal 10", "Fasal 4(3)",
// "(4) lanjutan", "Fasal 6(4)" — each holding the TAIL of a clause whose head
// was on the page before. The reader names such a tail after the sub-number
// it starts with; sortClauses then files "(3) lanjutan Fasal 10" between
// Fasal 3 and Fasal 4 (its leading number is 3); and the book looks broken —
// J:「constitution 那邊看起來怪怪的」. The book itself is in the ordinary ROS
// shape (Fasal 1 NAMA, 2 ALAMAT, 3 MATLAMAT, 4 KEAHLIAN…); only our reading
// had cut it.
//
// The tail belongs to the clause it continues. This fold puts it there: text
// appended to the parent, verbatim, in reading order. Only a clause_no that
// SAYS it is a continuation is folded — the word lanjutan / sambungan /
// continued, or the "Fasal N(m)" shape with no heading of its own. A bare
// "(3)" orphan is not a continuation: it keeps its own card and its "no
// parent found" tag (constitution-display.ts). A tail naming a parent the
// book does not hold is left exactly as it is — nothing is guessed.
//
// Applied at the flatten layer (new reads are STORED folded) and at the load
// layer (books already stored come out folded on every screen and in the
// Q&A). The stored bytes of an old book are never rewritten (Hard Rule 1).
// Pure; fixed-input tested (constitution-fold.test.ts).
// ---------------------------------------------------------------------------

import type { ConfirmedClause } from "@/lib/constitution";

const LABEL = "(?:fasal|clause|perkara|artikel|article)";
const CONT = "(?:lanjutan|sambungan|samb\\.|continued|continuation|cont\\.?|续|續)";

/** "(3) lanjutan Fasal 10" · "(4) lanjutan" · "3 sambungan" */
const TAIL_NUMBERED = new RegExp(
  `^[(（]?\\s*(\\d+(?:\\.\\d+)?)\\s*[)）]?\\s+${CONT}(?:\\s+${LABEL}\\s*(\\d+))?\\s*$`,
  "i",
);
/** "lanjutan Fasal 10" · "sambungan" */
const TAIL_BARE = new RegExp(`^${CONT}(?:\\s+${LABEL}\\s*(\\d+))?\\s*$`, "i");
/** "Fasal 10 (lanjutan)" */
const TAIL_SUFFIX = new RegExp(`^${LABEL}\\s*(\\d+)\\s*[(（]\\s*${CONT}\\s*[)）]\\s*$`, "i");
/** "Fasal 4(3)" — a sub-number hung on its Fasal, with no heading of its own. */
const TAIL_SUBNO = new RegExp(`^${LABEL}\\s*(\\d+)\\s*[(（]\\s*(\\d+)\\s*[)）]\\s*$`, "i");
/** The label word in front of a number: "Fasal 10" → "10". */
const LEADING_LABEL = new RegExp(`^\\s*${LABEL}\\b\\s*`, "i");

type Tail = {
  parentNo: string | null;
  /** The sub-number the tail's text starts from — only from the "(3) lanjutan"
   *  shapes, where the reader put the paragraph's own number in the label. The
   *  "(m)" of a "Fasal N(m)" label is NOT that (J's book: "Fasal 4(3)" held
   *  paragraph (6)), so it is never written into the text. */
  subNo: string | null;
};

/** What kind of continuation this clause_no announces — or null. */
function continuationOf(clauseNo: string, heading: string): Tail | null {
  const no = clauseNo.trim();
  let m = TAIL_NUMBERED.exec(no);
  if (m) return { subNo: m[1], parentNo: m[2] ?? null };
  m = TAIL_BARE.exec(no);
  if (m) return { subNo: null, parentNo: m[1] ?? null };
  m = TAIL_SUFFIX.exec(no);
  if (m) return { subNo: null, parentNo: m[1] };
  // The "Fasal 4(3)" shape is also what a confirmed reattach writes — and a
  // book can print a real sub-clause that way, WITH its own heading. Only a
  // headless one is a tail.
  if (heading.trim() === "") {
    m = TAIL_SUBNO.exec(no);
    if (m) return { subNo: null, parentNo: m[1] };
  }
  return null;
}

/** "Fasal 10" → "10", " 8.1 " → "8.1": the number a parent is looked up by. */
function bareNo(clauseNo: string): string {
  return clauseNo.trim().replace(LEADING_LABEL, "").replace(/\s+/g, "").toLowerCase();
}

/** "(3)" / "3." / "3)" at the start of a line, for sub-number `subNo`. */
function subNoMarker(subNo: string): RegExp {
  const n = subNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\n)\\s*[(（]?${n}[)）.、]`);
}

/** A tail that begins mid-sentence (a lowercase Latin letter) continues the
 *  parent's LAST paragraph — the page break fell inside a sentence. */
function isMidSentence(text: string): boolean {
  return /^[a-z]/.test(text);
}

/**
 * Fold every continuation tail onto the clause it continues, in reading
 * (stored) order. A tail with a named parent goes under that parent; one
 * without goes under the clause read just before it. Text is appended
 * verbatim: a mid-sentence tail finishes the parent's last sentence, any
 * other becomes a paragraph of its own — numbered with the sub-number the
 * reader put in the label only when neither side carries that number yet.
 * Heading and page reference stay the parent's.
 */
export function foldContinuationClauses(
  stored: readonly ConfirmedClause[],
): ConfirmedClause[] {
  const out: ConfirmedClause[] = [];
  const indexByNo = new Map<string, number>();
  for (const c of stored) {
    const tail = continuationOf(c.clause_no, c.heading);
    if (tail !== null) {
      const parentIndex =
        tail.parentNo !== null
          ? indexByNo.get(tail.parentNo)
          : out.length > 0
            ? out.length - 1
            : undefined;
      if (parentIndex !== undefined) {
        const parent = out[parentIndex];
        let piece = c.text.trim();
        if (piece !== "") {
          const body = parent.text.replace(/\s+$/, "");
          if (body === "") {
            out[parentIndex] = { ...parent, text: piece };
          } else if (isMidSentence(piece)) {
            // "…tidak boleh bertindak" + "bertentangan dengan…": one sentence.
            out[parentIndex] = { ...parent, text: `${body} ${piece}` };
          } else {
            if (
              tail.subNo !== null &&
              !subNoMarker(tail.subNo).test(piece) &&
              !subNoMarker(tail.subNo).test(body)
            ) {
              piece = `(${tail.subNo}) ${piece}`;
            }
            out[parentIndex] = { ...parent, text: `${body}\n\n${piece}` };
          }
        }
        continue;
      }
      // A tail whose named parent is not in the book stays as it is.
    }
    out.push({ ...c });
    indexByNo.set(bareNo(c.clause_no), out.length - 1);
  }
  return out;
}
