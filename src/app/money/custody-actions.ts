"use server";

import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { can } from "@/lib/roles";
import type { RemittanceBatch } from "@/lib/custody";

// ---------------------------------------------------------------------------
// CASH HAND-OVERS, IN THE ORGANISATION'S RECORDS RATHER THAN ONE BROWSER.
//
// J's UX list, root cause B. `remittance_batches` has existed since the first
// migration and had RLS policies from Phase 7 — and nothing anywhere ever
// inserted into it. So the answer to "has the Klang branch handed its cash to
// HQ yet" lived in the Klang treasurer's browser, which is the one place HQ
// cannot look.
//
// This is the one of the three where being device-local is not merely
// inconvenient. A hand-over is a claim by one person that they gave money to
// another person; it is worth exactly as much as the record both of them can
// see. A branch treasurer whose phone is lost or wiped takes the evidence of
// every hand-over with them.
//
// 🔴 Same rule as the calendar: this must work on a database where migration
// 20260825000000 has not been applied. It returns outcomes, never throws, and
// the register keeps working off localStorage either way — a hand-over that
// cannot be recorded remotely is still a hand-over that happened, and refusing
// to let the treasurer record it at all would be worse than recording it in
// one place.
// ---------------------------------------------------------------------------

export type CustodySaveOutcome =
  | { ok: true }
  | { ok: false; reason: "no_org" | "no_session" | "db" };

/**
 * Write (or re-write) one hand-over batch.
 *
 * Upsert on (org_id, client_id) so this is safe to call for the SAME batch
 * twice — which happens by design: once when the collector hands the cash over,
 * and again when HQ confirms receipt and the status changes to 'settled'.
 *
 * `total_cents` is summed by lib/custody.ts from the donation rows and passed
 * through untouched (Hard Rule 2: money math is TypeScript). Nothing here adds
 * anything up.
 */
export async function saveRemittanceBatch(
  batch: RemittanceBatch,
): Promise<CustodySaveOutcome> {
  if (typeof batch?.id !== "string" || batch.id === "") {
    return { ok: false, reason: "db" };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  // B-4: recording a hand-over is money_collect — collectors (their own
  // cash), the treasurer and hq_admin. Read-only and committee roles cannot
  // write custody records; the UI treats this as "saved on this device only"
  // and says so (custodyLocalOnly).
  if (!can(active.role, "money_collect")) return { ok: false, reason: "db" };

  const supabase = await getSupabaseServer();
  const base = {
    org_id: active.id,
    client_id: batch.id,
    collector_name: batch.collector,
    receipt_nos: batch.receiptNos,
    total_cents: batch.totalCents,
    // handed_over_at is a timestamptz and the batch carries a Malaysian
    // calendar day. Anchoring it to the start of that day in UTC+8 keeps the
    // date it reads back as the date the treasurer chose, in every timezone.
    handed_over_at: `${batch.handedOverAtIso}T00:00:00+08:00`,
    confirmed_by_hq: batch.confirmedByHq,
    status: batch.status,
  };
  const m27 = {
    recorded_at: batch.recordedAtIso ?? null,
    confirmed_at: batch.confirmedAtIso ?? null,
    note: batch.note ?? null,
  };
  // Migration 28 column first (the donation-id link, launch feedback #4);
  // retry down one migration at a time on an older database.
  const { error } = await supabase.from("remittance_batches").upsert(
    { ...base, ...m27, client_donation_ids: batch.donationIds ?? null },
    { onConflict: "org_id,client_id" },
  );
  if (!error) {
    await syncBatchDonationStatuses(supabase, active.id, batch);
    return { ok: true };
  }
  // 🔴 A batch containing UNRECEIPTED rows cannot be written to a pre-28
  // database: without client_donation_ids, every other device would resolve
  // it by receipt numbers and silently lose those rows. Refusing keeps the
  // record honest — the UI says "on this device only" until J applies 28.
  const hasUnreceipted =
    (batch.donationIds?.length ?? 0) > batch.receiptNos.length;
  if (hasUnreceipted) return { ok: false, reason: "db" };
  const retry27 = await supabase
    .from("remittance_batches")
    .upsert({ ...base, ...m27 }, { onConflict: "org_id,client_id" });
  if (!retry27.error) {
    await syncBatchDonationStatuses(supabase, active.id, batch);
    return { ok: true };
  }
  // 🔴 A CANCELLED batch cannot be written to a pre-27 database at all (its
  // status check only knows pending/settled). Refusing is correct: writing it
  // as anything else would un-cancel it on every other device. The UI then
  // says "on this device only", which is the truth until J applies 27.
  if (batch.status === "cancelled") return { ok: false, reason: "db" };
  const retry = await supabase
    .from("remittance_batches")
    .upsert(base, { onConflict: "org_id,client_id" });
  if (retry.error) return { ok: false, reason: "db" };
  await syncBatchDonationStatuses(supabase, active.id, batch);
  return { ok: true };
}

/**
 * D32 (2026-08-28), the #17 double-hand-over bug: the batch is only half the
 * record — the donation rows' `custody_status` in the DATABASE must move with
 * it, or every other device (and every reload of this one) keeps seeing the
 * money as "in hand, can be handed over" and lets it be handed over again.
 *
 * Forward-only, same as the client state machine: a pending batch lifts its
 * members from `collected`; a settled batch lifts anything to `settled`; a
 * cancelled batch returns ONLY `pending_remittance` rows to `collected`
 * (a row another batch already settled is real money that arrived — the
 * cancelled record cannot pull it back).
 *
 * Best-effort by design: the batch upsert already succeeded, and the load
 * path's reconcile (lib/custody.ts) heals any row this update misses. Works
 * on a database of any age — plain updates, no new columns.
 */
async function syncBatchDonationStatuses(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  orgId: number,
  batch: RemittanceBatch,
): Promise<void> {
  const status =
    batch.status === "settled"
      ? "settled"
      : batch.status === "cancelled"
        ? "collected"
        : "pending_remittance";

  // Which DB rows are members: client ids first (the authoritative link,
  // D26), receipt numbers for batches recorded before migration 28.
  const clientIds = batch.donationIds ?? [];
  const receiptNos = batch.receiptNos;

  const donationDbIds = new Set<number>();
  if (receiptNos.length > 0) {
    const { data } = await supabase
      .from("receipts")
      .select("donation_id")
      .eq("org_id", orgId)
      .in("receipt_no", receiptNos)
      .returns<{ donation_id: number }[]>();
    for (const r of data ?? []) donationDbIds.add(r.donation_id);
  }

  // Forward-only guards, expressed as status filters:
  //   → pending_remittance: only lift rows still `collected`
  //   → settled:            lift anything not already settled
  //   → collected (cancel): only return rows sitting at `pending_remittance`
  const guard =
    status === "pending_remittance"
      ? ["collected"]
      : status === "settled"
        ? ["collected", "pending_remittance"]
        : ["pending_remittance"];

  if (clientIds.length > 0) {
    await supabase
      .from("donations")
      .update({ custody_status: status })
      .eq("org_id", orgId)
      .in("client_id", clientIds)
      .in("custody_status", guard);
  }
  if (donationDbIds.size > 0) {
    await supabase
      .from("donations")
      .update({ custody_status: status })
      .eq("org_id", orgId)
      .in("id", [...donationDbIds])
      .in("custody_status", guard);
  }
}

/**
 * Every hand-over this organisation has recorded, newest first.
 *
 * Returns [] for "no organisation", "nothing recorded yet", "the migration has
 * not been applied" and "the query failed" alike — in all four the caller keeps
 * whatever the device already has, which is the safe direction to fail.
 *
 * Rows without a client_id (created before the migration, or by some other
 * screen) get a stable synthetic id so they still display and still merge.
 */
export async function loadRemittanceBatches(): Promise<RemittanceBatch[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const SELECT =
    "id, client_id, collector_name, receipt_nos, total_cents, handed_over_at, confirmed_by_hq, status, recorded_at, confirmed_at, note, client_donation_ids";
  /** While migration 28 (client_donation_ids) is not applied. */
  const SELECT_NO_IDS =
    "id, client_id, collector_name, receipt_nos, total_cents, handed_over_at, confirmed_by_hq, status, recorded_at, confirmed_at, note";
  /** While migration 27 (recorded_at/confirmed_at/note) is not applied. */
  const SELECT_LEGACY =
    "id, client_id, collector_name, receipt_nos, total_cents, handed_over_at, confirmed_by_hq, status";
  const query = (select: string) =>
    supabase
      .from("remittance_batches")
      .select(select)
      .eq("org_id", active.id)
      .order("id", { ascending: false })
      .limit(200);

  type BatchRow = {
    id: number;
    client_id: string | null;
    collector_name: string | null;
    receipt_nos: string[] | null;
    total_cents: number | null;
    handed_over_at: string | null;
    confirmed_by_hq: string | null;
    status: string | null;
    recorded_at?: string | null;
    confirmed_at?: string | null;
    note?: string | null;
    client_donation_ids?: string[] | null;
  };
  let { data, error } = await query(SELECT).returns<BatchRow[]>();
  if (error) {
    const retry = await query(SELECT_NO_IDS).returns<BatchRow[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const retry = await query(SELECT_LEGACY).returns<BatchRow[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.client_id ?? `db-${row.id}`,
    collector: row.collector_name ?? "",
    receiptNos: row.receipt_nos ?? [],
    totalCents: Number(row.total_cents ?? 0),
    handedOverAtIso: row.handed_over_at
      ? new Date(row.handed_over_at).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
        })
      : "",
    // The DB check allows 'pending', 'settled' and (since migration 27)
    // 'cancelled'. Anything unknown is treated as still outstanding: claiming
    // money has arrived when we cannot read the status is the wrong way
    // round to be wrong.
    status:
      row.status === "settled"
        ? ("settled" as const)
        : row.status === "cancelled"
          ? ("cancelled" as const)
          : ("pending" as const),
    confirmedByHq: row.confirmed_by_hq ?? null,
    recordedAtIso: row.recorded_at ?? undefined,
    confirmedAtIso: row.confirmed_at ?? null,
    note: row.note ?? null,
    donationIds:
      row.client_donation_ids && row.client_donation_ids.length > 0
        ? row.client_donation_ids
        : undefined,
  }));
}
