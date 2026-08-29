// Server-side data assembly for the AI suggestion cards on ONE confirmed
// minutes document (work order 64 §4). Reads only — the writes happen through
// the existing members/calendar actions when a human confirms a card.
//
// Failure directions, chosen card by card (fail-open, D8 — and 誤殺比漏掉更糟):
//   * extraction missing / does not parse (a doc saved before migration 11,
//     or a very old shape)      → no cards at all; the page renders as before.
//   * roster unreadable         → NO member cards (a card whose novelty cannot
//     be checked is the nagging card this feature promised not to show).
//   * events unreadable         → event cards still derive; the calendar-side
//     dedupe is weaker for that one render, and confirming an already-saved
//     event is a harmless upsert the person can see on /calendar.
//   * suggestion_marks missing (migration 36 not applied) → cards show, and
//     dismissals are remembered per device by the card component instead.

import { getSupabaseServer } from "@/db/supabase-server";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { dayIsoMalaysia } from "@/lib/history";
import {
  deriveSuggestions,
  type CalendarEntry,
  type MinutesSuggestion,
  type RosterEntry,
} from "@/lib/minutes-suggestions";
import { can } from "@/lib/roles";

export type SuggestionsForDoc = {
  suggestions: MinutesSuggestion[];
  /** Cards this document once showed that somebody dismissed — the visible
   *  trace 拍板 6 asks for. */
  ignoredCount: number;
  /** false = migration 36 not applied; the client remembers ignores locally. */
  marksStored: boolean;
  /** Capabilities of THIS viewer — cards they cannot act on are not shown. */
  canMembers: boolean;
  canEvents: boolean;
};

export async function loadSuggestionsForDoc(input: {
  orgId: number;
  /** The viewer's role in this org, as getActiveOrg() reports it. */
  role: string | null;
  docId: number;
  extractionRaw: unknown;
}): Promise<SuggestionsForDoc | null> {
  const { orgId, role, docId, extractionRaw } = input;

  const canMembers = can(role, "minutes_write");
  const canEvents = can(role, "calendar_write");
  if (!canMembers && !canEvents) return null;

  const parsed = parseMeetingNotesExtraction(extractionRaw);
  if (!parsed.success) return null;

  const supabase = await getSupabaseServer();

  // The committee roster — the dedupe basis for people. An error means the
  // novelty check is impossible, so member cards are switched off (null).
  let roster: RosterEntry[] | null = null;
  {
    const { data, error } = await supabase
      .from("committee_roster")
      .select("person_name, position")
      .eq("org_id", orgId)
      .limit(500);
    if (!error && data) {
      roster = data.map((r) => ({
        personName: String(r.person_name ?? ""),
        position: String(r.position ?? ""),
      }));
    }
  }

  // The saved calendar — the dedupe basis for events. Same idiom as
  // calendar/actions.ts loadOrgEvents: an error just means nothing to merge.
  let events: CalendarEntry[] = [];
  {
    const { data, error } = await supabase
      .from("events_meetings")
      .select("title, starts_at")
      .eq("org_id", orgId)
      .limit(500);
    if (!error && data) {
      events = data.map((row) => ({
        title: String(row.title ?? ""),
        // starts_at stores the START of the Malaysian day; rendering it back
        // in MYT round-trips the calendar date exactly (see loadOrgEvents).
        dateIso: new Date(row.starts_at as string).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
        }),
      }));
    }
  }

  // What already happened to this document's cards (migration 36).
  let marksStored = true;
  const decided = new Map<string, "applied" | "ignored">();
  {
    const { data, error } = await supabase
      .from("suggestion_marks")
      .select("suggestion_key, action")
      .eq("org_id", orgId)
      .eq("doc_id", docId)
      .limit(500);
    if (error) {
      marksStored = false; // migration 36 not applied (or unreadable) — same smaller promise
    } else {
      for (const m of data ?? []) {
        decided.set(
          String(m.suggestion_key ?? ""),
          m.action === "applied" ? "applied" : "ignored",
        );
      }
    }
  }

  const derived = deriveSuggestions({
    extraction: parsed.data,
    roster,
    events,
    todayIso: dayIsoMalaysia(new Date().toISOString())!,
  }).filter((s) => (s.type === "add_member" ? canMembers : canEvents));

  const suggestions = derived.filter((s) => !decided.has(s.key));
  const ignoredCount = derived.filter((s) => decided.get(s.key) === "ignored").length;

  return { suggestions, ignoredCount, marksStored, canMembers, canEvents };
}
