// ---------------------------------------------------------------------------
// WHICH LANGUAGE THE PAGE WAS WRITTEN IN (134, J 9/9 afternoon, live site).
//
// The free preview under the review form used to print the confirmed strings
// under BM headings whatever language the paper was in — a Chinese AGM page
// came out as "Kehadiran: …" over 「主席致词」, half one language, half the
// other, and then the finished document a step later was all BM. J: 「一半華語
// 一半馬來語很奇怪」. The preview is the person's check AGAINST THE PAPER, so it
// now reads in the paper's own language; the filing copy (step 3) stays in the
// document language the person chose.
//
// Pure, zero AI: count the characters. Chinese prose is CJK; Malay and English
// are Latin. A page with more CJK than Latin letters in its prose is Chinese.
// Names are deliberately NOT counted — a BM page lists Chinese names, and a
// Chinese page lists none in Latin.
// ---------------------------------------------------------------------------

import type { MeetingNotesExtraction } from "@/lib/extraction";
import type { MinutesLang } from "@/lib/minutes-lang";

const CJK = /[㐀-䶿一-鿿]/g;
const LATIN = /[A-Za-z]/g;

/**
 * 135 (J 9/9: 「用英文的會議報告也是 OK 的對不」): Latin prose is Malay or
 * English. The two share an alphabet, so the tell is the little words —
 * "the / and / was / of" against "dan / yang / pada / untuk". Whichever
 * side has more of them wins; a tie or too few words stays BM (the default).
 */
const ENGLISH_WORDS =
  /\b(the|and|was|were|of|to|is|are|be|that|this|for|with|by|on|at|meeting|members|report|will|has|have|from|it|as|not|all)\b/gi;
const MALAY_WORDS =
  /\b(dan|yang|untuk|pada|dengan|telah|adalah|oleh|kepada|tidak|akan|ini|itu|dalam|ahli|mesyuarat|wang|derma|bagi|daripada|semua|juga|sebanyak|diadakan|ditangguhkan)\b/gi;

function count(re: RegExp, text: string): number {
  return (text.match(re) ?? []).length;
}

/** The prose of the page — what a person wrote, not who was there. */
function proseOf(e: MeetingNotesExtraction): string[] {
  const present = (f?: { value: string; confidence: string }) =>
    f && f.confidence !== "missing" ? f.value : "";
  return [
    ...e.resolutions.map((r) => present(r.text)),
    present(e.meeting_venue),
    present(e.adjournment),
    present(e.attendance_count),
    ...e.figures.map((f) => present(f.description)),
    ...e.office_bearers.map((b) => present(b.position)),
  ];
}

function latinLanguage(text: string): MinutesLang {
  const english = count(ENGLISH_WORDS, text);
  const malay = count(MALAY_WORDS, text);
  return english >= 3 && english > malay ? "en" : "bm";
}

/**
 * "zh" when the page's prose is mostly Chinese; "en" when it is Latin prose
 * with clearly more English than Malay function words; "bm" otherwise. An
 * empty page (nothing read yet) is "bm" — the preview's historical default.
 */
export function sourceLanguageOf(e: MeetingNotesExtraction): MinutesLang {
  const text = proseOf(e).join("\n");
  const cjk = count(CJK, text);
  if (cjk > 0 && cjk > count(LATIN, text)) return "zh";
  return latinLanguage(text);
}
