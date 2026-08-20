import { describe, expect, it } from "vitest";
import {
  canTransition,
  collectorBalances,
  confirmRemittanceBatch,
  createRemittanceBatch,
  CustodyError,
  totalUnremittedCents,
} from "@/lib/custody";
import type { RegisterDonation } from "@/lib/receipts";

function donation(over: Partial<RegisterDonation>): RegisterDonation {
  return {
    id: "d1",
    donorName: "Tan Ah Kow",
    donorPhone: null,
    amountCents: 5000,
    purpose: "Derma",
    donatedAtIso: "2026-06-07",
    collector: "Lim",
    receiptNo: "MIN-2026-0001",
    custodyStatus: "collected",
    ...over,
  };
}

describe("custody state machine (forward-only)", () => {
  it("allows only the two legal transitions", () => {
    expect(canTransition("collected", "pending_remittance")).toBe(true);
    expect(canTransition("pending_remittance", "settled")).toBe(true);
  });

  it("blocks every illegal move, including backwards and skipping", () => {
    expect(canTransition("collected", "settled")).toBe(false);
    expect(canTransition("pending_remittance", "collected")).toBe(false);
    expect(canTransition("settled", "collected")).toBe(false);
    expect(canTransition("settled", "pending_remittance")).toBe(false);
  });
});

describe("remittance batches", () => {
  const donations: RegisterDonation[] = [
    donation({ id: "d1", receiptNo: "MIN-2026-0001", amountCents: 5000 }),
    donation({ id: "d2", receiptNo: "MIN-2026-0002", amountCents: 10000 }),
    donation({ id: "d3", receiptNo: null, amountCents: 7000 }), // no receipt yet
    donation({ id: "d4", receiptNo: "MIN-2026-0003", amountCents: 2000, collector: "Ravi" }),
    donation({ id: "d5", receiptNo: "MIN-2026-0004", amountCents: 999, custodyStatus: "settled" }),
  ];

  it("batches only the collector's receipted, un-remitted donations; code sums the total", () => {
    const { batch, donations: updated } = createRemittanceBatch(donations, {
      id: "batch-1",
      collector: "Lim",
      handedOverAtIso: "2026-06-30",
    });
    expect(batch.receiptNos).toEqual(["MIN-2026-0001", "MIN-2026-0002"]);
    expect(batch.totalCents).toBe(15000);
    expect(batch.status).toBe("pending");
    expect(updated.find((d) => d.id === "d1")?.custodyStatus).toBe("pending_remittance");
    expect(updated.find((d) => d.id === "d3")?.custodyStatus).toBe("collected"); // untouched
    expect(updated.find((d) => d.id === "d4")?.custodyStatus).toBe("collected"); // other collector
    // pure function: originals untouched
    expect(donations.find((d) => d.id === "d1")?.custodyStatus).toBe("collected");
  });

  it("throws when there is nothing to remit", () => {
    expect(() =>
      createRemittanceBatch(donations, { id: "b", collector: "Nobody", handedOverAtIso: "2026-06-30" })
    ).toThrow(CustodyError);
  });

  it("HQ confirmation settles the batch and its donations", () => {
    const step1 = createRemittanceBatch(donations, {
      id: "batch-1",
      collector: "Lim",
      handedOverAtIso: "2026-06-30",
    });
    const step2 = confirmRemittanceBatch(step1.batch, step1.donations, { confirmedBy: "HQ Admin" });
    expect(step2.batch.status).toBe("settled");
    expect(step2.batch.confirmedByHq).toBe("HQ Admin");
    expect(step2.donations.find((d) => d.id === "d1")?.custodyStatus).toBe("settled");
    expect(step2.donations.find((d) => d.id === "d2")?.custodyStatus).toBe("settled");
  });

  it("refuses to confirm a batch twice", () => {
    const step1 = createRemittanceBatch(donations, {
      id: "batch-1",
      collector: "Lim",
      handedOverAtIso: "2026-06-30",
    });
    const step2 = confirmRemittanceBatch(step1.batch, step1.donations, { confirmedBy: "HQ" });
    expect(() =>
      confirmRemittanceBatch(step2.batch, step2.donations, { confirmedBy: "HQ" })
    ).toThrow(CustodyError);
  });
});

describe("HQ dashboard sums (deterministic)", () => {
  const donations: RegisterDonation[] = [
    donation({ id: "d1", collector: "Lim", amountCents: 5000, custodyStatus: "collected" }),
    donation({ id: "d2", collector: "Lim", amountCents: 10000, custodyStatus: "pending_remittance" }),
    donation({ id: "d3", collector: "Ravi", amountCents: 2000, custodyStatus: "settled" }),
  ];

  it("splits balances per collector by custody status", () => {
    expect(collectorBalances(donations)).toEqual([
      { collector: "Lim", collectedCents: 5000, pendingCents: 10000, settledCents: 0 },
      { collector: "Ravi", collectedCents: 0, pendingCents: 0, settledCents: 2000 },
    ]);
  });

  it("totals everything not yet settled", () => {
    expect(totalUnremittedCents(donations)).toBe(15000);
  });
});
