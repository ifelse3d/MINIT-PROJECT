import { describe, expect, it } from "vitest";
import {
  buildFinancialStatement,
  incomeCategoryOf,
  isCashOutflow,
  StatementError,
} from "@/lib/financial-statement";

// Stage F (work order 27): the statement is money, so it gets the custody
// treatment — pure, deterministic, tested before any screen shows it.

const period = { fromIso: "2026-06-01", toIso: "2026-06-30" };

describe("incomeCategoryOf", () => {
  it("recognises the manual categories, with or without a note", () => {
    expect(incomeCategoryOf("Yuran ahli")).toBe("Yuran ahli");
    expect(incomeCategoryOf("Sewa dewan — majlis kahwin")).toBe("Sewa dewan");
  });
  it("everything else is donation money", () => {
    expect(incomeCategoryOf("香油钱")).toBe("Derma");
    expect(incomeCategoryOf("Derma am")).toBe("Derma");
    expect(incomeCategoryOf("")).toBe("Derma");
  });
});

describe("isCashOutflow (cash accounting)", () => {
  it("counts money that actually moved", () => {
    expect(isCashOutflow("recorded")).toBe(true);
    expect(isCashOutflow("paid")).toBe(true);
    // Pre-migration rows have no status — they were treasurer entries.
    expect(isCashOutflow(null)).toBe(true);
    expect(isCashOutflow(undefined)).toBe(true);
  });
  it("owed, pending or refused money has not moved", () => {
    expect(isCashOutflow("submitted")).toBe(false);
    expect(isCashOutflow("approved")).toBe(false);
    expect(isCashOutflow("rejected")).toBe(false);
  });
});

describe("buildFinancialStatement", () => {
  it("buckets income by category, sums payments, computes the net", () => {
    const s = buildFinancialStatement(
      {
        donations: [
          { amountCents: 5000, purpose: "香油钱", donatedAtIso: "2026-06-07" },
          { amountCents: 10000, purpose: "Derma am", donatedAtIso: "2026-06-08" },
          { amountCents: 2000, purpose: "Yuran ahli", donatedAtIso: "2026-06-10" },
          // outside the period — must not appear
          { amountCents: 99900, purpose: "Derma", donatedAtIso: "2026-07-01" },
        ],
        expenses: [
          { amountCents: 3000, category: "Utiliti", spentAtIso: "2026-06-15", status: "recorded" },
          { amountCents: 4000, category: "Utiliti", spentAtIso: "2026-06-20", status: "paid" },
          // owed, not moved
          { amountCents: 88800, category: "Utiliti", spentAtIso: "2026-06-21", status: "approved" },
        ],
      },
      period,
    );
    expect(s.income).toEqual([
      { category: "Derma", totalCents: 15000, count: 2 },
      { category: "Yuran ahli", totalCents: 2000, count: 1 },
    ]);
    expect(s.incomeTotalCents).toBe(17000);
    expect(s.payments).toEqual([{ category: "Utiliti", totalCents: 7000, count: 2 }]);
    expect(s.paymentsTotalCents).toBe(7000);
    expect(s.netCents).toBe(10000);
  });

  it("keeps in-kind donations in a separate schedule, never in the money", () => {
    const s = buildFinancialStatement(
      {
        donations: [
          { amountCents: 5000, purpose: "Derma", donatedAtIso: "2026-06-07" },
          {
            amountCents: 0,
            purpose: "Derma",
            donatedAtIso: "2026-06-08",
            kind: "in_kind",
            itemDesc: "20 kampit beras",
            estValueCents: 60000,
          },
          {
            amountCents: 0,
            purpose: "Derma",
            donatedAtIso: "2026-06-09",
            kind: "in_kind",
            itemDesc: "kerusi plastik",
            estValueCents: null,
          },
        ],
        expenses: [],
      },
      period,
    );
    expect(s.incomeTotalCents).toBe(5000);
    expect(s.inKind).toHaveLength(2);
    expect(s.inKind[0].itemDesc).toBe("20 kampit beras");
    expect(s.inKindEstTotalCents).toBe(60000);
  });

  it("refuses a nonsense period instead of quietly producing zeros", () => {
    expect(() =>
      buildFinancialStatement({ donations: [], expenses: [] }, { fromIso: "2026-06-30", toIso: "2026-06-01" }),
    ).toThrow(StatementError);
    expect(() =>
      buildFinancialStatement({ donations: [], expenses: [] }, { fromIso: "junk", toIso: "2026-06-01" }),
    ).toThrow(StatementError);
  });
});
