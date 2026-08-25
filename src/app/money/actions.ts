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
      reason: "no_org" | "readonly" | "failed" | "needs_prefix" | "sample";
    }
  | { saved: true; receiptNos: Record<string, string> };

/** The DB column default — shared by every org that never chose its own. */
const DEFAULT_PREFIX = "MIN";

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
  if (active.role === "auditor_readonly") return { saved: false, reason: "readonly" };
  if (rows.length === 0) return { saved: true, receiptNos: {} };

  // Stage 0-1: the sample ledger is read-only. The UI no longer offers the
  // buttons, but the UI is not the authority — a receipt number is permanent,
  // so the refusal lives here, before anything is written.
  if (containsSampleDonation(rows)) return { saved: false, reason: "sample" };

  const supabase = await getSupabaseServer();

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
