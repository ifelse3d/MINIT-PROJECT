import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// WHO COUNTS AS RECORDED PRESENT (work order 125 §2-4; D30 kept).
//
// D30 (2026-08-28): a document with nobody recorded as attending may not be
// confirmed — the number goes into the eROSES annual return. Until 125 the
// only way to satisfy D30 was a NAMED list, so a page that recorded its
// attendance as one headcount line (「理事12人,请假2人,会员40人」) forced
// somebody to type a name, and the document said "1 orang".
//
// Now a headcount a PERSON confirmed (attendance_confirmed — set by the
// attendance step's card, never by the model) satisfies D30 as well. The
// number printed in the document and pasted into eROSES is that confirmed
// count when there is one, the named list's length otherwise. Pure; shared
// by the client store and the server action so the two cannot disagree.
// ---------------------------------------------------------------------------

/** The named attendees with something in the name slot. */
export function namedAttendeeCount(e: MeetingNotesExtraction): number {
  return e.attendees.filter((a) => a.name.value.trim() !== "").length;
}

/** The person-confirmed headcount, if a person confirmed one. */
export function confirmedHeadcount(e: MeetingNotesExtraction): number | undefined {
  const n = e.attendance_confirmed;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * D30: is anybody recorded as present at all — by a confirmed headcount or
 * by a named list? False locks the confirmed save (client AND server).
 */
export function attendanceRecorded(e: MeetingNotesExtraction): boolean {
  return confirmedHeadcount(e) !== undefined || namedAttendeeCount(e) > 0;
}

/**
 * The number the document prints as "Jumlah hadir" and the paste-pack offers
 * as "Bilangan Ahli Hadir": the confirmed count first, the named list's
 * length as the fallback. Undefined when neither exists — nothing is printed
 * and nothing is pasted; the format never invents a count.
 */
export function headcountForDocument(e: MeetingNotesExtraction): number | undefined {
  const confirmed = confirmedHeadcount(e);
  if (confirmed !== undefined) return confirmed;
  const named = namedAttendeeCount(e);
  return named > 0 ? named : undefined;
}
