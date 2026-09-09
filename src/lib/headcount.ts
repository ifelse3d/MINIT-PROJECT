// ---------------------------------------------------------------------------
// THE HEADCOUNT LINE, COUNTED BY CODE (work order 125 §2 — J 2026-09-07 on
// the live site; 8/31 real-paper finding §2).
//
// J's AGM page says, in one line: 「理事12人,请假2人(甲,乙),会员40人」. The
// reader copied that line correctly, twice. Nothing turned it into a number:
// the attendance step saw an empty name list and made J type one name to get
// past it, and the document then said "Jumlah hadir: 1 orang" — a figure that
// goes into the eROSES annual return. On 8/31 the reader had also listed the
// two people on leave as the ONLY two attendees.
//
// The fix is arithmetic, not a prompt: this module reads a headcount line of
// a few FIXED shapes and returns the numbers, with the people on leave counted
// OUT and their names kept aside. It recognises only what it can test — a
// line of another shape returns null, and the attendance step then asks a
// person (the third ask-back shape, src/lib/minutes-ambiguity.ts) instead of
// guessing. The AI never counts (Hard Rule 2); a person confirms the number
// before it reaches any document (Hard Rule 1).
//
// Pure: no AI, no I/O. Fixed-input tested (headcount.test.ts).
// ---------------------------------------------------------------------------

export type HeadcountPart = { label: string; n: number };

export type Headcount = {
  /** People counted as present — the sum of every non-leave part. */
  present: number;
  /** People on leave / absent — never part of `present`. */
  apologies: number;
  /**
   * 134 (J 9/9, live site): whether the page SAID those people were excused
   * (请假 / apologies / dengan maaf) or merely absent (缺席 / tidak hadir /
   * absent). The document used to print "(DENGAN MAAF)" for both — an
   * apology the paper never recorded. True only on the page's own word.
   */
  excused: boolean;
  /** The names written in brackets after a leave/absent count. */
  names: string[];
  /** The counted groups, in the line's order (理事 12, 会员 40). */
  parts: HeadcountPart[];
};

/** Words that say the absence was EXCUSED — leave taken, apologies sent. */
const EXCUSED = /(请假|請假|告假|apolog|excused|leave|maaf|cuti)/i;

/** Words that mark a count as NOT present — on leave, absent, excused. */
const ABSENT =
  /(请假|請假|告假|缺席|未出席|没有出席|沒有出席|没来|沒來|tidak hadir|tidak dapat hadir|apolog|absent|excused|leave|maaf|cuti)/i;

/** A unit after the number: 人 / 位 / 名, orang / org, members, persons… */
const UNIT = /(人|位|名|\borang\b|\borg\b|\bmembers?\b|\bpersons?\b|\bpeople\b|\bpax\b)/i;

/** A label a headcount segment may carry INSTEAD of a unit ("Present: 33"). */
const HEADCOUNT_WORD =
  /(出席|人数|人數|hadir|kehadiran|present|attend|理事|会员|會員|\bahli\b|\bajk\b|请假|請假|缺席|apolog|absent)/i;

/** Lead-ins that are the LINE's label, not a group's ("出席人数：理事12人"). */
const LEAD_IN = /^(出席人数|出席人數|出席|kehadiran|hadir|present|attendance)\s*[:：]\s*/i;

/** A number glued to another by . : / is a time or a date, never a count. */
const TIME_OR_DATE = /\d[.:/]\d/;

/** Bracketed groups — (甲,乙) or （甲、乙） — in the line, left to right. */
const BRACKETS = /[（(]([^()（）]*)[)）]/g;

/** How names inside a bracket are separated. */
const NAME_SEP = /\s*(?:[,，、;；/]|\bdan\b|\band\b|&)\s*/i;

const CJK_OR_LETTER = /[A-Za-zÀ-ɏ㐀-䶿一-鿿豈-﫿]/;

/**
 * Read a headcount line. Recognised shapes (each fixed-input tested):
 *
 *   中文   「理事12人,请假2人(甲,乙),会员40人」  「出席人数：52人」
 *   BM     「AJK yang hadir : 33 orang」
 *          「Hadir: 12 orang AJK, 40 orang ahli; tidak hadir: 2 orang (A, B)」
 *   EN     「33 members present, 2 apologies (A, B)」  「Present: 33」
 *
 * Returns null when no segment reads as a count of people present — the
 * shape is not one this code knows, and the honest answer is to ask.
 */
export function parseHeadcount(line: string): Headcount | null {
  const brackets: string[] = [];
  const marked = line.replace(BRACKETS, (_m, inner: string) => {
    brackets.push(inner);
    return `${brackets.length - 1}`;
  });

  const parts: HeadcountPart[] = [];
  const names: string[] = [];
  let apologies = 0;
  let excused = false;

  for (const rawSeg of marked.split(/[,，;；、]/)) {
    const seg = rawSeg.trim();
    if (seg === "") continue;
    const bracketIds = [...seg.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    const text = seg.replace(/\d+/g, " ").trim();
    if (TIME_OR_DATE.test(text)) continue;
    const num = /(\d{1,4})/.exec(text);
    if (!num) continue;
    const n = Number(num[1]);
    const hasUnit = UNIT.test(text);
    if (!hasUnit && !HEADCOUNT_WORD.test(text)) continue;

    const absent = ABSENT.test(text);
    if (absent) {
      apologies += n;
      if (EXCUSED.test(text)) excused = true;
      for (const id of bracketIds) {
        for (const name of brackets[id].split(NAME_SEP)) {
          const t = name.trim();
          if (t !== "" && CJK_OR_LETTER.test(t) && !names.includes(t)) names.push(t);
        }
      }
      continue;
    }

    // The group's label: the words before the number when there are any
    // (理事12人 → 理事), otherwise the words after it minus the unit
    // (12 orang AJK → AJK, 33 members present → present).
    const before = text.slice(0, num.index).replace(LEAD_IN, "").replace(/[:：\s]+$/, "").trim();
    const after = text
      .slice((num.index ?? 0) + num[0].length)
      .replace(UNIT, " ")
      .replace(/^[\s:：]+|[\s:：.]+$/g, "")
      .trim();
    const label = CJK_OR_LETTER.test(before) ? before : after;
    parts.push({ label, n });
  }

  if (parts.length === 0) return null;
  return {
    present: parts.reduce((sum, p) => sum + p.n, 0),
    apologies,
    excused,
    names,
    parts,
  };
}

/**
 * 127 (J 9/8, live site): the BM document used to print the page's headcount
 * line AS WRITTEN — 「出席:理事12人,请假2人(甲,乙),会员40人」 — and the guard
 * then asked a person to deal with the leftover 人. When the line parses,
 * the document prints the SAME numbers in Bahasa Malaysia, built by code
 * from the parsed parts: "12 orang Ahli Jawatankuasa, 40 orang ahli; tidak
 * hadir dengan maaf: 2 orang". `labelBm` turns a group's Chinese label into
 * BM (the glossary); a label it does not know stays as written, for the
 * guard. Names in the brackets are printed only when the caller has no
 * separate list for them — never dropped, never transliterated.
 * A line with no Chinese in it is left to print as written (null).
 */
export function headcountLineBm(
  line: string,
  labelBm: (zh: string) => string,
  opts: { includeNames?: boolean } = {},
): string | null {
  if (!/[㐀-䶿一-鿿]/.test(line)) return null;
  const hc = parseHeadcount(line);
  if (!hc) return null;
  const groups = hc.parts.map((p) => {
    const label = p.label.trim() === "" ? "" : labelBm(p.label).trim();
    return label === "" ? `${p.n} orang` : `${p.n} orang ${label}`;
  });
  let out = groups.join(", ");
  if (hc.apologies > 0) {
    // 134: "dengan maaf" only when the page itself said the absence was
    // excused; a plain 缺席 prints as plain "tidak hadir".
    out += hc.excused
      ? `; tidak hadir dengan maaf: ${hc.apologies} orang`
      : `; tidak hadir: ${hc.apologies} orang`;
    if (opts.includeNames && hc.names.length > 0) out += ` (${hc.names.join(", ")})`;
  }
  return out;
}

/**
 * 134 (J 9/9, live site): did the page say the people who were not there
 * were EXCUSED? The paper wrote 「缺席」 (absent) and the document printed
 * "TIDAK HADIR (DENGAN MAAF)" — an apology nobody recorded. The heading now
 * follows the page's own word: excused only when the headcount line or the
 * source snippet of an on-leave name carries a leave/apology word (请假,
 * apologies, dengan maaf, cuti…). No evidence = plain "TIDAK HADIR".
 *
 * Structural parameter on purpose — the extraction module imports this file,
 * so this file must not import the extraction type at runtime.
 */
export function absenceIsExcused(e: {
  attendance_count?: { value: string; confidence: string } | null;
  apologies?:
    | {
        name: {
          value: string;
          source_ref?: { location?: string | null; snippet?: string | null } | null;
        };
      }[]
    | null;
}): boolean {
  const line = e.attendance_count;
  if (line && line.confidence !== "missing" && EXCUSED.test(line.value)) return true;
  for (const a of e.apologies ?? []) {
    const ref = a.name.source_ref;
    if (!ref) continue;
    if (EXCUSED.test(ref.snippet ?? "") || EXCUSED.test(ref.location ?? "")) return true;
  }
  return false;
}
