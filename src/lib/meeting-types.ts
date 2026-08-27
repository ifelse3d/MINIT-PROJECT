// ---------------------------------------------------------------------------
// WHAT KINDS OF MEETING A SOCIETY HOLDS — one list, one set of labels, read by
// every screen and every document.
//
// 2026-08-20. J photographed an activity-planning whiteboard, reached step 2,
// typed "event meeting" into the meeting-type box and "2/2/2026" into the date
// box. The screen accepted both. Then "let Minit write the official document"
// AND "Save to History" failed on the same parse, and what the screen printed
// was "Something went wrong on Minit's side" — a person's input problem shown
// as a server fault. Nothing was ever written to minutes_docs, which is also
// why History looked empty.
//
// The cause: meeting_type was z.enum(["agm","egm","committee",""]) with the same
// CHECK in the database, while step 2's "fill it in yourself" was a plain shared
// text <input> that did not know it was editing an enum.
//
// eROSES only knows AGM and EGM. But a society is not a machine for feeding
// eROSES (J, 2026-08-18: "社团不只是做会议给 eROSES，我要做到的是团体里面都可以
// 自己使用好用的"). Planning and activity meetings are the core of the product,
// not an edge case.
//
// TWO LISTS, on purpose:
//   MEETING_TYPES                 — every kind of meeting a society holds.
//   EROSES_FILEABLE_MEETING_TYPES — the only ones the Annual Return knows.
//
// ⚠ THE AI IS NOT TOLD ABOUT THE NEW TYPES. src/prompts/extract-meeting-notes.ts
// still asks for agm|egm|committee|"" and is unchanged on purpose: the published
// 95.2% accuracy was measured against that exact prompt, and STATE §6 records
// what happens when a default moves underneath a measurement. The extra types
// exist for a HUMAN to choose in step 2 — a person picking their own meeting
// type is more accurate than a model guessing it, and it costs no credits.
// ---------------------------------------------------------------------------

export type TriText = { bm: string; zh: string; en: string };

export const MEETING_TYPES = [
  "agm",
  "egm",
  "committee",
  "planning",
  "event",
  "other",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

/** The only meeting types the Registrar's Annual Return (Penyata Tahunan)
 *  accepts. Everything else is a real meeting that simply is not that form. */
export const EROSES_FILEABLE_MEETING_TYPES = ["agm", "egm"] as const;

export function isMeetingType(value: string): value is MeetingType {
  return (MEETING_TYPES as readonly string[]).includes(value);
}

export function isErosesFileable(value: string): boolean {
  return (EROSES_FILEABLE_MEETING_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// LABELS
//
// Written out in full, with the abbreviation in brackets after it — never the
// abbreviation alone. (J, 2026-08-20: "有很多人不懂 SHORTFORM".) A committee
// member who has never filed anything should be able to read the list and know
// which line is their meeting.
// ---------------------------------------------------------------------------

export const MEETING_TYPE_LABEL: Record<MeetingType, TriText> = {
  agm: {
    bm: "Mesyuarat Agung Tahunan (AGM)",
    zh: "常年大会（AGM）",
    en: "Annual General Meeting (AGM)",
  },
  egm: {
    bm: "Mesyuarat Agung Khas (EGM)",
    zh: "特别大会（EGM）",
    en: "Extraordinary General Meeting (EGM)",
  },
  committee: {
    bm: "Mesyuarat Jawatankuasa",
    zh: "理事会议",
    en: "Committee Meeting",
  },
  planning: {
    bm: "Mesyuarat Perancangan",
    zh: "活动策划会议",
    en: "Planning Meeting",
  },
  event: {
    bm: "Mesyuarat Program / Aktiviti",
    zh: "活动会议",
    en: "Event / Activity Meeting",
  },
  other: {
    // #29 (J review 27-evening, 2026-08-28): "write your own name" read like
    // "type YOUR name". Say what actually happens: a box for the MEETING's
    // name appears below once this is chosen.
    bm: "Lain-lain — taip nama mesyuarat di bawah",
    zh: "其他 —— 会议名称在下面填",
    en: "Other — type the meeting's name below",
  },
};

/** Shown when the meeting type was never written down and the person said so.
 *  Not a type: an honest gap. Hard Rule 1 — a gap stays a gap. */
export const MEETING_TYPE_NOT_WRITTEN: TriText = {
  bm: "Tidak dinyatakan dalam nota",
  zh: "笔记里没写",
  en: "Not written down in the notes",
};

/**
 * How this meeting is named, in all three languages.
 *
 * `customLabel` is minutes_docs.meeting_type_label — the society's own name for
 * the meeting ("周会", "Mesyuarat Ranting Muda"). It is consulted ONLY for
 * "other", because that is the only type where the person was asked to write
 * one. It never reaches eROSES.
 */
export function meetingTypeLabelTri(
  value: string,
  customLabel?: string | null,
): TriText {
  const custom = (customLabel ?? "").trim();
  if (value === "other" && custom !== "") {
    return { bm: custom, zh: custom, en: custom };
  }
  if (value === "") return MEETING_TYPE_NOT_WRITTEN;
  if (isMeetingType(value)) return MEETING_TYPE_LABEL[value];
  // Something we do not recognise: print it as written rather than invent a
  // label for it. (Documents saved before 2026-08-20 can only hold the old
  // three, so this is for safety, not for a known case.)
  return { bm: value, zh: value, en: value };
}

/**
 * G-4 (2026-08-25, J #19): the UI variant — Chinese and English interfaces
 * print the BM OFFICIAL name beside the local one ("常年大会（AGM）·
 * Mesyuarat Agung Tahunan"), because the BM term is what appears on the
 * government form, the bank letter and the auditor's questions; a secretary
 * working in Chinese still has to recognise it there. Documents and the
 * eROSES pack keep using meetingTypeLabel/meetingTypeLabelTri — a combined
 * label must never reach a filed document.
 *
 * "Other" (a society's own name, or the instruction to write one) has no
 * official BM name to teach, so it is left alone.
 */
export function meetingTypeUiLabelTri(
  value: string,
  customLabel?: string | null,
): TriText {
  const base = meetingTypeLabelTri(value, customLabel);
  if (!isMeetingType(value) || value === "other") return base;
  // The abbreviation rides once, on the BM half — "常年大会（AGM）· Mesyuarat
  // Agung Tahunan (AGM)" would say AGM twice.
  const local = (s: string) => s.replace(/\s*[（(][A-Z]+[）)]\s*$/, "");
  return {
    bm: base.bm,
    zh: `${local(base.zh)} · ${base.bm}`,
    en: `${local(base.en)} · ${base.bm}`,
  };
}

/** One language, for the deterministic renderers and the eROSES pack. */
export function meetingTypeLabel(
  value: string,
  lang: keyof TriText,
  customLabel?: string | null,
): string {
  return meetingTypeLabelTri(value, customLabel)[lang];
}

/**
 * The value stored in minutes_docs.meeting_type.
 *
 * The field is a real enum now, so what arrives here is normally already one of
 * MEETING_TYPES; this stays as the last line of defence for anything drafted
 * before that was true.
 *
 * ⚠ CHANGED 2026-08-20: an EMPTY value used to become "committee". That put a
 * meeting type nobody had written down onto a record the Registrar can be
 * shown — inventing a fact, which is the one thing this product must not do.
 * It now becomes "other", which claims nothing.
 */
export function normaliseMeetingType(raw: string): MeetingType {
  const value = raw.trim().toLowerCase();
  if (isMeetingType(value)) return value;
  if (value === "") return "other";
  if (value.includes("egm") || value.includes("khas") || value.includes("tergempar")) {
    return "egm";
  }
  if (value.includes("agm") || value.includes("agung")) return "agm";
  if (value.includes("jawatankuasa") || value.includes("committee")) return "committee";
  if (value.includes("perancangan") || value.includes("planning")) return "planning";
  if (
    value.includes("program") ||
    value.includes("aktiviti") ||
    value.includes("event")
  ) {
    return "event";
  }
  return "other";
}

/**
 * What the eROSES paste pack says when the meeting is not an AGM or an EGM.
 *
 * Before 2026-08-20 the pack printed whatever was in the field straight into
 * "Jenis Mesyuarat" and marked it Confirmed — so a planning meeting arrived at
 * the Registrar's form as if it were the general meeting the Annual Return asks
 * about. A wrong value in that box has a name: false declaration.
 */
export const NOT_FOR_ANNUAL_RETURN: TriText = {
  bm: "Mesyuarat ini tidak masuk Penyata Tahunan. eROSES hanya menerima Mesyuarat Agung Tahunan (AGM) atau Mesyuarat Agung Khas (EGM).",
  zh: "这场会议不进年报。eROSES 只收常年大会（AGM）或特别大会（EGM）。",
  en: "This meeting does not go into the Annual Return. eROSES only accepts an Annual General Meeting (AGM) or an Extraordinary General Meeting (EGM).",
};
