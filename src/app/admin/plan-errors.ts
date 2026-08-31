// ---------------------------------------------------------------------------
// The ops console's plan doors turn a database refusal into something a reader
// can act on. It lives OUTSIDE actions.ts because that file is "use server":
// a server-action module may only export async functions.
// ---------------------------------------------------------------------------

export type PlanAdminResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason: "no_session" | "not_admin" | "invalid" | "db_behind" | "db_locked" | "db";
    };

export function translatePlanAdminError(msg: string): Exclude<PlanAdminResult, { ok: true }> {
  if (/not a platform admin|insufficient_privilege|42501/i.test(msg)) {
    return { ok: false, reason: "not_admin" };
  }
  if (/could not find|function|PGRST202|schema cache|relation .* does not exist/i.test(msg)) {
    return { ok: false, reason: "db_behind" };
  }
  if (/invalid_parameter_value|out of range|unknown plan|no_data_found|no such organisation/i.test(msg)) {
    return { ok: false, reason: "invalid" };
  }
  // 116 §3: the privileged-column lock (migration 20260728000000) refusing an
  // org write. Before migration 44 this was EVERY "Change plan" press, and it
  // fell through to "try again" — advice that could not work, for a fault the
  // reader had no part in. Name it instead.
  if (/is not user-editable/i.test(msg)) {
    return { ok: false, reason: "db_locked" };
  }
  return { ok: false, reason: "db" };
}
