import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// SAMPLE DATA for the Phase 1 foundation (no API key connected yet).
// A realistic — but entirely FICTIONAL — mixed-language committee meeting,
// as the vision model would return it. Drives the /minutes review screen so
// it is fully clickable and screenshot-ready. Replaced by live extractions
// once the Anthropic key is connected.
//
// It deliberately shows all three confidence levels:
//   green (confirmed), amber (check — smudged name, unclear resolution),
//   red (missing — the treasurer position was never written down).
// ---------------------------------------------------------------------------

export const SAMPLE_ORG_NAME =
  "Persatuan Penganut Dewa Guan Di Selangor — Cawangan Klang";

export const SAMPLE_UPLOAD_LABEL =
  "nota-mesyuarat-jun.jpg (contoh / sample)";

export const sampleMeetingExtraction: MeetingNotesExtraction = {
  meeting_type: {
    value: "committee",
    confidence: "confirmed",
    source_ref: {
      location: "photo 1, heading",
      snippet: "Mesyuarat JK Bulanan 六月份理事会议",
    },
  },
  meeting_date: {
    value: "2026-06-14",
    confidence: "confirmed",
    source_ref: { location: "photo 1, heading", snippet: "14/6/26 (Ahad)" },
  },
  meeting_venue: {
    value: "Dewan utama tokong, Jalan Meru, Klang",
    confidence: "confirmed",
    source_ref: { location: "photo 1, line 2", snippet: "会所大礼堂 Jln Meru" },
  },
  attendees: [
    {
      name: {
        value: "Tan Ah Kow",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 4", snippet: "陈亚九 (Tan Ah Kow)" },
      },
    },
    {
      name: {
        value: "Lim Bee Hoon",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 5", snippet: "林美云 Lim Bee Hoon" },
      },
    },
    {
      name: {
        value: "S. Muniandy",
        confidence: "check",
        source_ref: {
          location: "photo 1, line 6",
          snippet: "S. Mun---dy (tulisan kabur / smudged)",
        },
      },
    },
  ],
  resolutions: [
    {
      text: {
        value:
          "Meluluskan pembaikan bumbung dewan dengan kos RM3,500 oleh kontraktor tempatan.",
        confidence: "confirmed",
        source_ref: {
          location: "photo 1, line 9",
          snippet: "同意修屋顶 RM3500 (bumbung) - lulus semua",
        },
      },
    },
    {
      text: {
        value: "Mengadakan majlis makan malam amal pada bulan September.",
        confidence: "check",
        source_ref: {
          location: "photo 1, line 11",
          snippet: "慈善晚宴 Sept? tarikh belum tetap",
        },
      },
    },
  ],
  figures: [
    {
      description: {
        value: "Kutipan derma bulan Mei / May donation collection",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 13", snippet: "五月乐捐 RM12,480.50" },
      },
      amount_cents: {
        value: 1248050,
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 13", snippet: "RM12,480.50" },
      },
    },
    {
      description: {
        value: "Kos pembaikan bumbung / Roof repair cost",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 9", snippet: "RM3500" },
      },
      amount_cents: {
        value: 350000,
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 9", snippet: "RM3500" },
      },
    },
  ],
  office_bearers: [
    {
      position: {
        value: "Setiausaha",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 5", snippet: "秘书 Lim Bee Hoon" },
      },
      person_name: {
        value: "Lim Bee Hoon",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 5", snippet: "林美云 Lim Bee Hoon" },
      },
    },
    {
      position: {
        value: "Bendahari",
        confidence: "confirmed",
        source_ref: { location: "photo 1, line 14", snippet: "财政 (nama tiada)" },
      },
      // The treasurer's NAME was never written in the notes — an honest gap.
      person_name: {
        value: "",
        confidence: "missing",
        source_ref: null,
      },
    },
  ],
};
