import type { MeetingNotesExtraction } from "@/lib/extraction";
import { latinNameRuns, sourcesOf, usableResolutions, type MinutesPlan } from "@/lib/minutes-compose";

// ---------------------------------------------------------------------------
// 🔴🔴 RAISE A HAND, DO NOT MAKE ONE UP (work order 118 §3 — the soul of the
// session; J 2026-08-31 第 22 條: 歧義一律舉手，不准預設選一個).
//
// A committee note is written in shorthand, and some shorthand genuinely has
// two readings:
//
//   「lanti Ajk seorg. Tan Kim Loo」   appoint Tan Kim Loo as one committee
//                                      member — or ask Tan Kim Loo to find one?
//   「Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)」
//                                      Chan Mei takes over from Ooi Bee Huar —
//                                      or the other way round?
//
// A model asked to write fluent minutes picks one. On 2026-08-31 it picked
// wrong, twice, in a document that goes to the Registrar. The rule now: such
// a line is a QUESTION, asked in plain words with the readings spelled out
// as whole sentences, no reading pre-selected, at no cost (nothing is
// re-read); and until a person answers, the document carries the line
// EXACTLY AS WRITTEN — an honest shorthand beats a fluent guess.
//
// 🔴 WHY THIS IS CODE AND NOT A PROMPT. The acceptance is a FIXED input:
// items ③ and ④ of J's note (fictional names) must raise, ①②⑤ must not
// (「亂問一樣是病」). A rule that fires the same way on the same words every
// time can be tested; a model's opinion cannot. So the patterns here are
// deliberately few and narrow — two shorthand shapes that have actually
// misled the document — and a line that matches neither is simply not
// asked about. Pure: no AI, no I/O.
// ---------------------------------------------------------------------------

export type Reading = {
  /** The full sentence that replaces the line when this reading is chosen —
   *  in the paper's own language (BM here), so the document stays honest. */
  value: string;
  /** The reading in plain words, for the person choosing. */
  label: { bm: string; zh: string; en: string };
};

export type Ambiguity = {
  /** Index into usableResolutions(extraction). */
  index: number;
  kind: "appointment" | "replacement";
  /** The line, exactly as written. */
  quote: string;
  readings: Reading[];
};

const CJK_RUN = /[㐀-䶿一-鿿豈-﫿]{2,}/g;

/** The names in a line, in order of appearance — Latin name-shaped runs and
 *  Chinese runs of two or more characters. */
function namesIn(text: string): { name: string; at: number }[] {
  const found: { name: string; at: number }[] = [];
  for (const run of latinNameRuns(text)) {
    const at = text.indexOf(run);
    if (at !== -1) found.push({ name: run, at });
  }
  for (const m of text.matchAll(CJK_RUN)) {
    found.push({ name: m[0], at: m.index ?? 0 });
  }
  return found.sort((a, b) => a.at - b.at);
}

// --- shape 1: 「lanti Ajk seorg. <name>」 ------------------------------------

/** The shorthand as a pen (and a reader of a pen) actually spells it —
 *  "seorg.", "seong." (the real page), "seorang", "sorg". */
const APPOINT_SHORTHAND =
  /\b(lanti|lantik|melantik)\b[^\n]*?\b(seorg|seong|seorang|sorg|s\/org)\b\.?\s*(?:iaitu\s+)?/i;

/** The name right after the shorthand: up to four words of letters, a
 *  lowercase middle word allowed ("Tan kim Loo" is how the real page was
 *  read), stopping at a digit or punctuation; trailing Malay function words
 *  are not part of a name. */
const NAME_AFTER = /^\s*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})/;
const NOT_A_NAME_WORD = new Set([
  "sebagai", "untuk", "dan", "di", "ke", "pada", "yang", "bagi", "dengan",
  "ajk", "ahli", "jawatankuasa", "baru", "baharu", "iaitu", "mesyuarat",
  "agung", "pengerusi", "naib", "setiausaha", "bendahari", "akan", "datang",
]);

/** 寧缺勿濫: the run stops at the first word that is not a name's, must
 *  start with a capital, and must be at least two words — a single word or
 *  a genre phrase ("Ahli Jawatankuasa", "AJK baharu") is not a person. */
function nameAfter(after: string): { name: string; at: number } | null {
  const m = NAME_AFTER.exec(after);
  if (!m) return null;
  const words: string[] = [];
  for (const w of m[1].split(/\s+/)) {
    if (NOT_A_NAME_WORD.has(w.toLowerCase())) break;
    words.push(w);
  }
  if (words.length < 2 || !/^[A-Z]/.test(words[0])) return null;
  const name = words.join(" ");
  return { name, at: after.indexOf(name) };
}

function appointment(text: string): Ambiguity["readings"] | null {
  const m = APPOINT_SHORTHAND.exec(text);
  if (!m) return null;
  const after = text.slice(m.index + m[0].length);
  const who = namesIn(after)[0] ?? nameAfter(after);
  if (!who || who.at > 2) return null; // the name must follow the shorthand
  const prefix = text.slice(0, m.index);
  const rest = after.slice(who.at + who.name.length).replace(/^[\s.,;:]+/, "");
  const finish = (sentence: string) =>
    `${prefix}${sentence}${rest ? ` ${rest}` : ""}`;
  return [
    {
      value: finish(`Melantik ${who.name} sebagai seorang Ahli Jawatankuasa.`),
      label: {
        bm: `${who.name} dilantik sebagai seorang AJK`,
        zh: `委任 ${who.name} 为理事一名`,
        en: `Appoint ${who.name} as one committee member`,
      },
    },
    {
      value: finish(`${who.name} diminta mencari seorang Ahli Jawatankuasa.`),
      label: {
        bm: `${who.name} diminta mencari seorang AJK`,
        zh: `请 ${who.name} 去物色一名理事`,
        en: `Ask ${who.name} to find one committee member`,
      },
    },
  ];
}

// --- shape 2: 「A diganti B」 / 「A ganti - B」 ------------------------------

/** The shorthand forms. A form that carries its own direction —
 *  "menggantikan", "digantikan oleh", 接替/代替/取代 — is NOT ambiguous. */
const REPLACE_SHORTHAND = /\b(diganti|ganti|gantikan|digantikan)\b(?!\s+oleh\b)/i;
const REPLACE_EXPLICIT = /(menggantikan|digantikan\s+oleh|mengganti\b|接替|代替|取代|顶替|頂替)/i;

function replacement(text: string): Ambiguity["readings"] | null {
  if (REPLACE_EXPLICIT.test(text)) return null;
  const m = REPLACE_SHORTHAND.exec(text);
  if (!m) return null;
  const names = namesIn(text);
  if (names.length !== 2) return null;
  const [a, b] = names;
  const cut = Math.min(m.index, a.at);
  const prefix = text.slice(0, cut).replace(/[\s:：\-–—]+$/, "");
  const finish = (sentence: string) => (prefix ? `${prefix} ${sentence}` : sentence);
  const pair = (x: string, y: string): Reading => ({
    value: finish(`${x} menggantikan ${y}.`),
    label: {
      bm: `${x} menggantikan ${y}`,
      zh: `${x} 接替 ${y}`,
      en: `${x} takes over from ${y}`,
    },
  });
  return [pair(a.name, b.name), pair(b.name, a.name)];
}

/** Every line among `texts` that has two readings, with both spelled out. */
export function findAmbiguities(texts: readonly string[]): Ambiguity[] {
  const out: Ambiguity[] = [];
  texts.forEach((text, index) => {
    const app = appointment(text);
    if (app) {
      out.push({ index, kind: "appointment", quote: text, readings: app });
      return;
    }
    const rep = replacement(text);
    if (rep) out.push({ index, kind: "replacement", quote: text, readings: rep });
  });
  return out;
}

/**
 * The open questions of an extraction: each ambiguous usable line that a
 * person has neither rewritten nor marked "keep as written". Carries both
 * numberings — the document's (usable) and the review page's (extraction).
 */
export function openAmbiguities(extraction: MeetingNotesExtraction): {
  ambiguity: Ambiguity;
  extractionIndex: number;
}[] {
  const usable: number[] = [];
  extraction.resolutions.forEach((r, i) => {
    if (r.text.confidence !== "missing" && r.text.value !== "") usable.push(i);
  });
  const texts = usable.map((i) => extraction.resolutions[i].text.value);
  return findAmbiguities(texts)
    .filter((a) => extraction.resolutions[usable[a.index]].as_written !== true)
    .map((a) => ({ ambiguity: a, extractionIndex: usable[a.index] }));
}

/** Indices (into usableResolutions) the document must carry AS WRITTEN —
 *  open questions and lines a person chose to keep as written alike. */
export function verbatimIndices(extraction: MeetingNotesExtraction): number[] {
  const rows = usableResolutions(extraction);
  const open = new Set(openAmbiguities(extraction).map((o) => o.ambiguity.index));
  rows.forEach((r, i) => {
    if (r.as_written === true) open.add(i);
  });
  return [...open].sort((a, b) => a - b);
}

/**
 * 🔴 UNTIL A PERSON CHOOSES, THE LINE IS THE LINE. Any plan item covering a
 * verbatim index has its text replaced by the original words (a merged item
 * falls back to all of its lines, so nothing is lost by refusing the
 * model's sentence) and loses its label. The prompt is told the same; this
 * is what makes it true regardless.
 */
export function verbatimForAmbiguous(
  plan: MinutesPlan,
  sourceTexts: readonly string[],
  indices: readonly number[],
): MinutesPlan {
  if (indices.length === 0) return plan;
  const locked = new Set(indices);
  const convert = <T extends { source: number | number[]; text: string }>(item: T): T => {
    const sources = sourcesOf(item);
    if (!sources.some((i) => locked.has(i))) return item;
    const { kind: _dropped, ...rest } = item as T & { kind?: unknown };
    void _dropped;
    return {
      ...rest,
      text: sources.map((i) => sourceTexts[i] ?? "").filter(Boolean).join("\n"),
    } as T;
  };
  return {
    sections: plan.sections.map((s) => ({ heading: s.heading, items: s.items.map(convert) })),
    unresolved: plan.unresolved.map(convert),
  };
}
