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
  /** Receipt numbers of the rows handed over that HAVE one — the paper
   *  trail. Since J's launch feedback #4 (2026-08-27 evening: 「先拿到錢才
   *  開收據」— money first, receipts after) a batch may include rows whose
   *  receipt is issued later, so this list can be shorter than the batch. */
  receiptNos: string[];
  /** The register rows in this batch, by client id — the authoritative link
   *  since receipts stopped being mandatory before a hand-over. Absent on
   *  batches recorded before migration 28; those were all-receipted, so
   *  receiptNos still resolves them. */
  donationIds?: string[];
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
 * holds". Every selected row must be still `collected` and actually cash
 * (holdsCash) — anything else is a CustodyError, because a batch containing
 * it would be a paper trail claiming cash that was not there to hand over.
 *
 * A receipt is NOT required any more (J's launch feedback #4, 2026-08-27
 * evening: money moves first, the receipt follows). The batch record itself —
 * donor, amount, date, carrier — is the hand-over's voucher; receipt numbers
 * ride along for the rows that already have one. Pure function — no mutation.
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
      receiptNos: inBatch
        .map((d) => d.receiptNo)
        .filter((n): n is string => n !== null),
      donationIds: inBatch.map((d) => d.id),
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
 * Which register rows belong to this batch. donationIds is the authority;
 * batches recorded before migration 28 carry only receiptNos — those were
 * all-receipted by the old rule, so the numbers still resolve them.
 */
function batchMembers(
  batch: RemittanceBatch,
  donations: RegisterDonation[],
): RegisterDonation[] {
  if (batch.donationIds && batch.donationIds.length > 0) {
    const wanted = new Set(batch.donationIds);
    return donations.filter((d) => wanted.has(d.id));
  }
  const receiptNos = new Set(batch.receiptNos);
  return donations.filter(
    (d) => d.receiptNo !== null && receiptNos.has(d.receiptNo),
  );
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
  const ids = new Set(
    batchMembers(batch, donations)
      .filter((d) => d.custodyStatus === "pending_remittance")
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
  const inBatch = batchMembers(batch, donations);
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

// ----- Merging two copies of the truth (D32, 2026-08-28) -----------------------
//
// J's review, 27 evening #17: the SAME receipt could be handed over twice.
// Root cause: hand-overs/confirms only advanced the LOCAL copy's custody
// status; the database row stayed `collected`, and the hydration merge let
// the database copy win — so every page load resurrected settled money as
// "in hand, can be handed over". The state machine is forward-only, so the
// merge rule must be too: when two copies of one row disagree, the one
// FURTHER along the machine is the truth.

const CUSTODY_RANK: Record<CustodyStatus, number> = {
  collected: 0,
  pending_remittance: 1,
  settled: 2,
};

/** The status further along the forward-only machine. */
export function furthestCustody(a: CustodyStatus, b: CustodyStatus): CustodyStatus {
  return CUSTODY_RANK[a] >= CUSTODY_RANK[b] ? a : b;
}

/**
 * Merge the organisation's donation rows (remote) onto this device's (local).
 * Remote wins on every field EXCEPT custody status, which only moves forward —
 * a database that has not yet heard about a hand-over must not undo it.
 * Rows only one side has are kept.
 */
export function mergeDonations(
  local: RegisterDonation[],
  remote: RegisterDonation[],
): RegisterDonation[] {
  const byId = new Map(local.map((d) => [d.id, d]));
  for (const r of remote) {
    const l = byId.get(r.id);
    byId.set(
      r.id,
      l ? { ...r, custodyStatus: furthestCustody(l.custodyStatus, r.custodyStatus) } : r,
    );
  }
  return [...byId.values()];
}

/**
 * Merge the organisation's hand-over batches (remote) onto this device's.
 * A batch is forward-only too (pending → settled | cancelled), so on a
 * collision the non-pending copy wins; two non-pending copies prefer remote.
 */
export function mergeBatches(
  local: RemittanceBatch[],
  remote: RemittanceBatch[],
): RemittanceBatch[] {
  const byId = new Map(local.map((b) => [b.id, b]));
  for (const r of remote) {
    const l = byId.get(r.id);
    byId.set(r.id, l && l.status !== "pending" && r.status === "pending" ? l : r);
  }
  return [...byId.values()];
}

/**
 * Self-heal: the batches ARE the hand-over record, so any donation row a
 * batch claims must be at least as far along as the batch says. Rows the
 * database still holds at `collected` (written before hand-overs synced
 * back — the #17 bug's leftovers) get pushed forward here on every load,
 * so stale data heals instead of offering settled money for a second
 * hand-over. Cancelled batches force nothing (their rows really did
 * return to `collected`). Pure function.
 */
export function reconcileCustodyWithBatches(
  donations: RegisterDonation[],
  batches: RemittanceBatch[],
): RegisterDonation[] {
  const floor = new Map<string, CustodyStatus>();
  for (const batch of batches) {
    if (batch.status === "cancelled") continue;
    const wants: CustodyStatus =
      batch.status === "settled" ? "settled" : "pending_remittance";
    for (const member of batchMembers(batch, donations)) {
      const prev = floor.get(member.id) ?? "collected";
      floor.set(member.id, furthestCustody(prev, wants));
    }
  }
  if (floor.size === 0) return donations;
  return donations.map((d) => {
    const want = floor.get(d.id);
    if (!want || CUSTODY_RANK[want] <= CUSTODY_RANK[d.custodyStatus]) return d;
    return { ...d, custodyStatus: want };
  });
}

/**
 * True when a PENDING batch's money has already been confirmed under some
 * OTHER batch (every member row is settled) — the #17 leftovers. Confirming
 * it would claim the money arrived twice; the honest action is to cancel
 * this record, and the UI uses this to say so in the user's language.
 */
export function batchAlreadySettledElsewhere(
  batch: RemittanceBatch,
  donations: RegisterDonation[],
): boolean {
  if (batch.status !== "pending") return false;
  const members = batchMembers(batch, donations);
  return members.length > 0 && members.every((d) => d.custodyStatus === "settled");
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
