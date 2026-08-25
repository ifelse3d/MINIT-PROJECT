// Stage 0-1 (2026-08-25): the sample fixtures must be REFUSED by the two
// server actions that write real records — issue-receipts and
// save-confirmed-minutes. Those actions call these guards first, before any
// database work, so "the guard says sample" IS "the API rejects it".
import { describe, expect, it } from "vitest";

import {
  containsSampleDonation,
  isSampleDonation,
  isSampleMeetingExtraction,
} from "@/lib/sample-guard";
import { sampleLedgerExtraction, sampleRegisterDonations } from "@/lib/sample-ledger";
import { sampleMeetingExtraction } from "@/lib/sample-data";
import type { MeetingNotesExtraction } from "@/lib/extraction";

describe("isSampleDonation", () => {
  it("recognises every row of the sample register", () => {
    for (const d of sampleRegisterDonations) {
      expect(
        isSampleDonation({
          donorName: d.donorName,
          amountCents: d.amountCents,
          donatedAtIso: d.donatedAtIso,
        }),
      ).toBe(true);
    }
  });

  it("recognises every row of the sample ledger extraction (the add-to-register path)", () => {
    for (const r of sampleLedgerExtraction.rows) {
      expect(
        isSampleDonation({
          donorName: r.donor_name.value,
          amountCents: r.amount_cents.value ?? 0,
          donatedAtIso: r.donated_at.value,
        }),
      ).toBe(true);
    }
  });

  it("ignores surrounding whitespace — a trimmed copy is still the sample", () => {
    expect(
      isSampleDonation({
        donorName: "  Tan Ah Kow ",
        amountCents: 5000,
        donatedAtIso: "2026-06-07",
      }),
    ).toBe(true);
  });

  it("does NOT flag a real donation that merely shares a name", () => {
    // Same donor name and amount as sample row 1, but a different day: this is
    // somebody's real donation and must go through.
    expect(
      isSampleDonation({
        donorName: "Tan Ah Kow",
        amountCents: 5000,
        donatedAtIso: "2026-08-25",
      }),
    ).toBe(false);
    // Same date, different amount.
    expect(
      isSampleDonation({
        donorName: "Tan Ah Kow",
        amountCents: 5100,
        donatedAtIso: "2026-06-07",
      }),
    ).toBe(false);
    // An unrelated person entirely.
    expect(
      isSampleDonation({
        donorName: "Lee Mei Ling",
        amountCents: 5000,
        donatedAtIso: "2026-06-07",
      }),
    ).toBe(false);
  });

  it("containsSampleDonation: one sample row poisons the batch", () => {
    const real = {
      donorName: "Lee Mei Ling",
      amountCents: 12300,
      donatedAtIso: "2026-08-20",
    };
    const sample = {
      donorName: sampleRegisterDonations[0].donorName,
      amountCents: sampleRegisterDonations[0].amountCents,
      donatedAtIso: sampleRegisterDonations[0].donatedAtIso,
    };
    expect(containsSampleDonation([real])).toBe(false);
    expect(containsSampleDonation([real, sample])).toBe(true);
    expect(containsSampleDonation([])).toBe(false);
  });
});

describe("isSampleMeetingExtraction", () => {
  it("recognises the sample meeting verbatim", () => {
    expect(isSampleMeetingExtraction(sampleMeetingExtraction)).toBe(true);
  });

  it("still recognises it after every field has been 'confirmed' (confirming does not touch source_refs)", () => {
    const confirmed = structuredClone(sampleMeetingExtraction) as MeetingNotesExtraction;
    confirmed.meeting_type.confidence = "confirmed";
    confirmed.meeting_date.confidence = "confirmed";
    confirmed.meeting_venue.confidence = "confirmed";
    for (const a of confirmed.attendees) a.name.confidence = "confirmed";
    for (const r of confirmed.resolutions) r.text.confidence = "confirmed";
    expect(isSampleMeetingExtraction(confirmed)).toBe(true);
  });

  it("still recognises it after a few fields were edited (their refs change, the rest remain)", () => {
    const edited = structuredClone(sampleMeetingExtraction) as MeetingNotesExtraction;
    edited.meeting_date.value = "2026-08-25";
    edited.meeting_date.source_ref = { location: "user", snippet: "edited" };
    edited.meeting_venue.value = "Somewhere else";
    edited.meeting_venue.source_ref = { location: "user", snippet: "edited" };
    expect(isSampleMeetingExtraction(edited)).toBe(true);
  });

  it("does NOT flag a real extraction with its own source_refs", () => {
    const real = {
      meeting_type: {
        value: "committee",
        confidence: "confirmed",
        source_ref: { location: "photo 1, heading", snippet: "Mesyuarat bulanan" },
      },
      meeting_date: {
        value: "2026-08-20",
        confidence: "confirmed",
        source_ref: { location: "photo 1, heading", snippet: "20/8/26" },
      },
      meeting_venue: {
        value: "Dewan orang ramai",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 2", snippet: "dewan" },
      },
      attendees: [
        {
          name: {
            value: "Lee Mei Ling",
            confidence: "confirmed",
            source_ref: { location: "photo 1, line 3", snippet: "Lee Mei Ling" },
          },
        },
      ],
      resolutions: [],
      figures: [],
      office_bearers: [],
    };
    expect(isSampleMeetingExtraction(real)).toBe(false);
  });

  it("does NOT flag an empty or hand-typed extraction (no source_refs at all)", () => {
    expect(isSampleMeetingExtraction({})).toBe(false);
    expect(isSampleMeetingExtraction(null)).toBe(false);
    expect(
      isSampleMeetingExtraction({
        meeting_type: { value: "agm", confidence: "confirmed", source_ref: null },
        attendees: [],
        resolutions: [],
        figures: [],
        office_bearers: [],
      }),
    ).toBe(false);
  });
});
