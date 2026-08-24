import "server-only";

// Has this organisation ever recorded anything?
//
// Used only to decide whether the home page shows the three-step onboarding
// strip. 2026-07-28 audit: `HowItWorks` existed but was imported by nothing, so
// the app shipped with no onboarding at all — and its own header comment claimed
// the home page showed it "on a first run". This is the check that claim needs.
//
// Deliberately cheap: two head-only count queries, no contents fetched, both
// scoped by org_id (Hard Rule 5). PDPA: nothing is logged.
import { getSupabaseServer } from "@/db/supabase-server";

export async function orgHasAnyActivity(orgId: number): Promise<boolean> {
  const supabase = await getSupabaseServer();

  const [uploads, minutes, receipts] = await Promise.all([
    supabase
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("minutes_docs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    // R-3 (2026-08-25): a treasurer whose FIRST act was issuing receipts has
    // used the product — showing them "how it works" onboarding forever was
    // wrong. Receipts count as activity too.
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  // A failed query must not hide the onboarding from someone who needs it, so
  // "unknown" counts as "no activity yet".
  const n = (uploads.count ?? 0) + (minutes.count ?? 0) + (receipts.count ?? 0);
  return n > 0;
}
