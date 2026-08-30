import "server-only";

// ---------------------------------------------------------------------------
// HOME-PAGE COUNTS.
//
// This file used to compute four status figures for the four home task cards
// (design pass 2026-08-28). Work order 100 §0-1 (J, 2026-08-31) removed the
// cards — the home page is the agent workbench now — and with them went
// getHomeFigures()/homeStats(): an export with no caller equals nonexistent,
// and the comment beside it would only mislead (STATE §6). What survives is
// the one count two real callers still want.
//
// 🔴 NULLABLE ON PURPOSE. null = the count could not be read; the caller
// then shows NO badge and NO claim — a failed query must never read like
// "you have none" (the null-vs-0 rule the old card lines pinned in tests).
//
// PDPA: counts only. No names, no purposes, no rows leave here.
// ---------------------------------------------------------------------------

import { getSupabaseServer } from "@/db/supabase-server";

/**
 * G3-3 (work order 68, J #7): how many UNFINISHED workspace drafts (cloud
 * drafts, migration 33) this org has — the "you started something and never
 * finished it" reminder shown in the sidebar badge and the workbench
 * greeting. Distinct from documents at status 'draft': these are half-typed
 * workspaces nobody saved yet.
 * null = the count could not be read (table not applied yet, D8 fail-open;
 * or a hiccup) — then NO badge, never a wrong number.
 */
export async function countUnfinishedMinutesDrafts(
  orgId: number,
): Promise<number | null> {
  try {
    const supabase = await getSupabaseServer();
    const { count, error } = await supabase
      .from("minutes_drafts")
      .select("client_key", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
