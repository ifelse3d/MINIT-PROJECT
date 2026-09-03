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

// ---------------------------------------------------------------------------
// Third pass (116 §2, J 8/31): a glossary cannot decide what is a name.
// The second pass treated "not in the table" as "must be a name", so J was
// asked for the identity-card spelling of 上届, 原, 没变, 点开始 and
// 感谢大家去年帮忙 — a clause, not a person. Chinese prose cannot be
// enumerated; Chinese SURNAMES can. So the question is turned round: instead
// of asking what is ordinary, ask what looks like a person.
//
// A Malaysian Chinese personal name is two to four characters opening with one
// of a closed set of surnames. 张伟杰, 王丽华, 刘国华, 林志强 pass; 上届,
// 没变, 点开始 fail on the surname; 感谢大家去年帮忙 fails on length.
// A miss sends the run to the BM rewrite, which is itself forbidden from
// translating names (draft-minutes.ts) — so a missed name is not a lost name.
// ---------------------------------------------------------------------------

/** Surnames common among Malaysian Chinese. */
const SURNAMES = new Set(
  (
    "陈林黄李王张吴刘蔡杨许郑谢洪郭曾廖赖徐周叶苏何高罗萧潘朱简钟游詹邱余卢梁" +
    "宋邓杜傅程汤马沈石魏温江侯柯彭田韩尤白姚方翁孔严董袁邹熊唐冯于薛雷贺倪" +
    "汪任姜范谭金陆郝崔康毛秦史顾邵孟龙万段钱尹黎易常武乔赵龚文庄戴巫官辜纪童" +
    "陳林黃張劉蔡楊許鄭謝郭曾廖賴徐葉蘇羅蕭鍾詹盧梁鄧傅湯馬瀋魏溫江侯柯彭韓"
  ).split(""),
);

const COMPOUND_SURNAMES = ["欧阳", "歐陽", "司徒", "诸葛", "諸葛", "尉迟", "尉遲"];

/**
 * Does this run of Chinese read as a person's name rather than ordinary words?
 * Two to four characters, opening on a surname.
 */
export function looksLikeChineseName(run: string): boolean {
  const s = run.trim();
  if (s.length < 2 || s.length > 4) return false;
  if (s.length >= 3 && COMPOUND_SURNAMES.includes(s.slice(0, 2))) return true;
  return SURNAMES.has(s[0]);
}

export type FlaggedSplit = {
  /** Lines whose Chinese the glossary covers completely — the button's job. */
  termOnly: string[];
  /** Lines that still hold Chinese after the glossary has run. */
  linesNeedingNames: string[];
  /**
   * The Chinese runs that read as PEOPLE — one row each in the mapping table.
   * Keyed on the RUN, not the line: the table used to key on the whole line,
   * so typing an IC name against
   * "…dicadangkan oleh 张伟杰 dan disokong oleh 王丽华." replaced THE WHOLE
   * SENTENCE with that name. Per run, the sentence survives, only the name is
   * swapped, and the roster pre-fill starts matching — it never could match a
   * roster name against a whole line.
   */
  nameTokens: string[];
  /**
   * The Chinese runs that read as ORDINARY TEXT. Nobody should be asked for
   * the identity-card spelling of a clause, so these are listed for the reader
   * to see but never given an input — they are the BM rewrite's job.
   */
  proseTokens: string[];
};

/**
 * Split what the BM guard flagged into three: lines the glossary finishes,
 * names only a person can spell, and ordinary text the BM rewrite handles.
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
  const proseTokens: string[] = [];
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
      (looksLikeChineseName(r) ? nameTokens : proseTokens).push(r);
    }
  }
  return { termOnly, linesNeedingNames, nameTokens, proseTokens };
}
