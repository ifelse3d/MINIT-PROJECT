// ---------------------------------------------------------------------------
// Which receipt number belongs to which row the treasurer confirmed?
//
// WHY THIS FILE EXISTS (2026-07-28 audit, P0)
// `src/app/money/actions.ts` used to answer that question by ARRAY POSITION:
//
//     receipts.forEach((r, i) => {
//       // receipts came back in insert order == rows order
//       map[rows[i].clientId] = r.receipt_no;
//     });
//
// PostgREST gives no such guarantee. `INSERT … RETURNING` row order is not
// contractual, and the same positional assumption was made twice in that file.
// If either `.select()` came back reordered, receipt MIN-2026-0004 was PRINTED
// with donor B's name and amount while the database held it against donor A —
// on a legal document, for money.
//
// The correlation is now done through the only key that actually ties the two
// together: `donations.id`. This module is pure so it can be unit-tested with
// deliberately shuffled input, which is exactly the failure that was invisible
// before.
// ---------------------------------------------------------------------------

/** A donation row we inserted, paired with the client row it came from. */
export type IssuedDonation = {
  donationId: string;
  clientId: string;
};

/** A receipt row as returned by the database. */
export type IssuedReceipt = {
  donationId: string;
  receiptNo: string;
};

export type MappingResult =
  | { ok: true; byClientId: Record<string, string> }
  | { ok: false; reason: "unmatched_receipt" | "missing_receipt" };

/**
 * Build `clientId → receiptNo`, keyed on `donationId` only.
 *
 * Fails loudly rather than guessing:
 *  - `unmatched_receipt`: a receipt points at a donation we did not insert.
 *  - `missing_receipt`: a donation we inserted has no receipt.
 *
 * Either case means the two sets disagree, and a caller must NOT show the
 * treasurer receipt numbers it cannot vouch for.
 */
export function mapReceiptsToClientIds(
  donations: readonly IssuedDonation[],
  receipts: readonly IssuedReceipt[],
): MappingResult {
  // One receipt per donation, exactly. A mismatch means the two sets disagree and
  // we must not quietly show fewer numbers than there are rows.
  if (donations.length !== receipts.length) {
    return {
      ok: false,
      reason: receipts.length < donations.length ? "missing_receipt" : "unmatched_receipt",
    };
  }

  const clientIdByDonation = new Map<string, string>();
  for (const d of donations) clientIdByDonation.set(d.donationId, d.clientId);

  const byClientId: Record<string, string> = {};
  for (const r of receipts) {
    const clientId = clientIdByDonation.get(r.donationId);
    if (clientId === undefined) return { ok: false, reason: "unmatched_receipt" };
    // Assigning twice would silently DROP a receipt number (two receipt rows
    // pointing at the same donation, or two donations sharing a clientId).
    if (byClientId[clientId] !== undefined) {
      return { ok: false, reason: "unmatched_receipt" };
    }
    byClientId[clientId] = r.receiptNo;
  }

  for (const d of donations) {
    if (byClientId[d.clientId] === undefined) {
      return { ok: false, reason: "missing_receipt" };
    }
  }

  return { ok: true, byClientId };
}
