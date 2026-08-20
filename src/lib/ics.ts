// ---------------------------------------------------------------------------
// ADD-TO-CALENDAR EXPORT — pure link/file generation, the same spirit as the
// wa.me links: no Google API, no OAuth, no server round-trip.
//
// PDPA (Hard Rule 5): item titles/descriptions must only ever be the fixed
// deadline labels or the user's own event title — never donor names, amounts
// from the register, or document contents. Callers build items exclusively
// from those sources; tests assert nothing else leaks in.
//
// Everything is ALL-DAY: deadlines are dates, and event times exist only as
// free text ("7:30 malam") which we pass through in the description rather
// than guess-parse into a clock time.
// ---------------------------------------------------------------------------

import { addDaysIso, assertIsoDate } from "./deadlines";

export type CalendarExportItem = {
  /** Fixed deadline label or the user's own event title ONLY (PDPA). */
  title: string;
  /** YYYY-MM-DD — the (all-day) date of the deadline/event. */
  dateIso: string;
  /** Optional extra text, e.g. the free-text time or the deadline source. */
  description?: string;
  /**
   * Stable key so re-imports UPDATE instead of duplicating,
   * e.g. "deadline-annual_return_60d-2026-08-19" or "event-1721e-2026-09-12".
   */
  uidKey: string;
};

function compactDate(iso: string): string {
  assertIsoDate(iso);
  return iso.replaceAll("-", "");
}

// --- Google Calendar template link ---------------------------------------------

/**
 * https://calendar.google.com/calendar/render?action=TEMPLATE&... for one
 * all-day item. Google's all-day format is dates=START/END-EXCLUSIVE.
 */
export function googleCalendarUrl(item: CalendarExportItem): string {
  const start = compactDate(item.dateIso);
  const end = compactDate(addDaysIso(item.dateIso, 1));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title,
    dates: `${start}/${end}`,
  });
  if (item.description) params.set("details", item.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// --- .ics (RFC 5545) -------------------------------------------------------------

/** Escape TEXT values: backslash, semicolon, comma, and newlines. */
export function escapeIcsText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

const FOLD_OCTETS = 75;
const encoder = new TextEncoder();

/**
 * Fold a content line at 75 OCTETS (not characters — Chinese labels are 3
 * bytes each in UTF-8), continuation lines start with a single space.
 * Never splits inside a UTF-8 character.
 */
export function foldIcsLine(line: string): string[] {
  if (encoder.encode(line).length <= FOLD_OCTETS) return [line];
  const out: string[] = [];
  let current = "";
  let budget = FOLD_OCTETS;
  for (const ch of line) {
    const chOctets = encoder.encode(ch).length;
    if (encoder.encode(current).length + chOctets > budget) {
      out.push(current);
      current = " "; // continuation marker
      budget = FOLD_OCTETS;
    }
    current += ch;
  }
  if (current !== " ") out.push(current);
  return out;
}

/**
 * A complete VCALENDAR for the given items, CRLF line endings, one all-day
 * VEVENT each. Deterministic: DTSTAMP derives from the item date, and UID
 * from uidKey — same input, byte-identical output.
 */
export function buildIcs(items: CalendarExportItem[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Minit//Minit Calendar//MS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const item of items) {
    const start = compactDate(item.dateIso);
    const end = compactDate(addDaysIso(item.dateIso, 1));
    lines.push(
      "BEGIN:VEVENT",
      `UID:minit-${item.uidKey}@minit.app`,
      `DTSTAMP:${start}T000000Z`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcsText(item.title)}`,
    );
    if (item.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(foldIcsLine).join("\r\n") + "\r\n";
}

/** data: URL for a client-side download link (no server route needed). */
export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
