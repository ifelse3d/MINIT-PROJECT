"use server";

// Issue receipts AND save them to the database (Phase 7 history).
//
// 2026-08-25 (S0-2): numbering now happens INSIDE the database, in the
// `issue_receipts()` RPC (migration 20260730000000, revised 20260824000000):
//   - one transaction: donations + receipts + back-links commit or nothing does,
//     which retires the whole rollback/reconciliation dance this file used to
//     carry (its scars are in git history);
//   - an advisory lock per org: two people issuing at the same moment queue
//     instead of racing;
//   - IDEMPOTENT on (org_id, client_id): a retried request — double tap, flaky
//     network — gets the SAME numbers back instead of burning new ones;
//   - the prefix comes from `orgs.receipt_prefix`, chosen in Settings and
//     frozen by a DB trigger once the first receipt exists. "MIN" is no longer
//     written anywhere server-side.
//   - the series aggregate runs in SQL, so the old "read every receipt_no into
//     the app" 1000-row ceiling is gone.
//
// All calls use the USER-scoped client — the RPC is SECURITY INVOKER, so RLS
// proves the user may write to the active org. PDPA: donor data is never
// logged; donor_masked is stored alongside for list views.
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { maskName } from "@/lib/mask";
import { can } from "@/lib/roles";
import { containsSampleDonation } from "@/lib/sample-guard";

export type RowToIssue = {
  /** Client-side row id, echoed back so the UI can match numbers to rows.
   *  Also the idempotency key: the DB refuses to issue twice for one id. */
  clientId: string;
  donorName: string;
  donorPhone: string | null;
  amountCents: number;
  purpose: string;
  /** YYYY-MM-DD */
  donatedAtIso: string;
  custodyStatus: "collected" | "pending_remittance" | "settled";
  /** How the row entered the register. DB accepts 'photo' | 'manual' only
   *  (donations_source_check), so this is the register's own vocabulary and
   *  is mapped below. */
  source?: "ledger" | "manual";
  /** Free-text collector (stored once migration 20260827000000 adds the
   *  column; the RPC simply ignores unknown keys before that). */
  collectorName?: string;
  /** D-1 (拍板③): in-kind (goods) donation. Absent = cash. */
  kind?: "cash" | "in_kind";
  /** In-kind only: what was donated — printed on the receipt. */
  itemDesc?: string | null;
  /** In-kind only, optional: estimated value in cents (ledger only). */
  estValueCents?: number | null;
  /** D19 (拍板 34): how the money arrived. Absent = 'cash'. */
  paymentMethod?: "cash" | "transfer";
  /** Transfer only, optional: Storage path of the attached proof screenshot. */
  transferProofPath?: string | null;
};

export type IssueResult =
  | {
      saved: false;
      /**
       * no_org        — nobody has chosen an organisation.
       * readonly      — auditor account; nothing was attempted.
       * needs_prefix  — the org still has the shared default receipt prefix and
       *                 no receipts yet. The person should pick their own
       *                 letters in Settings first (each branch needs its own so
       *                 a receipt says who issued it — J, 2026-08-22), or
       *                 explicitly accept the default.
       * sample        — at least one row is the worked-example ledger's
       *                 fictional data (Stage 0-1). Issuing would burn real,
       *                 gap-free receipt numbers on donations that never
       *                 happened; nothing was attempted.
       * failed        — nothing was written (the RPC is one transaction);
       *                 safe to try again.
       */
      /** db_behind — the rows include an in-kind donation but migration 25
       *  (donations.kind) has not been applied yet. Issuing would store the
       *  goods as a RM0.00 CASH receipt with no item line — a wrong legal
       *  document — so nothing was attempted. Cash-only batches still work.
       *  Same refusal for a TRANSFER row before migration 26
       *  (donations.payment_method): it would be stored as cash and start
       *  being chased as "cash in somebody's hands" that never existed. */
      reason: "no_org" | "readonly" | "failed" | "needs_prefix" | "sample" | "db_behind";
    }
  | { saved: true; receiptNos: Record<string, string> };

/** The DB column default — shared by every org that never chose its own. */
const DEFAULT_PREFIX = "MIN";

// ---------------------------------------------------------------------------
// B-4① (J #12): choosing the receipt letters used to mean a trip to Settings,
// where testers got lost and never came back to issue the receipt. The choice
// now happens INSIDE the issuing flow — this action sets the active org's
// prefix so the dialog on /money/receipts can finish the job in place.
// Same validation as orgs/actions.ts setReceiptPrefix; same RLS door
// (orgs_update = admins), and the DB trigger still freezes the prefix once
// the first receipt exists — this action is a convenience, not a new power.
// ---------------------------------------------------------------------------

export type PrefixOutcome =
  | { ok: true; prefix: string }
  | { ok: false; reason: "invalid" | "no_org" | "not_admin" | "frozen" | "failed" };

export async function chooseReceiptPrefix(raw: string): Promise<PrefixOutcome> {
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  // Lower case is the same intent; the DB check accepts capitals only.
  const prefix = raw.trim().toUpperCase();
  // Same expression as orgs_receipt_prefix_check — a looser client rule would
  // produce a DB error nobody can act on.
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix)) return { ok: false, reason: "invalid" };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("orgs")
    .update({ receipt_prefix: prefix })
    .eq("id", active.id)
    .select("id")
    .maybeSingle();

  if (error) {
    // The freeze trigger's message is English-only and never shown raw.
    return { ok: false, reason: /frozen/i.test(error.message) ? "frozen" : "failed" };
  }
  // No row back = RLS refused: not an admin of this org.
  if (!data) return { ok: false, reason: "not_admin" };
  return { ok: true, prefix };
}

export async function issueAndSaveReceipts(
  rows: RowToIssue[],
  opts?: {
    /** True after the person has seen the "pick your own letters" prompt and
     *  chosen to continue with the default anyway. */
    acceptDefaultPrefix?: boolean;
  },
): Promise<IssueResult> {
  const active = await getActiveOrg();
  if (!active) return { saved: false, reason: "no_org" };
  // B-4: issuing receipts is money_write — hq_admin and treasurer. A
  // collector records donations and hands cash over; the numbered receipt is
  // the treasurer's act (建議①). Auditors were already refused; the same door
  // now also names collectors, secretaries and committee members.
  if (!can(active.role, "money_write")) return { saved: false, reason: "readonly" };
  if (rows.length === 0) return { saved: true, receiptNos: {} };

  // Stage 0-1: the sample ledger is read-only. The UI no longer offers the
  // buttons, but the UI is not the authority — a receipt number is permanent,
  // so the refusal lives here, before anything is written.
  if (containsSampleDonation(rows)) return { saved: false, reason: "sample" };

  const supabase = await getSupabaseServer();

  // D-1: an in-kind row needs donations.kind (migration 25). On an older
  // database the RPC would silently store it as a RM0.00 CASH donation and
  // print a wrong receipt — refuse honestly instead. One cheap probe, only
  // when the batch actually contains goods.
  if (rows.some((r) => r.kind === "in_kind")) {
    const probe = await supabase.from("donations").select("kind").limit(1);
    if (probe.error) return { saved: false, reason: "db_behind" };
  }

  // D19: same shape of refusal for transfer rows on a pre-migration-26
  // database — the v5 RPC would silently store them as CASH, and the custody
  // page would then chase "cash in somebody's hands" that never existed.
  // Cash batches (the default) never trigger this probe.
  if (rows.some((r) => r.paymentMethod === "transfer")) {
    const probe = await supabase.from("donations").select("payment_method").limit(1);
    if (probe.error) return { saved: false, reason: "db_behind" };
  }

  // The prefix is chosen in Settings and FROZEN once the first receipt exists
  // (DB trigger). While it is still the shared default AND nothing has been
  // issued, pause and send the person to Settings — otherwise every branch
  // prints MIN-2026-0001 and nobody can tell whose receipt is whose.
  if (!opts?.acceptDefaultPrefix) {
    const [{ data: org }, { count }] = await Promise.all([
      supabase.from("orgs").select("receipt_prefix").eq("id", active.id).maybeSingle(),
      supabase
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", active.id),
    ]);
    const prefix = (org?.receipt_prefix as string | undefined) ?? DEFAULT_PREFIX;
    if (prefix === DEFAULT_PREFIX && (count ?? 0) === 0) {
      return { saved: false, reason: "needs_prefix" };
    }
  }

  const { data, error } = await supabase.rpc("issue_receipts", {
    p_org_id: active.id,
    p_rows: rows.map((r) => ({
      clientId: r.clientId,
      donorName: r.donorName,
      donorPhone: r.donorPhone,
      donorMasked: maskName(r.donorName),
      amountCents: r.amountCents,
      purpose: r.purpose,
      donatedAt: r.donatedAtIso,
      custodyStatus: r.custodyStatus,
      // donations_source_check allows 'photo' | 'manual' | null.
      source: r.source === "manual" ? "manual" : "photo",
      collectorName: r.collectorName ?? null,
      // D-1: pre-migration-25 RPC versions ignore these keys; the in-kind
      // probe above already refused in that case, so goods can never land as
      // cash. estValueCents rides as a string — the RPC casts it.
      kind: r.kind === "in_kind" ? "in_kind" : "cash",
      itemDesc: r.itemDesc ?? null,
      estValueCents:
        r.estValueCents === null || r.estValueCents === undefined
          ? null
          : String(r.estValueCents),
      // D19: pre-migration-26 RPC versions ignore these keys; the transfer
      // probe above already refused in that case, so a transfer can never
      // land recorded as cash.
      paymentMethod: r.paymentMethod === "transfer" ? "transfer" : "cash",
      transferProofPath: r.transferProofPath ?? null,
    })),
  });

  if (error || !data || typeof data !== "object") {
    // The RPC is a single transaction: on ANY error (series gap, RLS refusal,
    // constraint) nothing was written, so "failed / safe to retry" is the
    // truth. The old partial-write states cannot happen any more.
    return { saved: false, reason: "failed" };
  }

  const receiptNos: Record<string, string> = {};
  for (const [clientId, no] of Object.entries(data as Record<string, unknown>)) {
    if (typeof no === "string") receiptNos[clientId] = no;
  }
  return { saved: true, receiptNos };
}
