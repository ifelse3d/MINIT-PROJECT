import "server-only";

// ---------------------------------------------------------------------------
// CONFIRMED MINUTES, LISTED AND FETCHED FOR /filings (J review 2026-08-28,
// item 6: the filings page never said WHICH meeting was being filed — it
// silently used "the latest one". Now the person PICKS the meeting, so these
// two readers exist: the list to pick from, and one row's stored facts).
//
// PDPA: the list selects labels and dates only; the extraction jsonb is
// fetched for ONE chosen row. Queries are org-scoped on top of RLS (Hard
// Rule 5). Never logged.
// ---------------------------------------------------------------------------

import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { dayIsoMalaysia } from "@/lib/history";
import {
  parseMeetingNotesExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";

export type ConfirmedMinutesListItem = {
  id: number;
  /** The society's own name for the document (migration 30), or null. */
  title: string | null;
  meetingType: string;
  meetingTypeLabel: string | null;
  meetingDateIso: string | null;
};

/**
 * Every CONFIRMED minutes document of the active org, newest meeting first.
 * The select ladder tolerates a database that predates migration 30 (title)
 * or 20260820000000 (meeting_type_label) — older columns, fewer facts, page
 * still works.
 */
export async function listConfirmedMinutes(): Promise<ConfirmedMinutesListItem[]> {
  const active = await getActiveOrg();
  if (!active) return [];
  const supabase = await getSupabaseServer();

  const selects = [
    "id, meeting_type, meeting_type_label, meeting_date, title",
    "id, meeting_type, meeting_type_label, meeting_date",
    "id, meeting_type, meeting_date",
  ];
  for (const select of selects) {
    const { data, error } = await supabase
      .from("minutes_docs")
      .select(select)
      .eq("org_id", active.id)
      .eq("status", "confirmed")
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(200);
    if (error || !data) continue;
    return (data as unknown as Record<string, unknown>[]).map((row) => ({
      id: Number(row.id),
      title: typeof row.title === "string" && row.title.trim() !== "" ? row.title : null,
      meetingType: typeof row.meeting_type === "string" ? row.meeting_type : "",
      meetingTypeLabel:
        typeof row.meeting_type_label === "string" && row.meeting_type_label !== ""
          ? row.meeting_type_label
          : null,
      meetingDateIso:
        typeof row.meeting_date === "string" ? row.meeting_date : null,
    }));
  }
  return [];
}

export type ConfirmedMinutesDoc = ConfirmedMinutesListItem & {
  /** The stored reviewed extraction (S0-5), or null on pre-8/25 rows. */
  extraction: MeetingNotesExtraction | null;
  confirmedOnIso: string | null;
};

/** One confirmed document's stored facts, by id — org-scoped. */
export async function getConfirmedMinutesDoc(
  id: number,
): Promise<ConfirmedMinutesDoc | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const active = await getActiveOrg();
  if (!active) return null;
  const supabase = await getSupabaseServer();

  const selects = [
    "id, meeting_type, meeting_type_label, meeting_date, title, extraction, confirmed_at",
    "id, meeting_type, meeting_type_label, meeting_date, extraction, confirmed_at",
    "id, meeting_type, meeting_date, extraction, confirmed_at",
  ];
  for (const select of selects) {
    const { data, error } = await supabase
      .from("minutes_docs")
      .select(select)
      .eq("org_id", active.id)
      .eq("status", "confirmed")
      .eq("id", id)
      .maybeSingle();
    if (error) continue;
    if (!data) return null;
    const row = data as unknown as Record<string, unknown>;
    const parsed = parseMeetingNotesExtraction(row.extraction);
    return {
      id: Number(row.id),
      title: typeof row.title === "string" && row.title.trim() !== "" ? row.title : null,
      meetingType: typeof row.meeting_type === "string" ? row.meeting_type : "",
      meetingTypeLabel:
        typeof row.meeting_type_label === "string" && row.meeting_type_label !== ""
          ? row.meeting_type_label
          : null,
      meetingDateIso:
        typeof row.meeting_date === "string" ? row.meeting_date : null,
      extraction: parsed.success ? parsed.data : null,
      confirmedOnIso:
        typeof row.confirmed_at === "string" ? dayIsoMalaysia(row.confirmed_at) : null,
    };
  }
  return null;
}
