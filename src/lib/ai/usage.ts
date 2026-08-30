// ---------------------------------------------------------------------------
// AI USAGE METERING — server I/O (Phase 7.5a). Applies the decisions made by
// the pure, unit-tested logic in usage-core.ts:
//
//   getUsage(orgId)              → snapshot for the settings meter (RLS read)
//   checkAndRecordUsage(orgId,a) → charge ONE action or throw
//                                  QuotaExceededError BEFORE any AI vendor
//                                  is called
//   requireAiQuota(action, n)    → route helper: active org + charge, or a
//                                  ready-made JSON error body + status
//
// PDPA (Hard Rule 5): only org ids and short action codes are written —
// never contents, questions, or personal data. Nothing here is logged.
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabase } from "@/db/supabase";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg, type ActiveOrg } from "@/lib/active-org";
import { can, permissionError, type Capability } from "@/lib/roles";
import type { TokenUsage } from "./provider";
import {
  AI_RATE_WINDOW_SECONDS,
  aiRateLimitPerMin,
  computeUsageState,
  decideCharge,
  isRateLimited,
  QUOTA_BLOCKED_MESSAGE,
  QuotaExceededError,
  RATE_LIMITED_MESSAGE,
  RateLimitedError,
  usageMonthUtcWindow,
  type AiAction,
  type UsageState,
} from "./usage-core";

/** Usage snapshot for the CURRENT Malaysian month, via the user-scoped
 *  client — RLS guarantees members only ever see their own org's meter. */
export async function getUsage(orgId: number): Promise<UsageState | null> {
  const supabase = await getSupabaseServer();
  const { startUtc, endUtc } = usageMonthUtcWindow(new Date());

  const [orgRes, countRes] = await Promise.all([
    supabase
      .from("orgs")
      .select("monthly_free_quota, extra_credits")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc)
      // Refunded actions are not charged to the member. They are still real
      // rows carrying real cost — see refundUsage — so they are excluded HERE
      // and nowhere else. (2026-08-21)
      .is("refunded_at", null),
  ]);

  if (!orgRes.data) return null;
  return computeUsageState({
    usedThisMonth: countRes.count ?? 0,
    monthlyFreeQuota: orgRes.data.monthly_free_quota ?? 0,
    extraCredits: orgRes.data.extra_credits ?? 0,
  });
}

/**
 * Refuse a burst BEFORE any vendor call, by counting this org's ai_usage rows
 * inside the sliding window.
 *
 * WHY THE DATABASE AND NOT MEMORY. On Vercel each serverless instance has its
 * own memory, and instances come and go per request — an in-memory counter
 * would reset under exactly the traffic it exists to stop, and would read as
 * protection while being none. ai_usage is already written on every charge, is
 * indexed by org, and is shared by every instance, so counting it is both
 * correct and free of new schema.
 *
 * FAILS OPEN, deliberately. If the count itself errors, the request proceeds:
 * the monthly quota is still underneath it, and a database hiccup must not
 * lock an organisation out of its own paperwork. The opposite choice (fail
 * closed) would turn a transient read error into an outage.
 */
async function assertNotRateLimited(orgId: number): Promise<void> {
  const limit = aiRateLimitPerMin();
  const since = new Date(
    Date.now() - AI_RATE_WINDOW_SECONDS * 1000,
  ).toISOString();

  let recent: number;
  try {
    const { count, error } = await getSupabase()
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since);
    // NOTE: deliberately NOT filtered by refunded_at. This limit counts
    // attempts, and a burst of failures is exactly the burst worth stopping.
    if (error) return;
    recent = count ?? 0;
  } catch {
    return;
  }

  if (isRateLimited(recent, limit)) throw new RateLimitedError(limit);
}

/**
 * Charge exactly ONE AI action for this org, or throw QuotaExceededError
 * WITHOUT calling any AI. Consuming order: free monthly quota first, then
 * extra_credits (spent atomically via the spend_ai_credit SQL function —
 * the DB guard makes going negative impossible even under concurrency).
 *
 * Uses the service-role client: the caller must have ALREADY resolved the
 * org through an RLS-checked path (getActiveOrg). Retries of the same user
 * action (rule 7 zod retry) are NOT charged twice — charge once per action.
 */
export type UsageCharge = { rowId: number; spentCredit: boolean };

export async function checkAndRecordUsage(
  orgId: number,
  action: AiAction,
): Promise<UsageCharge> {
  const admin = getSupabase();
  const { startUtc, endUtc } = usageMonthUtcWindow(new Date());

  // SPEED limit before CEILING limit (2026-08-21). Both run before any vendor
  // is called, and this one runs first because it is the cheaper refusal: a
  // burst that trips it never touches the credit-spend path at all.
  await assertNotRateLimited(orgId);

  const [orgRes, countRes] = await Promise.all([
    admin
      .from("orgs")
      .select("monthly_free_quota, extra_credits")
      .eq("id", orgId)
      .maybeSingle(),
    admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc)
      // Same rule as getUsage: what the member has spent, not what we have.
      .is("refunded_at", null),
  ]);

  const snapshot = {
    usedThisMonth: countRes.count ?? 0,
    monthlyFreeQuota: orgRes.data?.monthly_free_quota ?? 0,
    extraCredits: orgRes.data?.extra_credits ?? 0,
  };

  const decision = decideCharge(snapshot);
  if (decision === "blocked") {
    throw new QuotaExceededError(computeUsageState(snapshot));
  }
  const spentCredit = decision === "credit";

  if (decision === "credit") {
    const { data: spent } = await admin.rpc("spend_ai_credit", {
      p_org_id: orgId,
    });
    if (spent !== true) {
      // Someone else consumed the last credit between our read and now.
      throw new QuotaExceededError(
        computeUsageState({ ...snapshot, extraCredits: 0 }),
      );
    }
  }

  // K-2 (work order 27): which MEMBER triggered the action — best-effort.
  // Metering must never depend on knowing the person; a failed lookup, or a
  // database behind migration 25 (no user_id column), still meters the org.
  let userId: string | null = null;
  try {
    userId = (await getSessionUser())?.id ?? null;
  } catch {
    userId = null;
  }
  let { data: row, error } = await admin
    .from("ai_usage")
    .insert(userId ? { org_id: orgId, action, user_id: userId } : { org_id: orgId, action })
    .select("id")
    .single();
  if (error && userId && /user_id|schema cache/i.test(error.message ?? "")) {
    const retry = await admin
      .from("ai_usage")
      .insert({ org_id: orgId, action })
      .select("id")
      .single();
    row = retry.data;
    error = retry.error;
  }
  if (error || !row) {
    // Metering must fail CLOSED for billing honesty, but a failed insert
    // after a successful credit spend should not strand the user — surface
    // a generic failure the route turns into a retryable 500.
    throw new Error("AI usage metering failed — try again.");
  }
  return { rowId: row.id, spentCredit };
}

/**
 * Refund ONE previously charged action: give the member their quota back
 * WITHOUT erasing the fact that the call happened.
 *
 * WHAT A REFUND MEANS NOW (2026-08-21, docs/助手重做-设计.md section 4.5).
 * It used to mean "the answer was not useful, so do not charge for it". It now
 * means one thing only: WE NEVER REACHED THE VENDOR. A photo the model could
 * not read, or a question it declined as off-topic, is still a call we paid
 * for — "he gives us a blurry photo and we pay for it" is not a business.
 * Network failures and throws before the call are different: nothing was
 * spent, so nothing is charged.
 *
 * WHY IT STOPPED DELETING THE ROW (0bd7c6b said this about itself):
 *
 *   > refundUsage() DELETES the ai_usage row, so a refund also erases the cost
 *   > figure for a call we really did pay the vendor for. The clean fix is a
 *   > refunded_at column.
 *
 * A delete did two things at once, and only one of them was right: it gave the
 * quota back (right) and it destroyed the cost record (wrong). Stamping
 * refunded_at splits them, so "what the member was charged" and "what we paid"
 * stop being the same number — which is the whole point, and is what
 * docs/方案与权益设计.md section 5.1 is built on.
 *
 * Best-effort: a failed refund must never break the user's response.
 */
export async function refundUsage(
  orgId: number,
  charge: UsageCharge,
): Promise<void> {
  try {
    const admin = getSupabase();
    const { error } = await admin
      .from("ai_usage")
      .update({ refunded_at: new Date().toISOString() })
      .eq("id", charge.rowId)
      .eq("org_id", orgId);
    if (error) {
      // D8: schema first, code second — but a tree running against a database
      // where 20260821000000 has not been applied yet must still refund, or
      // the column's absence silently starts charging people for calls that
      // never happened. Falls back to the old behaviour, and stops doing so the
      // moment the migration lands.
      await admin
        .from("ai_usage")
        .delete()
        .eq("id", charge.rowId)
        .eq("org_id", orgId);
    }
    if (charge.spentCredit) {
      // Give the credit back (plain increment; ties out with the stamp).
      const { data: org } = await admin
        .from("orgs")
        .select("extra_credits")
        .eq("id", orgId)
        .maybeSingle();
      if (org) {
        await admin
          .from("orgs")
          .update({ extra_credits: (org.extra_credits ?? 0) + 1 })
          .eq("id", orgId);
      }
    }
  } catch {
    // best-effort only
  }
}

/**
 * Attach what a vendor call actually cost to the ai_usage row that paid for it.
 *
 * BEST-EFFORT AND DELIBERATELY SILENT. Two reasons it must never throw:
 *   1. The person is waiting for their document. Bookkeeping is not worth
 *      failing their request over.
 *   2. D8 — schema goes first, code second, and code must tolerate "the column
 *      is not there yet". Until 20260803000000 is applied, this update fails
 *      and is swallowed; the app behaves exactly as it does today.
 *
 * costMicros is stored as computed at call time and never recalculated —
 * vendors change prices, and a row that re-prices itself makes gross margin
 * impossible to work out (D2).
 */
export async function recordTokens(
  orgId: number,
  charge: UsageCharge,
  usage: TokenUsage,
): Promise<void> {
  try {
    await getSupabase()
      .from("ai_usage")
      .update({
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        model: usage.model,
        provider: usage.provider,
        cost_micros: usage.costMicros,
      })
      .eq("id", charge.rowId)
      .eq("org_id", orgId);
  } catch {
    // see the note above — silence is the intended behaviour
  }
}

/**
 * Make a token sink for ONE charged `ai_usage` row.
 *
 * Why this exists (2026-08-18): `recordTokens` was wired into exactly one
 * route — `/api/extract-ledger`. Every other charged AI call (minutes,
 * constitution, events, intake classify + intake extract, ask classify + ask
 * summarise, chat) ran the vendor and threw the token counts away. Ask and
 * chat alone are most of the call volume, so `cost_micros` could never have
 * described what an organisation actually costs.
 *
 * Two things it does that a bare `recordTokens` call cannot:
 *   1. ACCUMULATES. A rule-7 validation retry is a second real vendor call
 *      charged to the same row. Each write carries the running total, so the
 *      row ends up holding what the whole action cost — not just its last
 *      call. (The retry is deliberately not charged a second ACTION; it does
 *      still cost real money, and that money is what this column is for.)
 *   2. SERIALISES. Writes are chained, so a slow earlier update can never
 *      land after a later one and overwrite a larger total with a smaller.
 *
 * `costMicros` stays null-tolerant: a call whose model is not in the price
 * table contributes its tokens but never an invented price.
 *
 * Best-effort and silent throughout — see `recordTokens` above.
 */
export function createUsageRecorder(
  orgId: number,
  charge: UsageCharge | undefined,
  /**
   * I1 (work order 81): a segmented constitution read is several REQUESTS
   * accumulating onto ONE charged row. Each write below carries a running
   * total that would otherwise start from zero and overwrite the earlier
   * segments' cost — so a continuation request seeds the accumulator with
   * what the row already holds.
   */
  seed?: { inputTokens: number; outputTokens: number; costMicros: number | null },
): (usage: TokenUsage) => void {
  if (!charge) return () => {};

  let inputTokens = seed?.inputTokens ?? 0;
  let outputTokens = seed?.outputTokens ?? 0;
  let costMicros: number | null = seed?.costMicros ?? null;
  let tail: Promise<void> = Promise.resolve();

  return (usage: TokenUsage) => {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    if (usage.costMicros !== null) {
      costMicros = (costMicros ?? 0) + usage.costMicros;
    }

    const total: TokenUsage = {
      inputTokens,
      outputTokens,
      model: usage.model,
      provider: usage.provider,
      costMicros,
    };
    tail = tail.then(() => recordTokens(orgId, charge, total)).catch(() => {});
  };
}

// --- route helper ------------------------------------------------------------

export type QuotaGate =
  | { ok: true; org: ActiveOrg; charges: UsageCharge[] }
  | { ok: false; status: number; body: QuotaErrorBody };

export type QuotaErrorBody = {
  error: string;
  code: "NO_ORG" | "QUOTA_EXCEEDED" | "RATE_LIMITED" | "METERING_FAILED" | "NO_PERMISSION";
  usage?: UsageState;
};

/**
 * One call at the top of every AI route: resolves the active org
 * (RLS-checked) and charges `cost` actions. Returns either the org to
 * proceed with, or the exact status + JSON body to send back.
 * 402 = "payment required" — the UI recognises it and shows the top-up card.
 *
 * B-4 (2026-08-25): pass `cap` to also require a role capability BEFORE
 * anything is charged — the extraction routes pass "upload" so an
 * auditor_readonly account cannot spend the organisation's quota. Left off
 * for the chat/ask routes, where asking questions is reading.
 */
export async function requireAiQuota(
  actions: AiAction[],
  opts?: { cap?: Capability },
): Promise<QuotaGate> {
  const org = await getActiveOrg();
  if (!org) {
    return {
      ok: false,
      status: 401,
      body: {
        error:
          "Pilih pertubuhan dahulu / choose an organisation first (log masuk diperlukan / login required).",
        code: "NO_ORG",
      },
    };
  }
  if (opts?.cap && !can(org.role, opts.cap)) {
    return {
      ok: false,
      status: 403,
      body: { error: permissionError(opts.cap), code: "NO_PERMISSION" },
    };
  }

  // Outside the try so the catch can refund a PARTIAL charge: with several
  // actions (intake's classify+extract; D47's per-block constitution
  // charges) the quota can run out mid-loop, and rows already charged for a
  // request that is now refused must be given back.
  const charges: UsageCharge[] = [];
  try {
    // The charges are handed back so the route can attach token counts and
    // cost to the exact row that paid for the call (see recordTokens).
    for (const action of actions) {
      charges.push(await checkAndRecordUsage(org.id, action));
    }
    return { ok: true, org, charges };
  } catch (e) {
    for (const c of charges) await refundUsage(org.id, c);
    // 429: going too fast, not out of quota. A different status because it is a
    // different fix — wait a moment, rather than buy more.
    if (e instanceof RateLimitedError) {
      return {
        ok: false,
        status: 429,
        body: {
          error: `${RATE_LIMITED_MESSAGE.bm}
${RATE_LIMITED_MESSAGE.zh}
${RATE_LIMITED_MESSAGE.en}`,
          code: "RATE_LIMITED",
        },
      };
    }
    if (e instanceof QuotaExceededError) {
      return {
        ok: false,
        status: 402,
        body: {
          error: `${QUOTA_BLOCKED_MESSAGE.bm} / ${QUOTA_BLOCKED_MESSAGE.en}`,
          code: "QUOTA_EXCEEDED",
          usage: e.state,
        },
      };
    }
    return {
      ok: false,
      status: 500,
      body: {
        error: "Ralat pelayan / server error.",
        code: "METERING_FAILED",
      },
    };
  }
}
