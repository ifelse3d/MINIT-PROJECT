// ---------------------------------------------------------------------------
// AGM PACK — Phase 4 pure logic (no AI, no I/O). Everything here is
// deterministic and unit-tested: date math, document text builders, and the
// bank-resolution extract. The AI (when connected) only supplies extracted
// facts; it NEVER writes these documents directly (CLAUDE.md Hard Rules 1–2).
//
// Documents are generated in BM. They carry the DRAF watermark until a human
// confirms them (Hard Rule 8), and a visible warning when the notice period
// came from an org setting instead of the ingested constitution.
// ---------------------------------------------------------------------------

export const DRAFT_WATERMARK_BM = "DRAF — sila semak sebelum guna";

export type CommitteeMember = {
  /** e.g. "Pengerusi", "Setiausaha", "Bendahari", "Ahli Jawatankuasa" */
  position: string;
  personName: string;
};

export type NoticePeriodSource = "constitution" | "org_setting";

export type AgmPackParams = {
  orgName: string;
  orgRegistrationNo?: string;
  orgAddress?: string;
  /** AGM year, e.g. 2026 → "Mesyuarat Agung Tahunan 2026". */
  year: number;
  /** YYYY-MM-DD */
  meetingDateIso: string;
  /** Free text, printed verbatim, e.g. "10:00 pagi". */
  meetingTimeText: string;
  venue: string;
  /** Days of notice required before the meeting. */
  noticePeriodDays: number;
  noticePeriodSource: NoticePeriodSource;
  /** e.g. "Fasal 10.2" — printed when the period came from the constitution. */
  constitutionClauseRef?: string;
  roster: CommitteeMember[];
  /** Who signs the notice (normally the Setiausaha). */
  secretaryName: string;
  /** Custom agenda items; when omitted the standard AGM agenda is used. */
  agendaItems?: string[];
  /** Set once a human has confirmed the pack; removes the DRAF watermark. */
  confirmed?: { by: string; onIso: string } | null;
};

// --- Date math (deterministic, tested) -------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(iso: string): void {
  if (!ISO_RE.test(iso)) throw new RangeError(`not a YYYY-MM-DD date: ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso)
    throw new RangeError(`not a real calendar date: ${iso}`);
}

export function addDaysIso(iso: string, days: number): string {
  assertIsoDate(iso);
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer: ${days}`);
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Latest date the notice may go out: meeting date − notice period. */
export function latestNoticeDateIso(meetingDateIso: string, noticePeriodDays: number): string {
  if (!Number.isInteger(noticePeriodDays) || noticePeriodDays < 0)
    throw new RangeError(`notice period must be a non-negative integer: ${noticePeriodDays}`);
  return addDaysIso(meetingDateIso, -noticePeriodDays);
}

// --- Shared fragments -------------------------------------------------------

export function orgSettingWarningBm(days: number): string {
  return (
    `⚠ AMARAN: Tempoh notis ${days} hari diambil daripada TETAPAN organisasi, ` +
    `bukan daripada perlembagaan yang dimuat naik. Sila semak perlembagaan anda ` +
    `sebelum mengedarkan notis ini. / WARNING: notice period comes from an org ` +
    `setting, not your uploaded constitution — verify before sending.`
  );
}

function noticeSourceLineBm(p: AgmPackParams): string {
  return p.noticePeriodSource === "constitution"
    ? `Tempoh notis: ${p.noticePeriodDays} hari (${p.constitutionClauseRef ?? "perlembagaan"}).`
    : `Tempoh notis: ${p.noticePeriodDays} hari (tetapan organisasi).`;
}

function headerBm(p: AgmPackParams): string {
  const lines = [p.orgName];
  if (p.orgRegistrationNo) lines.push(`No. Pendaftaran (ROS): ${p.orgRegistrationNo}`);
  if (p.orgAddress) lines.push(p.orgAddress);
  return lines.join("\n");
}

function footerBm(p: AgmPackParams): string {
  return p.confirmed
    ? `Drafted by Minit, confirmed by ${p.confirmed.by} on ${p.confirmed.onIso}.`
    : `${DRAFT_WATERMARK_BM} · Drafted by Minit.`;
}

export function formatDateBm(iso: string): string {
  assertIsoDate(iso);
  const months = [
    "Januari", "Februari", "Mac", "April", "Mei", "Jun",
    "Julai", "Ogos", "September", "Oktober", "November", "Disember",
  ];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

// --- 1 · Notice + 2 · Agenda ------------------------------------------------

export function defaultAgmAgendaBm(year: number): string[] {
  return [
    "Ucapan aluan Pengerusi",
    `Mengesahkan minit Mesyuarat Agung Tahunan ${year - 1}`,
    "Perkara berbangkit",
    `Membentang dan menerima Laporan Tahunan ${year - 1}`,
    `Membentang dan meluluskan Penyata Kewangan beraudit ${year - 1}`,
    "Pemilihan Ahli Jawatankuasa (jika berkenaan)",
    "Pelantikan Juruaudit",
    "Usul-usul (diterima mengikut perlembagaan)",
    "Hal-hal lain",
  ];
}

export function buildAgmNoticeBm(p: AgmPackParams): string {
  assertIsoDate(p.meetingDateIso);
  const agenda = p.agendaItems ?? defaultAgmAgendaBm(p.year);
  const noticeBy = latestNoticeDateIso(p.meetingDateIso, p.noticePeriodDays);
  const parts = [
    headerBm(p),
    "",
    `NOTIS MESYUARAT AGUNG TAHUNAN ${p.year}`,
    "",
    `Dengan hormatnya dimaklumkan bahawa Mesyuarat Agung Tahunan ${p.year} ` +
      `${p.orgName} akan diadakan seperti berikut:`,
    "",
    `Tarikh: ${formatDateBm(p.meetingDateIso)}`,
    `Masa: ${p.meetingTimeText}`,
    `Tempat: ${p.venue}`,
    "",
    "AGENDA",
    ...agenda.map((item, i) => `${i + 1}. ${item}`),
    "",
    noticeSourceLineBm(p),
    `Notis ini hendaklah diedarkan selewat-lewatnya pada ${formatDateBm(noticeBy)}.`,
  ];
  if (p.noticePeriodSource === "org_setting") {
    parts.push("", orgSettingWarningBm(p.noticePeriodDays));
  }
  parts.push(
    "",
    "Ahli yang tidak dapat hadir boleh melantik proksi menggunakan borang proksi yang disertakan.",
    "",
    "Dengan perintah Jawatankuasa,",
    "",
    "____________________________",
    `${p.secretaryName}`,
    "Setiausaha",
    "",
    footerBm(p)
  );
  return parts.join("\n");
}

// --- 3 · Attendance sheet ----------------------------------------------------

export type AttendanceRow = {
  no: number;
  name: string;
  position: string;
};

/**
 * Committee members first (name + position pre-filled), then blank numbered
 * rows for ordinary members. Designed to be printed, signed, and photographed
 * back into /inbox later.
 */
export function buildAttendanceRows(roster: CommitteeMember[], blankRows: number): AttendanceRow[] {
  if (!Number.isInteger(blankRows) || blankRows < 0)
    throw new RangeError(`blankRows must be a non-negative integer: ${blankRows}`);
  const rows: AttendanceRow[] = roster.map((m, i) => ({
    no: i + 1,
    name: m.personName,
    position: m.position,
  }));
  for (let i = 0; i < blankRows; i++) {
    rows.push({ no: roster.length + i + 1, name: "", position: "" });
  }
  return rows;
}

export function attendanceSheetTitleBm(p: AgmPackParams): string {
  return `SENARAI KEHADIRAN — MESYUARAT AGUNG TAHUNAN ${p.year} · ${formatDateBm(p.meetingDateIso)}`;
}

// --- 4 · Proxy form -----------------------------------------------------------

export function buildProxyFormBm(p: AgmPackParams): string {
  assertIsoDate(p.meetingDateIso);
  return [
    headerBm(p),
    "",
    `BORANG PROKSI — MESYUARAT AGUNG TAHUNAN ${p.year}`,
    "",
    "Saya, __________________________________________ (No. K/P: ______________________),",
    `ahli ${p.orgName}, dengan ini melantik:`,
    "",
    "Nama proksi: __________________________________________",
    "No. K/P proksi: ______________________",
    "",
    `untuk hadir dan mengundi bagi pihak saya di Mesyuarat Agung Tahunan ${p.year} ` +
      `pada ${formatDateBm(p.meetingDateIso)}, ${p.meetingTimeText}, di ${p.venue}.`,
    "",
    "Tandatangan ahli: ____________________  Tarikh: ______________",
    "",
    "Borang ini hendaklah dikembalikan kepada Setiausaha sebelum mesyuarat bermula.",
    "",
    footerBm(p),
  ].join("\n");
}

// --- 5 · Bank-resolution extract ----------------------------------------------

export type MinutesForExtract = {
  orgName: string;
  orgRegistrationNo?: string;
  meetingType: "agm" | "egm" | "committee";
  meetingDateIso: string;
  status: "draft" | "confirmed";
  confirmedBy?: string;
  confirmedOnIso?: string;
  /** Resolution texts exactly as confirmed by the human — printed verbatim. */
  resolutions: string[];
  officeBearers: CommitteeMember[];
};

const SIGNATORY_KEYWORDS = [
  "bank", "akaun", "penandatangan", "tandatangan", "cek", "cheque", "signatory", "account",
];

/** Keyword filter — no AI, no guessing. Verbatim resolutions in, subset out. */
export function findSignatoryResolutions(resolutions: string[]): string[] {
  return resolutions.filter((r) => {
    const low = r.toLowerCase();
    return SIGNATORY_KEYWORDS.some((k) => low.includes(k));
  });
}

export const MEETING_TYPE_BM: Record<MinutesForExtract["meetingType"], string> = {
  agm: "Mesyuarat Agung Tahunan",
  egm: "Mesyuarat Agung Khas",
  committee: "Mesyuarat Jawatankuasa",
};

export type BankExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Certified minutes extract of signatory changes, for handing to the bank.
 * Refuses when the minutes are not confirmed (an extract of a draft is
 * worthless to a bank) or when no signatory-related resolution exists
 * (Hard Rule 1: never invent).
 */
export function buildBankResolutionExtractBm(m: MinutesForExtract): BankExtractResult {
  if (m.status !== "confirmed") {
    return {
      ok: false,
      reason:
        "Minit belum disahkan — sahkan minit dahulu sebelum menjana petikan bank. / " +
        "Minutes not confirmed yet — confirm them before generating a bank extract.",
    };
  }
  assertIsoDate(m.meetingDateIso);
  const matches = findSignatoryResolutions(m.resolutions);
  if (matches.length === 0) {
    return {
      ok: false,
      reason:
        "Tiada resolusi berkaitan bank/penandatangan dalam minit yang disahkan. / " +
        "No bank/signatory resolution found in the confirmed minutes — nothing is invented.",
    };
  }
  const header = [m.orgName];
  if (m.orgRegistrationNo) header.push(`No. Pendaftaran (ROS): ${m.orgRegistrationNo}`);
  const bearers =
    m.officeBearers.length > 0
      ? [
          "",
          "Pemegang jawatan berkaitan:",
          ...m.officeBearers.map((b) => `- ${b.position}: ${b.personName}`),
        ]
      : [];
  const text = [
    ...header,
    "",
    "PETIKAN MINIT MESYUARAT (UNTUK PIHAK BANK)",
    "",
    `Petikan daripada minit ${MEETING_TYPE_BM[m.meetingType]} yang telah disahkan, ` +
      `bertarikh ${formatDateBm(m.meetingDateIso)}:`,
    "",
    ...matches.map((r, i) => `${i + 1}. ${r}`),
    ...bearers,
    "",
    "Diperakui sebagai petikan yang benar / Certified a true extract:",
    "",
    "____________________________        ____________________________",
    "Pengerusi                           Setiausaha",
    "",
    `Drafted by Minit, confirmed by ${m.confirmedBy ?? "—"} on ${m.confirmedOnIso ?? "—"}.`,
  ].join("\n");
  return { ok: true, text };
}
