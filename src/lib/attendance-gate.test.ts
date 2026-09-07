import { describe, expect, it } from "vitest";
import {
  attendanceRecorded,
  confirmedHeadcount,
  headcountForDocument,
  namedAttendeeCount,
} from "./attendance-gate";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "./extraction";

const attendee = (name: string) => ({
  name: { value: name, confidence: "confirmed" as const, source_ref: { location: "typed", snippet: name } },
});

const withList = (): MeetingNotesExtraction => ({
  ...emptyMeetingNotesExtraction,
  attendees: [attendee("Tan Kim Loo"), attendee("Chan Mei"), attendee("")],
});

describe("125 §2-4 — D30 with a confirmed headcount", () => {
  it("nobody named, nothing confirmed → not recorded (the save stays locked)", () => {
    expect(attendanceRecorded(emptyMeetingNotesExtraction)).toBe(false);
    expect(headcountForDocument(emptyMeetingNotesExtraction)).toBeUndefined();
  });

  it("a named list counts the names with something in them", () => {
    const e = withList();
    expect(namedAttendeeCount(e)).toBe(2);
    expect(attendanceRecorded(e)).toBe(true);
    expect(headcountForDocument(e)).toBe(2);
  });

  it("a person-confirmed headcount satisfies D30 with no names at all", () => {
    const e: MeetingNotesExtraction = { ...emptyMeetingNotesExtraction, attendance_confirmed: 52 };
    expect(confirmedHeadcount(e)).toBe(52);
    expect(attendanceRecorded(e)).toBe(true);
    expect(headcountForDocument(e)).toBe(52);
  });

  it("the confirmed count wins over the list's length when both exist", () => {
    const e: MeetingNotesExtraction = { ...withList(), attendance_confirmed: 52 };
    expect(headcountForDocument(e)).toBe(52);
  });

  it("zero or a non-integer is not a confirmed count", () => {
    expect(confirmedHeadcount({ ...emptyMeetingNotesExtraction, attendance_confirmed: 0 })).toBeUndefined();
    expect(attendanceRecorded({ ...emptyMeetingNotesExtraction, attendance_confirmed: 0 })).toBe(false);
    expect(confirmedHeadcount({ ...emptyMeetingNotesExtraction, attendance_confirmed: 2.5 })).toBeUndefined();
  });
});
