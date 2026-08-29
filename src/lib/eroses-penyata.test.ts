import { describe, expect, it } from "vitest";

import {
  PENYATA_SECTIONS,
  buildPenyataKewangan,
  classifyDonation,
  classifyExpense,
  penyataAmount,
  type PenyataExpenseInput,
} from "@/lib/eroses-penyata";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  incomeCategoryFromPurpose,
} from "@/lib/money-categories";

// ---------------------------------------------------------------------------
// D1-2 (work order 56): every cell's amount = which rows, added by TypeScript.
// The goal sentence: "1.1 Derma → 16,252.00".
// ---------------------------------------------------------------------------

const donation = (amountCents: number, purpose: string, over: Partial<{
  donatedAtIso: string;
  kind: "cash" | "in_kind";
}> = {}) => ({
  amountCents,
  purpose,
  donatedAtIso: over.donatedAtIso ?? "2026-03-15",
  kind: over.kind,
});

const expense = (
  amountCents: number,
  category: string | null,
  status: PenyataExpenseInput["status"] = "paid",
  spentAtIso: string | null = "2026-04-01",
): PenyataExpenseInput => ({ amountCents, category, status, spentAtIso });

function cell(result: ReturnType<typeof buildPenyataKewangan>, id: string) {
  for (const s of result.sections) {
    const c = s.cells.find((x) => x.id === id);
    if (c) return c;
  }
  throw new Error(`no cell ${id}`);
}

describe("the taxonomy", () => {
  it("every category maps to a field that exists", () => {
    const ids = new Set(
      PENYATA_SECTIONS.flatMap((s) => s.fields.map((f) => f.id)),
    );
    for (const c of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
      expect(ids.has(c.eroses), `${c.value} → ${c.eroses}`).toBe(true);
    }
  });

  it("income categories land in income sections, expenses in expense ones", () => {
    const dirOf = new Map<string, string>();
    for (const s of PENYATA_SECTIONS)
      for (const f of s.fields) dirOf.set(f.id, s.direction);
    for (const c of INCOME_CATEGORIES) expect(dirOf.get(c.eroses)).toBe("income");
    for (const c of EXPENSE_CATEGORIES) expect(dirOf.get(c.eroses)).toBe("expense");
  });
});

describe("classifying a donation from its stored purpose", () => {
  it("category alone, category — note, and free text starting with one all match", () => {
    expect(classifyDonation("Derma")).toEqual({ field: "1.1.derma", assumed: false });
    expect(classifyDonation("Geran — banjir 2026")).toEqual({
      field: "1.4.lain",
      assumed: false,
    });
    expect(classifyDonation("Derma am")).toEqual({ field: "1.1.derma", assumed: false });
    expect(classifyDonation("Yuran ahli 2026")).toEqual({
      field: "1.1.yuran_ahli",
      assumed: false,
    });
  });

  it("names no category → counted as Derma, marked assumed", () => {
    expect(classifyDonation("tabung bumbung")).toEqual({
      field: "1.1.derma",
      assumed: true,
    });
  });

  it("matching is case-insensitive and prefers the longest value", () => {
    expect(incomeCategoryFromPurpose("derma khas")?.value).toBe("Derma");
    expect(incomeCategoryFromPurpose("SEWA DEWAN Mac")?.value).toBe("Sewa dewan");
  });
});

describe("classifying an expense", () => {
  it("each stored category lands on its own field", () => {
    expect(classifyExpense("Utiliti")).toBe("2.3.utiliti");
    expect(classifyExpense("Penyelenggaraan")).toBe("2.3.penyelenggaraan");
    expect(classifyExpense("Kebajikan & khairat")).toBe("2.1.kebajikan");
    expect(classifyExpense("Perbelanjaan acara")).toBe("2.2.aktiviti");
  });

  it("'Lain-lain: detail' and unknown/absent categories go to 2.4", () => {
    expect(classifyExpense("Lain-lain: sumbangan misc")).toBe("2.4.lain");
    expect(classifyExpense(null)).toBe("2.4.lain");
    expect(classifyExpense("something the app never wrote")).toBe("2.4.lain");
  });
});

describe("buildPenyataKewangan", () => {
  it("the goal sentence: 1.1 Derma = the donations, to the sen", () => {
    const r = buildPenyataKewangan({
      donations: [
        donation(1000000, "Derma am"),
        donation(625200, "Derma — tabung bumbung"),
      ],
      expenses: [],
    });
    const derma = cell(r, "1.1.derma");
    expect(derma.amountCents).toBe(1625200);
    expect(derma.rowCount).toBe(2);
    expect(penyataAmount(derma.amountCents)).toBe("16,252.00");
  });

  it("each category's ringgit lands in its own cell and nowhere else", () => {
    const r = buildPenyataKewangan({
      donations: [
        donation(5000, "Yuran ahli"),
        donation(20000, "Sewa dewan — Mac"),
        donation(30000, "Faedah bank"),
        donation(40000, "Pendapatan acara — pasar malam"),
        donation(50000, "Geran"),
        donation(60000, "Lain-lain — pampasan"),
      ],
      expenses: [
        expense(7000, "Utiliti"),
        expense(8000, "Sewa"),
        expense(9000, "Kebajikan & khairat"),
      ],
    });
    expect(cell(r, "1.1.yuran_ahli").amountCents).toBe(5000);
    expect(cell(r, "1.3.sewa").amountCents).toBe(20000);
    expect(cell(r, "1.3.faedah").amountCents).toBe(30000);
    expect(cell(r, "1.2.lain").amountCents).toBe(40000);
    expect(cell(r, "1.4.lain").amountCents).toBe(50000);
    expect(cell(r, "x.lain_pendapatan").amountCents).toBe(60000);
    expect(cell(r, "2.3.utiliti").amountCents).toBe(7000);
    expect(cell(r, "2.3.sewa").amountCents).toBe(8000);
    expect(cell(r, "2.1.kebajikan").amountCents).toBe(9000);
    // Totals are the sum of the cells — nothing counted twice, nothing lost.
    expect(r.jumlahPendapatanCents).toBe(5000 + 20000 + 30000 + 40000 + 50000 + 60000);
    expect(r.jumlahPerbelanjaanCents).toBe(7000 + 8000 + 9000);
  });

  it("in-kind rows are listed, never summed (goods are not ringgit)", () => {
    const r = buildPenyataKewangan({
      donations: [donation(0, "Derma", { kind: "in_kind" }), donation(1000, "Derma")],
      expenses: [],
    });
    expect(r.inKindCount).toBe(1);
    expect(r.jumlahPendapatanCents).toBe(1000);
  });

  it("free-text purposes are counted as Derma AND reported as assumed", () => {
    const r = buildPenyataKewangan({
      donations: [donation(1000, "tabung bumbung"), donation(2000, "Derma am")],
      expenses: [],
    });
    expect(cell(r, "1.1.derma").amountCents).toBe(3000);
    expect(r.assumedDermaCount).toBe(1);
  });

  it("only money that LEFT counts as expense; claims in flight are reported", () => {
    const r = buildPenyataKewangan({
      donations: [],
      expenses: [
        expense(1000, "Utiliti", "paid"),
        expense(2000, "Utiliti", "recorded"),
        expense(4000, "Utiliti", "approved"),
        expense(8000, "Utiliti", "submitted"),
        expense(16000, "Utiliti", "rejected"),
      ],
    });
    expect(cell(r, "2.3.utiliti").amountCents).toBe(3000);
    expect(r.pendingExpenseCount).toBe(2);
    expect(r.pendingExpenseCents).toBe(12000);
    expect(r.jumlahPerbelanjaanCents).toBe(3000);
  });

  it("the financial-year filter is inclusive and says when rows had no date", () => {
    const r = buildPenyataKewangan({
      donations: [
        donation(1000, "Derma", { donatedAtIso: "2026-01-01" }),
        donation(2000, "Derma", { donatedAtIso: "2026-12-31" }),
        donation(4000, "Derma", { donatedAtIso: "2025-12-31" }),
        donation(8000, "Derma", { donatedAtIso: "" }),
      ],
      expenses: [],
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(cell(r, "1.1.derma").amountCents).toBe(3000);
    expect(r.undatedCount).toBe(1);
  });

  it("no filter = everything counts, undated included", () => {
    const r = buildPenyataKewangan({
      donations: [donation(1000, "Derma", { donatedAtIso: "" })],
      expenses: [],
    });
    expect(cell(r, "1.1.derma").amountCents).toBe(1000);
    expect(r.undatedCount).toBe(0);
  });
});

describe("penyataAmount", () => {
  it("formats exactly as the portal's RM boxes expect", () => {
    expect(penyataAmount(1625200)).toBe("16,252.00");
    expect(penyataAmount(260946)).toBe("2,609.46");
    expect(penyataAmount(0)).toBe("0.00");
    expect(penyataAmount(5)).toBe("0.05");
    expect(penyataAmount(123456789)).toBe("1,234,567.89");
  });
});
