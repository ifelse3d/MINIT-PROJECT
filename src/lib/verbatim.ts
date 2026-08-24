import type { EventsExtraction, LedgerExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// VERBATIM-FIELD INTEGRITY (S0-7, 2026-08-25).
//
// The 2026-08-24 eval proved the model truncates mid-value without flagging it:
// phone numbers lost their last digits (012-3456789 → 012-345678) and a
// constitution clause lost words mid-sentence. `invented = 0` only guards
// against making things up — it cannot see something quietly dropped. These
// checks demote a "confirmed" field the model cannot actually vouch for down
// to "check", so a human looks at exactly the fields that need looking at.
//
// Two checks, applied where their evidence exists:
//   1. Malaysian phone shape — a truncated phone has the wrong digit count,
//      and a phone is printed on a legal receipt. Works for photo sources too.
//   2. Substring-of-source — when the INPUT WAS TEXT (pasted event plans), a
//      verbatim field must appear in that text. Photos have no source text to
//      compare against, so this check honestly does not run for them.
//
// Pure functions, no AI, fully unit-tested (Hard Rule 2 spirit: verification
// is deterministic code, never the model grading itself).
// ---------------------------------------------------------------------------

/**
 * Digit-count check for a Malaysian phone number.
 * Returns null when the value looks complete, or a short reason when it does
 * not. An empty value returns null — "missing" is the confidence system's job.
 *
 * Accepted shapes (after stripping separators; leading +60/60 normalised to 0):
 *   Mobile   01X…  → 10–11 digits (011 numbers are 11)
 *   Landline 0X…   →  9–10 digits (03/08x areas have 8 subscriber digits)
 */
export function myPhoneProblem(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("60")) digits = `0${digits.slice(2)}`;
  if (!digits.startsWith("0")) return "not_malaysian_format";
  if (digits.startsWith("01")) {
    if (digits.length < 10) return "too_short";
    if (digits.length > 11) return "too_long";
    return null;
  }
  if (digits.length < 9) return "too_short";
  if (digits.length > 10) return "too_long";
  return null;
}

/** Whitespace-insensitive containment: is `value` copied from `source`? */
export function appearsInSource(value: string, source: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const v = norm(value);
  if (v === "") return true;
  return norm(source).includes(v);
}

/**
 * Demote any CONFIRMED donor phone that fails the Malaysian digit-count check
 * to "check". Returns the number of fields demoted alongside the (possibly
 * new) extraction; zero demotions returns the input object untouched.
 */
export function demoteSuspectPhones(extraction: LedgerExtraction): {
  extraction: LedgerExtraction;
  demoted: number;
} {
  let demoted = 0;
  const rows = extraction.rows.map((row) => {
    if (
      row.donor_phone.confidence === "confirmed" &&
      myPhoneProblem(row.donor_phone.value) !== null
    ) {
      demoted += 1;
      return {
        ...row,
        donor_phone: { ...row.donor_phone, confidence: "check" as const },
      };
    }
    return row;
  });
  if (demoted === 0) return { extraction, demoted };
  return { extraction: { ...extraction, rows }, demoted };
}

/**
 * For TEXT-sourced event extraction: demote any CONFIRMED title/time that does
 * not appear verbatim in the pasted text. (Dates are excluded — the model
 * legitimately rewrites "30 Ogos" as 2026-08-30.)
 */
export function demoteEventsNotInSource(
  extraction: EventsExtraction,
  sourceText: string,
): { extraction: EventsExtraction; demoted: number } {
  let demoted = 0;
  const events = extraction.events.map((ev) => {
    let next = ev;
    for (const field of ["title", "time"] as const) {
      if (
        next[field].confidence === "confirmed" &&
        !appearsInSource(next[field].value, sourceText)
      ) {
        demoted += 1;
        next = {
          ...next,
          [field]: { ...next[field], confidence: "check" as const },
        };
      }
    }
    return next;
  });
  if (demoted === 0) return { extraction, demoted };
  return { extraction: { events }, demoted };
}
