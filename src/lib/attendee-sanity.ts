// ---------------------------------------------------------------------------
// ATTENDEES ARE NOT INVENTED (work order 118 §5-2, 108 §6-2).
//
// J's committee note has no attendance list. The reader produced ONE
// attendee named "as" (a fragment of a line it could not read) and the
// document then printed "1. as" and "Jumlah hadir: 1 orang" — a headcount
// eROSES asks for, made of a scrap. Hard Rule 1: a fact that is not on the
// page is `missing`, never filled with something that fits the slot.
//
// This is the code half of that rule for the one field that has no other
// guard: a name-shaped value that cannot be a person's name is erased at
// parse time (erasing is what the rule permits; promoting never is), so an
// attendance list that was never written comes out EMPTY — and the empty
// list already has an honest path on screen ("the notes do not record who
// attended"). Pure, unit tested, deliberately narrow: 寧缺勿濫 the other way
// — a real short name must never be thrown away.
// ---------------------------------------------------------------------------

/** Function words a line fragment tends to leave behind. Lower-cased. */
const STOPWORDS = new Set([
  "as", "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "by",
  "dan", "atau", "yang", "di", "ke", "dari", "untuk", "pada", "oleh",
  "ada", "tiada", "nil", "na", "n/a", "tbc", "etc",
]);

const LEADING_ENUM = /^\s*\(?\d{1,3}\)?[.、．):]?\s*/;
const HAS_LETTER = /[A-Za-zÀ-ɏ㐀-䶿一-鿿豈-﫿]/;
const LATIN_ONLY = /^[A-Za-zÀ-ɏ'.\-\s/]+$/;

/**
 * Could this value be somebody's name as written on an attendance sheet?
 *
 *   "Tan Kim Loo", "Ng Ah Kow", "张伟杰", "王", "Ali"  → true
 *   "as", "1. as", "", "12", "—", "dan"                 → false
 *
 * Latin-only values of one or two letters are refused ("as", "an", "ok");
 * a two-letter surname alone ("Ng") is, in practice, never how a sheet
 * records a person, while "as" is exactly how a misread fragment looks.
 * Chinese is allowed down to a single character: 王 alone is a real entry.
 */
export function plausibleAttendeeName(raw: string): boolean {
  const s = raw.replace(LEADING_ENUM, "").trim();
  if (s === "") return false;
  if (!HAS_LETTER.test(s)) return false;
  if (STOPWORDS.has(s.toLowerCase())) return false;
  if (LATIN_ONLY.test(s)) {
    const letters = s.replace(/[^A-Za-zÀ-ɏ]/g, "");
    if (letters.length <= 2) return false;
  }
  return true;
}
