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
