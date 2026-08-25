import type { Role } from "@/lib/roles";
import { can, isRole } from "@/lib/roles";

// ---------------------------------------------------------------------------
// CLAIMS & EXPENSES — the state machine, pure and unit-tested (Stage E,
// work order 27; J 8/26 拍板②: "做最好的給我").
//
// Two kinds of expense row share one table:
//
//   recorded   — the treasurer's own entry ("I paid the electricity bill").
//                Terminal: there is nobody to approve the approver.
//   submitted  — a member's CLAIM ("I bought the paint, pay me back").
//                → approved → paid, or → rejected (with a reason).
//
// Money only moves forward, like custody: a paid claim cannot be un-paid, a
// rejected one cannot be quietly resurrected (the member submits a NEW claim,
// which keeps the audit trail honest). Role checks live here so the server
// actions and the UI can never disagree about who may press what; the server
// actions are the ones that ENFORCE them (fail-closed, B-4).
// ---------------------------------------------------------------------------

export const EXPENSE_STATUSES = [
  "recorded",
  "submitted",
  "approved",
  "paid",
  "rejected",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export function isExpenseStatus(v: string | null | undefined): v is ExpenseStatus {
  return (EXPENSE_STATUSES as readonly string[]).includes(v ?? "");
}

export class ClaimError extends Error {}

/** The decisions a treasurer/admin takes on a SUBMITTED claim. */
export type ClaimDecision = "approve" | "reject" | "mark_paid";

const DECISION_FROM: Record<ClaimDecision, ExpenseStatus> = {
  approve: "submitted",
  reject: "submitted",
  mark_paid: "approved",
};

const DECISION_TO: Record<ClaimDecision, ExpenseStatus> = {
  approve: "approved",
  reject: "rejected",
  mark_paid: "paid",
};

/** The next status a decision produces, or a ClaimError when the claim is not
 *  in the right state (double-tap, stale screen, forged request — same answer
 *  for all three: nothing happens). */
export function claimTransition(from: ExpenseStatus, decision: ClaimDecision): ExpenseStatus {
  if (DECISION_FROM[decision] !== from) {
    throw new ClaimError(
      `Cannot ${decision} a claim in status "${from}" — ` +
        `${decision} applies to "${DECISION_FROM[decision]}" only. ` +
        `Money moves forward: submitted → approved → paid, or submitted → rejected.`,
    );
  }
  return DECISION_TO[decision];
}

/**
 * Who may SUBMIT a claim: every member except the read-only auditor
 * (J 8/26: "成員（money_collect/committee 起）交 claim" — committee is the
 * lowest writing role, so the line is simply "anyone who can write anything").
 */
export function canSubmitClaim(role: string | null | undefined): boolean {
  if (!isRole(role)) return false;
  return (role as Role) !== "auditor_readonly";
}

/** Who may APPROVE / REJECT / MARK PAID — and record the society's own
 *  expenses directly: the money writers (treasurer, hq_admin). */
export function canDecideClaim(role: string | null | undefined): boolean {
  return can(role, "money_write");
}

/** A rejection without a reason is a door slammed in silence — required. */
export function normalizeRejectReason(raw: string): string | null {
  const reason = raw.trim().slice(0, 500);
  return reason === "" ? null : reason;
}
