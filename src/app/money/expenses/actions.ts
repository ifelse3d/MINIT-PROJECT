"use server";

// ---------------------------------------------------------------------------
// EXPENSES & CLAIMS — server actions (Stage E, work order 27).
//
// The state machine and role rules live in src/lib/claims.ts (pure, tested);
// this file ENFORCES them, fail-closed, on the server (B-4: the check belongs
// in the action, not in a hidden button). RLS scopes every query to the org
// (Hard Rule 5); roles decide what a member may DO within it.
//
// 🔴 Must survive a database where migration 25 has not been applied yet
// (J applies by hand, D8): every function returns a result object, never
// throws, and "the claim columns do not exist yet" is a normal outcome the
// UI says one honest sentence about — not an error screen.
// ---------------------------------------------------------------------------

import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import {
  canDecideClaim,
  canSubmitClaim,
  claimTransition,
  isExpenseStatus,
  normalizeRejectReason,
  type ClaimDecision,
  type ExpenseStatus,
} from "@/lib/claims";

export type ExpenseRow = {
  id: number;
  description: string;
  amountCents: number;
  category: string | null;
  /** YYYY-MM-DD */
  spentAtIso: string | null;
  status: ExpenseStatus;
  claimantName: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  rejectReason: string | null;
  createdBy: string | null;
  source: string | null;
  /** True when the signed-in member submitted this claim. */
  mine: boolean;
};

export type ExpenseOutcome =
  | { ok: true }
  | {
      /**
       * permission — the role check said no (the UI names whose job it is).
       * db_behind  — migration 25 not applied; nothing was written.
       * conflict   — the claim is not in the right state any more (someone
       *              else decided it first); reload and look again.
       * invalid/db — bad input / the write failed; nothing was written.
       */
      ok: false;
      reason: "no_session" | "no_org" | "permission" | "invalid" | "db_behind" | "conflict" | "db";
    };

export type LoadExpensesResult =
  | { ok: true; rows: ExpenseRow[]; role: string }
  | { ok: false; reason: "no_session" | "no_org" | "db_behind" | "db" };

const CLAIM_COLUMNS =
  "id, description, amount_cents, category, spent_at, status, claimant_user_id, claimant_name, submitted_at, approved_by, approved_at, paid_at, reject_reason, created_by, source";

/** Detects "column does not exist" (42703 surfaces as a message through
 *  PostgREST) — the honest "migration 25 not applied yet" signal. */
function isMissingColumn(message: string | undefined): boolean {
  return /column|schema cache/i.test(message ?? "");
}

type ExpenseInput = {
  clientId: string;
  description: string;
  amountCents: number;
  category: string;
  /** YYYY-MM-DD */
  spentAtIso: string;
  source: "photo" | "manual";
  /**
   * #20 (J review 27-evening, 2026-08-28): the person who paid out of pocket
   * is not always the person typing — an aunty hands her receipt to whoever
   * has the app. Claims only; blank = the signed-in member themselves. The
   * submitter stays on record (claimant_user_id, created_by) either way.
   */
  onBehalfOf?: string | null;
};

function validInput(input: ExpenseInput): boolean {
  return (
    typeof input.clientId === "string" &&
    input.clientId.length > 0 &&
    input.clientId.length <= 80 &&
    typeof input.description === "string" &&
    input.description.trim().length > 0 &&
    input.description.length <= 500 &&
    Number.isInteger(input.amountCents) &&
    input.amountCents > 0 &&
    typeof input.category === "string" &&
    input.category.length <= 60 &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.spentAtIso) &&
    (input.source === "photo" || input.source === "manual") &&
    (input.onBehalfOf === undefined ||
      input.onBehalfOf === null ||
      (typeof input.onBehalfOf === "string" && input.onBehalfOf.length <= 120))
  );
}

/** Shared insert path for both kinds of row. */
async function insertExpense(
  input: ExpenseInput,
  extra: Record<string, unknown>,
): Promise<ExpenseOutcome> {
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!validInput(input)) return { ok: false, reason: "invalid" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("expenses").insert({
    org_id: active.id,
    client_id: input.clientId,
    description: input.description.trim(),
    amount_cents: input.amountCents,
    category: input.category.trim() || null,
    spent_at: input.spentAtIso,
    source: input.source,
    ...extra,
  });
  if (error) {
    // Idempotency: the same clientId already stored = the double-tap case,
    // which is a success from the person's point of view.
    if (/duplicate|unique/i.test(error.message ?? "")) return { ok: true };
    if (isMissingColumn(error.message)) return { ok: false, reason: "db_behind" };
    return { ok: false, reason: "db" };
  }
  return { ok: true };
}

/**
 * The treasurer's own entry: "the society paid this". status = recorded,
 * no approval flow (there is nobody to approve the approver).
 */
export async function recordExpense(input: ExpenseInput): Promise<ExpenseOutcome> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!canDecideClaim(active.role)) return { ok: false, reason: "permission" };

  return insertExpense(input, {
    status: "recorded",
    created_by: user.email ?? "",
  });
}

/**
 * A member's claim: "I paid this for the society, pay me back."
 * status = submitted; the treasurer decides on the pending list.
 */
export async function submitClaim(input: ExpenseInput): Promise<ExpenseOutcome> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!canSubmitClaim(active.role)) return { ok: false, reason: "permission" };

  // The claimant's display name: their membership row's name, else email.
  const supabase = await getSupabaseServer();
  const { data: member } = await supabase
    .from("members_roles")
    .select("name")
    .eq("org_id", active.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // #20: the money may be owed to someone else — their name goes on the
  // claim; who SUBMITTED it stays on claimant_user_id / created_by.
  const onBehalf = (input.onBehalfOf ?? "").trim();
  return insertExpense(input, {
    status: "submitted",
    claimant_user_id: user.id,
    claimant_name:
      onBehalf !== ""
        ? onBehalf
        : ((member?.name as string | null) ?? user.email ?? ""),
    submitted_at: new Date().toISOString(),
    created_by: user.email ?? "",
  });
}

/**
 * The treasurer's decision on ONE submitted claim: approve, reject (with a
 * reason), or mark an approved one paid. The state machine (lib/claims.ts)
 * refuses out-of-order moves — a double tap or a stale screen changes nothing.
 */
export async function decideClaim(input: {
  expenseId: number;
  decision: ClaimDecision;
  rejectReason?: string;
}): Promise<ExpenseOutcome> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!canDecideClaim(active.role)) return { ok: false, reason: "permission" };
  if (!Number.isInteger(input.expenseId)) return { ok: false, reason: "invalid" };
  if (
    input.decision !== "approve" &&
    input.decision !== "reject" &&
    input.decision !== "mark_paid"
  ) {
    return { ok: false, reason: "invalid" };
  }
  const reason =
    input.decision === "reject" ? normalizeRejectReason(input.rejectReason ?? "") : null;
  if (input.decision === "reject" && reason === null) {
    // A rejection without a reason is a door slammed in silence.
    return { ok: false, reason: "invalid" };
  }

  const supabase = await getSupabaseServer();
  const { data: row, error: readError } = await supabase
    .from("expenses")
    .select("id, status")
    .eq("org_id", active.id)
    .eq("id", input.expenseId)
    .maybeSingle();
  if (readError) {
    return {
      ok: false,
      reason: isMissingColumn(readError.message) ? "db_behind" : "db",
    };
  }
  if (!row || !isExpenseStatus(row.status as string)) {
    return { ok: false, reason: "invalid" };
  }

  let next: ExpenseStatus;
  try {
    next = claimTransition(row.status as ExpenseStatus, input.decision);
  } catch {
    // Someone else decided first — the screen is stale, nothing happens.
    return { ok: false, reason: "conflict" };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next };
  if (input.decision === "approve") {
    patch.approved_by = user.email ?? "";
    patch.approved_at = now;
  } else if (input.decision === "reject") {
    patch.reject_reason = reason;
  } else {
    patch.paid_at = now;
  }

  // The status filter makes the write CONDITIONAL on the state we just
  // checked — two treasurers deciding at once cannot both win.
  const { data: updated, error } = await supabase
    .from("expenses")
    .update(patch)
    .eq("org_id", active.id)
    .eq("id", input.expenseId)
    .eq("status", row.status)
    .select("id")
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      reason: isMissingColumn(error.message) ? "db_behind" : "db",
    };
  }
  if (!updated) return { ok: false, reason: "conflict" };
  return { ok: true };
}

/**
 * Every expense row of the active org, newest first. `mine` marks the
 * signed-in member's own claims so the page can show "your claims" honestly.
 */
export async function loadExpenses(): Promise<LoadExpensesResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("expenses")
    .select(CLAIM_COLUMNS)
    .eq("org_id", active.id)
    .order("id", { ascending: false })
    .limit(500);
  if (error) {
    return {
      ok: false,
      reason: isMissingColumn(error.message) ? "db_behind" : "db",
    };
  }

  type Raw = {
    id: number;
    description: string | null;
    amount_cents: number;
    category: string | null;
    spent_at: string | null;
    status: string | null;
    claimant_user_id: string | null;
    claimant_name: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    paid_at: string | null;
    reject_reason: string | null;
    created_by: string | null;
    source: string | null;
  };
  const rows = ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    description: r.description ?? "",
    amountCents: Number(r.amount_cents),
    category: r.category,
    spentAtIso: r.spent_at,
    status: isExpenseStatus(r.status as string)
      ? (r.status as ExpenseStatus)
      : ("recorded" as const),
    claimantName: r.claimant_name,
    submittedAt: r.submitted_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    rejectReason: r.reject_reason,
    createdBy: r.created_by,
    source: r.source,
    mine: r.claimant_user_id === user.id,
  }));
  return { ok: true, rows, role: active.role };
}
