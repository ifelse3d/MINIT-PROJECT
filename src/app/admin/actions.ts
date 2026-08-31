"use server";

// ---------------------------------------------------------------------------
// K-3 (work order 27): granting AI credits from the ops console — the AUDITED
// path. The USER-scoped client calls public.admin_grant_credits() (migration
// 25 section ⑥), which:
//   * verifies the CALLER's JWT email against platform_admins (fail-closed —
//     an empty table, a missing email, no JWT: all refuse);
//   * routes through minit_admin.grant_ai_credits() — "加额度只有一条路"
//     stays true;
//   * writes a credit_grants audit row (who, whom, how much, when, note).
// This wrapper only shapes input and translates errors; the SECURITY DEFINER
// function is the authority, so a forged request without the email gets the
// same refusal the UI shows.
// ---------------------------------------------------------------------------

import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";

export type GrantResult =
  | {
      ok: true;
      orgName: string;
      creditsBefore: number;
      creditsAfter: number;
    }
  | {
      /**
       * not_admin  — platform_admins does not list this account.
       * db_behind  — migration 25 (the RPC) is not applied yet.
       * invalid/db — bad input / the call failed; nothing was granted.
       */
      ok: false;
      reason: "no_session" | "not_admin" | "invalid" | "db_behind" | "db";
    };

// ---------------------------------------------------------------------------
// §0-6 (work order 102): the plan-quota dials and the org-plan switch — the
// console doors that retire report 83 §7's hand-written SQL. Same shape as
// adminGrantCredits: the SECURITY DEFINER RPC (migration 42) verifies the
// caller against platform_admins; these wrappers only shape input and
// translate errors. db_behind = migration 42 not applied yet — honest, and
// nothing happened.
// ---------------------------------------------------------------------------

export type PlanAdminResult =
  | { ok: true; message: string }
  | { ok: false; reason: "no_session" | "not_admin" | "invalid" | "db_behind" | "db" };

function translatePlanAdminError(msg: string): Exclude<PlanAdminResult, { ok: true }> {
  if (/not a platform admin|insufficient_privilege|42501/i.test(msg)) {
    return { ok: false, reason: "not_admin" };
  }
  if (/could not find|function|PGRST202|schema cache|relation .* does not exist/i.test(msg)) {
    return { ok: false, reason: "db_behind" };
  }
  if (/invalid_parameter_value|out of range|unknown plan|no_data_found|no such organisation/i.test(msg)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: "db" };
}

const PLAN_IDS = ["trial", "standard", "plus", "hq"] as const;

export async function adminSetPlanQuota(input: {
  plan: string;
  quota: number;
}): Promise<PlanAdminResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  if (
    !(PLAN_IDS as readonly string[]).includes(input.plan) ||
    !Number.isInteger(input.quota) ||
    input.quota < 0 ||
    input.quota > 100_000
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("admin_set_plan_quota", {
    p_plan: input.plan,
    p_quota: input.quota,
  });
  if (error) return translatePlanAdminError(error.message ?? "");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { plan_id?: string; monthly_ai_quota?: number }
    | undefined;
  if (!row) return { ok: false, reason: "db" };
  return {
    ok: true,
    message: `${row.plan_id}: ${row.monthly_ai_quota}`,
  };
}

export async function adminSetOrgPlan(input: {
  orgId: number;
  plan: string;
}): Promise<PlanAdminResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  if (
    !Number.isInteger(input.orgId) ||
    input.orgId <= 0 ||
    !(PLAN_IDS as readonly string[]).includes(input.plan)
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("admin_set_org_plan", {
    p_org_id: input.orgId,
    p_plan: input.plan,
  });
  if (error) return translatePlanAdminError(error.message ?? "");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { org_id?: number; org_name?: string; plan?: string; monthly_free_quota?: number }
    | undefined;
  if (!row) return { ok: false, reason: "db" };
  return {
    ok: true,
    message: `${row.org_name} (#${row.org_id}) → ${row.plan}, ${row.monthly_free_quota}/月`,
  };
}

export async function adminGrantCredits(input: {
  orgId: number;
  delta: number;
  note?: string;
}): Promise<GrantResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  if (
    !Number.isInteger(input.orgId) ||
    input.orgId <= 0 ||
    !Number.isInteger(input.delta) ||
    input.delta === 0 ||
    Math.abs(input.delta) > 100_000
  ) {
    return { ok: false, reason: "invalid" };
  }
  const note = (input.note ?? "").trim().slice(0, 300);

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("admin_grant_credits", {
    p_org_id: input.orgId,
    p_delta: input.delta,
    p_note: note || null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/not a platform admin|insufficient_privilege|42501/i.test(msg)) {
      return { ok: false, reason: "not_admin" };
    }
    if (/could not find|function|PGRST202|schema cache/i.test(msg)) {
      return { ok: false, reason: "db_behind" };
    }
    return { ok: false, reason: "db" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { org_name?: string; credits_before?: number; credits_after?: number }
    | undefined;
  if (!row) return { ok: false, reason: "db" };
  return {
    ok: true,
    orgName: row.org_name ?? "",
    creditsBefore: Number(row.credits_before ?? 0),
    creditsAfter: Number(row.credits_after ?? 0),
  };
}
