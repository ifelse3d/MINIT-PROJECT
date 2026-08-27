import { holdsCash, type RegisterDonation } from "@/lib/receipts";

// ---------------------------------------------------------------------------
// CUSTODY — collector → HQ money tracking (Phase 3, CLAUDE.md Hard Rule 2).
// A donation's cash is physically SOMEWHERE at all times:
//
//   collected            cash in the collector's hands
//   → pending_remittance collector handed a batch to HQ (recorded, unconfirmed)
//   → settled            HQ counted and confirmed the batch
//
// Strictly forward-only. Deterministic TypeScript; all sums here, never AI.
// ---------------------------------------------------------------------------

export const CUSTODY_STATUSES = ["collected", "pending_remittance", "settled"] as const;
export type CustodyStatus = (typeof CUSTODY_STATUSES)[number];

export class CustodyError extends Error {}

const NEXT: Record<CustodyStatus, CustodyStatus | null> = {
  collected: "pending_remittance",
  pending_remittance: "settled",
  settled: null,
};

export function canTransition(from: CustodyStatus, to: CustodyStatus): boolean {
  return NEXT[from] === to;
}

export function assertTransition(from: CustodyStatus, to: CustodyStatus): void {
  if (!canTransition(from, to)) {
    throw new CustodyError(
      `Illegal custody transition ${from} → ${to}. Money only moves forward: collected → pending_remittance → settled.`
    );
  }
}

// ----- Remittance batches -----------------------------------------------------

export type RemittanceBatch = {
  id: string;
  collector: string;
  /** Exact receipt numbers handed over — the paper trail. */
  receiptNos: string[];
  /** Summed by this code from the donation rows, never keyed in. */
  totalCents: number;
  /** The DATE the cash changed hands (拍板 0-6: editable while pending —
   *  people record a hand-over later than it happened). */
  handedOverAtIso: string;
  /** 'cancelled' (拍板 0-6): a mis-recorded hand-over voided BEFORE HQ
   *  confirmed. The batch stays on file for audit; its donations return to
   *  `collected` (they never actually left). This voids a RECORD — the
   *  custody state machine on donations stays forward-only for money. */
  status: "pending" | "settled" | "cancelled";
  confirmedByHq: string | null;
  /** §1-11: WHEN the record was made — the timestamp that cannot lie,
   *  even when handedOverAtIso is edited to yesterday. Absent on batches
   *  recorded before migration 27. */
  recordedAtIso?: string;
  /** §1-11: when HQ confirmed. Absent/null while pending. */
  confirmedAtIso?: string | null;
  /** Free note, editable while pending, frozen at confirm (拍板 0-6). */
  note?: string | null;
};

/**
 * Collector hands cash to HQ: batches every `collected` donation of that
 * collector that HAS a receipt. Returns the batch and the updated donation
 * rows (moved to pending_remittance). Pure function — no mutation.
 */
export function createRemittanceBatch(
  donations: RegisterDonation[],
  params: { id: string; collector: string; handedOverAtIso: string }
): { batch: RemittanceBatch; donations: RegisterDonation[] } {
  const inBatch = donations.filter(
    (d) =>
      d.collector === params.collector &&
      d.custodyStatus === "collected" &&
      d.receiptNo !== null &&
      // D-1 (拍板③): goods are not cash. An in-kind receipt in the batch's
      // receiptNos would be a paper trail claiming cash that never existed —
      // its amount is 0 by convention, but the NUMBER must not appear either.
      // D19 (拍板 34): bank transfers went straight into the account — they
      // were never in the collector's hands, so they never join a hand-over.
      holdsCash(d)
  );
  if (inBatch.length === 0) {
    throw new CustodyError(`No receipted, un-remitted donations for collector "${params.collector}".`);
  }
  inBatch.forEach((d) => assertTransition(d.custodyStatus, "pending_remittance"));

  const ids = new Set(inBatch.map((d) => d.id));
  return {
    batch: {
      id: params.id,
      collector: params.collector,
      receiptNos: inBatch.map((d) => d.receiptNo as string),
      totalCents: inBatch.reduce((sum, d) => sum + d.amountCents, 0),
      handedOverAtIso: params.handedOverAtIso,
      status: "pending",
      confirmedByHq: null,
    },
    donations: donations.map((d) =>
      ids.has(d.id) ? { ...d, custodyStatus: "pending_remittance" as const } : d
    ),
  };
}

/**
 * 拍板 0-6 (work order 32): hand over a HAND-PICKED set of register rows —
 * the per-item successor to createRemittanceBatch's "everything the collector
 * holds". Every selected row must be receipted, still `collected`, and
 * actually cash (holdsCash) — anything else is a CustodyError, because a
 * batch containing it would be a paper trail claiming cash that was not
 * there to hand over. Pure function — no mutation.
 */
export function createRemittanceBatchFromIds(
  donations: RegisterDonation[],
  params: {
    id: string;
    /** Who physically brings the cash (拍板 0-6: asked in the dialog). */
    collector: string;
    donationIds: string[];
    handedOverAtIso: string;
    recordedAtIso: string;
    note?: string | null;
  }
): { batch: RemittanceBatch; donations: RegisterDonation[] } {
  if (params.donationIds.length === 0) {
    throw new CustodyError("A hand-over needs at least one selected donation.");
  }
  const wanted = new Set(params.donationIds);
  const inBatch = donations.filter((d) => wanted.has(d.id));
  if (inBatch.length !== wanted.size) {
    throw new CustodyError("A selected donation is not in the register.");
  }
  for (const d of inBatch) {
    if (d.receiptNo === null) {
      throw new CustodyError(`Donation ${d.id} has no receipt yet — issue it first.`);
    }
    if (!holdsCash(d)) {
      throw new CustodyError(`Donation ${d.id} is not cash in a hand (goods or transfer).`);
    }
    assertTransition(d.custodyStatus, "pending_remittance");
  }

  const ids = new Set(inBatch.map((d) => d.id));
  return {
    batch: {
      id: params.id,
      collector: params.collector,
      receiptNos: inBatch.map((d) => d.receiptNo as string),
      totalCents: inBatch.reduce((sum, d) => sum + d.amountCents, 0),
      handedOverAtIso: params.handedOverAtIso,
      status: "pending",
      confirmedByHq: null,
      recordedAtIso: params.recordedAtIso,
      confirmedAtIso: null,
      note: params.note ?? null,
    },
    donations: donations.map((d) =>
      ids.has(d.id) ? { ...d, custodyStatus: "pending_remittance" as const } : d
    ),
  };
}

/**
 * 拍板 0-6: edit a PENDING batch's hand-over date / note. A settled batch is
 * locked forever; a cancelled one is history. Pure function.
 */
export function updatePendingBatch(
  batch: RemittanceBatch,
  patch: { handedOverAtIso?: string; note?: string | null }
): RemittanceBatch {
  if (batch.status !== "pending") {
    throw new CustodyError(`Batch ${batch.id} is ${batch.status} — it can no longer be edited.`);
  }
  return {
    ...batch,
    handedOverAtIso: patch.handedOverAtIso ?? batch.handedOverAtIso,
    note: patch.note === undefined ? (batch.note ?? null) : patch.note,
  };
}

/**
 * 拍板 0-6: void a mis-recorded hand-over BEFORE HQ confirms it.
 *
 * This is deliberately NOT a custody transition. The forward-only machine
 * (collected → pending_remittance → settled) describes MONEY moving; a
 * cancelled batch is a RECORD that was wrong — the cash never actually left
 * the collector's hands, so the rows go back to `collected` and the batch
 * stays on file as `cancelled` for the audit trail. A settled batch can
 * never be cancelled: HQ counted real money.
 */
export function cancelRemittanceBatch(
  batch: RemittanceBatch,
  donations: RegisterDonation[]
): { batch: RemittanceBatch; donations: RegisterDonation[] } {
  if (batch.status !== "pending") {
    throw new CustodyError(`Batch ${batch.id} is ${batch.status} — only a pending batch can be cancelled.`);
  }
  const receiptNos = new Set(batch.receiptNos);
  const ids = new Set(
    donations
      .filter(
        (d) =>
          d.receiptNo !== null &&
          receiptNos.has(d.receiptNo) &&
          d.custodyStatus === "pending_remittance",
      )
      .map((d) => d.id),
  );
  return {
    batch: { ...batch, status: "cancelled" },
    donations: donations.map((d) =>
      ids.has(d.id) ? { ...d, custodyStatus: "collected" as const } : d
    ),
  };
}

/** HQ counts the cash and confirms: batch settles, donations settle. Pure function. */
export function confirmRemittanceBatch(
  batch: RemittanceBatch,
  donations: RegisterDonation[],
  params: { confirmedBy: string; confirmedAtIso?: string }
): { batch: RemittanceBatch; donations: RegisterDonation[] } {
  if (batch.status === "settled") {
    throw new CustodyError(`Batch ${batch.id} is already settled.`);
  }
  if (batch.status === "cancelled") {
    throw new CustodyError(`Batch ${batch.id} was cancelled — there is nothing to confirm.`);
  }
  const receiptNos = new Set(batch.receiptNos);
  const inBatch = donations.filter((d) => d.receiptNo !== null && receiptNos.has(d.receiptNo));
  inBatch.forEach((d) => assertTransition(d.custodyStatus, "settled"));

  const ids = new Set(inBatch.map((d) => d.id));
  return {
    batch: {
      ...batch,
      status: "settled",
      confirmedByHq: params.confirmedBy,
      confirmedAtIso: params.confirmedAtIso ?? null,
    },
    donations: donations.map((d) =>
      ids.has(d.id) ? { ...d, custodyStatus: "settled" as const } : d
    ),
  };
}

// ----- HQ dashboard sums (deterministic) ---------------------------------------

export type CollectorBalance = {
  collector: string;
  /** Cash still in the collector's hands. */
  collectedCents: number;
  /** Handed over, awaiting HQ confirmation. */
  pendingCents: number;
  settledCents: number;
};

export function collectorBalances(donations: RegisterDonation[]): CollectorBalance[] {
  const byCollector = new Map<string, CollectorBalance>();
  // D-1: in-kind rows hold no cash — they are not in anyone's hands.
  // D19: transfer rows hold no cash either — the bank has it, not a person.
  for (const d of donations.filter(holdsCash)) {
    const b =
      byCollector.get(d.collector) ??
      { collector: d.collector, collectedCents: 0, pendingCents: 0, settledCents: 0 };
    if (d.custodyStatus === "collected") b.collectedCents += d.amountCents;
    else if (d.custodyStatus === "pending_remittance") b.pendingCents += d.amountCents;
    else b.settledCents += d.amountCents;
    byCollector.set(d.collector, b);
  }
  return [...byCollector.values()].sort((a, b) => a.collector.localeCompare(b.collector));
}

/** Everything not yet settled — the number HQ chases. Cash only: goods hold
 *  no money (D-1) and transfers are already in the bank (D19). */
export function totalUnremittedCents(donations: RegisterDonation[]): number {
  return donations
    .filter((d) => d.custodyStatus !== "settled" && holdsCash(d))
    .reduce((sum, d) => sum + d.amountCents, 0);
}
