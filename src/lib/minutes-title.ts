import type { MeetingNotesExtraction } from "@/lib/extraction";
import { meetingTypeLabel } from "@/lib/meeting-types";
import type { MinutesLang } from "@/lib/minutes-lang";

// ---------------------------------------------------------------------------
// WHAT A SAVED MINUTES DOCUMENT IS CALLED (J review 2026-08-28, item 3:
// 「会议记录没有命名，要找回很难。…save 之前要问，或者先模拟一个，然后让 USER
// 决定用还是自己改名字，像 GOOGLE DOCS 那样」).
//
// The suggestion is DETERMINISTIC — the meeting's own type and date, the two
// facts a person actually reaches for when hunting a document ("七月那场活动
// 会议"). Zero AI, zero credit, always available; the box it pre-fills is the
// person's to overwrite, and Hard Rule 1 is untouched because a NAME is not a
// fact about the meeting — it is a label the person accepts or replaces.
// ---------------------------------------------------------------------------

export const MINUTES_TITLE_MAX = 200;

/** A cleaned title, or "" when nothing usable remains. */
export function cleanMinutesTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MINUTES_TITLE_MAX);
}

/**
 * The pre-filled name: "<meeting type> — <date>" in the document's language,
 * using the society's own label when the type is "other" ("周会 — 2026-07-26").
 * Falls back gracefully as facts are missing; an empty extraction suggests "".
 */
export function suggestMinutesTitle(
  extraction: MeetingNotesExtraction,
  lang: MinutesLang = "bm",
): string {
  const typeValue = extraction.meeting_type.value;
  const type =
    typeValue === "" || extraction.meeting_type.confidence === "missing"
      ? ""
      : meetingTypeLabel(typeValue, lang, extraction.meeting_type_label);
  const date =
    extraction.meeting_date.confidence === "missing"
      ? ""
      : extraction.meeting_date.value;
  if (type && date) return cleanMinutesTitle(`${type} — ${date}`);
  if (type) return cleanMinutesTitle(type);
  if (date) return cleanMinutesTitle(date);
  return "";
}
