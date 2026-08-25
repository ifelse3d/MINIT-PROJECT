// 0-4 (2026-08-25): the read half of the organisation-level e-Invois switch.
//
// DELIBERATELY its own tiny query, not a column added to getActiveOrg()'s
// select: a select that asks for one missing column fails WHOLE, and
// getActiveOrg() returning null makes the entire app look signed-out (STATE
// §6, the PostgREST trap). Here a missing column, an error or no row all
// collapse to `null` = "unknown", and the client falls back to the device
// preference — a degraded answer instead of a broken page.
import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";

export async function readNeedsEinvois(orgId: number): Promise<boolean | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("orgs")
      .select("needs_einvois")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) return null;
    return Boolean((data as { needs_einvois?: unknown }).needs_einvois);
  } catch {
    return null;
  }
}
