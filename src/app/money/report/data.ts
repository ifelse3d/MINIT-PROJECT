// ---------------------------------------------------------------------------
// The financial statement's DATA — read from the database, never from any
// device's localStorage draft (Stage F, work order 27: one statement, not one
// per browser). USER-scoped client: RLS is the boundary (Hard Rule 5).
//
// 🔴 Survives a database behind migration 25: the in-kind columns on
// donations and the status column on expenses each get a fallback select —
// PostgREST fails the WHOLE query over one unknown column, and a blank
// statement is indistinguishable from "the society had no money movement".
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";
import type {
  StatementDonationRow,
  StatementExpenseRow,
} from "@/lib/financial-statement";

const DONATIONS_SELECT =
  "amount_cents, purpose, donated_at, kind, item_desc, est_value_cents";
const DONATIONS_SELECT_LEGACY = "amount_cents, purpose, donated_at";
const EXPENSES_SELECT = "amount_cents, category, spent_at, status";
const EXPENSES_SELECT_LEGACY = "amount_cents, category, spent_at";

export type StatementRows = {
  donations: StatementDonationRow[];
  expenses: StatementExpenseRow[];
};

/**
 * §1-7 (work order 32): the month of the LATEST money record, or null when
 * the organisation has none (or the database cannot be read). An empty
 * period must offer a way out — "the latest record is in 2026-04 → jump
 * there" — instead of a wall of RM0.00 that reads like the report is broken.
 */
export async function loadLatestRecordMonth(orgId: number): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const latest = async (
    table: "donations" | "expenses",
    column: "donated_at" | "spent_at",
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .eq("org_id", orgId)
      .not(column, "is", null)
      .order(column, { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const value = (data[0] as Record<string, unknown>)[column];
    return typeof value === "string" ? value.slice(0, 7) : null;
  };
  const [donationMonth, expenseMonth] = await Promise.all([
    latest("donations", "donated_at"),
    latest("expenses", "spent_at"),
  ]);
  if (donationMonth === null) return expenseMonth;
  if (expenseMonth === null) return donationMonth;
  return donationMonth > expenseMonth ? donationMonth : expenseMonth;
}

export async function loadStatementRows(
  orgId: number,
  period: { fromIso: string; toIso: string },
): Promise<StatementRows | null> {
  const supabase = await getSupabaseServer();

  const donationsQuery = (select: string) =>
    supabase
      .from("donations")
      .select(select)
      .eq("org_id", orgId)
      .gte("donated_at", period.fromIso)
      .lte("donated_at", period.toIso)
      .limit(5000);
  const expensesQuery = (select: string) =>
    supabase
      .from("expenses")
      .select(select)
      .eq("org_id", orgId)
      .gte("spent_at", period.fromIso)
      .lte("spent_at", period.toIso)
      .limit(5000);

  type DonationRaw = {
    amount_cents: number;
    purpose: string | null;
    donated_at: string | null;
    kind?: string | null;
    item_desc?: string | null;
    est_value_cents?: number | null;
  };
  type ExpenseRaw = {
    amount_cents: number;
    category: string | null;
    spent_at: string | null;
    status?: string | null;
  };

  let donations = await donationsQuery(DONATIONS_SELECT).returns<DonationRaw[]>();
  if (donations.error) {
    donations = await donationsQuery(DONATIONS_SELECT_LEGACY).returns<DonationRaw[]>();
  }
  let expenses = await expensesQuery(EXPENSES_SELECT).returns<ExpenseRaw[]>();
  if (expenses.error) {
    expenses = await expensesQuery(EXPENSES_SELECT_LEGACY).returns<ExpenseRaw[]>();
  }
  if (donations.error || expenses.error) return null;

  return {
    donations: (donations.data ?? []).flatMap((d) =>
      d.donated_at === null
        ? []
        : [
            {
              amountCents: Number(d.amount_cents),
              purpose: d.purpose ?? "",
              donatedAtIso: d.donated_at,
              kind: d.kind === "in_kind" ? ("in_kind" as const) : ("cash" as const),
              itemDesc: d.item_desc ?? null,
              estValueCents: d.est_value_cents ?? null,
            },
          ],
    ),
    expenses: (expenses.data ?? []).map((e) => ({
      amountCents: Number(e.amount_cents),
      category: e.category,
      spentAtIso: e.spent_at,
      status: e.status ?? null,
    })),
  };
}
