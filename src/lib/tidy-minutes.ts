// ---------------------------------------------------------------------------
// THE TIDY PASS, DETERMINISTIC HALF (work order 105 §2). Pure logic, no I/O,
// unit tested.
//
// The model arranges; everything that can be CHECKED BY COUNTING is checked
// here, and an item that fails a check is replaced by its own verbatim text.
// Same split as step 3 (src/lib/minutes-compose.ts), for the same reason: on
// 2026-08-19 a model asked to organise seventeen items quietly returned
// sixteen, and nothing in its output said so.
//
// 🔴 WHAT MAKES THE LOCKED LIST SAFE IS THE SHAPE, NOT THE PROMPT. The tidy
// pass is only ever handed the RESOLUTION LINES. Amounts in `figures`, the
// attendance list, the office bearers, the meeting's date, venue and time,
// the financial resolutions — none of them are in its input, so none of them
// can come back changed. They are carried into the reading copy from the
// verbatim layer untouched, by construction. The checks below then guard the
// one field the model does touch:
//
//   * checkCoverage    — every line placed exactly once (nothing vanishes)
//   * checkLatinNamesWhole — every name-shaped Latin run of a source survives
//                        ON ITS OWN WORD BOUNDARIES ("Tan Kim Looi" is not
//                        "Tan Kim Loo")
//   * checkKeptFacts   — every Chinese run (≥2 chars) and every number of a
//                        source survives into the paragraph it became
//   * checkNumbers     — and no number appears that no source had
//   * polarity         — approved stays approved, deferred stays deferred
//
// 🔴 WHY NOT checkNames(). That check asks "where did this Chinese come
// from?" and can only mean anything when the OUTPUT is not Chinese — its own
// header says so, and says why: in a Chinese document the page is full of
// Chinese the note never contained, and on 2026-08-19 a near-miss rule
// flagged a correct rewording as readily as a corrupted label. This pass
// keeps every line in ITS OWN language, so its Chinese output is exactly the
// case that check refuses to judge. What IS safe in every language is the
// other direction — a fact the source had must still be there — and that is
// checkKeptFacts below. The limitation is stated on screen (the verbatim line
// is one tap from every paragraph) rather than papered over.
//
// A failure is never fatal and never silent: the item falls back to its
// verbatim wording and the fallback is counted, so the page can say plainly
// that some lines are shown exactly as they were written.
//
// 🔴 THE VERBATIM LAYER IS THE ONLY ARCHIVAL TRUTH. Nothing here writes back
// into the extraction. eROSES, the download and the confirm flow read the
// verbatim layer and only the verbatim layer; this module produces a READING
// COPY that always points home (`source`).
// ---------------------------------------------------------------------------

import type { MeetingNotesExtraction } from "@/lib/extraction";
import {
  checkCoverage,
  latinNameRuns,
  minutesPlanSchema,
  sourcesOf,
  usableResolutions,
  type MinutesPlan,
} from "@/lib/minutes-compose";

export { minutesPlanSchema as tidyPlanSchema };
export type TidyPlan = MinutesPlan;

/** One finished paragraph of the reading copy, and the way home. */
export type TidyItem = {
  text: string;
  /** Indices into usableResolutions(extraction) — the verbatim lines this
   *  paragraph was made from. Never empty. */
  source: number[];
  /** True when the model's wording was refused and the verbatim line is
   *  shown instead. The page says so; it is not a silent substitution. */
  verbatimFallback: boolean;
};

export type TidySection = {
  heading: string;
  items: TidyItem[];
};

export type TidyDocument = {
  sections: TidySection[];
  /** Items the meeting left open, or that the model could not place. */
  unresolved: TidyItem[];
  /** How many paragraphs are shown in their original wording after a check
   *  refused the model's. 0 is the normal answer. */
  fallbacks: number;
  /** How many verbatim lines were folded into a shorter list (§2-2 #2). */
  merged: number;
};

export function parseTidyPlan(raw: unknown) {
  return minutesPlanSchema.safeParse(raw);
}

/** The lines the tidy pass is given, and the numbering EVERYTHING uses. */
export function tidySourceItems(extraction: MeetingNotesExtraction): {
  index: number;
  text: string;
  sectionNo?: string;
  sectionTitle?: string;
}[] {
  return usableResolutions(extraction).map((r, index) => ({
    index,
    text: r.text.value,
    sectionNo: r.section_no,
    sectionTitle: r.section_title,
  }));
}

// --- the two checks this module adds -----------------------------------------

const DIGIT_RUN = /\d+(?:[.,:/-]\d+)*/g;
/** A printed enumerator ("3.", "2.1 ", "12)") is typography, not a fact — the
 *  tidy pass is allowed to drop it, and allowed to keep it. */
const LEADING_ENUM = /^\s*\d{1,3}(?:\.\d{1,3})*\s*[.、．)]?\s*/;

function numbersOf(text: string): string[] {
  return (text.replace(LEADING_ENUM, "").match(DIGIT_RUN) ?? []).map((n) =>
    n.replace(/[,\s]/g, ""),
  );
}

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]{2,}/g;

/**
 * 🔴 NOTHING THE PAPER SAID MAY DISAPPEAR INTO A NICER SENTENCE. Every
 * Chinese run of two or more characters and every number in a source line
 * must still be in the paragraph that line became.
 *
 * This is checkMergedFacts' rule applied to EVERY item, not only merged
 * ones — deliberately, because the licence here is narrower than step 3's.
 * Step 3 is allowed to re-word one item into another language, so it leaves
 * single-source items to the model's judgement. This pass may only FINISH A
 * SENTENCE in the line's own language, and a finished sentence that has lost
 * a name or an amount was not finished, it was rewritten.
 *
 * Single characters (位, 个, 人) are not demanded, same as step 3: they are
 * measure words a sentence legitimately absorbs, and every name and label
 * that identifies an item is at least two characters.
 */
export function checkKeptFacts(
  item: { source: number | number[]; text: string },
  sourceTexts: readonly string[],
): boolean {
  for (const idx of sourcesOf(item)) {
    const src = sourceTexts[idx];
    if (src === undefined) continue;
    const stripped = src.replace(LEADING_ENUM, "");
    const runs = [
      ...(stripped.match(CJK_RUN) ?? []),
      ...(stripped.match(DIGIT_RUN) ?? []),
    ];
    if (runs.some((run) => !item.text.includes(run))) return false;
  }
  return true;
}

/**
 * 🔴 A NUMBER IS NEVER THE MODEL'S TO WRITE. Every number in a tidied
 * paragraph must already be in one of the lines it came from, and every
 * number those lines carried must still be there. Money, dates, times, IC
 * numbers and receipt numbers are all digits, so one rule covers the numeric
 * half of the locked list — and it covers it by counting, which cannot be
 * talked out of it.
 */
export function checkNumbers(
  item: { source: number | number[]; text: string },
  sourceTexts: readonly string[],
): boolean {
  const sources = sourcesOf(item)
    .map((i) => sourceTexts[i])
    .filter((s): s is string => s !== undefined);
  if (sources.length === 0) return true;
  const have = new Set(sources.flatMap(numbersOf));
  const want = numbersOf(item.text);
  // Nothing invented…
  for (const n of want) if (!have.has(n)) return false;
  // …and nothing dropped.
  const got = new Set(want);
  for (const n of have) if (!got.has(n)) return false;
  return true;
}

/**
 * 🔴 A NAME MUST SURVIVE WHOLE, NOT AS A PREFIX. checkLatinNames() asks
 * whether the run appears in the sentence at all, which is right for step 3
 * and NOT ENOUGH here: "Tan Kim Loo" is a substring of "Tan Kim Looi", so a
 * name with one letter added passes a plain containment test while naming a
 * different person. This pass may only finish a sentence, so it can afford
 * the stricter rule — the run must stand on its own word boundaries.
 *
 * Latin only. Chinese has no word boundaries and legitimately absorbs a run
 * into a longer one ("小小班" inside "小小班主持由…"), so demanding a boundary
 * there would refuse correct sentences; the Chinese side is guarded by
 * checkKeptFacts' containment rule and by the verbatim line being one tap
 * away on the page.
 */
export function checkLatinNamesWhole(
  item: { source: number | number[]; text: string },
  sourceTexts: readonly string[],
): boolean {
  for (const idx of sourcesOf(item)) {
    const src = sourceTexts[idx];
    if (src === undefined) continue;
    for (const run of latinNameRuns(src)) {
      let at = item.text.indexOf(run);
      let whole = false;
      while (at !== -1) {
        const before = at === 0 ? "" : item.text[at - 1];
        const after = item.text[at + run.length] ?? "";
        if (!/[A-Za-z]/.test(before) && !/[A-Za-z]/.test(after)) {
          whole = true;
          break;
        }
        at = item.text.indexOf(run, at + 1);
      }
      if (!whole) return false;
    }
  }
  return true;
}

/**
 * The three states a decision can be in, as the paper says them. Malay,
 * Chinese and English, because one meeting's notes carry all three.
 */
const POLARITY: { key: "approved" | "rejected" | "deferred"; words: string[] }[] = [
  {
    key: "rejected",
    words: [
      "tidak diluluskan", "tidak lulus", "ditolak", "tidak bersetuju",
      "不通过", "不通過", "否决", "否決", "不批准", "不同意",
      "rejected", "not approved", "turned down",
    ],
  },
  {
    key: "deferred",
    words: [
      "ditangguhkan", "ditunda", "tangguh",
      "延后", "延後", "押后", "押後", "展期", "下次再", "留待",
      "deferred", "postponed", "held over",
    ],
  },
  {
    key: "approved",
    words: [
      "diluluskan", "lulus", "bersetuju", "dipersetujui", "sebulat suara",
      "通过", "通過", "批准", "同意", "议决", "議決",
      "approved", "agreed", "passed", "carried",
    ],
  },
];

function polarityOf(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const p of POLARITY) {
    if (p.words.some((w) => lower.includes(w))) found.add(p.key);
  }
  // "tidak diluluskan" contains "diluluskan"; the negative reading wins.
  if (found.has("rejected")) found.delete("approved");
  return found;
}

/**
 * 🔴 THE SUBSTANCE OF A DECISION IS LOCKED. A paragraph may not say a meeting
 * approved something its own line did not say was approved, and may not drop
 * a rejection or a deferral its line recorded. This is the half of the locked
 * list that has no digits in it, and it is the half that decides what a
 * society is committed to.
 */
export function checkDecisionPolarity(
  item: { source: number | number[]; text: string },
  sourceTexts: readonly string[],
): boolean {
  const sources = sourcesOf(item)
    .map((i) => sourceTexts[i])
    .filter((s): s is string => s !== undefined);
  if (sources.length === 0) return true;
  const have = new Set(sources.flatMap((s) => [...polarityOf(s)]));
  const want = polarityOf(item.text);
  for (const p of want) if (!have.has(p)) return false;
  for (const p of have) if (!want.has(p)) return false;
  return true;
}

// --- putting the reading copy together ---------------------------------------

/**
 * Turn a validated plan into the reading copy, refusing — item by item —
 * anything a check would not stand behind.
 *
 * When COVERAGE fails the whole plan is refused (`null`): a document missing
 * one of its decisions is not a document with a small problem, and there is
 * nothing to fall back to per-item because the item is simply absent.
 */
export function buildTidyDocument(
  plan: TidyPlan,
  extraction: MeetingNotesExtraction,
): TidyDocument | null {
  const rows = usableResolutions(extraction);
  const sourceTexts = rows.map((r) => r.text.value);
  if (sourceTexts.length === 0) return null;

  const coverage = checkCoverage(plan, sourceTexts.length);
  if (!coverage.ok) return null;

  let fallbacks = 0;
  let placed = 0;

  const convert = (item: { source: number | number[]; text: string }): TidyItem => {
    const source = sourcesOf(item);
    placed += source.length;
    const bad =
      !checkLatinNamesWhole(item, sourceTexts) ||
      !checkKeptFacts(item, sourceTexts) ||
      !checkNumbers(item, sourceTexts) ||
      !checkDecisionPolarity(item, sourceTexts);
    if (!bad) return { text: item.text, source, verbatimFallback: false };
    fallbacks += 1;
    // The honest fallback: the lines exactly as they were written. A merged
    // item that failed falls back to ALL of its lines, so nothing is lost by
    // refusing the model's sentence.
    return {
      text: source.map((s) => sourceTexts[s]).join("\n"),
      source,
      verbatimFallback: true,
    };
  };

  const sections = plan.sections
    .filter((s) => s.items.length > 0)
    .map((s) => ({ heading: s.heading.trim(), items: s.items.map(convert) }));
  const unresolved = plan.unresolved.map(convert);

  const paragraphs =
    sections.reduce((n, s) => n + s.items.length, 0) + unresolved.length;

  return {
    sections,
    unresolved,
    fallbacks,
    // §2-2 #2: how many lines the reading copy folded away. `placed` is every
    // verbatim line, counted once (coverage guarantees that); the difference
    // is what merging saved.
    merged: Math.max(0, placed - paragraphs),
  };
}
