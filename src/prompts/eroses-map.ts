// eROSES Annual Return field mapping — pipeline step 4 (paste-pack).
// This is CONTENT maintained by the team, not code (CLAUDE.md rule 6 &
// BUILD_PLAN.md §2.4): it maps confirmed extraction fields to the field
// names the treasurer/secretary sees in the eROSES portal, so they can
// copy-paste each value into the right box.
//
// ⚠ VERIFY: the labels below are drafted from memory of the eROSES Annual
// Return (Penyata Tahunan) screens. Before first real filing, open eROSES
// and correct every label to match the live portal EXACTLY.

export type ErosesMapEntry = {
  /** Field label as shown in the eROSES portal (BM). ⚠ VERIFY against portal. */
  erosesField: string;
  /** English gloss for the review UI. */
  erosesFieldEn: string;
  /** Dot-path into MeetingNotesExtraction that supplies the value. */
  extractionPath:
    | "meeting_type"
    | "meeting_date"
    | "meeting_venue"
    | "attendees"
    | "office_bearers"
    | "figures";
  /** Guidance shown to the human next to the value. */
  note: string;
};

export const EROSES_ANNUAL_RETURN_MAP: ErosesMapEntry[] = [
  {
    erosesField: "Jenis Mesyuarat",
    erosesFieldEn: "Meeting type",
    extractionPath: "meeting_type",
    note: "AGM diperlukan untuk Penyata Tahunan / AGM is required for the Annual Return.",
  },
  {
    erosesField: "Tarikh Mesyuarat Agung",
    erosesFieldEn: "Date of general meeting",
    extractionPath: "meeting_date",
    note: "Penyata Tahunan perlu dihantar dalam 60 hari selepas tarikh ini / Annual Return due within 60 days of this date.",
  },
  {
    erosesField: "Tempat Mesyuarat",
    erosesFieldEn: "Meeting venue",
    extractionPath: "meeting_venue",
    note: "",
  },
  {
    erosesField: "Bilangan Ahli Hadir",
    erosesFieldEn: "Number of members present",
    extractionPath: "attendees",
    note: "Dikira oleh sistem daripada senarai kehadiran yang disahkan / Counted by the system from the confirmed attendee list — never by the AI.",
  },
  {
    erosesField: "Senarai Ahli Jawatankuasa",
    erosesFieldEn: "List of committee members",
    extractionPath: "office_bearers",
    note: "Satu baris setiap jawatan / One row per position.",
  },
  {
    erosesField: "Maklumat Kewangan (ringkasan)",
    erosesFieldEn: "Financial information (summary)",
    extractionPath: "figures",
    note: "Angka disalin satu persatu; jumlah dikira oleh kod, bukan AI / Figures copied one by one; totals computed by code, not the AI.",
  },
];
