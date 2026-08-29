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

export type HomeFigures = {
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
};

/** The figures plus the AI quota, which the page already has in hand. */
export type HomeStats = HomeFigures & {
  /** AI actions left this month, and the allowance they are counted against. */
  aiLeft: number | null;
  aiTotal: number | null;
};

const NO_FIGURES: HomeFigures = {
  minutesDrafts: null,
  moneyInCents: null,
  moneyRecords: null,
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
 * 🔴 A DEADLINE, not just a catch. These three reads decorate the home page;
 * they must never be the reason it is slow to arrive. If the database is
 * having a bad day the figures come back null and the cards simply render
 * without their status lines — which is the same thing that happens when a
 * query fails, and is already what the cards are built for.
 *
 * 2.5s is deliberately loose: it is a backstop against a hang, not a
 * performance budget. The queries themselves are counts and one small select.
 */
const FIGURES_DEADLINE_MS = 2500;

function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * The three database figures, read in parallel, none of them able to break or
 * delay the page.
 *
 * 🔴 CALL THIS INSIDE THE PAGE'S ONE Promise.all, never after another await.
 * The home page used to walk four awaits in a row — agm, org flags, usage,
 * then these — so on a Supabase in another region every visit paid four round
 * trips end to end. They are all independent; they belong in one wave.
 */
/**
 * G3-3 (work order 68, J #7): how many UNFINISHED workspace drafts (cloud
 * drafts, migration 33) this org has — the "you started something and never
 * finished it" reminder. Distinct from unsignedMinutesDrafts (documents at
 * status 'draft'): these are half-typed workspaces nobody saved yet.
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

export async function getHomeFigures(orgId: number): Promise<HomeFigures> {
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const read = (async (): Promise<HomeFigures> => {
    const [drafts, moneyIn, month] = await Promise.all([
      unsignedMinutesDrafts(orgId).catch(() => null),
      moneyInThisMonth(orgId, todayIso).catch(() => null),
      latestRecordMonth(orgId).catch(() => null),
    ]);
    return { minutesDrafts: drafts, moneyInCents: moneyIn, moneyRecords: month };
  })();
  return withDeadline(read, FIGURES_DEADLINE_MS, NO_FIGURES);
}

/**
 * The AI card's numbers come from the quota the page already fetched for the
 * chat box — asking Supabase for the same allowance twice on one visit is a
 * query nobody would miss. Pure, so it composes inside the page after the one
 * Promise.all resolves.
 */
export function homeStats(
  figures: HomeFigures,
  usage: { totalRemaining: number; monthlyFreeQuota: number; extraCredits: number } | null,
): HomeStats {
  return {
    ...figures,
    aiLeft: usage ? usage.totalRemaining : null,
    aiTotal: usage ? usage.monthlyFreeQuota + usage.extraCredits : null,
  };
}
