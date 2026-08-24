import "server-only";

// ---------------------------------------------------------------------------
// The organisation's most recent CONFIRMED AGM (or EGM) minutes.
//
// WHY THIS FILE EXISTS (2026-07-28 audit)
// The 60-day ROS annual-return deadline hangs off the date a general meeting
// was held and confirmed. Until now `standard-deadlines.ts` took that date from
// `sampleConfirmedMinutes` — a FICTIONAL meeting by a fictional temple — so
// every organisation in the system saw the same invented due date, attributed
// on /filings to a person who does not exist. A committee could have missed a
// real statutory deadline because the fake one looked authoritative.
//
// This reads the real thing. No confirmed AGM ⇒ null ⇒ no deadline is shown,
// and the UI explains what to do instead of inventing a number.
//
// PDPA: selects only the three columns the deadline math needs; never logs.
import { getSupabaseServer } from "@/db/supabase-server";
import { dayIsoMalaysia } from "@/lib/history";
import { getActiveOrg } from "@/lib/active-org";
import { parseMeetingNotesExtraction, type MeetingNotesExtraction } from "@/lib/extraction";
import type { ConfirmedAgm } from "@/lib/standard-deadlines";

export async function getLatestConfirmedAgm(): Promise<ConfirmedAgm | null> {
  const active = await getActiveOrg();
  if (!active) return null;

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("minutes_docs")
    .select("meeting_date, confirmed_by, confirmed_at")
    // Hard Rule 5: scope every query by org_id, not RLS alone.
    .eq("org_id", active.id)
    .eq("status", "confirmed")
    .in("meeting_type", ["agm", "egm"])
    .not("meeting_date", "is", null)
    .order("meeting_date", { ascending: false })
    .limit(1);

  // A failed query must NOT look like "no AGM" in a way that silently drops a
  // real deadline... but it also must not fabricate one. Returning null is the
  // honest answer either way; the UI tells the user no confirmed AGM was found,
  // which is actionable (they can check /minutes/history).
  if (error || !data || data.length === 0) return null;

  const row = data[0] as {
    meeting_date: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
  };
  if (!row.meeting_date) return null;

  return {
    meetingDateIso: row.meeting_date,
    confirmedBy: row.confirmed_by,
    // Malaysia time, not UTC: a plain slice(0,10) reports the previous day
    // between 00:00 and 08:00 MYT. This only reaches the provenance STRING on
    // /filings, never the due-date maths, but it is the same class of bug the
    // receipt-year fix was about, so it uses the same helper.
    confirmedOnIso: row.confirmed_at ? dayIsoMalaysia(row.confirmed_at) : null,
  };
}

/**
 * The most recent CONFIRMED minutes' reviewed extraction — the server-side
 * source for the eROSES paste-pack (S0-5, 2026-08-25).
 *
 * /filings used to read this browser's `minit.minutes.v1` draft, which meant
 * a paste-pack for a government filing could be built from a HALF-CHECKED
 * draft that no human had signed, and a different device showed a different
 * pack. Only a confirmed document may feed a filing.
 *
 * Rows confirmed before 2026-08-25 have no stored extraction (the column
 * arrived with migration 20260820000000 but confirm only started writing it
 * tonight); they return null and the UI says "confirm minutes first".
 */
export async function getLatestConfirmedExtraction(): Promise<{
  extraction: MeetingNotesExtraction;
  confirmedOnIso: string | null;
} | null> {
  const active = await getActiveOrg();
  if (!active) return null;

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("minutes_docs")
    .select("extraction, confirmed_at")
    // Hard Rule 5: scope every query by org_id, not RLS alone.
    .eq("org_id", active.id)
    .eq("status", "confirmed")
    .not("extraction", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;

  const row = data[0] as { extraction: unknown; confirmed_at: string | null };
  const parsed = parseMeetingNotesExtraction(row.extraction);
  if (!parsed.success) return null;
  return {
    extraction: parsed.data,
    confirmedOnIso: row.confirmed_at ? dayIsoMalaysia(row.confirmed_at) : null,
  };
}
