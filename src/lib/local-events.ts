// ---------------------------------------------------------------------------
// Society events.
//
// 2026-08-23: these are no longer ONLY on this device. J's UX list, root cause
// B — the calendar, the hand-over batches and the deadlines all lived in one
// browser's localStorage, so signing in on another computer showed a society
// with nothing in it. `events_meetings` had existed since the first migration
// and had RLS policies; it simply had no insert anywhere in the codebase.
//
// The shape below is unchanged and localStorage is still the WORKING copy —
// it is what makes the calendar instant and what keeps it usable when the save
// fails. The database is the durable copy, and `mergeEvents` is how the two
// meet. See src/app/calendar/actions.ts.
// ---------------------------------------------------------------------------

export type SimpleEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  dateIso: string;
  /** As written, e.g. "7:30 malam" — may be "" */
  timeText: string;
  /**
   * A free note for this day, e.g. "kena tempah kerusi" / "要先订椅子".
   *
   * 2026-07-28, user: "点了进去也没办法 add event 或者写 note". Optional so every
   * event stored before this change still loads.
   */
  note?: string;
  /**
   * F-9: true for COMPUTED events (lunar offering days). Never stored, never
   * synced, no delete button — they exist only in the merged display list the
   * calendar shell builds when the offering toggle is on.
   */
  derived?: boolean;
};

import { adoptLegacyKey, scopedKey } from "@/lib/storage-scope-core";

/** Pre-S0-4 global key — adopted into the scoped key once, then removed. */
const EVENTS_LEGACY_KEY = "minit.events";

/** S0-4: scoped per user+org, like every other record key. */
function eventsKey(): string {
  return scopedKey("events:v1");
}

export function loadEvents(): SimpleEvent[] {
  try {
    const key = eventsKey();
    adoptLegacyKey(key, EVENTS_LEGACY_KEY);
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as SimpleEvent[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveEvents(events: SimpleEvent[]): void {
  try {
    localStorage.setItem(eventsKey(), JSON.stringify(events));
  } catch {
    // storage unavailable — events just won't persist
  }
  notifyEventListeners();
}

// ---------------------------------------------------------------------------
// 130 §5: the device's events as a SUBSCRIBABLE store, so a screen reads them
// with useSyncExternalStore (the hook is in src/lib/use-local-events.ts)
// instead of `useEffect(() => setEvents(loadEvents()))`
// — the SSR-hydration pattern the lint rejects (setState in an effect). The
// server snapshot is the empty list, the client snapshot is what is stored;
// React swaps the one for the other after hydration with no mismatch. Every
// write goes through saveEvents(), which tells every subscriber; another
// tab's write arrives through the `storage` event.
// ---------------------------------------------------------------------------

const EMPTY_EVENTS: SimpleEvent[] = [];
const eventListeners = new Set<() => void>();
let eventsCache: { key: string; raw: string | null; events: SimpleEvent[] } | null = null;

function notifyEventListeners(): void {
  for (const l of eventListeners) l();
}

/** The stored events, sorted — the SAME array reference until the stored
 *  blob (or the scope key) changes, which is what useSyncExternalStore needs. */
function eventsSnapshot(): SimpleEvent[] {
  const key = eventsKey();
  let raw: string | null = null;
  try {
    adoptLegacyKey(key, EVENTS_LEGACY_KEY);
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }
  if (eventsCache && eventsCache.key === key && eventsCache.raw === raw) {
    return eventsCache.events;
  }
  let parsed: SimpleEvent[] = EMPTY_EVENTS;
  try {
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    parsed = Array.isArray(arr) ? sortedByDate(arr as SimpleEvent[]) : EMPTY_EVENTS;
  } catch {
    parsed = EMPTY_EVENTS;
  }
  eventsCache = { key, raw, events: parsed };
  return parsed;
}

function subscribeEvents(listener: () => void): () => void {
  eventListeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    eventListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function serverEventsSnapshot(): SimpleEvent[] {
  return EMPTY_EVENTS;
}

/** The three functions useSyncExternalStore wants — exported as a bundle so
 *  the React hook can live in a "use client" file (src/lib/use-local-events.ts):
 *  this module is also imported by server actions, so it must not import
 *  React itself. */
export const localEventsStore = {
  subscribe: subscribeEvents,
  getSnapshot: eventsSnapshot,
  getServerSnapshot: serverEventsSnapshot,
};

export function sortedByDate(events: SimpleEvent[]): SimpleEvent[] {
  return [...events].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

/** Every event on one day, in the order they were added. */
export function eventsOnDay(events: SimpleEvent[], dayIso: string): SimpleEvent[] {
  return events.filter((e) => e.dateIso === dayIso);
}

/** A new event with a generated id. Callers still have to persist it. */
export function makeEvent(input: {
  title: string;
  dateIso: string;
  timeText?: string;
  note?: string;
}): SimpleEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim(),
    dateIso: input.dateIso,
    timeText: (input.timeText ?? "").trim(),
    note: input.note?.trim() ? input.note.trim() : undefined,
  };
}

/** WhatsApp announcement text for one event. */
export function eventWhatsappText(ev: SimpleEvent): string {
  return [
    `📣 ${ev.title}`,
    `Tarikh / 日期 / date: ${ev.dateIso}${ev.timeText ? ` · ${ev.timeText}` : ""}`,
    ...(ev.note ? [ev.note] : []),
    "Jumpa anda di sana! / 到时见! / See you there!",
    "— dijana oleh MinitAI / generated by MinitAI",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// #7 (launch feedback, 2026-08-27 evening): ready-to-send WhatsApp wording
// per event — an INVITATION (before people have said yes) and a REMINDER
// (closer to the day). Deterministic templates, zero AI quota; the person
// edits the text in the dialog before copying, so the words stay theirs.
// Dates are written out (formatDateLong) so 03-04 can never be read two ways.
// ---------------------------------------------------------------------------

import { formatDateLong } from "@/lib/date-input";

export function eventInviteText(ev: SimpleEvent, orgName: string | null): string {
  const org = orgName?.trim() || "";
  const when = `${formatDateLong(ev.dateIso, "bm")} / ${formatDateLong(ev.dateIso, "zh")}${
    ev.timeText ? ` · ${ev.timeText}` : ""
  }`;
  return [
    `📣 Jemputan / 邀请${org ? ` — ${org}` : ""}`,
    "",
    `${ev.title}`,
    `🗓 ${when}`,
    ...(ev.note ? [`📝 ${ev.note}`] : []),
    "",
    "Semua dijemput hadir! / 诚邀出席，欢迎大家！",
    "Sila balas untuk sahkan kehadiran / 请回复确认出席 🙏",
  ].join("\n");
}

export function eventReminderText(ev: SimpleEvent, orgName: string | null): string {
  const org = orgName?.trim() || "";
  const when = `${formatDateLong(ev.dateIso, "bm")} / ${formatDateLong(ev.dateIso, "zh")}${
    ev.timeText ? ` · ${ev.timeText}` : ""
  }`;
  return [
    `⏰ Peringatan / 提醒${org ? ` — ${org}` : ""}`,
    "",
    `${ev.title}`,
    `🗓 ${when}`,
    ...(ev.note ? [`📝 ${ev.note}`] : []),
    "",
    "Jangan lupa — jumpa anda di sana! / 别忘了，到时见！",
  ].join("\n");
}

/**
 * The device's events and the organisation's events, as one list.
 *
 * WHY A UNION AND NOT A REPLACE. Both sides can hold something the other has
 * never seen: this device may have events typed while the save was failing (or
 * before an organisation was chosen at all), and the organisation may have
 * events another committee member added from their own phone. Taking either
 * side wholesale silently deletes the other's work — and a deleted event is a
 * meeting nobody turns up to.
 *
 * On a genuine collision — the same id on both sides — the REMOTE wins. That is
 * the copy every other device will also see, so preferring it makes the
 * committee converge on one answer instead of each device insisting on its own.
 *
 * Ordering is by date, so the merged list reads as a calendar rather than as
 * two lists stapled together.
 */
export function mergeEvents(
  local: readonly SimpleEvent[],
  remote: readonly SimpleEvent[],
): SimpleEvent[] {
  const byId = new Map<string, SimpleEvent>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) byId.set(e.id, e);
  return sortedByDate([...byId.values()]);
}

/** Shape guard for events arriving from the database or from localStorage. */
export function isSimpleEvent(value: unknown): value is SimpleEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    e.id !== "" &&
    typeof e.title === "string" &&
    typeof e.dateIso === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.dateIso) &&
    typeof e.timeText === "string" &&
    (e.note === undefined || typeof e.note === "string")
  );
}
