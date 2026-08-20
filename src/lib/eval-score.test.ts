import { describe, expect, it } from "vitest";
import {
  normalizeText,
  scoreMinutes,
  scoreLedger,
  scoreEvents,
  summarize,
  type ExpectedMinutes,
  type ExpectedLedger,
  type ExpectedEvents,
} from "./eval-score";
import type {
  MeetingNotesExtraction,
  LedgerExtraction,
  EventsExtraction,
  TextField,
  DateField,
  AmountCentsField,
} from "./extraction";

// --- tiny builders for AI-output fields --------------------------------------

const ref = { location: "photo 1, line 1", snippet: "asal" };
const t = (value: string): TextField =>
  value === ""
    ? { value: "", confidence: "missing", source_ref: null }
    : { value, confidence: "confirmed", source_ref: ref };
const d = (value: string): DateField =>
  value === ""
    ? { value: "", confidence: "missing", source_ref: null }
    : { value, confidence: "confirmed", source_ref: ref };
const amt = (value: number | null): AmountCentsField =>
  value === null
    ? { value: null, confidence: "missing", source_ref: null }
    : { value, confidence: "confirmed", source_ref: ref };

function minutesActual(over?: Partial<MeetingNotesExtraction>): MeetingNotesExtraction {
  return {
    meeting_type: { value: "agm", confidence: "confirmed", source_ref: ref },
    meeting_date: d("2026-08-30"),
    meeting_venue: t("Dewan Orang Ramai Taman Contoh"),
    attendees: [{ name: t("Tan Ah Kow") }, { name: t("Siti Aminah") }],
    resolutions: [{ text: t("Meluluskan penyata kewangan tahun 2025") }],
    figures: [{ description: t("Baki bank"), amount_cents: amt(1_234_500) }],
    office_bearers: [{ position: t("Pengerusi"), person_name: t("Tan Ah Kow") }],
    ...over,
  };
}

const minutesExpected: ExpectedMinutes = {
  meeting_type: "agm",
  meeting_date: "2026-08-30",
  meeting_venue: "Dewan Orang Ramai Taman Contoh",
  attendees: ["Tan Ah Kow", "Siti Aminah"],
  resolutions: ["Meluluskan penyata kewangan tahun 2025"],
  figures: [{ description: "Baki bank", amount_cents: 1_234_500 }],
  office_bearers: [{ position: "Pengerusi", person_name: "Tan Ah Kow" }],
};

// -----------------------------------------------------------------------------

describe("normalizeText", () => {
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeText("  Tan Ah-Kow, Jr. ")).toBe("tan ah kow jr");
  });
  it("keeps Chinese characters", () => {
    expect(normalizeText("陈亚九 (师傅)")).toBe("陈亚九 师傅");
  });
});

describe("scoreMinutes", () => {
  it("perfect extraction scores 100%", () => {
    const s = summarize(scoreMinutes(minutesExpected, minutesActual()));
    expect(s.overall.pct).toBe(100);
    expect(s.inventedCount).toBe(0);
    expect(s.failures).toHaveLength(0);
  });

  it("wrong date is a dated failure, exact-match only", () => {
    const s = summarize(
      scoreMinutes(minutesExpected, minutesActual({ meeting_date: d("2026-08-31") }))
    );
    // meeting_date is the ONLY date-kind field in a minutes case
    expect(s.byKind.date.total).toBe(1);
    expect(s.byKind.date.correct).toBe(0);
    expect(s.failures.map((f) => f.field)).toContain("meeting_date");
  });

  it("AI value where golden says missing = INVENTED", () => {
    const expectedNoVenue = { ...minutesExpected, meeting_venue: "" };
    const s = summarize(scoreMinutes(expectedNoVenue, minutesActual()));
    expect(s.inventedCount).toBe(1);
    const f = s.failures.find((x) => x.field === "meeting_venue")!;
    expect(f.invented).toBe(true);
  });

  it("AI missing where golden has a value = honest miss, not invented", () => {
    const s = summarize(
      scoreMinutes(minutesExpected, minutesActual({ meeting_venue: t("") }))
    );
    const f = s.failures.find((x) => x.field === "meeting_venue")!;
    expect(f.invented).toBe(false);
    expect(s.inventedCount).toBe(0);
  });

  it("attendee order does not matter (greedy matching)", () => {
    const swapped = minutesActual({
      attendees: [{ name: t("Siti Aminah") }, { name: t("Tan Ah Kow") }],
    });
    const s = summarize(scoreMinutes(minutesExpected, swapped));
    expect(s.overall.pct).toBe(100);
  });

  it("extra attendee the golden answer never listed = invented", () => {
    const extra = minutesActual({
      attendees: [
        { name: t("Tan Ah Kow") },
        { name: t("Siti Aminah") },
        { name: t("Hantu Raya") },
      ],
    });
    const s = summarize(scoreMinutes(minutesExpected, extra));
    expect(s.inventedCount).toBe(1);
    expect(s.failures[0].got).toBe("Hantu Raya");
  });

  it("name comparison tolerates case and punctuation", () => {
    const messy = minutesActual({ attendees: [{ name: t("TAN AH-KOW") }, { name: t("siti aminah") }] });
    const s = summarize(scoreMinutes(minutesExpected, messy));
    expect(s.overall.pct).toBe(100);
  });

  it("long text tolerates containment, short text must match", () => {
    const partial = minutesActual({
      resolutions: [{ text: t("Meluluskan penyata kewangan") }], // substring of golden
    });
    const s = summarize(scoreMinutes(minutesExpected, partial));
    expect(s.failures.filter((f) => f.field.startsWith("resolutions"))).toHaveLength(0);
  });
});

describe("scoreLedger", () => {
  const expected: ExpectedLedger = {
    page_title: "Buku Derma Jun 2026",
    rows: [
      { donor_name: "Lim Bee Hoon", donor_phone: "", amount_cents: 5000, purpose: "derma am", donated_at: "2026-06-07" },
      { donor_name: "陈亚九", donor_phone: "0123456789", amount_cents: 30000, purpose: "香油钱", donated_at: "2026-06-08" },
    ],
  };
  const row = (n: string, p: string, a: number | null, pu: string, dt: string) => ({
    donor_name: t(n), donor_phone: t(p), amount_cents: amt(a), purpose: t(pu), donated_at: d(dt),
  });

  it("amounts must match exactly to the sen", () => {
    const actual: LedgerExtraction = {
      page_title: t("Buku Derma Jun 2026"),
      rows: [
        row("Lim Bee Hoon", "", 5000, "derma am", "2026-06-07"),
        row("陈亚九", "0123456789", 30001, "香油钱", "2026-06-08"), // off by 1 sen
      ],
    };
    const s = summarize(scoreLedger(expected, actual));
    expect(s.byKind.amount.correct).toBe(1);
    expect(s.byKind.amount.total).toBe(2);
    expect(s.failures.some((f) => f.expected === "30000" && f.got === "30001")).toBe(true);
  });

  it("a completely missed row counts every sub-field as a miss", () => {
    const actual: LedgerExtraction = {
      page_title: t("Buku Derma Jun 2026"),
      rows: [row("Lim Bee Hoon", "", 5000, "derma am", "2026-06-07")],
    };
    const s = summarize(scoreLedger(expected, actual));
    // second row: all 5 sub-fields (name, phone, amount, purpose, date) are misses
    expect(s.failures.filter((f) => f.field.startsWith("rows[1]"))).toHaveLength(5);
    expect(s.inventedCount).toBe(0);
  });
});

describe("scoreEvents", () => {
  const expected: ExpectedEvents = {
    events: [{ title: "Makan malam tahunan", date: "2026-09-12", time: "7:30 malam" }],
  };
  it("scores title/date/time", () => {
    const actual: EventsExtraction = {
      events: [{ title: t("Makan Malam Tahunan"), date: d("2026-09-12"), time: t("") }],
    };
    const s = summarize(scoreEvents(expected, actual));
    expect(s.overall.correct).toBe(2); // title (case-insensitive) + date; time missed
    expect(s.overall.total).toBe(3);
  });
});

describe("summarize", () => {
  it("handles empty result list without dividing by zero", () => {
    const s = summarize([]);
    expect(s.overall.pct).toBe(0);
    expect(s.overall.total).toBe(0);
  });
});
