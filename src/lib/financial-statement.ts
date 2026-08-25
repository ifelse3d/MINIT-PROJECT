// ---------------------------------------------------------------------------
// PENYATA PENERIMAAN DAN PEMBAYARAN — the financial statement, pure logic
// (Stage F, work order 27; J 8/26 #1 card ③ + #2 财报).
//
// CASH accounting, deliberately: a receipts-and-payments statement records
// money that MOVED in the period — the shape a society's AGM and auditor
// expect. That decides three things:
//
//   * Income = the donations/income rows in the DATABASE (written when
//     receipts are issued, or hydrated from the register save path). Never
//     localStorage — the register draft is per-device, and a statement built
//     from one device's draft is two account books (工作單 F-1 紅字).
//   * Outflow = expenses with status 'recorded' (the treasurer paid it) or
//     'paid' (a claim that was actually paid back). A submitted or approved
//     claim is money the society OWES, not money that moved; a rejected one
//     never moved at all.
//   * In-kind donations are goods, not cash: they appear in a SEPARATE
//     schedule (item + the optional human estimate) and never mix into the
//     money columns (拍板③).
//
// Every sum is TypeScript (Hard Rule 2). No I/O here; the caller feeds rows
// it read from the database.
// ---------------------------------------------------------------------------

/** The income categories the manual form offers — used to bucket purposes.
 *  A purpose that matches none of these is donation money (the donations
 *  table IS the donation register; non-donation income arrives through the
 *  manual categories, which write "<category>" or "<category> — note"). */
export const INCOME_CATEGORY_VALUES = [
  "Derma",
  "Yuran ahli",
  "Sewa dewan",
  "Pendapatan acara",
  "Geran",
  "Faedah bank",
  "Lain-lain",
] as const;

export type StatementDonationRow = {
  amountCents: number;
  purpose: string;
  /** YYYY-MM-DD */
  donatedAtIso: string;
  kind?: "cash" | "in_kind" | null;
  itemDesc?: string | null;
  estValueCents?: number | null;
  donorMasked?: string | null;
};

export type StatementExpenseRow = {
  amountCents: number;
  category: string | null;
  /** YYYY-MM-DD */
  spentAtIso: string | null;
  status?: string | null;
};

export type StatementLine = { category: string; totalCents: number; count: number };

export type FinancialStatement = {
  /** YYYY-MM-DD, inclusive. */
  fromIso: string;
  toIso: string;
  income: StatementLine[];
  incomeTotalCents: number;
  payments: StatementLine[];
  paymentsTotalCents: number;
  /** income − payments. Negative = the society paid out more than came in. */
  netCents: number;
  /** Goods received in the period — a schedule, never money. */
  inKind: { itemDesc: string; estValueCents: number | null; dateIso: string }[];
  /** Optional-estimate sum of the schedule, clearly an estimate. */
  inKindEstTotalCents: number;
};

export class StatementError extends Error {}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Which income line a stored purpose belongs to. */
export function incomeCategoryOf(purpose: string): string {
  const p = purpose.trim();
  for (const cat of INCOME_CATEGORY_VALUES) {
    if (p === cat || p.startsWith(`${cat} — `) || p.startsWith(`${cat} - `)) return cat;
  }
  // 香油钱, "Derma am", a blank — all donation money.
  return "Derma";
}

/** Does a cash movement in this period count as an outflow? */
export function isCashOutflow(status: string | null | undefined): boolean {
  // No status column yet (pre-migration-25 database) = the legacy rows were
  // all treasurer entries — money that moved.
  if (status === null || status === undefined || status === "") return true;
  return status === "recorded" || status === "paid";
}

function inPeriod(dayIso: string | null, fromIso: string, toIso: string): boolean {
  return dayIso !== null && dayIso >= fromIso && dayIso <= toIso;
}

export function buildFinancialStatement(
  input: {
    donations: StatementDonationRow[];
    expenses: StatementExpenseRow[];
  },
  period: { fromIso: string; toIso: string },
): FinancialStatement {
  if (!ISO_DAY.test(period.fromIso) || !ISO_DAY.test(period.toIso)) {
    throw new StatementError(`Period must be YYYY-MM-DD dates, got "${period.fromIso}" – "${period.toIso}".`);
  }
  if (period.fromIso > period.toIso) {
    throw new StatementError(`Period start ${period.fromIso} is after its end ${period.toIso}.`);
  }

  const donations = input.donations.filter((d) =>
    inPeriod(d.donatedAtIso || null, period.fromIso, period.toIso),
  );
  const cash = donations.filter((d) => d.kind !== "in_kind");
  const goods = donations.filter((d) => d.kind === "in_kind");

  const incomeByCat = new Map<string, StatementLine>();
  for (const d of cash) {
    const category = incomeCategoryOf(d.purpose);
    const line = incomeByCat.get(category) ?? { category, totalCents: 0, count: 0 };
    line.totalCents += d.amountCents;
    line.count += 1;
    incomeByCat.set(category, line);
  }
  // Stable, reader-friendly order: the known categories first, then anything
  // else alphabetically (future-proofing; today nothing else can appear).
  const income = [...incomeByCat.values()].sort((a, b) => {
    const ai = (INCOME_CATEGORY_VALUES as readonly string[]).indexOf(a.category);
    const bi = (INCOME_CATEGORY_VALUES as readonly string[]).indexOf(b.category);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.category.localeCompare(b.category);
  });
  const incomeTotalCents = income.reduce((s, l) => s + l.totalCents, 0);

  const paid = input.expenses.filter(
    (e) => isCashOutflow(e.status) && inPeriod(e.spentAtIso, period.fromIso, period.toIso),
  );
  const payByCat = new Map<string, StatementLine>();
  for (const e of paid) {
    const category = (e.category ?? "").trim() || "Lain-lain";
    const line = payByCat.get(category) ?? { category, totalCents: 0, count: 0 };
    line.totalCents += e.amountCents;
    line.count += 1;
    payByCat.set(category, line);
  }
  const payments = [...payByCat.values()].sort((a, b) =>
    a.category.localeCompare(b.category),
  );
  const paymentsTotalCents = payments.reduce((s, l) => s + l.totalCents, 0);

  const inKind = goods.map((d) => ({
    itemDesc: (d.itemDesc ?? "").trim() || "—",
    estValueCents: d.estValueCents ?? null,
    dateIso: d.donatedAtIso,
  }));
  const inKindEstTotalCents = inKind.reduce((s, g) => s + (g.estValueCents ?? 0), 0);

  return {
    fromIso: period.fromIso,
    toIso: period.toIso,
    income,
    incomeTotalCents,
    payments,
    paymentsTotalCents,
    netCents: incomeTotalCents - paymentsTotalCents,
    inKind,
    inKindEstTotalCents,
  };
}
