import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// ADDING AND REMOVING ROWS BY HAND.
//
// WHY (J's UX list, root cause A / N2, 2026-08-07): there was no way anywhere
// in Minit to add a line the AI had not proposed, or to take one away. The only
// direction data could flow was photo → AI → confirm → save. So:
//
//   * a resolution the meeting reached after the note-taker stopped writing
//     could not be added at all;
//   * a name the AI hallucinated off a smudge could only be blanked ("not in
//     the notes"), leaving an empty row in the document;
//   * "we forgot to write down that Encik Rahman came" meant redoing the photo.
//
// That is not an AI problem, it needs no model, and it costs nothing to run —
// which is why it sits at the top of docs/界面重做-计划.md §2.
//
// THE PROVENANCE RULE (CLAUDE.md Hard Rule 1). A row added here starts EMPTY
// and `missing`, with no source_ref — exactly what the rule requires of a fact
// nobody has asserted yet. It therefore counts as outstanding and blocks saving
// until the person types something, at which point the normal edit path stamps
// it "entered by you". We deliberately do NOT create a pre-confirmed blank row:
// that would let an empty line reach a document carrying the Hard Rule 8 audit
// line.
// ---------------------------------------------------------------------------

// ⚠ These return a NEW top-level object and a new array, but the row objects
// inside are shared with the input — a shallow copy, not a deep one. That is
// deliberate (deep-copying a hundred attendees on every keystroke is waste) and
// safe because the only caller edits through the store's `updateField`, which
// structuredClones first. Do not mutate a row on the result and expect the
// input to be untouched.

/** The lists on a meeting extraction whose rows a person may add or remove. */
export const ROW_LISTS = ["attendees", "resolutions", "figures", "office_bearers"] as const;
export type RowList = (typeof ROW_LISTS)[number];

const emptyText = () => ({ value: "", confidence: "missing" as const, source_ref: null });

/** One blank row of the right shape for each list. */
function blankRow(list: RowList) {
  switch (list) {
    case "attendees":
      return { name: emptyText() };
    case "resolutions":
      return { text: emptyText() };
    case "figures":
      return {
        description: emptyText(),
        amount_cents: { value: null, confidence: "missing" as const, source_ref: null },
      };
    case "office_bearers":
      return { position: emptyText(), person_name: emptyText() };
  }
}

/**
 * A copy of `e` with one blank row appended to `list`.
 *
 * Appended, never inserted at the top: the rows are in the order the meeting
 * happened, and a new line is something that comes after what is already there.
 */
export function addRow(e: MeetingNotesExtraction, list: RowList): MeetingNotesExtraction {
  return { ...e, [list]: [...e[list], blankRow(list)] } as MeetingNotesExtraction;
}

/**
 * A copy of `e` with row `index` removed from `list`.
 *
 * An out-of-range index returns the extraction unchanged rather than throwing:
 * the only way to reach one is a double-tap on the last row's delete button
 * (the second tap runs against a list that is already one shorter), and losing
 * a DIFFERENT row to that race would be far worse than doing nothing.
 */
export function removeRow(
  e: MeetingNotesExtraction,
  list: RowList,
  index: number,
): MeetingNotesExtraction {
  if (!Number.isInteger(index) || index < 0 || index >= e[list].length) return e;
  return {
    ...e,
    [list]: e[list].filter((_, i) => i !== index),
  } as MeetingNotesExtraction;
}

/**
 * Does this row still hold anything a person would mind losing?
 *
 * Used to decide whether deleting needs a confirmation. A blank row somebody
 * just added by mistake should vanish on one tap; a row with a name in it
 * should ask first.
 */
export function rowHasContent(e: MeetingNotesExtraction, list: RowList, index: number): boolean {
  const row = e[list][index] as Record<string, unknown> | undefined;
  if (!row) return false;
  return Object.values(row).some((field) => {
    if (typeof field !== "object" || field === null) return false;
    const v = (field as { value?: unknown }).value;
    return typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined;
  });
}

// ---------------------------------------------------------------------------
// K-4 (work order 27): countUnreviewed, ONE copy. It lived twice — in the
// save action and in /api/draft-minutes — with a comment on the second
// admitting "mirrors the first, keep in sync". Two copies of the gate that
// decides whether a document may carry the Hard Rule 8 audit line is one
// copy too many.
// ---------------------------------------------------------------------------

/**
 * Every reviewable leaf in the extraction that is not yet `confirmed`.
 *
 * `amount_cents` IS included: an earlier client-side check listed only the
 * figure DESCRIPTIONS, so a ringgit amount the AI could not read did not
 * block saving and was printed into an audited document.
 */
export function countUnreviewed(e: {
  meeting_type: { confidence: string };
  meeting_date: { confidence: string };
  meeting_venue: { confidence: string };
  /** G1 optional header/closing fields — reviewable ONLY when present
   *  (parseMeetingNotesExtraction prunes the model's `missing` ones, so a
   *  page that never had them never demands a tap for them). */
  meeting_time?: { confidence: string };
  attendance_count?: { confidence: string };
  adjournment?: { confidence: string };
  prepared_by?: {
    position: { confidence: string };
    person_name: { confidence: string };
  };
  endorsed_by?: {
    position: { confidence: string };
    person_name: { confidence: string };
  };
  attendees: { name: { confidence: string } }[];
  resolutions: { text: { confidence: string } }[];
  figures: {
    description: { confidence: string };
    amount_cents: { confidence: string };
  }[];
  office_bearers: {
    position: { confidence: string };
    person_name: { confidence: string };
  }[];
}): number {
  const levels: string[] = [
    e.meeting_type.confidence,
    e.meeting_date.confidence,
    e.meeting_venue.confidence,
    ...(e.meeting_time ? [e.meeting_time.confidence] : []),
    ...(e.attendance_count ? [e.attendance_count.confidence] : []),
    ...(e.adjournment ? [e.adjournment.confidence] : []),
    ...(e.prepared_by
      ? [e.prepared_by.position.confidence, e.prepared_by.person_name.confidence]
      : []),
    ...(e.endorsed_by
      ? [e.endorsed_by.position.confidence, e.endorsed_by.person_name.confidence]
      : []),
    ...e.attendees.map((a) => a.name.confidence),
    ...e.resolutions.map((r) => r.text.confidence),
    ...e.figures.flatMap((f) => [
      f.description.confidence,
      f.amount_cents.confidence,
    ]),
    ...e.office_bearers.flatMap((b) => [
      b.position.confidence,
      b.person_name.confidence,
    ]),
  ];
  return levels.filter((c) => c !== "confirmed").length;
}
