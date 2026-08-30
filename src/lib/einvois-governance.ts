// ---------------------------------------------------------------------------
// e-INVOIS GOVERNANCE — the deterministic bridge between a MEETING RESOLUTION
// that approves money and the LHDN e-Invois obligation that follows it.
//
// This file is the "code decides" half of the pair. The model's only job is to
// copy what is visibly written on the page (vendor, amount, purpose, each with
// its own source_ref). EVERY judgement below — whether an individual e-invoice
// is required, whether the committee had the authority to approve the amount,
// what the audit status is — is arithmetic performed here, on values a human
// has already confirmed.
//
// THE FOUR RULES THAT SHAPE EVERY LINE HERE:
//
//   1. Hard Rule 2 — money math is TypeScript, never the LLM. The thresholds
//      are constants, the comparisons are integers in sen, and nothing in this
//      file calls a vendor.
//
//   2. Hard Rule 1 — never invent. When a fact needed for a judgement is not
//      available (amount unreadable, no vendor written, the constitution has
//      no spending clause) the answer is `"unknown"` and a finding that says
//      what is missing. `"unknown"` is a correct answer and must stay
//      reachable; a confident wrong status on a compliance screen is worse
//      than an honest gap.
//
//   3. CLAUDE.md rule 10 — no legal, tax or accounting advice, EVER. Findings
//      are phrased as *things for a human to check*, never as rulings. There
//      is no severity above "check". A finding that cites a rule cites either
//      a published LHDN threshold (a number, with its date) or THIS society's
//      OWN constitution clause — never an invented national limit. There is no
//      hardcoded "committee spending cap" in this file, because no such
//      national figure exists: a society's approval limit lives in its own
//      constitution, which is why `committeeApprovalLimitCents` is an INPUT.
//
//   4. There is NO MyInvois API in v1 (see the header of `src/lib/einvois.ts`).
//      Therefore no status in this file may assert that the government has
//      seen, accepted or validated anything. `"exported"` and `"submitted"`
//      are FACTS RECORDED BY A HUMAN or by our own export pipeline, passed in
//      as `ledger`, never inferred. A green "LHDN Validated" badge would be a
//      claim we cannot substantiate, and the competition rules (§12) treat a
//      material misrepresentation as a disqualifying matter.
// ---------------------------------------------------------------------------

import { INDIVIDUAL_EINVOICE_THRESHOLD_CENTS } from "@/lib/einvois";
import { formatRm } from "@/lib/minit-format";
import { filterClauses, type ConfirmedClause } from "@/lib/constitution";

/** Trilingual copy, as data — this module is pure and renders no JSX. */
export type TriText = { bm: string; zh: string; en: string };

/**
 * The audit state of ONE financial resolution, as it travels from the meeting
 * that approved it to the treasurer's MyInvois upload.
 *
 * Ordered by how far along the trail the money has travelled. Note what is
 * absent: there is no "validated" / "accepted by LHDN" state, because nothing
 * in v1 can observe one.
 */
export const EINVOIS_AUDIT_STATUSES = [
  /** Nothing here needs an e-invoice (no money, or an in-kind entry). */
  "not_applicable",
  /** A fact needed to decide is missing. The honest default. */
  "unknown",
  /** Below the individual threshold — belongs in the month-end consolidated pack. */
  "consolidated_pack",
  /** At or above the LHDN individual threshold — needs its own e-invoice. */
  "individual_required",
  /** Appeared in a MyInvois batch file we generated. Recorded by our pipeline. */
  "exported",
  /** The treasurer recorded that they uploaded it to the MyInvois Portal. */
  "submitted",
] as const;
export type EInvoisAuditStatus = (typeof EINVOIS_AUDIT_STATUSES)[number];

/**
 * What our own side of the trail knows about this resolution. Both timestamps
 * are written by code or by a human action — the model never supplies them,
 * and neither of them means the government replied.
 */
export type LedgerLink = {
  /** When this row was written into a generated MyInvois batch .xlsx. */
  exportedAtIso?: string | null;
  /** When a named human recorded uploading that file to the portal. */
  submittedAtIso?: string | null;
};

/** One money-approving resolution, AFTER a human confirmed the extraction. */
export type FinancialResolutionInput = {
  /** The payee exactly as written on the page. "" when the page did not say. */
  vendorName: string;
  /** Integer sen, or null when the amount could not be read. Never computed. */
  approvedAmountCents: number | null;
  /** What the money is for, as written. */
  purpose: string;
  /** In-kind approvals (goods, donated services) carry no invoice. */
  inKind?: boolean;
  /** Facts from our own pipeline. Absent = nothing exported yet. */
  ledger?: LedgerLink | null;
};

export type GovernanceInput = {
  resolution: FinancialResolutionInput;
  /**
   * THIS society's own committee approval ceiling, in sen, read from its
   * constitution. `null` = the constitution does not say (or has not been read
   * yet) — in which case no approval-limit finding is produced at all, because
   * inventing a limit would be inventing a rule.
   */
  committeeApprovalLimitCents?: number | null;
  /** The clause the limit came from, e.g. "Fasal 12.3". Shown to the human. */
  committeeApprovalClauseRef?: string | null;
  /** Whether the organisation switched e-Invois on (src/lib/org-flags.ts). */
  einvoisEnabled: boolean;
};

export type GovernanceFindingCode =
  | "amount_unreadable"
  | "vendor_missing"
  | "individual_einvoice_required"
  | "approval_limit_exceeded";

export type GovernanceFinding = {
  code: GovernanceFindingCode;
  /**
   * "info"  — worth knowing, nothing to do.
   * "check" — a human should look before this becomes a filing.
   * There is deliberately no level above "check": this module reports, it
   * does not rule (CLAUDE.md rule 10).
   */
  severity: "info" | "check";
  message: TriText;
  /**
   * Where the rule being checked comes from — a constitution clause of this
   * society, or a published LHDN threshold with its in-force date. Never a
   * figure this codebase made up.
   */
  basis: TriText | null;
};

export type GovernanceResult = {
  status: EInvoisAuditStatus;
  findings: GovernanceFinding[];
};

/** Statuses that should read as "settled" in the UI (green). */
export function isSettledStatus(s: EInvoisAuditStatus): boolean {
  return s === "exported" || s === "submitted" || s === "not_applicable";
}

/**
 * The audit status of one resolution.
 *
 * Reading order matters: recorded FACTS (exported / submitted) outrank derived
 * expectations, because a thing that has already been exported is no longer
 * merely "due to be consolidated".
 */
export function auditStatusFor(input: GovernanceInput): EInvoisAuditStatus {
  const { resolution, einvoisEnabled } = input;
  const { approvedAmountCents, inKind, ledger } = resolution;

  // Facts first — these were recorded, not inferred.
  if (ledger?.submittedAtIso) return "submitted";
  if (ledger?.exportedAtIso) return "exported";

  // An in-kind approval has no invoice to raise. Same for a zero amount.
  if (inKind) return "not_applicable";
  if (approvedAmountCents === 0) return "not_applicable";

  // Hard Rule 1: an unreadable amount cannot be classified. Say so.
  if (approvedAmountCents === null) return "unknown";

  // The organisation has not switched e-Invois on, so no obligation is being
  // tracked for it here. This is a setting, not a legal conclusion.
  if (!einvoisEnabled) return "not_applicable";

  return approvedAmountCents >= INDIVIDUAL_EINVOICE_THRESHOLD_CENTS
    ? "individual_required"
    : "consolidated_pack";
}

/**
 * Everything a human should look at before this resolution becomes a filing.
 * Order is stable: the most consequential check first.
 */
export function governanceFindings(input: GovernanceInput): GovernanceFinding[] {
  const { resolution, einvoisEnabled } = input;
  const { vendorName, approvedAmountCents, inKind } = resolution;
  const limit = input.committeeApprovalLimitCents ?? null;
  const clauseRef = input.committeeApprovalClauseRef ?? null;

  const findings: GovernanceFinding[] = [];

  // --- 1. The society's OWN spending authority, from its OWN constitution. ---
  // Produced ONLY when we actually read a limit out of the constitution. No
  // constitution clause = no finding. We never supply a default ceiling.
  if (limit !== null && approvedAmountCents !== null && approvedAmountCents > limit) {
    findings.push({
      code: "approval_limit_exceeded",
      severity: "check",
      message: {
        bm: `Keputusan ini meluluskan ${formatRm(approvedAmountCents)}, melebihi had ${formatRm(limit)} yang tertulis dalam perlembagaan pertubuhan. Sila semak sama ada kelulusan mesyuarat agung diperlukan.`,
        zh: `这项决议批准 ${formatRm(approvedAmountCents)}，超过贵会章程写明的 ${formatRm(limit)} 上限。请确认是否需要会员大会批准。`,
        en: `This resolution approves ${formatRm(approvedAmountCents)}, above the ${formatRm(limit)} ceiling written in your own constitution. Please check whether a general-meeting approval is needed.`,
      },
      basis: clauseRef
        ? {
            bm: `Sumber: perlembagaan pertubuhan anda, ${clauseRef}.`,
            zh: `依据：贵会章程 ${clauseRef}。`,
            en: `Basis: your organisation's own constitution, ${clauseRef}.`,
          }
        : null,
    });
  }

  // --- 2. The LHDN individual-e-invoice threshold. A published number. ---
  if (
    einvoisEnabled &&
    !inKind &&
    approvedAmountCents !== null &&
    approvedAmountCents >= INDIVIDUAL_EINVOICE_THRESHOLD_CENTS
  ) {
    findings.push({
      code: "individual_einvoice_required",
      severity: "check",
      message: {
        bm: `${formatRm(approvedAmountCents)} mencapai ambang e-Invois individu — transaksi ini tidak boleh digabungkan dalam pakej bulanan dan memerlukan e-invois tersendiri.`,
        zh: `${formatRm(approvedAmountCents)} 达到 e-Invois 单笔门槛 —— 这笔不能并进月结合并单，需要自己一张 e-invois。`,
        en: `${formatRm(approvedAmountCents)} reaches the individual e-Invois threshold — this transaction cannot go in the monthly consolidated pack and needs its own e-invoice.`,
      },
      basis: {
        bm: `Ambang LHDN ${formatRm(INDIVIDUAL_EINVOICE_THRESHOLD_CENTS)} bagi satu transaksi, berkuat kuasa 1 Januari 2026.`,
        zh: `LHDN 单笔 ${formatRm(INDIVIDUAL_EINVOICE_THRESHOLD_CENTS)} 门槛，2026 年 1 月 1 日起生效。`,
        en: `LHDN ${formatRm(INDIVIDUAL_EINVOICE_THRESHOLD_CENTS)} single-transaction threshold, in force since 1 January 2026.`,
      },
    });
  }

  // --- 3. Gaps that stop a judgement being possible at all. ---
  if (approvedAmountCents === null) {
    findings.push({
      code: "amount_unreadable",
      severity: "check",
      message: {
        bm: "Jumlah tidak dapat dibaca daripada minit ini, jadi status e-Invois tidak dapat ditentukan. Sila isikan jumlah yang diluluskan.",
        zh: "这份记录里读不出金额，所以无法判断 e-Invois 状态。请补上批准的数目。",
        en: "The amount could not be read from these minutes, so the e-Invois status cannot be decided. Please fill in the approved amount.",
      },
      basis: null,
    });
  }

  if (einvoisEnabled && !inKind && vendorName.trim() === "") {
    findings.push({
      code: "vendor_missing",
      severity: "check",
      message: {
        bm: "Minit ini tidak menyebut penerima bayaran. Nama pembekal diperlukan sebelum e-invois boleh disediakan.",
        zh: "这份记录没有写收款方。开 e-invois 之前需要供应商名称。",
        en: "These minutes do not name a payee. A vendor name is needed before an e-invoice can be prepared.",
      },
      basis: null,
    });
  }

  return findings;
}

/** Status + findings in one call — what the UI actually consumes. */
export function checkFinancialResolution(input: GovernanceInput): GovernanceResult {
  return {
    status: auditStatusFor(input),
    findings: governanceFindings(input),
  };
}

/**
 * Best-effort read of THIS society's committee spending ceiling out of its own
 * confirmed constitution clauses.
 *
 * Modelled on `findNoticePeriodDays` in `src/lib/constitution.ts`: search the
 * clauses the society actually confirmed, and return null the moment anything
 * is uncertain. Returning null is the SAFE answer — it means no approval-limit
 * finding is produced at all, which is exactly right when we do not know the
 * society's rule. Never guess a ceiling.
 */
export function findCommitteeSpendingLimit(
  clauses: ConfirmedClause[]
): { limitCents: number; clause: ConfirmedClause } | null {
  const matches = filterClauses("perbelanjaan jawatankuasa had kelulusan wang", clauses);
  for (const { clause } of matches) {
    // "RM 5,000" / "RM5000.00" / "RM 5,000.50" — the amount as written.
    const m = /RM\s*([\d,]+(?:\.\d{1,2})?)/i.exec(clause.text);
    if (!m) continue;
    const plain = m[1].replace(/,/g, "");
    const value = Number(plain);
    if (!Number.isFinite(value) || value <= 0) continue;
    const limitCents = Math.round(value * 100);
    // A constitution ceiling below RM10 or above RM10,000,000 is far more
    // likely to be a misread than a real rule — refuse rather than mislead.
    if (limitCents < 1_000 || limitCents > 1_000_000_000) continue;
    return { limitCents, clause };
  }
  return null;
}
