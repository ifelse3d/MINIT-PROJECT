import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";

/**
 * K-2 (work order 27): this month's usage split by MEMBER. Moved here from
 * the old long /settings page when §1-13 (work order 32) split it — the
 * consumer is now /settings/plan, where the rest of the usage story lives.
 * User-scoped client (RLS: only this org's rows); names from members_roles;
 * rows without a user_id (pre-migration-25, server-initiated) group under
 * "?". Returns [] on any failure — the page just shows no split.
 */
export async function loadUsageByPerson(
  orgId: number,
): Promise<{ name: string; count: number }[]> {
  try {
    const supabase = await getSupabaseServer();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [usageRes, memberRes] = await Promise.all([
      supabase
        .from("ai_usage")
        .select("user_id")
        .eq("org_id", orgId)
        .gte("created_at", monthStart.toISOString())
        .is("refunded_at", null)
        .limit(5000),
      supabase
        .from("members_roles")
        .select("user_id, name")
        .eq("org_id", orgId)
        .limit(500),
    ]);
    if (usageRes.error || !usageRes.data) return [];
    const names = new Map<string, string>();
    for (const m of (memberRes.data ?? []) as { user_id: string | null; name: string | null }[]) {
      if (m.user_id) names.set(m.user_id, m.name ?? "?");
    }
    const counts = new Map<string, number>();
    for (const u of usageRes.data as { user_id?: string | null }[]) {
      const label = u.user_id ? names.get(u.user_id) ?? "?" : "?";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}
