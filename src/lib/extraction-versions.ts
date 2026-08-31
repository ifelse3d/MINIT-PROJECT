import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// §10 (work order 104) — TWO PHOTOS OF THE SAME MEETING, NOT TWO PAGES OF IT.
//
// J, 2026-08-31 evening, holding two papers about one meeting — a short note
// of what had to be done, and a fuller typed-up minit of the same thing. The
// workbench read them as PAGE 1 and PAGE 2 and concatenated the two, so the
// finished document ran "3. 4. 5." and then "1. 2.1 4. 5." — the same agenda
// twice, in two hands.
//
// Concatenation is right for pages and wrong for versions, and only the person
// holding the paper knows which they have. So the staged-file strip asks (see
// ask-box.tsx), and this module is what "versions" means:
//
//   * the FULLEST reading becomes the document — not the first one, not the
//     last one; the one that carries the most facts;
//   * every other version may only ADD what the fullest one does not already
//     have. A scalar it read as `missing` can be filled in; a line it does not
//     carry can be appended;
//   * an item that both versions carry is written ONCE, in the fullest
//     version's own words. Two wordings of one decision are not two decisions.
//
// 🔴 THE BAR FOR CALLING TWO LINES ONE ITEM IS HIGH, and it is written down at
// `sameItem` with the numbers it was set from. A duplicate a person can delete
// is recoverable; a decision this deleted is not — so the rule only fires on
// identity, containment, or a strong word overlap, and only when the person
// has already told the app these papers are two tellings of one thing.
//
// Pure logic, no I/O, unit-tested — CLAUDE.md rule 13.
// ---------------------------------------------------------------------------

type Scalar = {
  value: string;
  confidence: "confirmed" | "check" | "missing";
  source_ref: { location: string; snippet: string } | null;
};

const known = (f: Scalar | undefined): boolean =>
  f !== undefined && f.confidence !== "missing" && f.value.trim() !== "";

/**
 * How much a reading actually carries — one point per fact it read, plus a
 * point per row. Deliberately counts FACTS and not characters: a version that
 * repeats one decision at length is not fuller than one that records five.
 * Character length is only the tie-break.
 */
export function meetingRichness(e: MeetingNotesExtraction): number {
  let n = 0;
  for (const f of [
    e.meeting_type,
    e.meeting_date,
    e.meeting_venue,
    e.meeting_time,
    e.attendance_count,
    e.adjournment,
  ]) {
    if (known(f)) n += 1;
  }
  for (const b of [e.prepared_by, e.endorsed_by]) {
    if (b && (known(b.position) || known(b.person_name))) n += 1;
  }
  n += e.attendees.filter((a) => known(a.name)).length;
  n += e.resolutions.filter((r) => known(r.text)).length;
  n += e.figures.filter((f) => known(f.description)).length;
  n += e.office_bearers.filter((o) => known(o.person_name)).length;
  n += (e.financial_resolutions ?? []).filter((f) => known(f.purpose)).length;
  return n;
}

/** Characters of real content — the tie-break when two readings tie on facts. */
function meetingChars(e: MeetingNotesExtraction): number {
  return (
    e.resolutions.reduce((n, r) => n + r.text.value.length, 0) +
    e.attendees.reduce((n, a) => n + a.name.value.length, 0) +
    e.figures.reduce((n, f) => n + f.description.value.length, 0)
  );
}

/** Letters, digits and CJK only, lower-cased — punctuation and the printed
 *  enumerator ("3.", "2.1") are typography, not content. */
function itemKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/^[\s\d.)（(、]+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * The words a line is actually about: Latin words of three letters or more,
 * and CJK character pairs (Chinese words are one or two characters, so a
 * three-letter floor would erase the language). Bare numbers are dropped —
 * "2.1" and "5" are the printed numbering, not the subject.
 */
function contentTokens(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const out: string[] = [];
  for (const word of cleaned.split(" ")) {
    if (word === "") continue;
    if (/^[一-鿿]+$/.test(word)) {
      if (word.length === 1) out.push(word);
      for (let i = 0; i + 1 < word.length; i++) out.push(word.slice(i, i + 2));
      continue;
    }
    if (word.length >= 3 && !/^\d+$/.test(word)) out.push(word);
  }
  return out;
}

/**
 * Two lines that are the same item told at two lengths.
 *
 * Three arms, in order of how sure each is:
 *   1. the same after normalisation;
 *   2. one contains the other — the shape of "short note vs typed-up minit" —
 *      when the shorter is long enough for that to mean anything (6
 *      characters; "ok" inside "kokurikulum" is not a match anybody wants);
 *   3. they share at least SHARED_WORDS of the shorter line's content words.
 *
 * 🔴 WHY ARM 3 EXISTS AND WHY THE BAR IS WHERE IT IS. Measured on J's own two
 * papers (probe-versions-104): the one line that really is the same item told
 * twice — "3 Agenda 2.1 diganti Lee Moy (Lim Guat Kior)" and "Lim Guat Kioy
 * ganti - Lee Moy" — shares 0.67 of the shorter line's words, while the best
 * match for either genuinely-different line scores 0.11 and 0.00. Arm 2 misses
 * the pair because neither string contains the other: two hands wrote the same
 * fact in a different order, and one of them spelled a name differently.
 *
 * The bar sits in that gap, and the shorter line must carry at least three
 * content words before the arm applies at all — a two-word line has no room
 * for 0.6 to mean anything. This ONLY ever runs when the person has said, on
 * the upload strip, that these papers are two tellings of one thing, which is
 * what makes a similarity this strong evidence rather than coincidence.
 */
const SHARED_WORDS = 0.6;
const MIN_WORDS_FOR_OVERLAP = 3;

export function sameItem(a: string, b: string): boolean {
  const x = itemKey(a);
  const y = itemKey(b);
  if (x === "" || y === "") return false;
  if (x === y) return true;
  const [shortKey, longKey] = x.length <= y.length ? [x, y] : [y, x];
  if (shortKey.length >= 6 && longKey.includes(shortKey)) return true;

  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  const smaller = ta.size <= tb.size ? ta : tb;
  if (smaller.size < MIN_WORDS_FOR_OVERLAP) return false;
  let shared = 0;
  for (const t of smaller) if ((smaller === ta ? tb : ta).has(t)) shared += 1;
  return shared / smaller.size >= SHARED_WORDS;
}

/** Rows of `extra` that say something `main` does not already say. */
function newRows<T>(
  main: readonly T[],
  extra: readonly T[],
  textOf: (row: T) => string,
): T[] {
  const out: T[] = [];
  const have = main.map(textOf);
  for (const row of extra) {
    const text = textOf(row);
    if (text.trim() === "") continue;
    if (have.some((h) => sameItem(h, text))) continue;
    if (out.some((o) => sameItem(textOf(o), text))) continue;
    have.push(text);
    out.push(row);
  }
  return out;
}

/** Take `incoming`'s reading only where `main` has none. */
function fillGap<T extends Scalar>(main: T, incoming: T): T {
  return known(main) ? main : known(incoming) ? incoming : main;
}
function fillOptional<T extends Scalar>(
  main: T | undefined,
  incoming: T | undefined,
): T | undefined {
  if (!main) return incoming;
  if (!incoming) return main;
  return fillGap(main, incoming);
}

/**
 * Several readings of the SAME meeting, told at different lengths → ONE
 * document. Returns the input unchanged when there is only one reading.
 */
export function mergeMeetingVersions(
  readings: readonly MeetingNotesExtraction[],
): MeetingNotesExtraction {
  if (readings.length === 0) throw new Error("mergeMeetingVersions: no readings");
  if (readings.length === 1) return readings[0];

  const ranked = [...readings].sort((a, b) => {
    const d = meetingRichness(b) - meetingRichness(a);
    return d !== 0 ? d : meetingChars(b) - meetingChars(a);
  });
  const [fullest, ...others] = ranked;

  let out: MeetingNotesExtraction = { ...fullest };
  for (const other of others) {
    out = {
      ...out,
      meeting_type: fillGap(out.meeting_type, other.meeting_type),
      meeting_type_label:
        (out.meeting_type_label ?? "").trim() !== ""
          ? out.meeting_type_label
          : other.meeting_type_label,
      meeting_date: fillGap(out.meeting_date, other.meeting_date),
      meeting_venue: fillGap(out.meeting_venue, other.meeting_venue),
      meeting_time: fillOptional(out.meeting_time, other.meeting_time),
      attendance_count: fillOptional(out.attendance_count, other.attendance_count),
      adjournment: fillOptional(out.adjournment, other.adjournment),
      prepared_by: out.prepared_by ?? other.prepared_by,
      endorsed_by: out.endorsed_by ?? other.endorsed_by,
      attendees: [
        ...out.attendees,
        ...newRows(out.attendees, other.attendees, (a) => a.name.value),
      ],
      resolutions: [
        ...out.resolutions,
        ...newRows(out.resolutions, other.resolutions, (r) => r.text.value),
      ],
      figures: [
        ...out.figures,
        ...newRows(out.figures, other.figures, (f) => f.description.value),
      ],
      office_bearers: [
        ...out.office_bearers,
        ...newRows(
          out.office_bearers,
          other.office_bearers,
          (o) => `${o.position.value} ${o.person_name.value}`,
        ),
      ],
      financial_resolutions:
        out.financial_resolutions || other.financial_resolutions
          ? [
              ...(out.financial_resolutions ?? []),
              ...newRows(
                out.financial_resolutions ?? [],
                other.financial_resolutions ?? [],
                (f) => `${f.vendor_name.value} ${f.purpose.value}`,
              ),
            ]
          : undefined,
      other_meetings:
        out.other_meetings || other.other_meetings
          ? [
              ...(out.other_meetings ?? []),
              ...newRows(
                out.other_meetings ?? [],
                other.other_meetings ?? [],
                (m) => m.date_text.value,
              ),
            ]
          : undefined,
    };
  }
  return out;
}
