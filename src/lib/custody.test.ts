import { describe, expect, it } from "vitest";
import {
  batchAlreadySettledElsewhere,
  canTransition,
  cancelRemittanceBatch,
  collectorBalances,
  confirmRemittanceBatch,
  createRemittanceBatch,
  createRemittanceBatchFromIds,
  CustodyError,
  furthestCustody,
  mergeBatches,
  mergeDonations,
  reconcileCustodyWithBatches,
  totalUnremittedCents,
  updatePendingBatch,
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

  // D-1 (拍板③): goods are not cash. An in-kind receipt number inside a
  // remittance batch would be a paper trail claiming cash that never existed.
  it("keeps in-kind donations out of the cash hand-over entirely", () => {
    const withGoods = [
      ...donations,
      donation({
        id: "g1",
        receiptNo: "MIN-2026-0005",
        amountCents: 0,
        kind: "in_kind",
        itemDesc: "20 kampit beras",
        estValueCents: 60000,
      }),
    ];
    const { batch, donations: updated } = createRemittanceBatch(withGoods, {
      id: "batch-g",
      collector: "Lim",
      handedOverAtIso: "2026-06-30",
    });
    expect(batch.receiptNos).not.toContain("MIN-2026-0005");
    expect(batch.totalCents).toBe(15000);
    // The goods row is untouched — it never becomes pending cash.
    expect(updated.find((d) => d.id === "g1")?.custodyStatus).toBe("collected");
  });

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

  // D-1: goods hold no cash — the dashboard must not show them as money in
  // anyone's hands, even if a bug ever puts a value in amountCents.
  it("keeps in-kind donations out of every cash sum", () => {
    const withGoods = [
      ...donations,
      donation({
        id: "g1",
        collector: "Lim",
        amountCents: 60000, // deliberately wrong: the filter must not rely on 0
        kind: "in_kind",
        itemDesc: "20 kampit beras",
        custodyStatus: "collected",
      }),
    ];
    expect(collectorBalances(withGoods)).toEqual(collectorBalances(donations));
    expect(totalUnremittedCents(withGoods)).toBe(15000);
  });

  // D19 (拍板 34): a bank transfer went straight into the account. It is not
  // in anyone's hands, it never joins a hand-over, and HQ must not chase it.
  it("keeps bank-transfer donations out of every cash sum", () => {
    const withTransfer = [
      ...donations,
      donation({
        id: "t1",
        collector: "Lim",
        amountCents: 88800,
        paymentMethod: "transfer",
        custodyStatus: "collected",
      }),
    ];
    expect(collectorBalances(withTransfer)).toEqual(collectorBalances(donations));
    expect(totalUnremittedCents(withTransfer)).toBe(15000);
  });

  it("keeps bank-transfer receipts out of a remittance batch", () => {
    const rows = [
      donation({ id: "c1", collector: "Lim", receiptNo: "MIN-2026-0001", amountCents: 5000 }),
      donation({
        id: "t1",
        collector: "Lim",
        receiptNo: "MIN-2026-0002",
        amountCents: 7000,
        paymentMethod: "transfer",
      }),
    ];
    const { batch, donations: after } = createRemittanceBatch(rows, {
      id: "b1",
      collector: "Lim",
      handedOverAtIso: "2026-08-28",
    });
    expect(batch.receiptNos).toEqual(["MIN-2026-0001"]);
    expect(batch.totalCents).toBe(5000);
    // The transfer row is untouched — it was never part of the hand-over.
    expect(after.find((d) => d.id === "t1")?.custodyStatus).toBe("collected");
  });

  it("a collector holding ONLY transfers has nothing to hand over", () => {
    const rows = [
      donation({
        id: "t1",
        collector: "Siti",
        receiptNo: "MIN-2026-0009",
        amountCents: 12000,
        paymentMethod: "transfer",
      }),
    ];
    expect(() =>
      createRemittanceBatch(rows, {
        id: "b1",
        collector: "Siti",
        handedOverAtIso: "2026-08-28",
      }),
    ).toThrow(CustodyError);
  });
});

// 拍板 0-6 (work order 32 §1-6): per-item hand-over, editable while pending,
// cancellable before HQ confirms, locked after.
describe("per-item remittance batches (拍板 0-6)", () => {
  const rows: RegisterDonation[] = [
    donation({ id: "d1", receiptNo: "MIN-2026-0001", amountCents: 5000 }),
    donation({ id: "d2", receiptNo: "MIN-2026-0002", amountCents: 10000 }),
    donation({ id: "d3", receiptNo: "MIN-2026-0003", amountCents: 2000 }),
    donation({ id: "u1", receiptNo: null, amountCents: 7000 }),
  ];
  const params = {
    id: "b1",
    collector: "Lim",
    handedOverAtIso: "2026-08-26",
    recordedAtIso: "2026-08-27T03:00:00Z",
  };

  it("batches exactly the selected rows and sums them in code", () => {
    const { batch, donations: after } = createRemittanceBatchFromIds(rows, {
      ...params,
      donationIds: ["d1", "d3"],
    });
    expect(batch.receiptNos).toEqual(["MIN-2026-0001", "MIN-2026-0003"]);
    expect(batch.totalCents).toBe(7000);
    expect(batch.status).toBe("pending");
    expect(batch.recordedAtIso).toBe("2026-08-27T03:00:00Z");
    // The hand-over DATE is the one the person chose, not today.
    expect(batch.handedOverAtIso).toBe("2026-08-26");
    expect(after.find((d) => d.id === "d1")?.custodyStatus).toBe("pending_remittance");
    expect(after.find((d) => d.id === "d2")?.custodyStatus).toBe("collected");
  });

  // #4 (launch feedback, 2026-08-27 evening): money moves FIRST, the receipt
  // follows — an unreceipted cash row can be handed over. The batch keeps the
  // donation-id link as the authority and carries only the receipt numbers
  // that exist.
  it("accepts an unreceipted row — the batch record itself is the voucher", () => {
    const { batch, donations: after } = createRemittanceBatchFromIds(rows, {
      ...params,
      donationIds: ["d1", "u1"],
    });
    expect(batch.donationIds).toEqual(["d1", "u1"]);
    expect(batch.receiptNos).toEqual(["MIN-2026-0001"]);
    expect(batch.totalCents).toBe(12000);
    expect(after.find((d) => d.id === "u1")?.custodyStatus).toBe("pending_remittance");
  });

  it("cancels and confirms an unreceipted batch through the donation-id link", () => {
    const { batch, donations: pending } = createRemittanceBatchFromIds(rows, {
      ...params,
      donationIds: ["u1"],
    });
    // Cancel: the row returns to collected; the batch stays on file.
    const cancelledResult = cancelRemittanceBatch(batch, pending);
    expect(cancelledResult.batch.status).toBe("cancelled");
    expect(cancelledResult.donations.find((d) => d.id === "u1")?.custodyStatus).toBe(
      "collected",
    );
    // Confirm (fresh batch): the row settles even though it has no receipt.
    const again = createRemittanceBatchFromIds(rows, {
      ...params,
      id: "b2",
      donationIds: ["u1"],
    });
    const confirmed = confirmRemittanceBatch(again.batch, again.donations, {
      confirmedBy: "HQ",
    });
    expect(confirmed.donations.find((d) => d.id === "u1")?.custodyStatus).toBe(
      "settled",
    );
  });

  it("refuses goods and transfers — they are not cash in a hand", () => {
    const withGoods = [
      ...rows,
      donation({ id: "g1", receiptNo: "MIN-2026-0009", amountCents: 0, kind: "in_kind" }),
      donation({ id: "t1", receiptNo: "MIN-2026-0010", amountCents: 100, paymentMethod: "transfer" }),
    ];
    expect(() =>
      createRemittanceBatchFromIds(withGoods, { ...params, donationIds: ["g1"] }),
    ).toThrow(CustodyError);
    expect(() =>
      createRemittanceBatchFromIds(withGoods, { ...params, donationIds: ["t1"] }),
    ).toThrow(CustodyError);
  });

  it("refuses an empty selection and an unknown id", () => {
    expect(() =>
      createRemittanceBatchFromIds(rows, { ...params, donationIds: [] }),
    ).toThrow(CustodyError);
    expect(() =>
      createRemittanceBatchFromIds(rows, { ...params, donationIds: ["nope"] }),
    ).toThrow(CustodyError);
  });

  it("lets a PENDING batch's date and note be edited, and only pending", () => {
    const { batch } = createRemittanceBatchFromIds(rows, {
      ...params,
      donationIds: ["d1"],
    });
    const edited = updatePendingBatch(batch, {
      handedOverAtIso: "2026-08-25",
      note: "kiraan malam",
    });
    expect(edited.handedOverAtIso).toBe("2026-08-25");
    expect(edited.note).toBe("kiraan malam");
    const settled = { ...batch, status: "settled" as const };
    expect(() => updatePendingBatch(settled, { note: "x" })).toThrow(CustodyError);
  });

  it("cancel voids the record and returns the rows to collected", () => {
    const made = createRemittanceBatchFromIds(rows, {
      ...params,
      donationIds: ["d1", "d2"],
    });
    const { batch, donations: after } = cancelRemittanceBatch(made.batch, made.donations);
    expect(batch.status).toBe("cancelled");
    expect(after.find((d) => d.id === "d1")?.custodyStatus).toBe("collected");
    expect(after.find((d) => d.id === "d2")?.custodyStatus).toBe("collected");
  });

  it("a settled batch can never be cancelled, a cancelled one never confirmed", () => {
    const made = createRemittanceBatchFromIds(rows, {
      ...params,
      donationIds: ["d1"],
    });
    const confirmed = confirmRemittanceBatch(made.batch, made.donations, {
      confirmedBy: "HQ Mei",
      confirmedAtIso: "2026-08-27T05:00:00Z",
    });
    expect(confirmed.batch.confirmedAtIso).toBe("2026-08-27T05:00:00Z");
    expect(() => cancelRemittanceBatch(confirmed.batch, confirmed.donations)).toThrow(
      CustodyError,
    );
    const cancelled = cancelRemittanceBatch(made.batch, made.donations);
    expect(() =>
      confirmRemittanceBatch(cancelled.batch, cancelled.donations, { confirmedBy: "HQ" }),
    ).toThrow(CustodyError);
  });
});

// ---------------------------------------------------------------------------
// D32 (2026-08-28) — the #17 double-hand-over bug. The database never heard
// about custody transitions, and the hydration merge let its stale `collected`
// copy overwrite the device's `settled` one — so every load resurrected
// settled money as handable. These tests pin the three repairs: forward-only
// merge, batch-driven reconcile, and the duplicate-pending detector.
// ---------------------------------------------------------------------------

describe("D32: forward-only merge of two copies of the truth", () => {
  it("furthestCustody picks the state further along the machine", () => {
    expect(furthestCustody("collected", "settled")).toBe("settled");
    expect(furthestCustody("settled", "collected")).toBe("settled");
    expect(furthestCustody("pending_remittance", "collected")).toBe("pending_remittance");
    expect(furthestCustody("collected", "collected")).toBe("collected");
  });

  it("mergeDonations: remote fields win, but custody status never moves backwards", () => {
    const local = [
      donation({ id: "d1", custodyStatus: "settled", donorName: "Old Name" }),
      donation({ id: "only-local", receiptNo: null }),
    ];
    const remote = [
      donation({ id: "d1", custodyStatus: "collected", donorName: "DB Name" }),
      donation({ id: "only-remote" }),
    ];
    const merged = mergeDonations(local, remote);
    const d1 = merged.find((d) => d.id === "d1");
    expect(d1?.donorName).toBe("DB Name"); // remote fields win
    expect(d1?.custodyStatus).toBe("settled"); // …but money never un-settles
    expect(merged.map((d) => d.id).sort()).toEqual(["d1", "only-local", "only-remote"]);
  });

  it("mergeBatches: a non-pending copy beats a pending one, whichever side holds it", () => {
    const pending = {
      id: "b1",
      collector: "Lim",
      receiptNos: ["MIN-2026-0001"],
      totalCents: 5000,
      handedOverAtIso: "2026-08-27",
      status: "pending" as const,
      confirmedByHq: null,
    };
    const settled = { ...pending, status: "settled" as const, confirmedByHq: "HQ Mei" };
    // Local device confirmed; the DB write failed and it still says pending.
    expect(mergeBatches([settled], [pending])[0].status).toBe("settled");
    // The DB knows it settled; this device is stale.
    expect(mergeBatches([pending], [settled])[0].status).toBe("settled");
  });

  it("reconcile: rows a settled batch claims are forced to settled on load", () => {
    // The #17 leftovers: DB rows still `collected`, batch already settled.
    const rows = [
      donation({ id: "d1", receiptNo: "MIN-2026-0001", custodyStatus: "collected" }),
      donation({ id: "d2", receiptNo: "MIN-2026-0002", custodyStatus: "collected" }),
      donation({ id: "d3", receiptNo: null, custodyStatus: "collected" }),
    ];
    const batches = [
      {
        id: "b1",
        collector: "J",
        receiptNos: ["MIN-2026-0001", "MIN-2026-0002"],
        donationIds: ["d1", "d2"],
        totalCents: 27010,
        handedOverAtIso: "2026-08-27",
        status: "settled" as const,
        confirmedByHq: "HQ",
      },
      {
        id: "b2",
        collector: "J",
        receiptNos: [],
        donationIds: ["d3"],
        totalCents: 2000,
        handedOverAtIso: "2026-08-27",
        status: "pending" as const,
        confirmedByHq: null,
      },
    ];
    const healed = reconcileCustodyWithBatches(rows, batches);
    expect(healed.find((d) => d.id === "d1")?.custodyStatus).toBe("settled");
    expect(healed.find((d) => d.id === "d2")?.custodyStatus).toBe("settled");
    // A pending batch pins its member at pending_remittance — not handable.
    expect(healed.find((d) => d.id === "d3")?.custodyStatus).toBe("pending_remittance");
  });

  it("reconcile: a cancelled batch forces nothing, and a settled row never regresses", () => {
    const rows = [
      donation({ id: "d1", custodyStatus: "settled" }),
      donation({ id: "d2", custodyStatus: "collected" }),
    ];
    const batches = [
      {
        id: "b-cancelled",
        collector: "J",
        receiptNos: [],
        donationIds: ["d2"],
        totalCents: 5000,
        handedOverAtIso: "2026-08-27",
        status: "cancelled" as const,
        confirmedByHq: null,
      },
      {
        id: "b-pending",
        collector: "J",
        receiptNos: [],
        donationIds: ["d1"],
        totalCents: 5000,
        handedOverAtIso: "2026-08-27",
        status: "pending" as const,
        confirmedByHq: null,
      },
    ];
    const healed = reconcileCustodyWithBatches(rows, batches);
    expect(healed.find((d) => d.id === "d2")?.custodyStatus).toBe("collected");
    // The stale duplicate pending batch cannot drag a settled row backwards.
    expect(healed.find((d) => d.id === "d1")?.custodyStatus).toBe("settled");
  });

  it("batchAlreadySettledElsewhere flags the stale duplicate pending batch", () => {
    const rows = [
      donation({ id: "d1", custodyStatus: "settled" }),
      donation({ id: "d2", custodyStatus: "pending_remittance" }),
    ];
    const dup = {
      id: "b-dup",
      collector: "J",
      receiptNos: [],
      donationIds: ["d1"],
      totalCents: 3800,
      handedOverAtIso: "2026-08-27",
      status: "pending" as const,
      confirmedByHq: null,
    };
    expect(batchAlreadySettledElsewhere(dup, rows)).toBe(true);
    // A batch with a genuinely outstanding row is NOT a duplicate.
    expect(
      batchAlreadySettledElsewhere({ ...dup, donationIds: ["d1", "d2"] }, rows),
    ).toBe(false);
    // Settled/cancelled batches are never flagged.
    expect(
      batchAlreadySettledElsewhere({ ...dup, status: "settled", confirmedByHq: "HQ" }, rows),
    ).toBe(false);
  });
});
