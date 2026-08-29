// ---------------------------------------------------------------------------
// WHAT LANGUAGE THE MINUTES COME OUT IN.
//
// 2026-08-19 (user: "不止给 eROSES，平时也可以使用"). Bahasa Malaysia is what the
// Registrar needs, but it is not what most committees read to each other. A
// society whose members discuss in Chinese should be able to keep its own
// minutes in Chinese and still produce the BM version when it files.
//
// Half of the document is written by the model (section headings, the wording
// of each item) and half is written here (letterhead, field labels, the fixed
// section names, the audit line). Both halves have to move together or you get
// a Chinese document with Malay headings — which is exactly what step 3 used
// to produce, and what started this whole thread.
//
// The audit line keeps Bahasa Malaysia in every language. It is the line that
// makes the document evidence (CLAUDE.md Hard Rule 8), and the reader who most
// needs it is a registrar or an auditor.
// ---------------------------------------------------------------------------

import { draftedByLine } from "@/lib/brand";

export const MINUTES_LANGUAGES = ["bm", "zh", "en"] as const;
export type MinutesLang = (typeof MINUTES_LANGUAGES)[number];

export function isMinutesLang(v: string): v is MinutesLang {
  return (MINUTES_LANGUAGES as readonly string[]).includes(v);
}

/** How the model is told to write, and what its examples should look like. */
export const LANGUAGE_NAME: Record<MinutesLang, string> = {
  bm: "Bahasa Malaysia",
  zh: "Chinese (中文, simplified)",
  en: "English",
};

/** D-1: how each item is classified inside an agenda section. The model TAGS;
 *  the code prints the label — so a wrong tag can misfile a line under
 *  "Keputusan", but it can never change what the line says. */
export const ITEM_KINDS = ["perbincangan", "keputusan", "tindakan"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

type Labels = {
  title: string;
  meetingType: string;
  date: string;
  /** MASA — the meeting's time as written ("8.30 PM – 10.30 PM"). Part of the
   *  standard minit header block (work order 68 §1-3: it went missing). */
  masa: string;
  venue: string;
  purpose: string;
  attendance: string;
  /** "Jumlah hadir: N orang" — the formal count line under the attendance
   *  sheet (28/8 formality pass; also the number eROSES asks for). */
  attendanceCount: (n: number) => string;
  money: string;
  officeBearers: string;
  unresolved: string;
  /** "This meeting discussed: <headings>." */
  discussed: (headings: string) => string;
  /** "N items are still undecided — see <section> at the end." */
  stillOpen: (n: number, section: string) => string;
  /** D-1: "Bil. ____ / 2026" — the meeting's serial number in the year. The
   *  number itself is NOT invented: nobody told Minit which meeting of the
   *  year this was, so the slot is a blank the society fills in (the document
   *  is editable before saving). */
  bil: (year: string) => string;
  /** D-1: the Perbincangan / Keputusan / Tindakan prefixes. */
  kind: Record<ItemKind, string>;
  /** D-1: the closing section. */
  penutup: string;
  closing: string;
  /** D-1: the signature block. */
  preparedBy: string;
  endorsedBy: string;
  chairSlot: string;
  /** D-2: printed under the letterhead of every NON-BM document. BM is the
   *  filing language; the others are reading copies and must say so. */
  translationNote?: string;
};

// The names of the meeting types themselves are NOT here. They live in
// @/lib/meeting-types with every other place that has to name a meeting type —
// the review dropdown, the eROSES pack, the history list. Three copies of the
// same list is how a type comes to exist on one screen and not another
// (STATE §6: "同一个元件在两个画面待遇不同，没有任何测试会抓到").

export const LABELS: Record<MinutesLang, Labels> = {
  bm: {
    title: "MINIT MESYUARAT",
    meetingType: "Jenis mesyuarat",
    date: "Tarikh",
    masa: "Masa",
    venue: "Tempat",
    purpose: "TUJUAN MESYUARAT",
    attendance: "KEHADIRAN",
    attendanceCount: (n) => `Jumlah hadir: ${n} orang`,
    money: "KEWANGAN",
    officeBearers: "PEMEGANG JAWATAN",
    unresolved: "PERKARA BELUM MUKTAMAD",
    discussed: (h) => `Mesyuarat ini membincangkan: ${h}.`,
    stillOpen: (n, s) =>
      `${n} perkara masih belum dimuktamadkan — lihat "${s}" di bahagian akhir.`,
    bil: (y) => `Bil.: ____ / ${y}`,
    kind: {
      perbincangan: "Perbincangan",
      keputusan: "Keputusan",
      tindakan: "Tindakan",
    },
    penutup: "PENUTUP",
    closing: "Mesyuarat ditangguhkan.",
    preparedBy: "Disediakan oleh,",
    endorsedBy: "Disahkan oleh,",
    chairSlot: "( Pengerusi )",
  },
  zh: {
    title: "会议记录",
    meetingType: "会议类型",
    date: "日期",
    masa: "时间",
    venue: "地点",
    purpose: "这次会议要谈什么",
    attendance: "出席",
    attendanceCount: (n) => `出席人数：${n} 人`,
    money: "款项",
    officeBearers: "职位与人名",
    unresolved: "还没定下来的事",
    discussed: (h) => `这次会议谈了：${h}。`,
    stillOpen: (n, s) => `还有 ${n} 项没有定下来 —— 见文末「${s}」。`,
    bil: (y) => `编号（Bil.）: ____ / ${y}`,
    kind: {
      perbincangan: "讨论",
      keputusan: "议决",
      tindakan: "行动",
    },
    penutup: "散会",
    closing: "会议到此结束。",
    preparedBy: "记录人：",
    endorsedBy: "核准人：",
    chairSlot: "（主席）",
    translationNote:
      "翻译本 —— 非呈报用 / Terjemahan — bukan untuk difailkan",
  },
  en: {
    title: "MINUTES OF MEETING",
    meetingType: "Type of meeting",
    date: "Date",
    masa: "Time",
    venue: "Venue",
    purpose: "WHAT THIS MEETING WAS ABOUT",
    attendance: "ATTENDANCE",
    attendanceCount: (n) => `Total present: ${n}`,
    money: "AMOUNTS",
    officeBearers: "OFFICE BEARERS",
    unresolved: "STILL TO BE DECIDED",
    discussed: (h) => `This meeting discussed: ${h}.`,
    stillOpen: (n, s) =>
      `${n} item(s) are still undecided — see "${s}" at the end.`,
    bil: (y) => `No. (Bil.): ____ / ${y}`,
    kind: {
      perbincangan: "Discussion",
      keputusan: "Decision",
      tindakan: "Action",
    },
    penutup: "CLOSING",
    closing: "The meeting was adjourned.",
    preparedBy: "Prepared by,",
    endorsedBy: "Endorsed by,",
    chairSlot: "( Chairperson )",
    translationNote:
      "Translation — not for filing / Terjemahan — bukan untuk difailkan",
  },
};

/** The letterhead. Also the line the save action rewrites from the session, so
 *  a document can never carry the wrong organisation's name. */
export function minutesTitle(lang: MinutesLang, orgName: string): string {
  return `# ${LABELS[lang].title} — ${orgName}`;
}

/** Matches the letterhead in ANY of the languages, so re-stamping a document
 *  works even if it was written in one language and saved in another. */
export const MINUTES_TITLE_PATTERN = new RegExp(
  `^#\\s*(${MINUTES_LANGUAGES.map((l) => LABELS[l].title).join("|")})`,
  "i",
);

/**
 * CLAUDE.md Hard Rule 8. Bahasa Malaysia is always present; the second half
 * follows the document's language. `bm` keeps the BM / English pairing the
 * documents have always had — a registrar reads one half, everyone else reads
 * the other.
 */
export function minutesAuditLine(
  lang: MinutesLang,
  confirmedBy: string,
  dateIso: string,
): string {
  const bm = draftedByLine.bm(confirmedBy, dateIso);
  const second =
    lang === "zh"
      ? draftedByLine.zh(confirmedBy, dateIso)
      : draftedByLine.en(confirmedBy, dateIso);
  return `${bm} / ${second}`;
}

/** True when the document's own language uses Chinese characters for ordinary
 *  prose — which changes how the name-alteration check has to work. */
export function writesInChinese(lang: MinutesLang): boolean {
  return lang === "zh";
}
