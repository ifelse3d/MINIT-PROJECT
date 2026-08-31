import { describe, expect, it } from "vitest";
import {
  hasMeetingContent,
  mergeConstitutionExtractions,
  mergeLedgerExtractions,
  mergeMeetingExtractions,
  mergedSourceLabel,
} from "@/lib/extraction-merge";
import {
  emptyLedgerExtraction,
  emptyMeetingNotesExtraction,
  type ConstitutionExtraction,
  type MeetingNotesExtraction,
  type TextField,
} from "@/lib/extraction";

// G-2 (J #10): a photo taken after typing ADDS; it never wipes. These tests
// are the guarantee that a person's typed half-meeting survives the shutter.

const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: { location: "typed", snippet: value },
});
const check = (value: string) => ({
  value,
  confidence: "check" as const,
  source_ref: { location: "photo", snippet: value },
});
const missing = () => ({
  value: "",
  confidence: "missing" as const,
  source_ref: null,
});

const meeting = (over: Partial<MeetingNotesExtraction>): MeetingNotesExtraction => ({
  ...structuredClone(emptyMeetingNotesExtraction),
  ...over,
});

describe("mergeMeetingExtractions", () => {
  it("keeps every typed row and appends what the photo read", () => {
    const typed = meeting({
      resolutions: [{ text: confirmed("家长班改到礼堂") }],
    });
    const photo = meeting({
      resolutions: [{ text: check("Perarakan bermula 8 pagi") }],
    });
    const m = mergeMeetingExtractions(typed, photo);
    expect(m.resolutions.map((r) => r.text.value)).toEqual([
      "家长班改到礼堂",
      "Perarakan bermula 8 pagi",
    ]);
    // The typed row keeps its human confirmation.
    expect(m.resolutions[0].text.confidence).toBe("confirmed");
  });

  it("a scalar the human settled is not outranked by the model", () => {
    const typed = meeting({ meeting_date: confirmed("2026-08-20") });
    const photo = meeting({ meeting_date: check("2026-08-21") });
    expect(mergeMeetingExtractions(typed, photo).meeting_date.value).toBe(
      "2026-08-20",
    );
  });

  it("an absence the human asserted also stands (confirmed empty)", () => {
    const typed = meeting({
      meeting_venue: { value: "", confidence: "confirmed", source_ref: { location: "reviewed", snippet: "none" } },
    });
    const photo = meeting({ meeting_venue: check("Dewan Besar") });
    const m = mergeMeetingExtractions(typed, photo);
    expect(m.meeting_venue.value).toBe("");
    expect(m.meeting_venue.confidence).toBe("confirmed");
  });

  it("an unsettled scalar takes the new reading", () => {
    const typed = meeting({ meeting_venue: missing() });
    const photo = meeting({ meeting_venue: check("Dewan Besar") });
    expect(mergeMeetingExtractions(typed, photo).meeting_venue.value).toBe(
      "Dewan Besar",
    );
  });

  it("de-duplicates attendees by name, keeping the human's row", () => {
    const typed = meeting({ attendees: [{ name: confirmed("嘉益") }] });
    const photo = meeting({
      attendees: [{ name: check("嘉益") }, { name: check("雯倩") }],
    });
    const m = mergeMeetingExtractions(typed, photo);
    expect(m.attendees.map((a) => a.name.value)).toEqual(["嘉益", "雯倩"]);
    expect(m.attendees[0].name.confidence).toBe("confirmed");
  });

  it("keeps the society's own meeting name", () => {
    const typed = meeting({ meeting_type_label: "青年组周会" });
    const photo = meeting({ meeting_type_label: undefined });
    expect(mergeMeetingExtractions(typed, photo).meeting_type_label).toBe(
      "青年组周会",
    );
  });

  // 0-3 (26 号报告 2-3): while the model reads page 2 (5–20 s), the person can
  // keep confirming page 1's fields. The stores now merge with a functional
  // update, i.e. onto the state AS IT IS when the read returns — this test
  // simulates that one confirmation landing mid-read, and pins BOTH halves:
  // merging onto the current state keeps the tick; merging onto the
  // shutter-time snapshot (the old bug) would silently revert it.
  it("a field confirmed while the AI was reading survives the merge", () => {
    const atShutter = meeting({
      meeting_date: check("2026-08-25"),
      resolutions: [{ text: check("家长班改到礼堂") }],
    });
    // Mid-read, the person taps "没错" on the date.
    const whileReading = meeting({
      meeting_date: confirmed("2026-08-25"),
      resolutions: [{ text: check("家长班改到礼堂") }],
    });
    const page2 = meeting({
      meeting_date: check("2026-08-26"), // the model mis-reads the date
      resolutions: [{ text: check("Perarakan bermula 8 pagi") }],
    });

    // Functional update (the fix): the tick stands, page 2 still appends.
    const merged = mergeMeetingExtractions(whileReading, page2);
    expect(merged.meeting_date.confidence).toBe("confirmed");
    expect(merged.meeting_date.value).toBe("2026-08-25");
    expect(merged.resolutions).toHaveLength(2);

    // Shutter-time snapshot (the old bug): the tick would be gone.
    const stale = mergeMeetingExtractions(atShutter, page2);
    expect(stale.meeting_date.confidence).not.toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------
// The 真件 A regression (work order 100 Stage 1): this merge predates G1 and
// returned an object literal WITHOUT the optional header/closing keys — so
// page 2 of a two-page meeting silently deleted the MASA and the "AJK yang
// hadir : 33 orang" that page 1 had correctly read. These tests pin the fix.
// ---------------------------------------------------------------------------

describe("mergeMeetingExtractions — G1 optional fields survive a merge", () => {
  it("keeps page 1's MASA / headcount / adjournment / signers when page 2 has none", () => {
    const page1 = meeting({
      meeting_time: check("8.30 PM – 10.30 PM"),
      attendance_count: check("AJK yang hadir : 33 orang"),
      adjournment: check("Mesyuarat ditangguhkan pada 10.30 PM"),
      prepared_by: { position: check("SETIAUSAHA"), person_name: check("LOO SIO SAN") },
      endorsed_by: { position: check("PENGERUSI"), person_name: check("KHONG YEM TIM") },
    });
    const merged = mergeMeetingExtractions(page1, meeting({}));
    expect(merged.meeting_time?.value).toBe("8.30 PM – 10.30 PM");
    expect(merged.attendance_count?.value).toBe("AJK yang hadir : 33 orang");
    expect(merged.adjournment?.value).toBe("Mesyuarat ditangguhkan pada 10.30 PM");
    expect(merged.prepared_by?.person_name.value).toBe("LOO SIO SAN");
    expect(merged.endorsed_by?.person_name.value).toBe("KHONG YEM TIM");
  });

  it("takes page 2's value when page 1 had none", () => {
    const merged = mergeMeetingExtractions(
      meeting({}),
      meeting({ meeting_time: check("8.30 PM") }),
    );
    expect(merged.meeting_time?.value).toBe("8.30 PM");
  });

  it("a CONFIRMED page-1 value is settled — page 2 does not outrank the human", () => {
    const merged = mergeMeetingExtractions(
      meeting({ meeting_time: confirmed("8.30 PM") }),
      meeting({ meeting_time: check("9.00 PM") }),
    );
    expect(merged.meeting_time?.value).toBe("8.30 PM");
  });

  it("absent on both sides STAYS absent (no empty review row is invented)", () => {
    const merged = mergeMeetingExtractions(meeting({}), meeting({}));
    expect(merged.meeting_time).toBeUndefined();
    expect(merged.attendance_count).toBeUndefined();
    expect(merged.adjournment).toBeUndefined();
    expect(merged.prepared_by).toBeUndefined();
    expect(merged.financial_resolutions).toBeUndefined();
  });

  it("financial_resolutions concatenate when either side has any", () => {
    const fr = {
      vendor_name: check("Kedai Cat"),
      approved_amount_cents: {
        value: 50000,
        confidence: "check" as const,
        source_ref: { location: "photo 1", snippet: "RM500" },
      },
      purpose: check("cat dinding"),
    };
    const merged = mergeMeetingExtractions(
      meeting({ financial_resolutions: [fr] }),
      meeting({}),
    );
    expect(merged.financial_resolutions).toHaveLength(1);
  });
});

describe("hasMeetingContent", () => {
  it("is false for the empty page and true once anything is typed", () => {
    expect(hasMeetingContent(emptyMeetingNotesExtraction)).toBe(false);
    expect(
      hasMeetingContent(meeting({ resolutions: [{ text: confirmed("x") }] })),
    ).toBe(true);
    // A human's "not written down" is also content worth protecting.
    expect(
      hasMeetingContent(
        meeting({
          meeting_venue: { value: "", confidence: "confirmed", source_ref: null },
        }),
      ),
    ).toBe(true);
  });
});

describe("mergeLedgerExtractions", () => {
  it("appends page 2's rows after page 1's, edits intact", () => {
    const page1 = {
      ...structuredClone(emptyLedgerExtraction),
      rows: [
        {
          donor_name: confirmed("陈亚妹"),
          donor_phone: missing(),
          amount_cents: { value: 1050, confidence: "confirmed" as const, source_ref: null },
          donated_at: confirmed("2026-08-25"),
          purpose: confirmed("Derma am"),
        },
      ],
    };
    const page2 = {
      ...structuredClone(emptyLedgerExtraction),
      rows: [
        {
          donor_name: check("Lim Bee Hoon"),
          donor_phone: missing(),
          amount_cents: { value: 2000, confidence: "check" as const, source_ref: null },
          donated_at: check("2026-08-25"),
          purpose: check("Derma am"),
        },
      ],
    };
    const m = mergeLedgerExtractions(page1, page2);
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].donor_name.value).toBe("陈亚妹");
    expect(m.rows[0].donor_name.confidence).toBe("confirmed");
    expect(m.rows[1].donor_name.value).toBe("Lim Bee Hoon");
  });
});

describe("mergedSourceLabel", () => {
  it("joins a second page onto the first", () => {
    expect(mergedSourceLabel(null, "p1.jpg")).toBe("p1.jpg");
    expect(mergedSourceLabel("p1.jpg", "p2.jpg")).toBe("p1.jpg ＋ p2.jpg");
  });
  it("collapses to a count once the names stop fitting a badge", () => {
    const long = mergedSourceLabel(
      "a-very-long-file-name-from-a-phone-camera-20260825-0001.jpg ＋ another-one-0002.jpg",
      "third-page-0003.jpg",
    );
    expect(long).toBe("3 × 📄");
  });

  // I-4③ (26 号报告 §3-6): the collapsed badge used to be re-split on " ＋ ",
  // which counts one thing — so 6 pages displayed as 4, shrinking each merge.
  it("keeps counting UP after collapsing", () => {
    expect(mergedSourceLabel("3 × 📄", "page4.jpg")).toBe("4 × 📄");
    expect(mergedSourceLabel("11 × 📄", "page12.jpg")).toBe("12 × 📄");
  });
});

// ---------------------------------------------------------------------------
// §2 (work order 104): the organisation block across several photographed
// pages. Page 1 prints the name; page 2 does not — and page 2 must not be
// allowed to erase it.
// ---------------------------------------------------------------------------

describe("mergeConstitutionExtractions — the organisation block", () => {
  const page = (org?: ConstitutionExtraction["organisation"]): ConstitutionExtraction => ({
    document_title: missing(),
    organisation: org,
    clauses: [],
  });
  const org = (name: TextField): ConstitutionExtraction["organisation"] => ({
    registered_name: name,
    registered_address: missing(),
    registration_no: missing(),
  });

  it("a later page that read nothing does not erase page 1's name", () => {
    const merged = mergeConstitutionExtractions(
      page(org(confirmed("PERTUBUHAN CONTOH HARMONI"))),
      page(org(missing())),
    );
    expect(merged.organisation?.registered_name.value).toBe(
      "PERTUBUHAN CONTOH HARMONI",
    );
  });

  it("a later page fills in what page 1 could not read", () => {
    const merged = mergeConstitutionExtractions(
      page(org(missing())),
      page(org(check("PERTUBUHAN CONTOH HARMONI"))),
    );
    expect(merged.organisation?.registered_name.value).toBe(
      "PERTUBUHAN CONTOH HARMONI",
    );
  });

  it("absent on both sides stays absent (a constitution read before §2)", () => {
    const merged = mergeConstitutionExtractions(page(), page());
    expect(merged.organisation).toBeUndefined();
  });

  it("one side absent still keeps the other side's reading", () => {
    const merged = mergeConstitutionExtractions(
      page(),
      page(org(confirmed("PERTUBUHAN CONTOH HARMONI"))),
    );
    expect(merged.organisation?.registered_name.value).toBe(
      "PERTUBUHAN CONTOH HARMONI",
    );
    expect(merged.organisation?.registration_no.confidence).toBe("missing");
  });
});
