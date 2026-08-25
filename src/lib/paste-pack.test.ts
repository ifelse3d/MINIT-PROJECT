import { describe, expect, it } from "vitest";
import { buildPastePack, type FilingRosterEntry } from "@/lib/paste-pack";
import {
  emptyMeetingNotesExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";

// G-1 (work order 27, executing the 8/19 拍板 at last): the Annual Return's
// committee field files from `committee_roster` — the standing committee with
// IC names — never from what the AI read off one meeting's page. These tests
// pin the three shapes: no roster, roster missing IC names, complete roster.

function agmMeeting(): MeetingNotesExtraction {
  const e = structuredClone(emptyMeetingNotesExtraction);
  e.meeting_type = {
    value: "agm",
    confidence: "confirmed",
    source_ref: { location: "page 1", snippet: "Mesyuarat Agung Tahunan" },
  };
  // Office bearers the AI read off the page — the OLD source. They must NOT
  // reach the filing row any more.
  e.office_bearers = [
    {
      position: { value: "Pengerusi", confidence: "confirmed", source_ref: { location: "p1", snippet: "主席 陈大明" } },
      person_name: { value: "陈大明", confidence: "confirmed", source_ref: { location: "p1", snippet: "陈大明" } },
    },
  ];
  return e;
}

const bearersRow = (roster: FilingRosterEntry[]) =>
  buildPastePack(agmMeeting(), roster).find((r) =>
    r.erosesFieldEn.toLowerCase().includes("committee"),
  ) ??
  buildPastePack(agmMeeting(), roster).find((r) =>
    r.erosesField.toLowerCase().includes("jawatankuasa"),
  );

describe("the paste-pack committee field files from the roster (G-1)", () => {
  it("no roster in the system: the field is blocked and says where to go", () => {
    const row = bearersRow([]);
    expect(row).toBeDefined();
    expect(row!.value).toBe("—");
    expect(row!.confidence).toBe("missing");
    expect(row!.note).toContain("Ahli");
    // The AI-read name from the page must not leak through as a fallback.
    expect(row!.value).not.toContain("陈大明");
  });

  it("roster present but IC names missing: blocked at the FILING, named count", () => {
    const row = bearersRow([
      { name: "陈大明", position: "Pengerusi", nameOfficial: "TAN TAI BENG" },
      { name: "林小美", position: "Setiausaha", nameOfficial: null },
    ]);
    expect(row!.value).toBe("—");
    expect(row!.confidence).toBe("missing");
    expect(row!.note).toContain("1");
  });

  it("complete roster: official (IC) names, confirmed, sourced to the roster", () => {
    const row = bearersRow([
      { name: "陈大明", position: "Pengerusi", nameOfficial: "TAN TAI BENG" },
      { name: "林小美", position: "Setiausaha", nameOfficial: "LIM SIEW BEE" },
    ]);
    expect(row!.value).toBe("Pengerusi: TAN TAI BENG; Setiausaha: LIM SIEW BEE");
    expect(row!.confidence).toBe("confirmed");
    expect(row!.source).toContain("committee_roster");
    // The recorded (non-IC) spellings never enter a government field.
    expect(row!.value).not.toContain("陈大明");
  });

  it("a non-AGM meeting still blanks the WHOLE pack, roster or not", () => {
    const e = structuredClone(emptyMeetingNotesExtraction);
    e.meeting_type = {
      value: "committee",
      confidence: "confirmed",
      source_ref: { location: "p1", snippet: "AJK" },
    };
    const rows = buildPastePack(e, [
      { name: "陈大明", position: "Pengerusi", nameOfficial: "TAN TAI BENG" },
    ]);
    for (const r of rows) {
      expect(r.value).toBe("—");
    }
  });
});
