import { describe, expect, it } from "vitest";
import {
  EMPTY_MEETING_FACTS,
  applyKnownMeetingFacts,
  noFactsGiven,
  type KnownMeetingFacts,
} from "@/lib/meeting-facts";
import {
  emptyMeetingNotesExtraction,
  meetingNotesExtractionSchema,
  type MeetingNotesExtraction,
} from "@/lib/extraction";

const SOURCE = { location: "entered by you", snippet: "before Minit read the page" };

const facts = (over: Partial<KnownMeetingFacts> = {}): KnownMeetingFacts => ({
  ...EMPTY_MEETING_FACTS,
  ...over,
});

/**
 * An extraction as it comes back from the model: a guess at every field.
 *
 * Each guess carries a source_ref, because the contract requires one on
 * anything that is not `missing` (Hard Rule 1) — a fixture without them is not
 * a thing the model could have returned, and a test built on one proves less
 * than it looks like it does.
 */
const READ_FROM = { location: "muka surat 1", snippet: "read off the board" };
const asRead = (): MeetingNotesExtraction => ({
  ...structuredClone(emptyMeetingNotesExtraction),
  meeting_type: { value: "committee", confidence: "check", source_ref: READ_FROM },
  meeting_date: { value: "2026-09-15", confidence: "check", source_ref: READ_FROM },
  meeting_venue: { value: "Dewan", confidence: "check", source_ref: READ_FROM },
});

describe("noFactsGiven", () => {
  it("is true when nothing was filled in", () => {
    expect(noFactsGiven(EMPTY_MEETING_FACTS)).toBe(true);
    expect(noFactsGiven(facts({ venue: "   " }))).toBe(true);
  });

  it("is false as soon as one box has something in it", () => {
    expect(noFactsGiven(facts({ meetingType: "agm" }))).toBe(false);
    expect(noFactsGiven(facts({ meetingDateIso: "2026-08-23" }))).toBe(false);
    expect(noFactsGiven(facts({ venue: "Dewan Serbaguna" }))).toBe(false);
  });
});

describe("applyKnownMeetingFacts", () => {
  it("returns the extraction untouched when nothing was filled in", () => {
    const e = asRead();
    expect(applyKnownMeetingFacts(e, EMPTY_MEETING_FACTS, SOURCE)).toBe(e);
  });

  // THE ONE THIS EXISTS FOR. A whiteboard often carries two dates — the day the
  // meeting happened and the day of the event it agreed to hold — and they look
  // identical. No prompt can tell them apart, because what distinguishes them is
  // in the head of the person who was there.
  it("lets the person's date beat the one the model read", () => {
    const out = applyKnownMeetingFacts(asRead(), facts({ meetingDateIso: "2026-08-20" }), SOURCE);
    expect(out.meeting_date.value).toBe("2026-08-20");
    expect(out.meeting_date.confidence).toBe("confirmed");
    expect(out.meeting_date.source_ref).toEqual(SOURCE);
  });

  it("lets the person's meeting type and venue beat the model's too", () => {
    const out = applyKnownMeetingFacts(
      asRead(),
      facts({ meetingType: "agm", venue: "Kuil Guan Di" }),
      SOURCE,
    );
    expect(out.meeting_type.value).toBe("agm");
    expect(out.meeting_venue.value).toBe("Kuil Guan Di");
    expect([out.meeting_type.confidence, out.meeting_venue.confidence]).toEqual([
      "confirmed",
      "confirmed",
    ]);
  });

  // A blank box is not an assertion. Leaving it empty must mean "you read it",
  // never "there is none".
  it("leaves a field the person did not fill in exactly as the model read it", () => {
    const out = applyKnownMeetingFacts(asRead(), facts({ venue: "Kuil" }), SOURCE);
    expect(out.meeting_date.value).toBe("2026-09-15");
    expect(out.meeting_date.confidence).toBe("check");
  });

  it("does not turn an unread field into a confirmed empty one", () => {
    const out = applyKnownMeetingFacts(
      emptyMeetingNotesExtraction,
      facts({ meetingType: "agm" }),
      SOURCE,
    );
    expect(out.meeting_venue.confidence).toBe("missing");
    expect(out.meeting_venue.value).toBe("");
  });

  // STATE.md's 2026-08-20 trap: a shared text box produced values the schema and
  // the database CHECK both refused, and the person was shown "something went
  // wrong on Minit's side" two screens later.
  it("ignores a meeting type that is not a real one", () => {
    const out = applyKnownMeetingFacts(asRead(), facts({ meetingType: "event meeting" }), SOURCE);
    expect(out.meeting_type.value).toBe("committee");
    expect(meetingNotesExtractionSchema.safeParse(out).success).toBe(true);
  });

  it("ignores a date that is not a real ISO day", () => {
    for (const bad of ["2/2/2026", "2026-13-01", "tomorrow", "2026-02-30"]) {
      const out = applyKnownMeetingFacts(asRead(), facts({ meetingDateIso: bad }), SOURCE);
      expect(out.meeting_date.value).toBe("2026-09-15");
    }
  });

  it("trims the venue rather than storing the spaces", () => {
    const out = applyKnownMeetingFacts(asRead(), facts({ venue: "  Dewan Serbaguna  " }), SOURCE);
    expect(out.meeting_venue.value).toBe("Dewan Serbaguna");
  });

  it("does not mutate the extraction it was given", () => {
    const e = asRead();
    applyKnownMeetingFacts(e, facts({ meetingType: "agm" }), SOURCE);
    expect(e.meeting_type.value).toBe("committee");
  });

  it("leaves a legal extraction behind", () => {
    const out = applyKnownMeetingFacts(
      asRead(),
      facts({ meetingType: "egm", meetingDateIso: "2026-08-20", venue: "Dewan" }),
      SOURCE,
    );
    expect(meetingNotesExtractionSchema.safeParse(out).success).toBe(true);
  });
});
