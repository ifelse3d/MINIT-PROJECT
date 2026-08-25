// B-5 (2026-08-25): org type + PPM number, read tolerantly.
//
// Same contract as einvois-server.ts, and DELIBERATELY a separate query from
// needs_einvois: the two columns arrive in different migrations (20 vs 24),
// and one combined select would fail WHOLE while only one of them exists —
// degrading a flag that yesterday worked (STATE §6, the PostgREST trap).
// null = unknown (column missing / error): callers treat it as 'registered',
// the safe default — nagging a committee too much beats never nagging a
// registered society.
import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";

export type OrgTypeFlags = {
  orgType: "registered" | "committee" | null;
  ppmNo: string | null;
};

export async function readOrgTypeFlags(orgId: number): Promise<OrgTypeFlags> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("orgs")
      .select("org_type, ppm_no")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) return { orgType: null, ppmNo: null };
    const raw = (data as { org_type?: unknown; ppm_no?: unknown }).org_type;
    const orgType = raw === "registered" || raw === "committee" ? raw : null;
    const ppmRaw = (data as { ppm_no?: unknown }).ppm_no;
    const ppmNo = typeof ppmRaw === "string" && ppmRaw.trim() !== "" ? ppmRaw.trim() : null;
    return { orgType, ppmNo };
  } catch {
    return { orgType: null, ppmNo: null };
  }
}
