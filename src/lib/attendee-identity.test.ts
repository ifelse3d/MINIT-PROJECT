import { describe, expect, it } from "vitest";

import { attendeeIdentityKey } from "./attendee-identity";

describe("attendeeIdentityKey (I4 — same name, two people)", () => {
  it("two people sharing a name are told apart by their note", () => {
    expect(attendeeIdentityKey("Ali", "青年组")).not.toBe(
      attendeeIdentityKey("Ali", "妇女组"),
    );
  });

  it("old data with no note keeps matching itself (一筆不丟)", () => {
    // Attendees saved before notes existed carry no note field at all —
    // undefined, null and "" must all be the same person.
    expect(attendeeIdentityKey("Ali")).toBe(attendeeIdentityKey("Ali", null));
    expect(attendeeIdentityKey("Ali")).toBe(attendeeIdentityKey("Ali", ""));
    expect(attendeeIdentityKey("Ali")).toBe(attendeeIdentityKey(" ali ", "  "));
  });

  it("case and surrounding spaces do not create a second person", () => {
    expect(attendeeIdentityKey("Ali Bin Abu", "大")).toBe(
      attendeeIdentityKey("  ALI bin abu ", " 大 "),
    );
  });

  it("a note-less Ali is NOT the same key as a noted Ali", () => {
    // The picker offers both roster rows even when a bare "Ali" is already
    // on the list — which of the two the bare one was is not decidable, and
    // guessing would hide a real person.
    expect(attendeeIdentityKey("Ali")).not.toBe(attendeeIdentityKey("Ali", "大"));
  });

  it("no separator collision: the note cannot leak into the name", () => {
    expect(attendeeIdentityKey('a", "b')).not.toBe(attendeeIdentityKey("a", "b"));
  });
});
