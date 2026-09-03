// ---------------------------------------------------------------------------
// AI 智能建議 (work order 64, package E1) — a CONFIRMED minutes document is
// read back and the system proposes cards: add a committee member the minutes
// appointed, put a decided activity / next meeting on the calendar. A human
// confirms every card; confirming walks the EXISTING write paths (members'
// addCommitteeMember, calendar's saveEvent) — this file only derives
// candidates, it writes nothing.
//
// THE TWO RULES THAT SHAPE EVERY LINE HERE:
//
//   1. Rules, not the model (拍板 3). The extraction already carries the
//      structured facts a human has reviewed: `office_bearers` for standing
//      committee appointments (the extraction prompt routes every election /
//      appointment there and keeps one-off duties out), and `resolutions`
//      whose text a person confirmed word by word. Deriving from those is
//      arithmetic — zero vendor calls, zero invention. The AI's contribution
//      is already inside the input (it structured the page); nothing more is
//      asked of it.
//
//   2. A false card is worse than a missed one (拍板, §2: 誤殺比漏掉更糟 —
//      建議卡騷擾人就沒人理它了). So:
//        * people are only suggested from the STRUCTURED office_bearers rows,
//          never guessed out of free resolution text;
//        * events need an EXPLICIT calendar date in the resolution text, and
//          only a date AFTER the meeting date counts — a date with no year
//          that lands before the meeting is dropped, never bumped a year
//          forward (bumping would turn "上次活动 3月2日很成功" into a future
//          event that never was);
//        * anything already on the roster / calendar is silently not
//          suggested again.
//
// Every suggestion carries `source` — where in the confirmed minutes it came
// from (拍板 5: 沒有來源的建議不准出現). When the extraction row has a real
// source_ref (a photo region) that is used; a row a human typed during review
// has none, so the confirmed value itself becomes the quoted snippet — still
// a citation of the confirmed record, never an invention.
// ---------------------------------------------------------------------------

import type { MeetingNotesExtraction } from "@/lib/extraction";
import { isIsoDate } from "@/lib/date-input";

export type SuggestionSource = {
  /** Where in the input, e.g. "photo 1, line 3" — or the confirmed-minutes
   *  fallback label when the row was typed by the reviewer. */
  location: string;
  /** The original text exactly as written / as confirmed. */
  snippet: string;
};

export type MemberSuggestion = {
  type: "add_member";
  /** Stable per-document identity — the ignore/apply mark is keyed on it. */
  key: string;
  position: string;
  personName: string;
  /** The meeting date when known — the natural term_start (eROSES asks for
   *  the appointment date, and the appointment happened at this meeting). */
  termStartIso: string | null;
  /** Roster rows currently holding the SAME position under a different name —
   *  the 换届 hint. Display only: removing someone from a government filing
   *  is a human's decision on /members, never this card's. */
  replaces: string[];
  source: SuggestionSource;
};

export type EventSuggestion = {
  type: "add_event";
  key: string;
  title: string;
  /** YYYY-MM-DD, strictly after the meeting date (or after today when the
   *  meeting date is unknown). */
  dateIso: string;
  /** The time AS WRITTEN in the resolution ("7.30pm", "晚上8点") — the same
   *  "a phrase, not an instant" contract events_meetings.time_text keeps. */
  timeText: string;
  source: SuggestionSource;
};

export type MinutesSuggestion = MemberSuggestion | EventSuggestion;

/** A full AGM re-election is a dozen positions; past this it is noise. */
export const MAX_MEMBER_SUGGESTIONS = 15;
/** A page of programme notes must not become a wall of calendar cards. */
export const MAX_EVENT_SUGGESTIONS = 6;

/** Case/width/whitespace-insensitive identity for names, positions, titles. */
export function normKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Finding an explicit date inside resolution text.
// Formats people actually write in Malaysian society minutes:
//   2026-09-12 · 12/9 · 12/9/2026 · 12 Ogos · 1hb Ogos 2026 · 12 Sept ·
//   9月12日 · 2026年9月12日
// Chinese numeral dates (九月十二日) are deliberately NOT parsed — handwritten
// notes use digits, and a wrong reading here becomes a wrong calendar entry.
// ---------------------------------------------------------------------------

/** Real calendar date only — 31/2 is rejected, not rolled into March. */
function buildIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** BM + English month words, full and abbreviated, → month number. */
const MONTH_WORDS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mac: 3, mar: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, june: 6,
  jul: 7, julai: 7, july: 7,
  ogo: 8, ogos: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  dis: 12, disember: 12, dec: 12, december: 12,
};

const MONTH_WORD_PATTERN = Object.keys(MONTH_WORDS)
  // Longest first so "Ogos" is not eaten as "Ogo" + a stray "s".
  .sort((a, b) => b.length - a.length)
  .join("|");

type FoundDate = {
  /** With an explicit year when one was written; null month/day-only. */
  year: number | null;
  month: number;
  day: number;
  /** The exact substring matched — removed from the card title later. */
  matched: string;
};

/** Two-digit years are this century; "26" → 2026. */
function fullYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (raw.length === 4) return n;
  if (raw.length === 2) return 2000 + n;
  return null;
}

/** The FIRST date-looking thing in the text, or null. Exported for tests. */
export function findDateInText(text: string): FoundDate | null {
  // ISO — unambiguous, checked first.
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);

  // 中文: [2026年]9月12[日|号]
  const zh = /(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]?/.exec(text);

  // BM/EN day-first: 12 Ogos [2026], 1hb Ogos, 12 Sept
  const dayMonth = new RegExp(
    String.raw`\b(\d{1,2})(?:hb)?\.?\s*(${MONTH_WORD_PATTERN})\b\.?,?\s*(\d{4})?`,
    "i",
  ).exec(text);

  // EN month-first ("Sept 12") is deliberately NOT parsed: lowercase "may"
  // and "jun" are ordinary English words / Chinese names, and "AGM may 12
  // members attend" must never become a May 12 calendar card. Day-first is
  // the Malaysian convention everywhere else in this codebase too.

  // Slashes, day-first (Malaysia writes the day first — src/lib/date-input.ts):
  // 12/9, 12/9/26, 12/9/2026. A month over 12 is NOT swapped — ambiguity is
  // dropped, not guessed at.
  const slash = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/.exec(text);

  // Earliest match in the text wins — the first date written is the date the
  // sentence is about; later ones tend to be asides.
  const candidates: { index: number; found: FoundDate }[] = [];
  if (iso) {
    candidates.push({
      index: iso.index,
      found: {
        year: Number(iso[1]),
        month: Number(iso[2]),
        day: Number(iso[3]),
        matched: iso[0],
      },
    });
  }
  if (zh) {
    candidates.push({
      index: zh.index,
      found: {
        year: fullYear(zh[1]),
        month: Number(zh[2]),
        day: Number(zh[3]),
        matched: zh[0],
      },
    });
  }
  if (dayMonth) {
    candidates.push({
      index: dayMonth.index,
      found: {
        year: fullYear(dayMonth[3]),
        month: MONTH_WORDS[dayMonth[2].toLowerCase()],
        day: Number(dayMonth[1]),
        matched: dayMonth[0],
      },
    });
  }
  if (slash) {
    candidates.push({
      index: slash.index,
      found: {
        year: fullYear(slash[3]),
        month: Number(slash[2]),
        day: Number(slash[1]),
        matched: slash[0],
      },
    });
  }

  candidates.sort((a, b) => a.index - b.index);
  for (const c of candidates) {
    const { year, month, day } = c.found;
    // Validity check with a placeholder year for month/day-only forms.
    if (buildIso(year ?? 2024, month, day) === null) continue;
    return c.found;
  }
  return null;
}

/**
 * The first time-looking phrase in the text, AS WRITTEN — "" when none.
 * Exported for tests.
 */
export function findTimeInText(text: string): string {
  const patterns = [
    // 7.30pm · 7:30 pagi · 19:30
    /\b\d{1,2}[.:]\d{2}\s*(?:am|pm|pagi|petang|ptg|malam|mlm|tengah\s*hari|tengahari)?\b/i,
    // 8pm · 8 am
    /\b\d{1,2}\s*(?:am|pm)\b/i,
    // pukul 8 / pukul 8.30
    /\b(?:pukul|pkl)\s*\d{1,2}(?:[.:]\d{2})?\b/i,
    // 晚上8点 / 下午3時半 / 8点30分 — (?<!第) keeps list numbering
    // ("第3点决议") from reading as three o'clock.
    /(?:早上|上午|中午|下午|晚上|傍晚)?\s*(?<!第)\d{1,2}\s*[点點时時]\s*(?:半|\d{1,2}\s*分?)?/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) {
      const t = m[0].trim();
      // A bare number that only matched because 点/时 patterns allow an empty
      // prefix must still contain the hour marker to count as a time.
      if (/[点點时時]/.test(t) || /[.:]\d{2}/.test(t) || /am|pm|pukul|pkl/i.test(t)) {
        return t;
      }
    }
  }
  return "";
}

/** The resolution text with the date/time phrases taken out — a card title. */
function eventTitle(text: string, dateMatch: string, timeMatch: string): string {
  let t = text;
  if (dateMatch !== "") t = t.replace(dateMatch, " ");
  if (timeMatch !== "") t = t.replace(timeMatch, " ");
  t = t
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)/g, " ")
    // Connector punctuation left dangling where the date was cut out.
    .replace(/^[\s:：,，、;；·．.\-–—]+/, "")
    .replace(/[\s:：,，、;；·．\-–—]+$/, "")
    .trim();
  if (t.length < 2) t = text.replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

// ---------------------------------------------------------------------------
// Replacement resolutions — the 换届 signal (work order 68 §1-10).
//
// A shorthand sample of the same shape: "Agenda 2.1: Ooi Bee Huang ganti - Chan Mei". E1 read
// people only from the STRUCTURED office_bearers rows, so a replacement
// written as a resolution produced no card. The literal signal is explicit
// enough to act on (拍板 2's 寧缺勿濫 stands — see the guards below):
//
//   A ganti B · A menggantikan B          → A in, B out
//   B diganti/digantikan oleh A           → A in, B out
//   A 替换/接替/顶替 B · B 由 A 接替      → A in, B out
//   A replaces B                          → A in, B out
//
// GUARDS: both sides must yield a name; the OUTGOING name must already be on
// the roster (that is what makes it a replacement and tells us the position);
// the incoming name must not. "diganti Chan Mei" WITHOUT "oleh" is ambiguous
// about direction and deliberately not matched. Removal itself stays a
// human's act on /members — the card only proposes the ADDITION and shows
// who it replaces (same display the structured cards already have).
// ---------------------------------------------------------------------------

/** A personal-name-shaped run: Latin capitalised words (with bin/binti/a/l),
 *  or a 2–4 character CJK run. */
const NAME_RUN =
  /(?:[A-Z][A-Za-z'.-]+(?:\s+(?:[A-Z][A-Za-z'.-]+|bin|binti|a\/[lp]))*)|[㐀-䶿一-鿿]{2,4}/g;

/** Leading honorific stripped — the roster records people, not salutations. */
const LEADING_HONORIFIC =
  /^(?:En|Encik|Pn|Puan|Cik|Dr|Tuan|Dato'?|Datuk|Datin|Ustaz|Ustazah|Haji|Hajah)(?:\.\s*|\s+)/i;

function nameRuns(s: string): string[] {
  return [...s.matchAll(NAME_RUN)]
    .map((m) => m[0].replace(LEADING_HONORIFIC, "").trim())
    .filter((n) => n !== "");
}

/** Words that the Latin name regex matches but that are never a person. */
const NOT_A_NAME = new Set(["agenda", "ajk", "en", "encik", "pn", "puan", "cik"]);

function lastName(s: string): string | null {
  const runs = nameRuns(s).filter((n) => !NOT_A_NAME.has(n.toLowerCase()));
  return runs.length > 0 ? runs[runs.length - 1] : null;
}
function firstName(s: string): string | null {
  const runs = nameRuns(s).filter((n) => !NOT_A_NAME.has(n.toLowerCase()));
  return runs.length > 0 ? runs[0] : null;
}

export type Replacement = { newName: string; oldName: string };

/** The explicit replacement in a resolution's text, or null. Exported for
 *  tests — J's margin note is the golden case. */
export function findReplacementInText(text: string): Replacement | null {
  // Direction-explicit passive forms first.
  const passive = /(.*?)\bdiganti(?:kan)?\s+oleh\b(.*)/i.exec(text);
  if (passive) {
    const oldName = lastName(passive[1]);
    const newName = firstName(passive[2]);
    if (oldName && newName && normKey(oldName) !== normKey(newName)) {
      return { newName, oldName };
    }
    return null;
  }
  const zhPassive = /(.*?)由(.*?)(?:接替|替换|頂替|顶替)/.exec(text);
  if (zhPassive) {
    const oldName = lastName(zhPassive[1]);
    const newName = firstName(zhPassive[2]);
    if (oldName && newName && normKey(oldName) !== normKey(newName)) {
      return { newName, oldName };
    }
    return null;
  }
  // Active forms: A <keyword> B. Bare "diganti X" (no oleh) stays unmatched —
  // it does not say which way the replacement runs.
  const active =
    /(.*?)(?:\bmenggantikan\b|\bganti(?:kan)?\b|替换|接替|頂替|顶替|取代|\breplaces\b|\bto replace\b)(.*)/i.exec(
      text,
    );
  if (active && !/\bdiganti/i.test(text)) {
    const newName = lastName(active[1]);
    const oldName = firstName(active[2]);
    if (newName && oldName && normKey(oldName) !== normKey(newName)) {
      return { newName, oldName };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Derivation.
// ---------------------------------------------------------------------------

export type RosterEntry = { personName: string; position: string };
export type CalendarEntry = { title: string; dateIso: string };

export type DeriveInput = {
  extraction: MeetingNotesExtraction;
  /** The org's committee roster — the dedupe basis for people. When the
   *  roster could not be read the caller passes null and NO member cards are
   *  produced: a card whose novelty cannot be checked is exactly the nagging
   *  card this feature promised not to show. */
  roster: readonly RosterEntry[] | null;
  /** The org's saved events — the dedupe basis for calendar cards. */
  events: readonly CalendarEntry[];
  /** Today (MYT), YYYY-MM-DD — the future test when the meeting is undated. */
  todayIso: string;
};

function fieldSource(
  ref: { location: string; snippet: string } | null,
  fallbackSnippet: string,
): SuggestionSource {
  if (ref && ref.location.trim() !== "" && ref.snippet.trim() !== "") {
    return { location: ref.location, snippet: ref.snippet };
  }
  // A row the reviewer typed has no photo region; the confirmed value itself
  // is the citation (the confirmed record, not an invention).
  return {
    location: "minit yang disahkan / 已确认的会议记录 / confirmed minutes",
    snippet: fallbackSnippet,
  };
}

export function deriveSuggestions(input: DeriveInput): MinutesSuggestion[] {
  const { extraction, roster, events, todayIso } = input;

  const meetingDate = isIsoDate(extraction.meeting_date.value)
    ? extraction.meeting_date.value
    : null;

  // ---- People: STRUCTURED office_bearers only -----------------------------
  const members: MemberSuggestion[] = [];
  if (roster !== null) {
    const rosterNames = new Set(roster.map((r) => normKey(r.personName)));
    const seen = new Set<string>();
    for (const b of extraction.office_bearers) {
      const position = b.position.value.trim();
      const personName = b.person_name.value.trim();
      if (position === "" || personName === "") continue;
      if (b.position.confidence === "missing" || b.person_name.confidence === "missing")
        continue;
      const nName = normKey(personName);
      const nPos = normKey(position);
      // Already on the roster under ANY position → nothing to add. (A person
      // changing positions is a delete + add on /members, a human's call on a
      // government filing — not a card that quietly duplicates them.)
      if (rosterNames.has(nName)) continue;
      const key = `member:${nName}|${nPos}`.slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        type: "add_member",
        key,
        position,
        personName,
        termStartIso: meetingDate,
        replaces: roster
          .filter((r) => normKey(r.position) === nPos && normKey(r.personName) !== nName)
          .map((r) => r.personName)
          .slice(0, 3),
        source: fieldSource(
          b.person_name.source_ref ?? b.position.source_ref,
          `${position}: ${personName}`,
        ),
      });
      if (members.length >= MAX_MEMBER_SUGGESTIONS) break;
    }

    // 换届 from resolution text (work order 68 §1-10): an explicit
    // "A ganti B" where B IS on the roster (that row names the position)
    // and A is not. The card proposes the addition and shows who it
    // replaces; removing B stays a human's act on /members.
    for (const r of extraction.resolutions) {
      if (members.length >= MAX_MEMBER_SUGGESTIONS) break;
      const text = r.text.value.trim();
      if (text === "" || r.text.confidence === "missing") continue;
      const rep = findReplacementInText(text);
      if (!rep) continue;
      const nNew = normKey(rep.newName);
      if (rosterNames.has(nNew)) continue; // already added → nothing to do
      const outgoing = roster.find((x) => normKey(x.personName) === normKey(rep.oldName));
      if (!outgoing) continue; // not a roster person → not our replacement
      const position = outgoing.position.trim();
      const key = `member:${nNew}|${normKey(position)}`.slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        type: "add_member",
        key,
        position,
        personName: rep.newName,
        termStartIso: meetingDate,
        replaces: [outgoing.personName],
        source: fieldSource(r.text.source_ref, text),
      });
    }
  }

  // ---- Events: resolutions with an EXPLICIT future date -------------------
  const eventCards: EventSuggestion[] = [];
  const existing = events.map((e) => ({ dateIso: e.dateIso, nTitle: normKey(e.title) }));
  const seenEvents = new Set<string>();
  for (const r of extraction.resolutions) {
    const text = r.text.value.trim();
    if (text === "" || r.text.confidence === "missing") continue;

    const found = findDateInText(text);
    if (!found) continue;

    let dateIso: string | null;
    if (found.year !== null) {
      dateIso = buildIso(found.year, found.month, found.day);
    } else if (meetingDate !== null) {
      // No year written: the meeting's own year. A result on or before the
      // meeting date is a PAST reference, not a plan — dropped, never bumped
      // a year forward (bumping is how "上次活动 3月2日" becomes a ghost event).
      dateIso = buildIso(Number(meetingDate.slice(0, 4)), found.month, found.day);
      if (dateIso !== null && dateIso <= meetingDate) continue;
    } else {
      // Meeting date unknown: only a fully explicit date can be trusted.
      continue;
    }
    if (dateIso === null) continue;

    // Future only. Against the meeting when dated, against today otherwise —
    // reading old minutes must not fill the calendar with the past.
    const baseline = meetingDate ?? todayIso;
    if (dateIso <= baseline) continue;

    const timeText = findTimeInText(text);
    const title = eventTitle(text, found.matched, timeText);
    const nTitle = normKey(title);

    // Already on the calendar (same day, same-ish title) → not suggested.
    if (
      existing.some(
        (e) =>
          e.dateIso === dateIso &&
          (e.nTitle === nTitle || e.nTitle.includes(nTitle) || nTitle.includes(e.nTitle)),
      )
    )
      continue;

    const key = `event:${dateIso}|${nTitle.slice(0, 60)}`.slice(0, 200);
    if (seenEvents.has(key)) continue;
    seenEvents.add(key);

    eventCards.push({
      type: "add_event",
      key,
      title,
      dateIso,
      timeText,
      source: fieldSource(r.text.source_ref, text),
    });
    if (eventCards.length >= MAX_EVENT_SUGGESTIONS) break;
  }
  eventCards.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  // Committee changes first (a government filing outranks a calendar entry),
  // then events in date order.
  return [...members, ...eventCards];
}
