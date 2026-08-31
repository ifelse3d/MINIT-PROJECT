// ---------------------------------------------------------------------------
// "THESE TWO PAPERS LOOK LIKE THE SAME MEETING TWICE" (work order 105 §3).
// Pure logic, no I/O, unit tested.
//
// 104 §10 did the half a person can answer in advance: the upload strip asks
// whether several files are PAGES or VERSIONS, and the person taps. This is
// the other half — J did not say anything, the papers were read as pages, and
// the finished document repeated an entire agenda. The app noticed nothing
// because nobody had asked it to look.
//
// 🔴 THE BAR IS SET TO MISS RATHER THAN TO NAG (J's own instruction:
// 「寧可漏問，不可亂問」). Page 1 and page 2 of one meeting legitimately share
// a heading and an attendance list; that is not a repeated version, and a
// question about it every time would train the person to dismiss the card
// without reading it — after which the card is worse than nothing.
//
// So the comparison looks ONLY at what was decided (`resolutions`), never at
// headings or attendance, and it uses the same `sameItem` bar 104 measured on
// J's own two papers. What this module adds is the DOCUMENT-level question:
// how much of the shorter reading is already in the longer one?
//
// 🔴 IT ONLY EVER ASKS. Nothing here merges anything. The person taps, and the
// merge that follows re-uses readings already paid for — no photo is read
// again, no action is charged. A duplicate a person can delete is recoverable;
// a decision the app deleted on its own is not.
// ---------------------------------------------------------------------------

import type { MeetingNotesExtraction } from "@/lib/extraction";
import { sameItem } from "@/lib/extraction-versions";

/**
 * How much of the shorter reading must already be in the longer one before
 * the question is worth asking.
 *
 * 🔴 MEASURED, NOT CHOSEN (probe-duplicates-105, on J's own two papers —
 * their content stays on this machine, only the numbers travel):
 *
 *   J's real pair   short note 3 decisions, typed minit 11 decisions,
 *                   1 of the 3 is the same item told twice   → 0.33
 *   the control     a real printed minit cut in half — the shape of an
 *                   ordinary two-page document, agenda table on one side
 *                   and its paragraphs on the other          → 0.00
 *
 * The bar sits between them and as close to the true case as the measurement
 * allows: 0.30. Anything below it stays silent.
 */
export const DUPLICATE_ASK_RATIO = 0.3;

/**
 * A reading with fewer decisions than this is not evidence of anything — one
 * line matching one line is a coincidence, not a repeated document.
 */
export const DUPLICATE_MIN_ITEMS = 2;

/**
 * 🔴 THE FALSE POSITIVE THIS EXISTS TO KILL, found by building the negative
 * control before trusting the bar (probe-duplicates-105).
 *
 * A printed minit carries its own AGENDA TABLE and then its SECTIONS, and the
 * table's row is literally contained in the section's paragraph — that is
 * what an agenda table IS. Photograph such a document as two pages and the
 * table lands on page 1 while the paragraphs land on page 2, so
 * `sameItem`'s containment arm reports match after match and the app would
 * ask "are these two versions of the same meeting?" about a perfectly
 * ordinary two-page minit.
 *
 * Measured on a real printed minit cut in half: the offending pairs are
 * 59↔294, 43↔95 and 85↔476 characters — a table row against the paragraph
 * that expands it. J's genuine repeat is 29↔41 characters. So a match only
 * counts here when the two lines are of COMPARABLE LENGTH: two tellings of
 * one decision are roughly as long as each other; a heading and the
 * paragraph under it are not.
 *
 * 🔴 This lives HERE and not in `sameItem`. When the person has TICKED
 * "different versions" (104 §10), containment is exactly the right rule and
 * must keep working — that road is the person's own judgement, and this one
 * is a guess the app is making unasked, so it is held to a higher bar.
 */
export const DUPLICATE_MIN_LENGTH_RATIO = 0.5;

export type RepeatedReading = {
  /** Index of the SHORTER reading — the one mostly contained in the other. */
  shorter: number;
  /** Index of the fuller reading. */
  fuller: number;
  /** Decisions of the shorter reading that the fuller one already carries. */
  matches: number;
  /** matches ÷ the shorter reading's decisions, 0–1. */
  ratio: number;
};

/** `sameItem`, plus the length-comparability rule above. */
function comparableSameItem(a: string, b: string): boolean {
  const shortLen = Math.min(a.trim().length, b.trim().length);
  const longLen = Math.max(a.trim().length, b.trim().length);
  if (longLen === 0) return false;
  if (shortLen / longLen < DUPLICATE_MIN_LENGTH_RATIO) return false;
  return sameItem(a, b);
}

function decisions(e: MeetingNotesExtraction): string[] {
  return e.resolutions
    .filter((r) => r.text.confidence !== "missing" && r.text.value.trim() !== "")
    .map((r) => r.text.value);
}

/**
 * The strongest repeat among the readings, or null when there is nothing
 * worth asking about. Deliberately returns ONE pair: the card asks one
 * question, and a person holding two papers does not want a report.
 */
export function findRepeatedReading(
  readings: readonly MeetingNotesExtraction[],
): RepeatedReading | null {
  if (readings.length < 2) return null;
  const lines = readings.map(decisions);
  let best: RepeatedReading | null = null;

  for (let i = 0; i < readings.length; i++) {
    for (let j = i + 1; j < readings.length; j++) {
      const [shortIdx, fullIdx] =
        lines[i].length <= lines[j].length ? [i, j] : [j, i];
      const shortLines = lines[shortIdx];
      const fullLines = lines[fullIdx];
      if (shortLines.length < DUPLICATE_MIN_ITEMS) continue;

      let matches = 0;
      for (const line of shortLines) {
        if (fullLines.some((other) => comparableSameItem(line, other))) matches += 1;
      }
      const ratio = matches / shortLines.length;
      if (matches === 0 || ratio < DUPLICATE_ASK_RATIO) continue;
      if (!best || ratio > best.ratio) {
        best = { shorter: shortIdx, fuller: fullIdx, matches, ratio };
      }
    }
  }
  return best;
}
