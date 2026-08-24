import { describe, expect, it } from "vitest";
import {
  appearsInSource,
  demoteEventsNotInSource,
  demoteSuspectPhones,
  myPhoneProblem,
} from "./verbatim";
import type { EventsExtraction, LedgerExtraction } from "./extraction";

// S0-7 (2026-08-25): the 08-24 eval showed the model TRUNCATES verbatim values
// without flagging them. These tests pin the two failures it actually made —
// phone digits eaten (012-3456789 → 012-345678) — and the demotion machinery.

describe("myPhoneProblem", () => {
  it("accepts complete Malaysian numbers in common formats", () => {
    expect(myPhoneProblem("012-3456789")).toBeNull(); // mobile, 10 digits
    expect(myPhoneProblem("011-2345 6789")).toBeNull(); // 011 mobile, 11 digits
    expect(myPhoneProblem("+60 12-345 6789")).toBeNull(); // intl mobile
    expect(myPhoneProblem("03-9876 5432")).toBeNull(); // KL landline, 10 digits
    expect(myPhoneProblem("04-226 1234")).toBeNull(); // Penang landline, 9 digits
  });

  it("flags the exact truncations the 08-24 eval produced", () => {
    expect(myPhoneProblem("012-345678")).toBe("too_short"); // one digit eaten
    expect(myPhoneProblem("03-9")).toBe("too_short"); // most digits eaten
  });

  it("flags overlong and non-Malaysian shapes", () => {
    expect(myPhoneProblem("012-345678901")).toBe("too_long");
    expect(myPhoneProblem("12345")).toBe("not_malaysian_format");
  });

  it("says nothing about an empty value — that is the missing-confidence system's job", () => {
    expect(myPhoneProblem("")).toBeNull();
    expect(myPhoneProblem("   ")).toBeNull();
  });
});

describe("appearsInSource", () => {
  it("is whitespace- and case-insensitive", () => {
    expect(appearsInSource("Makan Malam", "aturcara:  makan   malam tahunan")).toBe(true);
  });
  it("rejects a value not copied from the source", () => {
    expect(appearsInSource("gotong-royong", "makan malam sahaja")).toBe(false);
  });
  it("treats an empty value as fine (missing is handled elsewhere)", () => {
    expect(appearsInSource("", "anything")).toBe(true);
  });
});

function ledgerWith(phone: string, confidence: "confirmed" | "check"): LedgerExtraction {
  return {
    page_title: { value: "", confidence: "missing", source_ref: null },
    rows: [
      {
        donor_name: { value: "Tan Ah Kow", confidence: "confirmed", source_ref: { kind: "row", ref: "1" } },
        donor_phone: { value: phone, confidence, source_ref: { kind: "row", ref: "1" } },
        amount_cents: { value: 1000, confidence: "confirmed", source_ref: { kind: "row", ref: "1" } },
        purpose: { value: "", confidence: "missing", source_ref: null },
        donated_at: { value: "2026-08-01", confidence: "confirmed", source_ref: { kind: "row", ref: "1" } },
      },
    ],
  } as unknown as LedgerExtraction;
}

describe("demoteSuspectPhones", () => {
  it("demotes a confirmed-but-truncated phone to check", () => {
    const { extraction, demoted } = demoteSuspectPhones(ledgerWith("012-345678", "confirmed"));
    expect(demoted).toBe(1);
    expect(extraction.rows[0].donor_phone.confidence).toBe("check");
    // The VALUE is untouched — demotion asks a human, it never edits data.
    expect(extraction.rows[0].donor_phone.value).toBe("012-345678");
  });

  it("leaves complete phones and already-flagged phones alone", () => {
    expect(demoteSuspectPhones(ledgerWith("012-3456789", "confirmed")).demoted).toBe(0);
    expect(demoteSuspectPhones(ledgerWith("012-345678", "check")).demoted).toBe(0);
  });
});

function eventsWith(title: string, confidence: "confirmed" | "check"): EventsExtraction {
  return {
    events: [
      {
        title: { value: title, confidence, source_ref: { kind: "line", ref: "1" } },
        date: { value: "2026-08-30", confidence: "confirmed", source_ref: { kind: "line", ref: "1" } },
        time: { value: "", confidence: "missing", source_ref: null },
      },
    ],
  } as unknown as EventsExtraction;
}

describe("demoteEventsNotInSource", () => {
  const source = "AGM 30 Ogos dewan besar, makan malam 12 Sept";

  it("keeps a title that is really in the pasted text", () => {
    const { demoted } = demoteEventsNotInSource(eventsWith("makan malam", "confirmed"), source);
    expect(demoted).toBe(0);
  });

  it("demotes a confirmed title the text never contained", () => {
    const { extraction, demoted } = demoteEventsNotInSource(
      eventsWith("gotong-royong perdana", "confirmed"),
      source,
    );
    expect(demoted).toBe(1);
    expect(extraction.events[0].title.confidence).toBe("check");
  });

  it("never touches dates — rewriting '30 Ogos' as 2026-08-30 is legitimate", () => {
    const { extraction } = demoteEventsNotInSource(
      eventsWith("gotong-royong perdana", "confirmed"),
      source,
    );
    expect(extraction.events[0].date.confidence).toBe("confirmed");
  });
});
