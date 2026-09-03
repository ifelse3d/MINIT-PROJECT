import { describe, expect, it } from "vitest";
import {
  DUPLICATE_ASK_RATIO,
  DUPLICATE_MIN_ITEMS,
  findRepeatedReading,
} from "./duplicate-pages";
import type { MeetingNotesExtraction } from "@/lib/extraction";

const field = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: { location: "photo 1", snippet: value },
});

function reading(texts: string[]): MeetingNotesExtraction {
  return {
    meeting_type: field("committee"),
    meeting_date: field("2026-05-20"),
    meeting_venue: field("Dewan"),
    attendees: [],
    resolutions: texts.map((t) => ({ text: field(t) })),
    figures: [],
    office_bearers: [],
  } as unknown as MeetingNotesExtraction;
}

describe("findRepeatedReading — §3 (105), the app noticing on its own", () => {
  it("🔴 J's real shape: a short note whose decisions are already in the typed minit", () => {
    // Same shape as the measured pair (probe-duplicates-105): the short note
    // has three decisions and one of them is the minit's, written by another
    // hand — the word order differs and a name is spelled differently.
    const note = reading([
      "Ooi Bee Huay ganti - Chan Mei",
      "Bawa kerusi",
    ]);
    const minit = reading([
      "Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)",
      "Ucapan Pengerusi dan aluan kepada semua",
      "Laporan kewangan dibentangkan oleh Bendahari",
    ]);
    const found = findRepeatedReading([note, minit])!;
    expect(found).not.toBeNull();
    expect(found.shorter).toBe(0);
    expect(found.matches).toBe(1);
    expect(found.ratio).toBeGreaterThanOrEqual(DUPLICATE_ASK_RATIO);
  });

  it("🔴 two genuine PAGES of one meeting are never asked about", () => {
    const page1 = reading([
      "Ucapan Pengerusi dan aluan kepada semua yang hadir",
      "Laporan kewangan dibentangkan oleh Bendahari",
    ]);
    const page2 = reading([
      "Cadangan lawatan ke Pulau Pinang dibincangkan",
      "Tarikh mesyuarat akan datang ditetapkan",
    ]);
    expect(findRepeatedReading([page1, page2])).toBeNull();
  });

  it("🔴 an agenda TABLE row against the paragraph that expands it is not a repeat", () => {
    // The false positive the negative control found: a printed minit's own
    // table row is literally contained in its section paragraph.
    const tablePage = reading([
      "Kekosongan jawatan Ahli Jawatankuasa",
      "Pindaan alamat berdaftar pertubuhan",
    ]);
    const bodyPage = reading([
      "Kekosongan jawatan Ahli Jawatankuasa dibincangkan dengan panjang lebar oleh mesyuarat, dan beberapa nama telah dicadangkan untuk mengisi kekosongan itu sebelum mesyuarat agung akan datang",
      "Pindaan alamat berdaftar pertubuhan perlu dikemukakan kepada Pendaftar Pertubuhan dalam tempoh yang ditetapkan oleh undang-undang tubuh, dan Setiausaha akan menguruskan borang berkenaan",
    ]);
    expect(findRepeatedReading([tablePage, bodyPage])).toBeNull();
  });

  it("a one-line reading is never evidence of anything", () => {
    const a = reading(["Bawa kerusi"]);
    const b = reading(["Bawa kerusi", "Ucapan Pengerusi"]);
    expect(DUPLICATE_MIN_ITEMS).toBe(2);
    expect(findRepeatedReading([a, b])).toBeNull();
  });

  it("one reading on its own asks nothing", () => {
    expect(findRepeatedReading([reading(["a", "b"])])).toBeNull();
  });

  it("empty readings ask nothing", () => {
    expect(findRepeatedReading([reading([]), reading([])])).toBeNull();
  });

  it("a wholly repeated paper is caught outright", () => {
    const lines = ["Ucapan Pengerusi dan aluan", "Laporan kewangan dibentangkan"];
    const found = findRepeatedReading([reading(lines), reading([...lines, "Hal lain"])])!;
    expect(found.ratio).toBe(1);
    expect(found.matches).toBe(2);
  });
});
