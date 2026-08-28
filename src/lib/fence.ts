// ---------------------------------------------------------------------------
// FREE FENCE — server I/O (D44, 2026-08-28). The pure logic and the words
// live in fence-core.ts; the numbers in plans.ts; the atomic counter in the
// fence_charge() SQL function (migration 20260909000000).
//
// WHO IS FENCED. Not the plan STRING — an org can pick "standard" at creation
// without paying (C-1: activation is J's manual SQL, and what activation
// actually raises is monthly_free_quota). So the honest signal is the same
// arithmetic /settings/plan already shows: an org whose metered quota is
// still at (or below) the trial level is a free org. J's early accounts
// (quota 100) and demo orgs are therefore never fenced, automatically.
//
// FAILURE DIRECTIONS, chosen deliberately per call:
//   - "is this org fenced?" read fails        → NOT fenced (fail open). A
//     database hiccup must not watermark a paid org's legal documents or
//     lock a society out of its paperwork (same reasoning as the AI rate
//     limit). The AI quota still guards the money underneath.
//   - fence_charge() missing (migration not applied yet) → NOT fenced
//     (D8: the code must tolerate a database older than itself, and the app
//     then behaves exactly as it did yesterday).
//   - fence_charge() fails for any OTHER reason → the charge FAILS (closed):
//     if the fence cannot count, it does not hand out the clean file —
//     the same honesty rule as AI metering.
//
// PDPA: only org ids and integers ever reach the database. Nothing logged.
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabase } from "@/db/supabase";
import { PLANS, type FenceLimits } from "@/lib/plans";
import {
  computeFenceState,
  fenceBlockedMessage,
  parseFenceChargeResult,
  whichFenceBlocks,
  type FenceCounters,
  type FenceDelta,
  type FenceKind,
  type FenceState,
} from "@/lib/fence-core";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";

/** What the routes need to know about the org. ActiveOrg satisfies this. */
export type FenceOrg = { id: number; isDemo?: boolean };

/** A successful charge, kept so the same amounts can be refunded. */
export type FenceCharge = { orgId: number; delta: FenceDelta };

export type FenceErrorBody = {
  error: string;
  code: "FENCE_BLOCKED" | "FENCE_METERING_FAILED";
  fence?: { kind: FenceKind; limit: number };
};

export type FenceChargeResult =
  | { ok: true; charge: FenceCharge | null }
  | { ok: false; status: number; body: FenceErrorBody };

/** Errors that mean "the fence migration is not applied yet" (D8). */
function isDbBehind(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return (
    code === "42883" || // undefined_function
    code === "42P01" || // undefined_table
    code === "PGRST202" || // PostgREST: function not found in schema cache
    (/fence_charge|fence_usage/i.test(msg) &&
      /does not exist|not find|schema cache/i.test(msg))
  );
}

/**
 * The trial fence limits when this org is fenced, or null when it is not.
 * Fail open on any read problem — see the header.
 */
export async function getFenceLimits(org: FenceOrg): Promise<FenceLimits | null> {
  if (org.isDemo) return null; // CONTOH 禁令: the demo never blocks anybody
  const limits = PLANS.trial.fence;
  if (!limits) return null;
  try {
    const admin = getSupabase();
    const { data, error } = await admin
      .from("orgs")
      .select("monthly_free_quota")
      .eq("id", org.id)
      .maybeSingle();
    if (error || !data) return null;
    const quota = (data as { monthly_free_quota?: unknown }).monthly_free_quota;
    const activated =
      typeof quota === "number" && quota > PLANS.trial.monthlyAiQuota;
    return activated ? null : limits;
  } catch {
    return null;
  }
}

/** Lifetime counters for the meters. Missing table / any error → zeros. */
export async function readFenceCounters(orgId: number): Promise<FenceCounters> {
  const zero: FenceCounters = {
    docsMade: 0,
    pagesUploaded: 0,
    cleanDownloads: 0,
    receipts: 0,
  };
  try {
    const admin = getSupabase();
    const [usageRes, receiptsRes] = await Promise.all([
      admin
        .from("fence_usage")
        .select("docs_made, pages_uploaded, clean_downloads")
        .eq("org_id", orgId)
        .maybeSingle(),
      admin
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
    ]);
    const u = usageRes.data as
      | { docs_made?: number; pages_uploaded?: number; clean_downloads?: number }
      | null;
    return {
      docsMade: u?.docs_made ?? 0,
      pagesUploaded: u?.pages_uploaded ?? 0,
      cleanDownloads: u?.clean_downloads ?? 0,
      receipts: receiptsRes.count ?? 0,
    };
  } catch {
    return zero;
  }
}

/** Full meter state for /settings/plan and the page hints. null = unfenced. */
export async function getFenceState(org: FenceOrg): Promise<FenceState | null> {
  const limits = await getFenceLimits(org);
  if (!limits) return null;
  return computeFenceState(limits, await readFenceCounters(org.id));
}

const blockedBody = (kind: FenceKind, limits: FenceLimits): FenceErrorBody => ({
  error: joinUserError(fenceBlockedMessage(kind, limits)),
  code: "FENCE_BLOCKED",
  fence: {
    kind,
    limit:
      kind === "docs"
        ? limits.docsMade
        : kind === "pages"
          ? limits.uploadPages
          : kind === "downloads"
            ? limits.cleanDownloads
            : limits.receipts,
  },
});

/**
 * Atomically charge the fence, or say exactly why not. `charge: null` means
 * "this org is not fenced — nothing was counted, nothing to refund".
 */
export async function chargeFence(
  org: FenceOrg,
  delta: FenceDelta,
): Promise<FenceChargeResult> {
  const limits = await getFenceLimits(org);
  if (!limits) return { ok: true, charge: null };

  const docs = Math.max(Math.floor(delta.docs ?? 0), 0);
  const pages = Math.max(Math.floor(delta.pages ?? 0), 0);
  const downloads = Math.max(Math.floor(delta.downloads ?? 0), 0);
  if (docs === 0 && pages === 0 && downloads === 0)
    return { ok: true, charge: null };

  try {
    const admin = getSupabase();
    const { data, error } = await admin.rpc("fence_charge", {
      p_org_id: org.id,
      p_docs: docs,
      p_pages: pages,
      p_downloads: downloads,
      p_max_docs: limits.docsMade,
      p_max_pages: limits.uploadPages,
      p_max_downloads: limits.cleanDownloads,
    });
    if (error) {
      if (isDbBehind(error)) return { ok: true, charge: null };
      return {
        ok: false,
        status: 500,
        body: {
          error: joinUserError(USER_ERRORS.serverError),
          code: "FENCE_METERING_FAILED",
        },
      };
    }
    const parsed = parseFenceChargeResult(data);
    if (!parsed) {
      return {
        ok: false,
        status: 500,
        body: {
          error: joinUserError(USER_ERRORS.serverError),
          code: "FENCE_METERING_FAILED",
        },
      };
    }
    if (!parsed.ok) {
      const kind =
        whichFenceBlocks(
          limits,
          { ...parsed.counters, receipts: 0 },
          { docs, pages, downloads },
        ) ?? "downloads";
      return { ok: false, status: 402, body: blockedBody(kind, limits) };
    }
    return { ok: true, charge: { orgId: org.id, delta: { docs, pages, downloads } } };
  } catch {
    return {
      ok: false,
      status: 500,
      body: {
        error: joinUserError(USER_ERRORS.serverError),
        code: "FENCE_METERING_FAILED",
      },
    };
  }
}

/**
 * Give a charge back — the vendor was never reached, or the thing charged for
 * was never delivered. Same meaning as refundUsage. Best-effort and silent:
 * a failed refund must never break the user's response.
 */
export async function refundFence(
  charge: FenceCharge | null | undefined,
): Promise<void> {
  if (!charge) return;
  const { docs = 0, pages = 0, downloads = 0 } = charge.delta;
  if (docs === 0 && pages === 0 && downloads === 0) return;
  try {
    const admin = getSupabase();
    // Negative deltas: fence_charge floors at zero and never refuses them.
    // The caps are irrelevant on a refund; trial's own numbers keep the
    // signature satisfied.
    const limits = PLANS.trial.fence;
    await admin.rpc("fence_charge", {
      p_org_id: charge.orgId,
      p_docs: -docs,
      p_pages: -pages,
      p_downloads: -downloads,
      p_max_docs: limits?.docsMade ?? 0,
      p_max_pages: limits?.uploadPages ?? 0,
      p_max_downloads: limits?.cleanDownloads ?? 0,
    });
  } catch {
    // best-effort only
  }
}

/**
 * May this org issue `n` more numbered receipts? Receipts are counted from
 * their own table — gap-free and never deleted, so count(*) is the truth and
 * needs no second counter. Fail open on read problems (a hiccup must not
 * stop a treasurer's receipts; the number sequence itself stays safe).
 */
export async function checkReceiptFence(
  org: FenceOrg,
  n: number,
): Promise<{ ok: true } | { ok: false; status: number; body: FenceErrorBody }> {
  const limits = await getFenceLimits(org);
  if (!limits) return { ok: true };
  try {
    const admin = getSupabase();
    const { count, error } = await admin
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);
    if (error) return { ok: true };
    if ((count ?? 0) + Math.max(n, 0) > limits.receipts) {
      return { ok: false, status: 402, body: blockedBody("receipts", limits) };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
