"use server";

import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { isSimpleEvent, type SimpleEvent } from "@/lib/local-events";

// ---------------------------------------------------------------------------
// THE CALENDAR, ON MORE THAN ONE COMPUTER.
//
// J's UX list, root cause B (2026-08-07): `remittance_batches`,
// `events_meetings` and `deadlines` had existed since the very first migration,
// with RLS policies and everything — and `src/db/activity.ts` contained not one
// insert against any of them. So the calendar lived in a single browser's
// localStorage. Sign in on the office computer instead of your phone and the
// society appeared to have no events at all.
//
// 🔴 THE RULE THAT SHAPES THIS FILE: it must work fine on a database where
// migration 20260825000000 has NOT been applied yet. J applies migrations by
// hand (D8), so there is always a window where the code is ahead of the
// database — and asking PostgREST for a column that does not exist fails the
// WHOLE query. So every function here:
//
//   * returns a result object, never throws;
//   * treats "could not save" as a normal outcome the UI reports, not an error
//     screen;
//   * leaves localStorage as the working copy, so nobody's typing is ever lost
//     to a database that is not ready.
//
// That is not a temporary scaffold. A committee secretary standing in a hall
// with one bar of signal is in exactly the same situation as an unmigrated
// database, and both deserve a calendar that still works.
// ---------------------------------------------------------------------------

export type SaveOutcome =
  /** Written to the organisation's records; every device will see it. */
  | { ok: true }
  /** Not written. `reason` is for us; the UI says one plain sentence. */
  | { ok: false; reason: "no_org" | "no_session" | "db" };

/** The Malaysian midnight of a YYYY-MM-DD, as the timestamptz the column wants. */
function startOfDayUtc8(dateIso: string): string {
  // events_meetings.starts_at is a timestamptz and NOT NULL. The time somebody
  // typed is a phrase ("7:30 malam"), not an instant, so inventing 19:30 would
  // be inventing data (Hard Rule 1). The instant stored is the START of that
  // Malaysian day; the phrase itself goes in time_text, which is what every
  // screen displays.
  return `${dateIso}T00:00:00+08:00`;
}

/**
 * Put one event into the organisation's records.
 *
 * Upsert on (org_id, client_id), so tapping "Add" twice on a flaky connection
 * produces one event rather than two — the same trick `donations.client_id`
 * uses for receipts.
 */
export async function saveEvent(event: SimpleEvent): Promise<SaveOutcome> {
  if (!isSimpleEvent(event)) return { ok: false, reason: "db" };
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("events_meetings").upsert(
    {
      org_id: active.id,
      client_id: event.id,
      title: event.title,
      starts_at: startOfDayUtc8(event.dateIso),
      time_text: event.timeText,
      note: event.note ?? null,
      // The kind column has a CHECK constraint of agm/committee/activity/class.
      // Nothing on the calendar screen asks which one it is, and guessing from
      // the title would be the AI inventing by another route, so everything a
      // person types by hand is an "activity" — the neutral member of the set.
      kind: "activity",
    },
    { onConflict: "org_id,client_id" },
  );
  return error ? { ok: false, reason: "db" } : { ok: true };
}

/** Take one event out of the organisation's records. */
export async function deleteEvent(clientId: string): Promise<SaveOutcome> {
  if (typeof clientId !== "string" || clientId === "") return { ok: false, reason: "db" };
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("events_meetings")
    .delete()
    .eq("org_id", active.id)
    .eq("client_id", clientId);
  return error ? { ok: false, reason: "db" } : { ok: true };
}

/**
 * The organisation's events, for merging into whatever this device already has.
 *
 * Returns [] for "no organisation", "nothing saved yet", "the migration has not
 * been applied" and "the query failed" alike. Every one of those means the same
 * thing to the caller — there is nothing to merge in — and mergeEvents() then
 * simply keeps the device's own list, which is the safe direction to fail.
 *
 * Rows created before the migration (or by some future screen that fills in
 * starts_at properly) have no client_id; they are given a stable synthetic one
 * so they can still be displayed, merged and told apart. They cannot be edited
 * from here, which is correct — this screen did not create them.
 */
export async function loadOrgEvents(): Promise<SimpleEvent[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("events_meetings")
    .select("id, client_id, title, starts_at, time_text, note")
    .eq("org_id", active.id)
    .order("starts_at", { ascending: true })
    .limit(500);

  // The commonest cause of `error` here, today, is that migration
  // 20260825000000 has not been run yet, so time_text/note/client_id do not
  // exist and PostgREST rejects the whole select. That is a calendar that
  // works off this device only — not an error screen.
  if (error || !data) return [];

  return data.flatMap((row) => {
    // starts_at is stored as the START of the Malaysian day, so slicing the
    // Malaysian rendering back off it round-trips exactly.
    const dateIso = new Date(row.starts_at as string)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const candidate: SimpleEvent = {
      id: (row.client_id as string | null) ?? `db-${row.id}`,
      title: (row.title as string) ?? "",
      dateIso,
      timeText: (row.time_text as string | null) ?? "",
      note: (row.note as string | null) ?? undefined,
    };
    return isSimpleEvent(candidate) ? [candidate] : [];
  });
}
