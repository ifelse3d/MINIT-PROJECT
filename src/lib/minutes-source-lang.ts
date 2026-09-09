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
// Chinese page lists none in Latin. Anything that is not Chinese reads as BM
// (the default every preview has always had): Malay and English cannot be
// told apart cheaply, and English pages have never been a complaint.
// ---------------------------------------------------------------------------

import type { MeetingNotesExtraction } from "@/lib/extraction";
import type { MinutesLang } from "@/lib/minutes-lang";

const CJK = /[㐀-䶿一-鿿]/g;
const LATIN = /[A-Za-z]/g;

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

/**
 * "zh" when the page's prose is mostly Chinese, "bm" otherwise. An empty
 * page (nothing read yet) is "bm" — the preview's historical default.
 */
export function sourceLanguageOf(e: MeetingNotesExtraction): MinutesLang {
  const text = proseOf(e).join("\n");
  const cjk = count(CJK, text);
  if (cjk === 0) return "bm";
  return cjk > count(LATIN, text) ? "zh" : "bm";
}
