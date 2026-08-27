"use server";

// ---------------------------------------------------------------------------
// F-4 (2026-08-25): the register reads BACK from the database.
//
// J's complaint, on the UX list since 8/20: sign in on another computer and
// the money is "gone" — the register lived only in one browser's localStorage.
// The durable copy has been in `donations` + `receipts` since Phase 7; nothing
// ever read it back. Now the /money layout hydrates from here on mount and
// localStorage demotes to what it really is: the offline working draft.
//
// USER-scoped client (RLS is the boundary, Hard Rule 5), org-scoped anyway.
// PDPA: donor names cross this boundary to the signed-in member's own screen,
// never to a log.
// ---------------------------------------------------------------------------

import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { maskName } from "@/lib/mask";
import type { RegisterDonation } from "@/lib/receipts";

const SELECT =
  "id, client_id, donor_name, donor_phone, amount_cents, purpose, donated_at, created_at, custody_status, source, collector_name, kind, item_desc, est_value_cents, payment_method, transfer_proof_path, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;
/** While migration 27 (donations.created_at) is not applied — retry without
 *  it, keeping every younger column. Each tier drops ONE migration's columns
 *  so a database at any age still returns everything it truthfully has. */
const SELECT_NO_CREATED =
  "id, client_id, donor_name, donor_phone, amount_cents, purpose, donated_at, custody_status, source, collector_name, kind, item_desc, est_value_cents, payment_method, transfer_proof_path, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;
/** While migration 26 (donations.payment_method) is not applied — retry
 *  without the payment columns (rows come back as cash, which is what a
 *  pre-26 database can only truthfully hold anyway). */
const SELECT_NO_PAYMENT =
  "id, client_id, donor_name, donor_phone, amount_cents, purpose, donated_at, custody_status, source, collector_name, kind, item_desc, est_value_cents, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;
/** While migration 25 (donations.kind) is not applied — retry without the
 *  in-kind columns. */
const SELECT_NO_KIND =
  "id, client_id, donor_name, donor_phone, amount_cents, purpose, donated_at, custody_status, source, collector_name, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;
/** While migration 20260827000000 (collector_name) is not applied, PostgREST
 *  fails the whole query over the unknown column — retry without it. */
const SELECT_LEGACY =
  "id, client_id, donor_name, donor_phone, amount_cents, purpose, donated_at, custody_status, source, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;

type Row = {
  id: number;
  client_id: string | null;
  donor_name: string | null;
  donor_phone: string | null;
  amount_cents: number;
  purpose: string | null;
  donated_at: string | null;
  created_at?: string | null;
  custody_status: "collected" | "pending_remittance" | "settled";
  source: string | null;
  collector_name?: string | null;
  kind?: string | null;
  item_desc?: string | null;
  est_value_cents?: number | null;
  payment_method?: string | null;
  transfer_proof_path?: string | null;
  receipt: { receipt_no: string } | null;
};

/**
 * Every donation the organisation has stored, shaped as register rows.
 * Returns [] on any failure — hydration is an upgrade, never a gate: the
 * localStorage draft keeps working offline exactly as before.
 */
export async function loadRegisterDonations(): Promise<RegisterDonation[]> {
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const query = (select: string) =>
    supabase
      .from("donations")
      .select(select)
      .eq("org_id", active.id)
      .order("donated_at", { ascending: true });

  let { data, error } = await query(SELECT).returns<Row[]>();
  if (error) {
    const retry = await query(SELECT_NO_CREATED).returns<Row[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const retry = await query(SELECT_NO_PAYMENT).returns<Row[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const retry = await query(SELECT_NO_KIND).returns<Row[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const retry = await query(SELECT_LEGACY).returns<Row[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error || !data) return [];

  return data.map((d) => ({
    // The client_id IS the register row id when it exists (rows issued through
    // the RPC, or saved at record time by save_register_rows), so a row from
    // THIS device merges onto itself instead of duplicating. Pre-client_id
    // rows get a stable db- id.
    id: d.client_id ?? `db-${d.id}`,
    donorName: d.donor_name ?? "",
    donorPhone: d.donor_phone,
    amountCents: Number(d.amount_cents),
    purpose: d.purpose ?? "",
    donatedAtIso: d.donated_at ?? "",
    collector: d.collector_name ?? "",
    receiptNo: d.receipt?.receipt_no ?? null,
    custodyStatus: d.custody_status,
    source: d.source === "manual" ? "manual" : "ledger",
    // D-1: goods rows come back as goods rows.
    kind: d.kind === "in_kind" ? ("in_kind" as const) : ("cash" as const),
    itemDesc: d.item_desc ?? null,
    estValueCents: d.est_value_cents ?? null,
    // D19: transfer rows come back as transfer rows (pre-26 DB = all cash).
    paymentMethod:
      d.payment_method === "transfer" ? ("transfer" as const) : ("cash" as const),
    transferProofPath: d.transfer_proof_path ?? null,
    // §1-11: pre-migration-27 rows have no stored record time — honest absence.
    createdAtIso: d.created_at ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// D32 (2026-08-28): the register writes FORWARD to the database too — every
// recorded row reaches `donations` the moment it is recorded, not only at
// receipt time. localStorage demotes to the offline draft. Without this, a
// row that was handed to HQ existed only in one browser, and the #17 bug
// (the same receipt handed over twice) had half its fuel.
// ---------------------------------------------------------------------------

export type RegisterSaveOutcome =
  | { ok: true }
  /** `db_behind` = migration 29 not applied yet — the rows stay device-local
   *  and the UI says so; every other reason reads the same to the caller. */
  | { ok: false; reason: "no_org" | "no_session" | "role" | "db_behind" | "db" };

/**
 * Upsert recorded (possibly unreceipted) register rows into `donations`.
 * Goes through the `save_register_rows` RPC (migration 29) so a database
 * that predates it refuses cleanly — the RPC's absence IS the feature
 * detection, and rows never half-arrive on an old schema where
 * `issue_receipts` v7 would then crash on them.
 */
export async function saveRegisterRows(
  rows: RegisterDonation[],
): Promise<RegisterSaveOutcome> {
  if (rows.length === 0) return { ok: true };
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  // Recording income is money_collect — same door as the transfer proof and
  // the hand-over record.
  if (!can(active.role, "money_collect")) return { ok: false, reason: "role" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc("save_register_rows", {
    p_org_id: active.id,
    p_rows: rows.map((r) => ({
      clientId: r.id,
      donorName: r.donorName,
      donorPhone: r.donorPhone,
      donorMasked: maskName(r.donorName),
      amountCents: r.amountCents,
      purpose: r.purpose,
      donatedAt: r.donatedAtIso,
      custodyStatus: r.custodyStatus,
      source: r.source === "manual" ? "manual" : "photo",
      collectorName: r.collector || null,
      kind: r.kind === "in_kind" ? "in_kind" : "cash",
      itemDesc: r.itemDesc ?? null,
      estValueCents:
        r.estValueCents === null || r.estValueCents === undefined
          ? null
          : String(r.estValueCents),
      paymentMethod: r.paymentMethod === "transfer" ? "transfer" : "cash",
      transferProofPath: r.transferProofPath ?? null,
      createdAt: r.createdAtIso ?? null,
    })),
  });
  if (!error) return { ok: true };
  // PGRST202 = PostgREST cannot find the function — migration 29 not applied.
  return {
    ok: false,
    reason:
      error.code === "PGRST202" || /save_register_rows/.test(error.message ?? "")
        ? "db_behind"
        : "db",
  };
}

/**
 * Delete recorded rows from `donations` — ONLY rows that never got a receipt
 * (gap-free series, Hard Rule 2) and are still `collected` (a row inside a
 * hand-over batch is part of a money record). The same guards the client
 * applies; repeated here because the UI having hidden a button is not a rule.
 */
export async function deleteRegisterRows(
  clientIds: string[],
): Promise<RegisterSaveOutcome> {
  if (clientIds.length === 0) return { ok: true };
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!can(active.role, "money_collect")) return { ok: false, reason: "role" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("donations")
    .delete()
    .eq("org_id", active.id)
    .in("client_id", clientIds)
    .is("receipt_id", null)
    .eq("custody_status", "collected");
  return error ? { ok: false, reason: "db" } : { ok: true };
}
