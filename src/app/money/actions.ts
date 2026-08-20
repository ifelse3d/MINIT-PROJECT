"use server";

// Issue receipts AND save them to the database (Phase 7 history).
//
// Hard Rule 2: numbering is deterministic TypeScript (allocateReceiptNos) —
// the numbers come from the DATABASE's existing series, so they stay sequential
// and gap-free across devices and sessions. The unique (org_id, receipt_no)
// constraint is the backstop: if two people issue at the same moment, one insert
// fails and we retry once with fresh numbers.
//
// All writes use the USER-scoped client — RLS proves the user may write to
// the active org. PDPA: donor data is never logged; donor_masked is stored
// alongside for list views.
//
// ===========================================================================
// 2026-07-28 AUDIT FIXES IN THIS FILE (it is the most safety-critical one)
//
// P0 · WRONG DONOR ON A LEGAL RECEIPT.
//   Receipt numbers were matched to the treasurer's rows by ARRAY POSITION,
//   twice, on the result of a multi-row `insert().select()` — an order
//   PostgREST does not guarantee. The donations are now inserted ONE ROW AT A
//   TIME so each returned id is unambiguously tied to its client row, and the
//   receipt→row mapping goes through `donations.id` via the unit-tested pure
//   function `mapReceiptsToClientIds`. (Once migration 20260726000000 is applied
//   this can become a single upsert on (org_id, client_id) — see the note at the
//   insert loop. The per-row loop is the correct fix that needs no new columns.)
//
// M1 · WRONG YEAR SERIES FOR 8 HOURS EVERY NEW YEAR.
//   `new Date().getFullYear()` ran in the SERVER's timezone. On a UTC host,
//   between 00:00 and 08:00 MYT on 1 January it returned the PREVIOUS year, so
//   receipts issued on 1 Jan 2027 continued the closed MIN-2026 series. Now
//   derived from Malaysia time like every other date in the codebase.
//
// M4 · Hard Rule 5: the rollback delete and the receipt_id back-link carried no
//   org_id filter (relying on RLS alone). Both are scoped now.
//
// P1 · Unchecked compensating writes silently orphaned money rows: a failed
//   rollback left donations with no receipt, which every income total counts but
//   no receipt explains. Both errors are checked and reported distinctly.
//
// P2 · An auditor account got `reason: "failed"`, which the UI renders as the
//   alarming "we could not confirm whether receipts were issued" message. It now
//   returns `readonly`.
// ===========================================================================
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { dayIsoMalaysia } from "@/lib/history";
import { maskName } from "@/lib/mask";
import { mapReceiptsToClientIds, type IssuedDonation } from "@/lib/receipt-mapping";
import { allocateReceiptNos } from "@/lib/receipts";

export type RowToIssue = {
  /** Client-side row id, echoed back so the UI can match numbers to rows. */
  clientId: string;
  donorName: string;
  donorPhone: string | null;
  amountCents: number;
  purpose: string;
  /** YYYY-MM-DD */
  donatedAtIso: string;
  custodyStatus: "collected" | "pending_remittance" | "settled";
};

export type IssueResult =
  | {
      saved: false;
      /**
       * no_org             — nobody has chosen an organisation.
       * readonly           — auditor account; nothing was attempted.
       * failed             — nothing was written; safe to try again.
       * needs_reconciliation — something WAS written and could not be cleaned
       *                      up. The treasurer must check Receipt history
       *                      before touching this again.
       */
      reason: "no_org" | "readonly" | "failed" | "needs_reconciliation";
    }
  | { saved: true; receiptNos: Record<string, string> };

const PREFIX = "MIN";

export async function issueAndSaveReceipts(
  rows: RowToIssue[],
): Promise<IssueResult> {
  const active = await getActiveOrg();
  if (!active) return { saved: false, reason: "no_org" };
  if (active.role === "auditor_readonly") return { saved: false, reason: "readonly" };
  if (rows.length === 0) return { saved: true, receiptNos: {} };

  const supabase = await getSupabaseServer();
  // Malaysia time, not the server's: see M1 in the header comment.
  const year = Number(dayIsoMalaysia(new Date().toISOString())!.slice(0, 4));

  // Two attempts: a concurrent issuer can win the race once; we re-read and
  // re-allocate, then give up cleanly (never partial).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: existingRows, error: readError } = await supabase
      .from("receipts")
      .select("receipt_no")
      .eq("org_id", active.id);
    if (readError) return { saved: false, reason: "failed" };

    let receiptNos: string[];
    try {
      receiptNos = allocateReceiptNos(
        (existingRows ?? []).map((r) => r.receipt_no as string),
        rows.length,
        { prefix: PREFIX, year },
      );
    } catch {
      // Gaps in the existing series — must be resolved by a human.
      return { saved: false, reason: "failed" };
    }

    // -------------------------------------------------------------------
    // 1. Insert the donations, ONE AT A TIME.
    //
    // A single multi-row insert gives back ids in an order PostgREST does not
    // promise, and without a correlating column there is no way to tell which
    // id belongs to which of the treasurer's rows. Inserting per row makes the
    // correlation a fact rather than an assumption. A confirmed ledger page is
    // tens of rows, so the extra round-trips are cheap next to printing a legal
    // receipt against the wrong donor.
    //
    // FUTURE: once migration 20260726000000 (client_id + the unique
    // (org_id, client_id) constraint) is applied, replace this loop with one
    // `.upsert(rows, { onConflict: "org_id,client_id" })` — that also makes a
    // retried request idempotent, which this version cannot be.
    // -------------------------------------------------------------------
    const inserted: IssuedDonation[] = [];
    let insertFailed = false;
    for (const r of rows) {
      const { data, error } = await supabase
        .from("donations")
        .insert({
          org_id: active.id,
          donor_name: r.donorName,
          donor_phone: r.donorPhone,
          donor_masked: maskName(r.donorName),
          amount_cents: r.amountCents,
          purpose: r.purpose,
          donated_at: r.donatedAtIso,
          custody_status: r.custodyStatus,
        })
        .select("id")
        .single();
      if (error || !data) {
        insertFailed = true;
        break;
      }
      inserted.push({ donationId: data.id as string, clientId: r.clientId });
    }

    if (insertFailed) {
      const cleaned = await rollbackDonations(supabase, active.id, inserted);
      return {
        saved: false,
        reason: cleaned ? "failed" : "needs_reconciliation",
      };
    }

    // -------------------------------------------------------------------
    // 2. Insert the receipts. If another issuer grabbed the same numbers in
    //    the meantime, the unique constraint rejects this — undo and retry.
    //    Note each receipt row carries its own donation_id explicitly, so the
    //    number→donation pairing is decided HERE, by us, not by row order.
    // -------------------------------------------------------------------
    const { data: receipts, error: receiptError } = await supabase
      .from("receipts")
      .insert(
        inserted.map((d, i) => ({
          org_id: active.id,
          receipt_no: receiptNos[i],
          donation_id: d.donationId,
        })),
      )
      .select("id, donation_id, receipt_no");

    if (receiptError || !receipts) {
      const cleaned = await rollbackDonations(supabase, active.id, inserted);
      if (!cleaned) {
        // Donations exist with no receipts. Every income total counts them and
        // no receipt explains them, so the treasurer must look before retrying.
        return { saved: false, reason: "needs_reconciliation" };
      }
      continue; // retry once with fresh numbers
    }

    // -------------------------------------------------------------------
    // 3. Point each donation at its receipt. A failure here leaves the receipt
    //    correct but the back-link missing, which skews the "not yet receipted"
    //    counts on the dashboard — so it is surfaced, not swallowed.
    // -------------------------------------------------------------------
    let backlinkFailed = false;
    for (const r of receipts) {
      const { error } = await supabase
        .from("donations")
        .update({ receipt_id: r.id })
        // Hard Rule 5: scope by org_id, do not lean on RLS alone.
        .eq("org_id", active.id)
        .eq("id", r.donation_id);
      if (error) backlinkFailed = true;
    }

    // -------------------------------------------------------------------
    // 4. clientId → receiptNo, keyed on donation_id. Never on array position.
    // -------------------------------------------------------------------
    const mapping = mapReceiptsToClientIds(
      inserted,
      receipts.map((r) => ({
        donationId: r.donation_id as string,
        receiptNo: r.receipt_no as string,
      })),
    );
    if (!mapping.ok) {
      // The two sets disagree. The receipts ARE in the database, so we must not
      // delete them — but we also must not show numbers we cannot vouch for.
      return { saved: false, reason: "needs_reconciliation" };
    }
    if (backlinkFailed) {
      return { saved: false, reason: "needs_reconciliation" };
    }

    return { saved: true, receiptNos: mapping.byClientId };
  }

  return { saved: false, reason: "failed" };
}

/**
 * Undo freshly inserted donations that never got receipts.
 * Returns false when the cleanup itself failed — the caller must then report
 * `needs_reconciliation` rather than pretending nothing was written.
 */
async function rollbackDonations(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  orgId: number,
  inserted: readonly IssuedDonation[],
): Promise<boolean> {
  if (inserted.length === 0) return true;
  const { data, error } = await supabase
    .from("donations")
    .delete()
    // Hard Rule 5: scope by org_id, do not lean on RLS alone.
    .eq("org_id", orgId)
    .in(
      "id",
      inserted.map((d) => d.donationId),
    )
    // `.select()` so we can COUNT what was actually removed.
    //
    // A PostgREST DELETE that matches ZERO rows returns no error. Trusting
    // `!error` alone meant a delete that removed nothing still reported
    // success, the caller `continue`d, and attempt 1 re-inserted the same rows —
    // every donation duplicated in the register with receipts attached only to
    // the second set. Verifying the count is what makes the retry safe.
    .select("id");
  return !error && (data?.length ?? 0) === inserted.length;
}
