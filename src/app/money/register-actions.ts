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

import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import type { RegisterDonation } from "@/lib/receipts";

const SELECT =
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
  custody_status: "collected" | "pending_remittance" | "settled";
  source: string | null;
  collector_name?: string | null;
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
    const retry = await query(SELECT_LEGACY).returns<Row[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error || !data) return [];

  return data.map((d) => ({
    // The client_id IS the register row id when it exists (rows issued through
    // the RPC), so a row issued on THIS device merges onto itself instead of
    // duplicating. Pre-client_id rows get a stable db- id.
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
  }));
}
