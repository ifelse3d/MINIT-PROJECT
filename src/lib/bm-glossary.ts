// ---------------------------------------------------------------------------
// §2 (work order 116, J 8/31): the BM guard flagged NINE lines of J's AGM
// minutes — 助学金, 上年结存, 收入, 乐捐, 晚宴, 支出, 礼堂, 银行, 散会 — and
// asked a human to type the Malay for every one of them. Not one was a name.
// They are ordinary society and book-keeping vocabulary with settled Malay
// equivalents, and making somebody hand-type nine of them is exactly the form
// this product exists to remove.
//
// WHY THIS IS CODE AND NOT AI (same reasoning as roster-names.ts): a fixed
// table is free, exact and invents nothing. It also CANNOT touch a personal
// name — a name is not in the table, so it is never matched, never
// transliterated, and stays flagged for a human to supply the IC spelling.
// That is the property that matters: the failure mode of a wrong Malay word
// for "bank" is a typo; the failure mode of a transliterated person's name is
// a false government filing.
// ---------------------------------------------------------------------------

import type { NameSubstitution } from "./roster-names";

/**
 * Chinese → Bahasa Malaysia for the vocabulary a Malaysian society's minutes
 * and accounts actually use. Terms only — never a person's name, never a
 * place name, never an organisation's registered name.
 */
export const BM_GLOSSARY: readonly (readonly [string, string])[] = [
  // Meetings
  ["常年大会", "Mesyuarat Agung Tahunan"],
  ["特别大会", "Mesyuarat Agung Khas"],
  ["理事会议", "Mesyuarat Jawatankuasa"],
  ["会议记录", "minit mesyuarat"],
  ["会议室", "Bilik Mesyuarat"],
  ["上届会议", "mesyuarat lalu"],
  ["会议", "mesyuarat"],
  // Positions
  ["副主席", "Naib Pengerusi"],
  ["主席致词", "Ucapan Pengerusi"],
  ["主席", "Pengerusi"],
  ["副秘书", "Penolong Setiausaha"],
  ["秘书报告", "Laporan Setiausaha"],
  ["秘书", "Setiausaha"],
  ["副财政", "Penolong Bendahari"],
  ["财政报告", "Laporan Bendahari"],
  ["财政", "Bendahari"],
  ["查账员", "Juruaudit"],
  ["理事", "Ahli Jawatankuasa"],
  ["会员", "ahli"],
  ["学生", "pelajar"],
  // Attendance
  ["出席", "Hadir"],
  ["请假", "Tidak hadir dengan maaf"],
  ["记录", "Dicatat oleh"],
  // Headings
  ["日期", "Tarikh"],
  ["时间", "Masa"],
  ["地点", "Tempat"],
  ["其他", "Hal-hal lain"],
  ["散会", "Bersurai"],
  // Money
  ["上年结存", "Baki tahun lepas"],
  ["结存", "Baki"],
  ["收入", "Pendapatan"],
  ["支出", "Perbelanjaan"],
  ["银行", "Bank"],
  ["会费", "Yuran ahli"],
  ["乐捐", "Derma"],
  ["筹款", "kutipan derma"],
  ["助学金", "Biasiswa"],
  ["慈善晚宴", "Jamuan amal"],
  ["晚宴", "Jamuan malam"],
  ["晚餐", "Jamuan malam"],
  ["礼堂", "Dewan"],
  // Motions
  ["动议", "Usul"],
  ["附议", "Disokong oleh"],
  ["通过", "Diluluskan"],
  ["没有", "Tiada"],
];

function occurrences(text: string, needle: string): number {
  if (needle === "") return 0;
  return text.split(needle).length - 1;
}

/**
 * Which glossary terms appear in `text`, longest first so 上年结存 is matched
 * before 结存 can shadow it, and 慈善晚宴 before 晚宴.
 *
 * `protectedText` holds anything that must never be treated as vocabulary —
 * the roster's Chinese names, the organisation's registered name, the
 * signer's name. Those are blanked out BEFORE matching, so a term that
 * happens to sit inside a person's name can never claim it.
 */
export function glossaryTermSubstitutions(
  text: string,
  protectedText: readonly string[] = [],
): NameSubstitution[] {
  let remaining = text;
  for (const p of protectedText) {
    const t = p.trim();
    if (t !== "") remaining = remaining.split(t).join(" ");
  }
  const out: NameSubstitution[] = [];
  const terms = [...BM_GLOSSARY].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of terms) {
    const count = occurrences(remaining, from);
    if (count === 0) continue;
    out.push({ from, to, count });
    // Claim the characters so a shorter term cannot also match a fragment.
    remaining = remaining.split(from).join(" ");
  }
  return out;
}

/** A CJK run — the unit a human actually supplies a spelling for. */
const CJK_RUN = /[㐀-䶿一-鿿]+/g;

export type FlaggedSplit = {
  /** Lines whose Chinese the glossary covers completely — the button's job. */
  termOnly: string[];
  /** Lines that still hold Chinese the glossary does not know. */
  linesNeedingNames: string[];
  /**
   * The distinct Chinese runs still standing in those lines — one row each in
   * the mapping table. §2 (work order 116, second pass): the table used to key
   * on the whole LINE, so typing an IC name against
   * "…dicadangkan oleh 叶俊成 dan disokong oleh 何淑仪." replaced THE WHOLE
   * SENTENCE with that name. Keyed on the run, the sentence survives and only
   * the name is swapped — and the roster pre-fill starts matching, which it
   * never could against a whole line.
   */
  nameTokens: string[];
};

/**
 * Split what the BM guard flagged into "the glossary can finish this line" and
 * "a human must spell this out". Conservative on purpose: a line keeps its
 * human row unless EVERY Chinese run in it is gone once the glossary has run.
 */
export function splitFlaggedLines(
  lines: readonly string[],
  termSubs: readonly NameSubstitution[],
  protectedText: readonly string[] = [],
): FlaggedSplit {
  const terms = [...termSubs].sort((a, b) => b.from.length - a.from.length);
  const termOnly: string[] = [];
  const linesNeedingNames: string[] = [];
  const nameTokens: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    let after = line;
    for (const t of terms) after = after.split(t.from).join(" ");
    for (const p of protectedText) {
      const trimmed = p.trim();
      if (trimmed !== "") after = after.split(trimmed).join(" ");
    }
    const runs = after.match(CJK_RUN) ?? [];
    if (runs.length === 0) {
      termOnly.push(line);
      continue;
    }
    linesNeedingNames.push(line);
    for (const r of runs) {
      if (seen.has(r)) continue;
      seen.add(r);
      nameTokens.push(r);
    }
  }
  return { termOnly, linesNeedingNames, nameTokens };
}
