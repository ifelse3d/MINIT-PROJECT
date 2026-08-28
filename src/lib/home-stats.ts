import "server-only";

// ---------------------------------------------------------------------------
// THE FOUR FIGURES UNDER THE HOME CARDS (design pass 2026-08-28).
//
// The bands and tiles on the home cards are a one-time visual lift; these
// numbers are the part that changes every week, so the home page is not the
// same page twice. One line per card, and every line is a fact this database
// already holds — nothing is estimated and nothing is invented.
//
// 🔴 EVERY FIELD IS NULLABLE ON PURPOSE. A card whose figure cannot be read
// renders WITHOUT its status line (see task-cards.tsx); it never shows a 0, a
// dash or a spinner. A wrong number on the first screen of a compliance tool
// is worse than no number, and the home page must render even when a query
// fails — hence the catch on every read.
//
// A brand-new society legitimately has zero of everything. That is NOT a
// failure: zero comes back as 0 and the card writes it as an invitation
// ("no minutes yet — start with a photo"), which is a different string from
// the null case.
//
// PDPA: counts and sums only. No names, no purposes, no rows leave here.
// Org-scoped on top of RLS (Hard Rule 5).
// ---------------------------------------------------------------------------

import { getSupabaseServer } from "@/db/supabase-server";
import { dayIsoMalaysia, monthRange } from "@/lib/history";

export type HomeStats = {
  /** Minutes still at status 'draft' — started, not signed off. */
  minutesDrafts: number | null;
  /** Donations recorded against THIS Malaysian calendar month, in cents. */
  moneyInCents: number | null;
  /**
   * Outer null means the money tables could not be read; inner null means
   * they were read and hold nothing. The card says something different in
   * each case — "nothing to report yet" is a claim, and it must not be made
   * on the strength of a failed query (the same trap app/money/report/data.ts
   * warns about: a blank statement reads exactly like an empty society).
   */
  moneyRecords: { latestMonth: string | null } | null;
  /** AI actions left this month, and the allowance they are counted against. */
  aiLeft: number | null;
  aiTotal: number | null;
};

/**
 * The month of the newest money record — donation or expense, whichever is
 * later. Deliberately a copy of the same idea in app/money/report/data.ts
 * rather than an import: this runs on the home page of every visit, and a
 * home page that reaches into a route folder for one string is a coupling
 * nobody would expect to find when they change the report.
 */
async function latestRecordMonth(
  orgId: number,
): Promise<{ latestMonth: string | null } | null> {
  const supabase = await getSupabaseServer();
  const newest = async (
    table: "donations" | "expenses",
    column: "donated_at" | "spent_at",
  ): Promise<{ month: string | null } | null> => {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .eq("org_id", orgId)
      .not(column, "is", null)
      .order(column, { ascending: false })
      .limit(1);
    if (error) return null;
    if (!data || data.length === 0) return { month: null };
    const value = (data[0] as Record<string, unknown>)[column];
    return { month: typeof value === "string" ? value.slice(0, 7) : null };
  };
  const [donation, expense] = await Promise.all([
    newest("donations", "donated_at"),
    newest("expenses", "spent_at"),
  ]);
  // Either query failing loses the right to say "nothing recorded".
  if (donation === null || expense === null) return null;
  const months = [donation.month, expense.month].filter(
    (m): m is string => m !== null,
  );
  return { latestMonth: months.length === 0 ? null : months.sort().at(-1)! };
}

/** Sum of this Malaysian month's donations, in cents. */
async function moneyInThisMonth(orgId: number, todayIso: string): Promise<number | null> {
  const supabase = await getSupabaseServer();
  const { firstIso, lastIso } = monthRange(todayIso.slice(0, 7));
  const { data, error } = await supabase
    .from("donations")
    .select("amount_cents")
    .eq("org_id", orgId)
    .gte("donated_at", firstIso)
    .lte("donated_at", lastIso)
    .limit(5000);
  if (error || !data) return null;
  return (data as { amount_cents: number | null }[]).reduce(
    (sum, row) => sum + (row.amount_cents ?? 0),
    0,
  );
}

async function unsignedMinutesDrafts(orgId: number): Promise<number | null> {
  const supabase = await getSupabaseServer();
  const { count, error } = await supabase
    .from("minutes_docs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "draft");
  if (error) return null;
  return count ?? 0;
}

/**
 * All four figures, in parallel, none of them able to break the page.
 * `usage` is passed in rather than fetched: the home page already reads it
 * for the chat box, and asking Supabase for the same quota twice on every
 * visit is a query nobody would miss.
 */
export async function getHomeStats(
  orgId: number,
  usage: { totalRemaining: number; monthlyFreeQuota: number; extraCredits: number } | null,
): Promise<HomeStats> {
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const [drafts, moneyIn, month] = await Promise.all([
    unsignedMinutesDrafts(orgId).catch(() => null),
    moneyInThisMonth(orgId, todayIso).catch(() => null),
    latestRecordMonth(orgId).catch(() => null),
  ]);
  return {
    minutesDrafts: drafts,
    moneyInCents: moneyIn,
    moneyRecords: month,
    aiLeft: usage ? usage.totalRemaining : null,
    aiTotal: usage ? usage.monthlyFreeQuota + usage.extraCredits : null,
  };
}
