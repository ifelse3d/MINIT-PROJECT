// ---------------------------------------------------------------------------
// WHAT A PERSON TYPES → the one date format everything else stores.
//
// 2026-08-20: "2/2/2026" was typed into the meeting-date box and the entire
// flow failed with "Something went wrong on Minit's side". dateFieldSchema only
// accepts YYYY-MM-DD, and it SHOULD — a date that means two different things in
// two places is worse than no date at all. What was missing is the piece that
// turns what a person types into that format, and shows them what it understood.
//
// 🔴 MALAYSIA WRITES THE DAY FIRST. 2/2/2026 is 2 February 2026; 3/12/2026 is
// 3 December 2026, not 12 March. No parser can resolve that ambiguity, so the
// rule here is: assume day-first (the local convention), and ALWAYS print the
// month back IN WORDS so a wrong reading is visible before it is confirmed.
// A silent misreading of a meeting date is a wrong date on a government form.
// ---------------------------------------------------------------------------

/** Real calendar date only: 31/02/2026 is rejected, not rolled into March. */
function build(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Accepts what people actually type; returns YYYY-MM-DD, or null when it cannot
 * be read as a date. Null means "ask them again", never "guess".
 *
 *   2026-02-02  2026-2-2   →  2026-02-02   (already the storage format)
 *   2/2/2026    02.02.2026 →  2026-02-02   (day first — see the note above)
 *   2-2-2026               →  2026-02-02
 *   20260202    02022026   →  2026-02-02   (bare digits, launch feedback #8:
 *                              nobody should be scolded over missing dashes)
 */
export function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dayFirst) {
    return build(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  }

  // Eight bare digits (#8): the dashes are OUR formatting job, not the
  // typist's. A leading 19xx/20xx/21xx reads as year-first (20260101);
  // otherwise day-first, the local convention (01012026).
  const digits = /^\d{8}$/.exec(s);
  if (digits) {
    const head = Number(s.slice(0, 4));
    if (head >= 1900 && head <= 2200) {
      return build(head, Number(s.slice(4, 6)), Number(s.slice(6, 8)));
    }
    return build(Number(s.slice(4, 8)), Number(s.slice(2, 4)), Number(s.slice(0, 2)));
  }

  return null;
}

/** True for a value already in the stored format. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(value) !== null;
}

const MONTH_NAMES = {
  bm: [
    "Januari", "Februari", "Mac", "April", "Mei", "Jun",
    "Julai", "Ogos", "September", "Oktober", "November", "Disember",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
} as const;

/**
 * The date written out so a person can SEE what was understood — the whole
 * point of accepting a typed date at all.
 *
 *   formatDateLong("2026-02-02", "bm") → "2 Februari 2026"
 *   formatDateLong("2026-02-02", "zh") → "2026年2月2日"
 *   formatDateLong("2026-02-02", "en") → "2 February 2026"
 *
 * Anything that is not a real date comes back unchanged: this function prints,
 * it never repairs.
 */
export function formatDateLong(iso: string, lang: "bm" | "zh" | "en"): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  if (lang === "zh") return `${y}年${m}月${d}日`;
  return `${d} ${MONTH_NAMES[lang][m - 1]} ${y}`;
}
