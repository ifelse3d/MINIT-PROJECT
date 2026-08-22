import type { MeetingNotesExtraction } from "@/lib/extraction";
import { isMeetingType } from "@/lib/meeting-types";
import { isIsoDate } from "@/lib/date-input";

// ---------------------------------------------------------------------------
// WHAT THE PERSON ALREADY KNOWS, BEFORE THE AI READS ANYTHING.
//
// J's UX list, items 1 and 2 — and item 2 is marked 根 (the root) in
// docs/产品缺口盘点.md for good reason:
//
//   「放照片下去他还是直接走，想 type 跟他说这是什么会议没办法；
//     有时照片里写的是活动时间不是会议时间」
//
// The second half is the interesting one. A whiteboard photographed after a
// meeting often carries TWO dates — the day the meeting happened, and the day
// of the event it agreed to hold. They look identical on the board. No prompt
// can reliably tell them apart, because the information needed to tell them
// apart is not in the picture: it is in the head of the person who was there.
// That is a design gap, not a model failure, and the fix is to ask them.
//
// So: three optional boxes before the photo goes anywhere. Whatever the person
// fills in is applied to the extraction AFTERWARDS, overriding whatever the
// model read — because on these three facts the human is not a reviewer, they
// are the source.
//
// 🔴 HARD RULE 1 STILL HOLDS, AND THIS IS WHERE IT COULD SLIP. A field written
// here is `confirmed` and carries a source_ref saying a person supplied it
// before the reading. That is a true provenance, not a rubber stamp: somebody
// typed it, and the record says so. What must never happen is a BLANK box being
// treated as an assertion — an empty field leaves whatever the AI read
// untouched, and an empty field over an empty reading stays `missing`.
// ---------------------------------------------------------------------------

/** What a person can tell Minit before it reads the page. All optional. */
export type KnownMeetingFacts = {
  /** One of MEETING_TYPES, or "" for "let the AI read it". */
  meetingType: string;
  /** YYYY-MM-DD, or "". */
  meetingDateIso: string;
  /** Free text, or "". */
  venue: string;
};

export const EMPTY_MEETING_FACTS: KnownMeetingFacts = {
  meetingType: "",
  meetingDateIso: "",
  venue: "",
};

/** True when the person filled in nothing at all — nothing to apply. */
export function noFactsGiven(facts: KnownMeetingFacts): boolean {
  return (
    facts.meetingType === "" &&
    facts.meetingDateIso === "" &&
    facts.venue.trim() === ""
  );
}

/**
 * Overlay what the person told us onto what the model read.
 *
 * Applied AFTER extraction, not before, for a reason worth keeping: the
 * extraction response REPLACES the whole object, so anything seeded beforehand
 * would be silently thrown away. Doing it afterwards also makes the precedence
 * explicit — on these three facts the person wins, always.
 *
 * Invalid input is IGNORED rather than written: a meeting type that is not one
 * of the known types, or a date that is not a real ISO day, would fail the zod
 * contract and the database CHECK — and the failure would surface as
 * "something went wrong on Minit's side", two screens later, with no clue that
 * a box at the top was the cause. That exact bug is in STATE.md's trap list
 * from 2026-08-20.
 */
export function applyKnownMeetingFacts(
  extraction: MeetingNotesExtraction,
  facts: KnownMeetingFacts,
  /** Trilingual provenance line, supplied by the caller (which has the locale). */
  source: { location: string; snippet: string },
): MeetingNotesExtraction {
  if (noFactsGiven(facts)) return extraction;
  const next = structuredClone(extraction);

  if (facts.meetingType !== "" && isMeetingType(facts.meetingType)) {
    next.meeting_type = {
      value: facts.meetingType,
      confidence: "confirmed",
      source_ref: source,
    };
  }
  if (facts.meetingDateIso !== "" && isIsoDate(facts.meetingDateIso)) {
    next.meeting_date = {
      value: facts.meetingDateIso,
      confidence: "confirmed",
      source_ref: source,
    };
  }
  const venue = facts.venue.trim();
  if (venue !== "") {
    next.meeting_venue = {
      value: venue,
      confidence: "confirmed",
      source_ref: source,
    };
  }
  return next;
}
