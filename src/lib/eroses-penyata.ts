// ---------------------------------------------------------------------------
// eROSES PENYATA KEWANGAN — the field taxonomy and the mapper (D1-2, work
// order 56, 2026-08-29).
//
// WHAT THIS IS. eROSES's Penyata Tahunan step 5 ("Penyata Kewangan") is a
// fixed form: income sections 1.1–1.4 plus a catch-all, expense sections
// 2.1–2.4, one RM box per field, totals computed by the portal. The labels
// below are transcribed FIELD BY FIELD from J's own eROSES account
// (screenshots, 2026-08-29) — including the portal's own quirks
// ("officeSupplies", "Kahirat kematian"), kept verbatim so a person matching
// this app's guidance against the real page sees the same words.
//
// WHAT THE MAPPER DOES. Every register row and expense row is classified into
// exactly one field, deterministically, from the category the person picked
// at entry (money-categories.ts). TypeScript sums the cents per field (Hard
// Rule 2 — the AI never touches these numbers). The goal is literally:
// "1.1 Derma → 16,252.00", with each cell able to say WHICH rows it was
// added up from.
//
// HONESTY RULES, decided here and tested:
//   * in-kind rows (goods) carry 0 money by convention (D-1) and are LISTED,
//     not summed — goods are not ringgit.
//   * a donation whose purpose names no known category counts as Derma (this
//     register IS the donation register), but the row is COUNTED as
//     "assumed" so the UI can say "N rows counted as Derma by default".
//   * expenses count when the money actually left: status "recorded" (typed
//     as already spent) or "paid". submitted/approved are reported separately
//     as pending, never silently added.
//   * rows outside the requested date range are excluded; rows with NO date
//     are excluded from a filtered statement but counted, out loud.
// ---------------------------------------------------------------------------

import {
  expenseCategoryFromStored,
  incomeCategoryFromPurpose,
} from "./money-categories";

export type PenyataSection = {
  id: string;
  /** Exact eROSES heading, e.g. "1.1 Pendapatan Operasi". */
  titleBm: string;
  direction: "income" | "expense";
  fields: { id: PenyataFieldId; labelBm: string }[];
};

// The ids are stable keys ("1.1.derma") used by money-categories.ts — never
// rename one without migrating that file.
export const PENYATA_SECTIONS = [
  {
    id: "1.1",
    titleBm: "1.1 Pendapatan Operasi",
    direction: "income",
    fields: [
      { id: "1.1.yuran_kemasukan", labelBm: "Yuran kemasukan (RM)" },
      { id: "1.1.yuran_ahli", labelBm: "Yuran ahli (RM)" },
      { id: "1.1.derma", labelBm: "Derma (RM)" },
      { id: "1.1.lain", labelBm: "Lain-lain pendapatan operasi (RM)" },
    ],
  },
  {
    id: "1.2",
    titleBm: "1.2 Hasil Aktiviti Menjana Dana",
    direction: "income",
    fields: [
      { id: "1.2.makan_malam", labelBm: "Majlis makan malam (RM)" },
      { id: "1.2.jualan_amal", labelBm: "Jualan amal (RM)" },
      { id: "1.2.perkhidmatan", labelBm: "Perkhidmatan (RM)" },
      { id: "1.2.lain", labelBm: "Lain-lain pendapatan menjana dana (RM)" },
    ],
  },
  {
    id: "1.3",
    titleBm: "1.3 Pendapatan Pelaburan",
    direction: "income",
    fields: [
      { id: "1.3.sewa", labelBm: "Pendapatan sewa (RM)" },
      { id: "1.3.dividen", labelBm: "Pendapatan dividen (RM)" },
      { id: "1.3.faedah", labelBm: "Faedah dari simpanan tetap (RM)" },
      { id: "1.3.harta", labelBm: "Keuntungan harta (RM)" },
      { id: "1.3.lain", labelBm: "Lain-lain pendapatan pelaburan (RM)" },
    ],
  },
  {
    id: "1.4",
    titleBm: "1.4 Geran",
    direction: "income",
    fields: [
      { id: "1.4.kerajaan", labelBm: "Geran agensi kerajaan (RM)" },
      { id: "1.4.swasta", labelBm: "Geran agensi swasta (RM)" },
      { id: "1.4.individu", labelBm: "Geran individu (RM)" },
      { id: "1.4.lain", labelBm: "Lain-lain geran (RM)" },
    ],
  },
  {
    id: "x",
    titleBm: "Lain lain pendapatan",
    direction: "income",
    fields: [{ id: "x.lain_pendapatan", labelBm: "Lain lain pendapatan (RM)" }],
  },
  {
    id: "2.1",
    titleBm: "2.1 Perbelanjaan operasi",
    direction: "expense",
    fields: [
      { id: "2.1.kutipan", labelBm: "Perbelanjaan aktiviti kutipan derma (RM)" },
      { id: "2.1.cukai", labelBm: "Cukai (RM)" },
      { id: "2.1.lain", labelBm: "Lain-lain (RM)" },
      { id: "2.1.kebajikan", labelBm: "Perbelanjaan kebajikan (RM)" },
      { id: "2.1.khairat_umum", labelBm: "Khairat umum (RM)" },
      // eROSES's own spelling ("Kahirat"), kept verbatim on purpose.
      { id: "2.1.khairat_kematian", labelBm: "Kahirat kematian (RM)" },
      { id: "2.1.cenderahati", labelBm: "Cenderahati/ hadiah (RM)" },
      { id: "2.1.biasiswa", labelBm: "Biasiswa (RM)" },
    ],
  },
  {
    id: "2.2",
    titleBm: "2.2 Perbelanjaan aktiviti/ menjana dana",
    direction: "expense",
    fields: [
      { id: "2.2.aktiviti", labelBm: "Perbelanjaan aktiviti pertubuhan (RM)" },
      { id: "2.2.promosi", labelBm: "Promosi aktiviti pertubuhan (RM)" },
      { id: "2.2.hiburan", labelBm: "Hiburan (RM)" },
      { id: "2.2.lawatan", labelBm: "Lawatan/Pelancongan/Hari Keluarga (RM)" },
      { id: "2.2.pelaburan", labelBm: "Perbelanjaan pelaburan (RM)" },
      { id: "2.2.yuran_penyertaan", labelBm: "Yuran penyertaan (RM)" },
      { id: "2.2.lain", labelBm: "Lain-lain (RM)" },
    ],
  },
  {
    id: "2.3",
    titleBm: "2.3 Kos Pentadbiran",
    direction: "expense",
    fields: [
      { id: "2.3.gaji", labelBm: "Elaun, gaji, upah (RM)" },
      { id: "2.3.sewa", labelBm: "Sewa (RM)" },
      { id: "2.3.utiliti", labelBm: "Utiliti (RM)" },
      // Verbatim from the portal — it really says "officeSupplies".
      { id: "2.3.office", labelBm: "officeSupplies (RM)" },
      { id: "2.3.kad_ahli", labelBm: "Kad ahli (RM)" },
      { id: "2.3.bonus", labelBm: "Bonus (RM)" },
      { id: "2.3.kwsp", labelBm: "KWSP/PERKESO (RM)" },
      { id: "2.3.insuran", labelBm: "Insuran (RM)" },
      { id: "2.3.pakaian", labelBm: "Pakaian seragam (RM)" },
      { id: "2.3.penyelenggaraan", labelBm: "Penyelenggaraan (RM)" },
      { id: "2.3.pengubahsuaian", labelBm: "Pengubahsuaian (RM)" },
      { id: "2.3.pengangkutan", labelBm: "Pengangkutan (RM)" },
      { id: "2.3.fotokopi", labelBm: "Fotokopi (RM)" },
      { id: "2.3.caj_bank", labelBm: "Caj bank (RM)" },
      { id: "2.3.lain", labelBm: "Lain-lain (RM)" },
    ],
  },
  {
    id: "2.4",
    titleBm: "2.4 Lain-lain perbelanjaan",
    direction: "expense",
    fields: [{ id: "2.4.lain", labelBm: "2.4 Lain-lain perbelanjaan (RM)" }],
  },
] as const satisfies readonly {
  id: string;
  titleBm: string;
  direction: "income" | "expense";
  fields: readonly { id: string; labelBm: string }[];
}[];

export type PenyataFieldId =
  (typeof PENYATA_SECTIONS)[number]["fields"][number]["id"];

// --- inputs ----------------------------------------------------------------

export type PenyataDonationInput = {
  amountCents: number;
  purpose: string;
  /** YYYY-MM-DD (or "" when unknown). */
  donatedAtIso: string;
  kind?: "cash" | "in_kind";
};

export type PenyataExpenseInput = {
  amountCents: number;
  category: string | null;
  /** YYYY-MM-DD or null. */
  spentAtIso: string | null;
  status: "recorded" | "submitted" | "approved" | "paid" | "rejected";
};

// --- output ----------------------------------------------------------------

export type PenyataCell = {
  id: PenyataFieldId;
  labelBm: string;
  amountCents: number;
  /** How many rows this cell was added up from. */
  rowCount: number;
};

export type PenyataKewangan = {
  sections: {
    id: string;
    titleBm: string;
    direction: "income" | "expense";
    cells: PenyataCell[];
  }[];
  jumlahPendapatanCents: number;
  jumlahPerbelanjaanCents: number;
  /** Donation rows counted as Derma because their purpose named no category. */
  assumedDermaCount: number;
  /** Goods rows (in-kind) — listed for the treasurer, never summed. */
  inKindCount: number;
  /** Claims not yet paid out (submitted/approved) — NOT in the totals. */
  pendingExpenseCount: number;
  pendingExpenseCents: number;
  /** Rows dropped by the date filter for having no date at all. */
  undatedCount: number;
};

/** The classifier for one donation row — exported so a UI can show, per row,
 *  where it will land. `assumed` = fell back to Derma. */
export function classifyDonation(purpose: string): {
  field: PenyataFieldId;
  assumed: boolean;
} {
  const cat = incomeCategoryFromPurpose(purpose);
  if (cat) return { field: cat.eroses, assumed: false };
  return { field: "1.1.derma", assumed: true };
}

/** The classifier for one expense row. Unknown/absent category → 2.4. */
export function classifyExpense(category: string | null): PenyataFieldId {
  const cat = expenseCategoryFromStored(category);
  return cat ? cat.eroses : "2.4.lain";
}

const inRange = (
  iso: string | null | undefined,
  from: string | null,
  to: string | null,
): "in" | "out" | "undated" => {
  if (!iso) return from || to ? "undated" : "in";
  if (from && iso < from) return "out";
  if (to && iso > to) return "out";
  return "in";
};

/**
 * The whole statement, from the rows. Every number is a TypeScript sum of
 * the cents Postgres/localStorage returned — no model anywhere near it.
 */
export function buildPenyataKewangan(input: {
  donations: PenyataDonationInput[];
  expenses: PenyataExpenseInput[];
  /** Financial year, inclusive, YYYY-MM-DD. Omit for "everything". */
  from?: string | null;
  to?: string | null;
}): PenyataKewangan {
  const from = input.from ?? null;
  const to = input.to ?? null;
  const sums = new Map<PenyataFieldId, { cents: number; rows: number }>();
  const add = (field: PenyataFieldId, cents: number) => {
    const cur = sums.get(field) ?? { cents: 0, rows: 0 };
    cur.cents += cents;
    cur.rows += 1;
    sums.set(field, cur);
  };

  let assumedDermaCount = 0;
  let inKindCount = 0;
  let undatedCount = 0;
  for (const d of input.donations) {
    if (d.kind === "in_kind") {
      // Goods are not ringgit (D-1). Count them so the statement can say
      // "and N in-kind donations besides", never add their estimates.
      inKindCount++;
      continue;
    }
    const range = inRange(d.donatedAtIso, from, to);
    if (range === "out") continue;
    if (range === "undated") {
      undatedCount++;
      continue;
    }
    const { field, assumed } = classifyDonation(d.purpose);
    if (assumed) assumedDermaCount++;
    add(field, d.amountCents);
  }

  let pendingExpenseCount = 0;
  let pendingExpenseCents = 0;
  for (const e of input.expenses) {
    if (e.status === "rejected") continue;
    if (e.status === "submitted" || e.status === "approved") {
      // The money has not left yet — report it, never add it.
      pendingExpenseCount++;
      pendingExpenseCents += e.amountCents;
      continue;
    }
    const range = inRange(e.spentAtIso, from, to);
    if (range === "out") continue;
    if (range === "undated") {
      undatedCount++;
      continue;
    }
    add(classifyExpense(e.category), e.amountCents);
  }

  let jumlahPendapatanCents = 0;
  let jumlahPerbelanjaanCents = 0;
  const sections = PENYATA_SECTIONS.map((s) => {
    const cells = s.fields.map((f) => {
      const sum = sums.get(f.id) ?? { cents: 0, rows: 0 };
      if (s.direction === "income") jumlahPendapatanCents += sum.cents;
      else jumlahPerbelanjaanCents += sum.cents;
      return {
        id: f.id,
        labelBm: f.labelBm,
        amountCents: sum.cents,
        rowCount: sum.rows,
      };
    });
    return { id: s.id, titleBm: s.titleBm, direction: s.direction, cells };
  });

  return {
    sections,
    jumlahPendapatanCents,
    jumlahPerbelanjaanCents,
    assumedDermaCount,
    inKindCount,
    pendingExpenseCount,
    pendingExpenseCents,
    undatedCount,
  };
}

/**
 * The string a person pastes into an eROSES RM box: two decimals, thousands
 * separators, no currency prefix — "16,252.00", exactly as the portal's own
 * example ("RM 500.59 ~ RM 500.60") formats amounts.
 */
export function penyataAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${(abs % 100).toString().padStart(2, "0")}`;
}
