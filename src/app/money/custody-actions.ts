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
  const { error } = await supabase.from("remittance_batches").upsert(
    {
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
    },
    { onConflict: "org_id,client_id" },
  );
  return error ? { ok: false, reason: "db" } : { ok: true };
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
  const { data, error } = await supabase
    .from("remittance_batches")
    .select(
      "id, client_id, collector_name, receipt_nos, total_cents, handed_over_at, confirmed_by_hq, status",
    )
    .eq("org_id", active.id)
    .order("id", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => ({
    id: (row.client_id as string | null) ?? `db-${row.id}`,
    collector: (row.collector_name as string | null) ?? "",
    receiptNos: (row.receipt_nos as string[] | null) ?? [],
    totalCents: Number(row.total_cents ?? 0),
    handedOverAtIso: row.handed_over_at
      ? new Date(row.handed_over_at as string).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
        })
      : "",
    // The DB check allows 'pending' and 'settled' (fixed in migration
    // 20260726000000, which also migrated the legacy 'confirmed' rows). Anything
    // else is treated as still outstanding: claiming money has arrived when we
    // cannot read the status is the wrong way round to be wrong.
    status: row.status === "settled" ? "settled" : "pending",
    confirmedByHq: (row.confirmed_by_hq as string | null) ?? null,
  }));
}
