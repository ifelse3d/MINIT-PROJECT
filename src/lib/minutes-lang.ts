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

type Labels = {
  title: string;
  meetingType: string;
  date: string;
  venue: string;
  purpose: string;
  attendance: string;
  money: string;
  officeBearers: string;
  unresolved: string;
  /** "This meeting discussed: <headings>." */
  discussed: (headings: string) => string;
  /** "N items are still undecided — see <section> at the end." */
  stillOpen: (n: number, section: string) => string;
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
    venue: "Tempat",
    purpose: "TUJUAN MESYUARAT",
    attendance: "KEHADIRAN",
    money: "KEWANGAN",
    officeBearers: "PEMEGANG JAWATAN",
    unresolved: "PERKARA BELUM MUKTAMAD",
    discussed: (h) => `Mesyuarat ini membincangkan: ${h}.`,
    stillOpen: (n, s) =>
      `${n} perkara masih belum dimuktamadkan — lihat "${s}" di bahagian akhir.`,
  },
  zh: {
    title: "会议记录",
    meetingType: "会议类型",
    date: "日期",
    venue: "地点",
    purpose: "这次会议要谈什么",
    attendance: "出席",
    money: "款项",
    officeBearers: "职位与人名",
    unresolved: "还没定下来的事",
    discussed: (h) => `这次会议谈了：${h}。`,
    stillOpen: (n, s) => `还有 ${n} 项没有定下来 —— 见文末「${s}」。`,
  },
  en: {
    title: "MINUTES OF MEETING",
    meetingType: "Type of meeting",
    date: "Date",
    venue: "Venue",
    purpose: "WHAT THIS MEETING WAS ABOUT",
    attendance: "ATTENDANCE",
    money: "AMOUNTS",
    officeBearers: "OFFICE BEARERS",
    unresolved: "STILL TO BE DECIDED",
    discussed: (h) => `This meeting discussed: ${h}.`,
    stillOpen: (n, s) =>
      `${n} item(s) are still undecided — see "${s}" at the end.`,
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
  const bm = `Disediakan oleh Minit, disahkan oleh ${confirmedBy} pada ${dateIso}`;
  const second =
    lang === "zh"
      ? `由 Minit 起草，${confirmedBy} 于 ${dateIso} 确认`
      : `Drafted by Minit, confirmed by ${confirmedBy} on ${dateIso}`;
  return `${bm} / ${second}`;
}

/** True when the document's own language uses Chinese characters for ordinary
 *  prose — which changes how the name-alteration check has to work. */
export function writesInChinese(lang: MinutesLang): boolean {
  return lang === "zh";
}
