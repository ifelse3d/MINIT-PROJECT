// ---------------------------------------------------------------------------
// THE SIGNATORIES A PAGE NAMES IN ITS HEADER (work order 125 §3 — 8/31 real
// paper §3, J 2026-09-07 on the live site).
//
// J's AGM page opens 「主席：甲　记录：乙」. The reader is told to take the
// signature block's names — and this page has no signature block, so the
// document printed "( Pengerusi )" as a placeholder where the chair's name
// belonged and, when it did find the recorder, printed the role in Chinese.
//
// The prompt now also reads the header. This module is the CODE half (D53):
// a header line of a FIXED shape — a role word, a colon, a name — yields the
// two signatories whether or not the model noticed, and a test can say so.
// Nothing is guessed: no colon, no name; a role word in prose (主席致词,
// 主席感谢大家) is not a header line. The signed-in user's name is never
// used (「不准拿登入者名字冒充」). Pure; fixed-input tested.
// ---------------------------------------------------------------------------

export type HeaderSignatory = {
  /** The name as written, honorific stripped. */
  name: string;
  /** The role word as written on the page (主席 / Pengerusi / Chairman…). */
  role: string;
  /** The whole line it was read from. */
  line: string;
};

export type HeaderSignatories = {
  chair?: HeaderSignatory;
  secretary?: HeaderSignatory;
};

const CHAIR_ROLE = /(主席|主持人|Pengerusi|Chairperson|Chairman|Chairwoman|Chair)/i;
const SECRETARY_ROLE = /(记录人|記錄人|记录|記錄|秘书|秘書|Setiausaha|Secretary|Minuted by|Dicatat oleh)/i;

const HONORIFIC =
  /^(?:En\.?|Encik|Pn\.?|Puan|Cik|Dr\.?|Tuan|Dato'?|Datuk|Datin|Ustaz|Ustazah|Haji|Hajah|Mr\.?|Mrs\.?|Ms\.?|Miss)\s+/i;

/** A name right after the colon: a Chinese run of 2–4 characters, or up to
 *  five capitalised Latin words (bin / binti / a/l / a/p allowed inside). */
const CJK_NAME = /^\s*([㐀-䶿一-鿿]{2,4})(?![㐀-䶿一-鿿])/;
const LATIN_NAME =
  /^\s*((?:[A-Z][A-Za-z'.-]*)(?:\s+(?:[A-Z][A-Za-z'.-]*|bin|binti|a\/l|a\/p)){0,4})/;

function nameAfter(rest: string): string | null {
  const bare = rest.replace(HONORIFIC, "");
  const cjk = CJK_NAME.exec(bare);
  if (cjk) return cjk[1];
  const latin = LATIN_NAME.exec(bare);
  if (latin && latin[1].trim() !== "") return latin[1].trim();
  return null;
}

function find(line: string, role: RegExp): HeaderSignatory | null {
  // The role word must be followed by a colon — "主席：甲" is a header,
  // "主席感谢大家" is prose.
  const re = new RegExp(`${role.source}\\s*[:：]\\s*`, "i");
  const m = re.exec(line);
  if (!m) return null;
  const name = nameAfter(line.slice(m.index + m[0].length));
  if (!name) return null;
  return { name, role: m[1], line };
}

/**
 * The chair and the secretary a page names in a header line, if any —
 * first match of each across the lines, in order. Lines are the page's own
 * text (resolution lines and their snippets); nothing else is consulted.
 */
export function signatoriesFromLines(lines: readonly string[]): HeaderSignatories {
  const out: HeaderSignatories = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (!out.chair) {
      const c = find(line, CHAIR_ROLE);
      if (c) out.chair = c;
    }
    if (!out.secretary) {
      const s = find(line, SECRETARY_ROLE);
      if (s) out.secretary = s;
    }
    if (out.chair && out.secretary) break;
  }
  return out;
}
