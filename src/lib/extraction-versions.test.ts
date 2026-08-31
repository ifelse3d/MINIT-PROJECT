import { describe, expect, it } from "vitest";
import {
  meetingRichness,
  mergeMeetingVersions,
  sameItem,
} from "@/lib/extraction-versions";
import {
  emptyMeetingNotesExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";

// ---------------------------------------------------------------------------
// §10 (work order 104): J's two papers about ONE meeting — a short note of
// what had to be done, and the typed-up minit of the same thing. Read as
// pages, the finished document ran "3. 4. 5." and then "1. 2.1 4. 5.".
// ---------------------------------------------------------------------------

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

describe("sameItem", () => {
  it("matches a short line inside its longer telling", () => {
    expect(sameItem("Perarakan", "3. Perarakan bermula 8 pagi")).toBe(true);
    expect(sameItem("2.1 早餐", "早餐")).toBe(true);
  });

  it("ignores the printed enumerator and the punctuation", () => {
    expect(sameItem("3. Sarapan pagi", "Sarapan pagi.")).toBe(true);
  });

  it("does NOT match two genuinely different decisions", () => {
    expect(sameItem("Beli 50 kerusi", "Sewa dewan untuk AGM")).toBe(false);
  });

  it("refuses to match on a fragment too short to mean anything", () => {
    expect(sameItem("ok", "kokurikulum bermula pagi")).toBe(false);
  });
});

describe("mergeMeetingVersions", () => {
  const short = meeting({
    meeting_date: check("2026-08-30"),
    resolutions: [
      { text: check("1. Lapor diri 8.30 pagi") },
      { text: check("2. Perarakan") },
    ],
  });
  const full = meeting({
    meeting_venue: check("Dewan Besar"),
    meeting_time: check("8.30 pagi"),
    resolutions: [
      { text: check("1. Lapor diri 8.30 pagi di dewan") },
      { text: check("2. Perarakan bermula selepas lapor diri") },
      { text: check("3. Sarapan") },
      { text: check("4. Kelas") },
      { text: check("5. Liveband") },
    ],
  });

  it("uses the FULLEST version as the document, whatever order they arrive in", () => {
    for (const order of [
      [short, full],
      [full, short],
    ]) {
      const out = mergeMeetingVersions(order);
      expect(out.meeting_venue.value).toBe("Dewan Besar");
      expect(out.resolutions[0].text.value).toBe("1. Lapor diri 8.30 pagi di dewan");
    }
  });

  it("writes ONE agenda, not two — J's 「3. 4. 5.」 then 「1. 2.1 4. 5.」", () => {
    const out = mergeMeetingVersions([short, full]);
    expect(out.resolutions).toHaveLength(5);
    expect(out.resolutions.map((r) => r.text.value)).toEqual([
      "1. Lapor diri 8.30 pagi di dewan",
      "2. Perarakan bermula selepas lapor diri",
      "3. Sarapan",
      "4. Kelas",
      "5. Liveband",
    ]);
  });

  it("still takes what only the OTHER version had", () => {
    // The short note carries the date; the full minit never printed one.
    const out = mergeMeetingVersions([short, full]);
    expect(out.meeting_date.value).toBe("2026-08-30");
  });

  it("adds a decision the fullest version genuinely does not carry", () => {
    const extra = meeting({
      resolutions: [{ text: check("Beli 50 kerusi baharu") }],
    });
    const out = mergeMeetingVersions([full, extra]);
    expect(out.resolutions).toHaveLength(6);
    expect(out.resolutions[5].text.value).toBe("Beli 50 kerusi baharu");
  });

  it("one reading comes back untouched", () => {
    expect(mergeMeetingVersions([full])).toBe(full);
  });

  it("counts FACTS, not characters, when deciding which is fullest", () => {
    const wordy = meeting({
      resolutions: [{ text: check("a".repeat(400)) }],
    });
    expect(meetingRichness(full)).toBeGreaterThan(meetingRichness(wordy));
    expect(mergeMeetingVersions([wordy, full]).resolutions).toHaveLength(6);
  });

  it("keeps a missing field missing when no version read it", () => {
    const a = meeting({ meeting_venue: missing() });
    const b = meeting({ meeting_venue: missing() });
    expect(mergeMeetingVersions([a, b]).meeting_venue.confidence).toBe("missing");
  });
});

// ---------------------------------------------------------------------------
// The overlap arm, set from J's own two papers (probe-versions-104). The one
// line that really is the same item told twice scored 0.67 of the shorter
// line's words; the best score for either genuinely-different line was 0.11.
// ---------------------------------------------------------------------------

describe("sameItem — two hands writing the same fact", () => {
  it("matches the real pair the containment rule misses", () => {
    expect(
      sameItem(
        "3 Agenda 2.1 diganti Lee Moy (Lim Guat Kior)",
        "Lim Guat Kioy ganti - Lee Moy",
      ),
    ).toBe(true);
  });

  it("does NOT match the other two lines of the same paper", () => {
    expect(
      sameItem(
        "4 lanti AJK seang. Teh kim hoo 661112 07 5089",
        "Setiausaha En.Loo Sio San membentangkan minit mesyuarat Agung yang lalu.",
      ),
    ).toBe(false);
    expect(sameItem("5 usul pindaan alamat.", "Ucapan Pengerusi")).toBe(false);
  });

  it("needs three content words before the overlap arm applies at all", () => {
    // Two two-word lines sharing one word must not collapse into one.
    expect(sameItem("Beli kerusi", "Beli meja")).toBe(false);
  });

  it("ignores bare numbers — they are the printed numbering, not the subject", () => {
    expect(sameItem("1. 2026 2027 2028", "5. 2026 2027 2028")).toBe(false);
  });

  it("works in Chinese, where words are one or two characters", () => {
    expect(sameItem("通过购买五十张椅子", "购买五十张椅子")).toBe(true);
    expect(sameItem("通过购买五十张椅子", "租借礼堂开常年大会")).toBe(false);
  });
});
