import "server-only";

import { getSupabase } from "@/db/supabase";
import { PLANS, type PlanId } from "@/lib/plans";

// ---------------------------------------------------------------------------
// THE PLAN POOLS, FROM THE DATABASE (work order 102 §0-6).
//
// J sets each plan's monthly AI pool from the ops console (plan_quotas,
// migration 42). Every percentage the app shows converts through THESE
// numbers. FAIL-OPEN: a database that predates migration 42 (or a read that
// hiccups) falls back to the compiled-in numbers in src/lib/plans.ts — the
// display keeps working, nothing is blocked, and the two sources carry the
// same values until J turns the dial.
// ---------------------------------------------------------------------------

export type PlanQuotas = Record<PlanId, number>;

function compiledFallback(): PlanQuotas {
  return {
    trial: PLANS.trial.monthlyAiQuota,
    standard: PLANS.standard.monthlyAiQuota,
    plus: PLANS.plus.monthlyAiQuota,
    hq: PLANS.hq.monthlyAiQuota,
  };
}

export async function loadPlanQuotas(): Promise<PlanQuotas> {
  const out = compiledFallback();
  try {
    const { data, error } = await getSupabase()
      .from("plan_quotas")
      .select("plan_id, monthly_ai_quota");
    if (error || !Array.isArray(data)) return out;
    for (const row of data) {
      const id = String(row.plan_id) as PlanId;
      const quota = Number(row.monthly_ai_quota);
      if (id in out && Number.isFinite(quota) && quota >= 0) out[id] = quota;
    }
    return out;
  } catch {
    return out;
  }
}

/** One plan's pool as a share of Standard, 0–…% (the plan-page unit). */
export function planPctOfStandard(quotas: PlanQuotas, id: PlanId): number {
  if (quotas.standard <= 0) return 0;
  return Math.round((quotas[id] / quotas.standard) * 100);
}
