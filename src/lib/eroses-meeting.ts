import type { MeetingNotesExtraction } from "@/lib/extraction";
import { meetingTypeLabel, type TriText } from "@/lib/meeting-types";

// ---------------------------------------------------------------------------
// THE eROSES "TAMBAH MESYUARAT" FORM, FIELD BY FIELD (J review 2026-08-28,
// item 6 + his 12 eROSES screenshots).
//
// The portal's Pengurusan Mesyuarat → Tambah form asks, in order:
//   Jenis Mesyuarat*   (dropdown: Mesyuarat Agung / Mesyuarat Agung Luar
//                       Biasa / Khas / Mesyuarat AJK / … (Pembubaran))
//   Kaedah Mesyuarat*  (Bersemuka / Dalam Talian / Hibrid)
//   Tujuan Mesyuarat*  (free text)
//   Tarikh Mesyuarat*  (DD-MM-YYYY)
//   Masa*              (start – end)
//   Tempat / Alamat*   (+ Negeri / Daerah / Poskod)
//   Jumlah Kehadiran*  (a number)
//   Muat Naik Minit*   (a PDF <25MB — /api/minutes-pdf IS that file)
//
// This module maps ONE confirmed MinitAI meeting onto those boxes,
// DETERMINISTICALLY (Hard Rule 2: the attendance number is counted by code;
// Hard Rule 1: a fact the notes never carried stays "—" with an honest note —
// the meeting's start/end time is the usual one). Screens render; this builds.
// ---------------------------------------------------------------------------

export type ErosesMeetingRow = {
  /** The field label as the portal shows it (BM). */
  field: string;
  fieldEn: string;
  /** Ready to paste; "—" when the notes never carried it. */
  value: string;
  /** Guidance beside the value. */
  note: TriText | null;
  /** False = nothing to copy (the person answers this one on the portal). */
  copyable: boolean;
};

/** "2026-07-26" → "26-07-2026" (the format the portal's date box shows). */
export function isoToErosesDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/**
 * Which option of the portal's Jenis Mesyuarat dropdown this meeting is —
 * or null when the dropdown simply has no honest option for it.
 * (The dropdown only knows general meetings, committee meetings and
 * dissolution; a planning/activity meeting is a real meeting that this
 * government form does not collect.)
 */
export function erosesMeetingKind(meetingType: string): string | null {
  switch (meetingType) {
    case "agm":
      return "Mesyuarat Agung";
    case "egm":
      return "Mesyuarat Agung Luar Biasa / Khas";
    case "committee":
      return "Mesyuarat AJK";
    default:
      return null;
  }
}

const NOT_IN_DROPDOWN: TriText = {
  bm: "Dropdown eROSES hanya ada Mesyuarat Agung / Khas / AJK (dan pembubaran). Mesyuarat jenis ini biasanya TIDAK perlu didaftarkan di eROSES — rekod dalam MinitAI sudah memadai. Kalau mesyuarat ini sebenarnya mesyuarat jawatankuasa, pilih Mesyuarat AJK.",
  zh: "eROSES 的下拉里只有 常年大会 / 特别大会 / 理事会议（和解散会议）。这类会议通常不必登记进 eROSES —— 记录留在 MinitAI 就够了。如果这场其实就是理事开的会，就选 Mesyuarat AJK。",
  en: "The eROSES dropdown only has general / extraordinary / committee meetings (and dissolution). A meeting of this kind normally does NOT need registering on eROSES — the MinitAI record is enough. If it really was a committee sitting, pick Mesyuarat AJK.",
};

const KAEDAH_NOTE: TriText = {
  bm: "Pilih di portal: Bersemuka / Dalam Talian / Hibrid. Nota mesyuarat tidak merekodkannya — anda yang tahu.",
  zh: "在 eROSES 网站上选：Bersemuka（面对面）/ Dalam Talian（线上）/ Hibrid（混合）。笔记里没记这个 —— 您自己知道是哪种。",
  en: "Choose on the portal: Bersemuka (in person) / Dalam Talian (online) / Hibrid. The notes do not record this — you know which it was.",
};

const MASA_NOTE: TriText = {
  bm: "eROSES minta masa mula dan tamat — nota mesyuarat tidak merekodkannya, isi sendiri di portal.",
  zh: "eROSES 要开始和结束时间 —— 笔记里没记，请在网站上自己填。",
  en: "eROSES asks for a start and end time — the notes do not record it; fill it in on the portal.",
};

const ALAMAT_NOTE: TriText = {
  bm: "Portal juga minta alamat penuh, negeri, daerah dan poskod tempat itu.",
  zh: "网站还会要这个地点的完整地址、州属、县区和邮编。",
  en: "The portal also asks for the venue's full address, state, district and postcode.",
};

const PDF_NOTE: TriText = {
  bm: 'Butang "Muat turun PDF minit" di bawah — itulah fail untuk kotak "Muat Naik Minit Mesyuarat" (PDF, bawah 25MB).',
  zh: "用下面的「下载会议记录 PDF」—— 那就是「Muat Naik Minit Mesyuarat」上传框要的文件（PDF，25MB 以内）。",
  en: 'Use the "Download minutes PDF" button below — that is the file for the "Muat Naik Minit Mesyuarat" upload box (PDF, under 25MB).',
};

export type MeetingFormFacts = {
  /** minutes_docs.meeting_type (the stored enum value). */
  meetingType: string;
  /** The society's own name for an "other" meeting. */
  meetingTypeLabel?: string | null;
  /** minutes_docs.title — the person's own name for the document. */
  title?: string | null;
  /** minutes_docs.meeting_date (ISO), the authoritative date. */
  meetingDateIso: string | null;
  /** The stored reviewed extraction, when the row has one (S0-5). */
  extraction: MeetingNotesExtraction | null;
};

/** The Tambah Mesyuarat form, one row per portal box, in the portal's order. */
export function buildMeetingFormPack(facts: MeetingFormFacts): ErosesMeetingRow[] {
  const kind = erosesMeetingKind(facts.meetingType);
  const e = facts.extraction;

  const venue =
    e && e.meeting_venue.confidence !== "missing" && e.meeting_venue.value !== ""
      ? e.meeting_venue.value
      : "";
  const attendeeCount = e
    ? e.attendees.filter(
        (a) => a.name.confidence !== "missing" && a.name.value.trim() !== "",
      ).length
    : 0;
  // Tujuan: the person's own name for the meeting is the truest one-line
  // purpose; the BM type label is the fallback the portal understands.
  const tujuan =
    (facts.title ?? "").trim() !== ""
      ? (facts.title as string).trim()
      : facts.meetingType !== ""
        ? meetingTypeLabel(facts.meetingType, "bm", facts.meetingTypeLabel)
        : "";

  return [
    {
      field: "Jenis Mesyuarat",
      fieldEn: "Meeting type (the portal's dropdown)",
      value: kind ?? "—",
      note: kind === null ? NOT_IN_DROPDOWN : null,
      copyable: kind !== null,
    },
    {
      field: "Kaedah Mesyuarat",
      fieldEn: "How it was held",
      value: "—",
      note: KAEDAH_NOTE,
      copyable: false,
    },
    {
      field: "Tujuan Mesyuarat",
      fieldEn: "Purpose of the meeting",
      value: tujuan === "" ? "—" : tujuan,
      note: null,
      copyable: tujuan !== "",
    },
    {
      field: "Tarikh Mesyuarat",
      fieldEn: "Meeting date (DD-MM-YYYY)",
      value: facts.meetingDateIso ? isoToErosesDate(facts.meetingDateIso) : "—",
      note: null,
      copyable: facts.meetingDateIso !== null,
    },
    {
      field: "Masa",
      fieldEn: "Start and end time",
      value: "—",
      note: MASA_NOTE,
      copyable: false,
    },
    {
      field: "Tempat Mesyuarat",
      fieldEn: "Venue",
      value: venue === "" ? "—" : venue,
      note: ALAMAT_NOTE,
      copyable: venue !== "",
    },
    {
      field: "Jumlah Kehadiran Ahli Mesyuarat",
      fieldEn: "Number of members present",
      // Counted by CODE from the confirmed list (Hard Rule 2) — and an
      // honest "—" when the row predates stored extractions.
      value: attendeeCount > 0 ? String(attendeeCount) : "—",
      note: null,
      copyable: attendeeCount > 0,
    },
    {
      field: "Muat Naik Minit Mesyuarat",
      fieldEn: "Upload the minutes (PDF)",
      value: "—",
      note: PDF_NOTE,
      copyable: false,
    },
  ];
}
