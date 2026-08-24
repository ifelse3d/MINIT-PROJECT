// ---------------------------------------------------------------------------
// PLANS — the subscription tiers, ONE source of truth (S-1, 2026-08-25).
//
// Prices and final quota numbers are TBD (J's decision #2: "等系统做好、量出
// 真实成本再定"). Every number that is still a guess is tagged TBD_PRICING so
// grep finds them all the day real numbers exist, and every screen reads THIS
// file — change it here, the whole app follows.
//
// What IS decided (docs/DECISIONS.md):
//   - trial = ONE organisation (J, 8/22, decision #6)
//   - entitlements are enforced SERVER-side, fail-closed; the client only
//     displays (S-3)
//   - no payments until: real prices + a legal entity + lawyer-reviewed terms
//     (D12). No fake checkout anywhere.
// ---------------------------------------------------------------------------

/**
 * Marks a number that is a PLACEHOLDER until real cost data exists.
 * The value passes through unchanged; the call is greppable.
 */
export const TBD_PRICING = <T>(placeholder: T): T => placeholder;

export type PlanId = "trial" | "standard" | "hq";

export type Plan = {
  id: PlanId;
  /** Display names, all three languages. */
  name: { bm: string; zh: string; en: string };
  /** Monthly AI actions included. TBD_PRICING until real cost data. */
  monthlyAiQuota: number;
  /** How many ROOT organisations one account may run on this plan. */
  maxRootOrgs: number;
  /** How many branches an HQ may hang under it. null = not applicable. */
  maxBranches: number | null;
  /** Feature flags — capability, not quota. */
  features: {
    /** HQ + branches tree, custody flows between them. */
    branchHierarchy: boolean;
    /** The month-end e-Invois pack pages. */
    einvois: boolean;
  };
  /** RM/month. null = price not announced yet (all of them, deliberately). */
  priceRm: number | null;
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: { bm: "Percubaan", zh: "试用", en: "Trial" },
    monthlyAiQuota: TBD_PRICING(100),
    // DECIDED (J 2026-08-22): the trial covers exactly one organisation.
    maxRootOrgs: 1,
    maxBranches: null,
    features: { branchHierarchy: false, einvois: true },
    priceRm: null, // free while it lasts; duration TBD
  },
  standard: {
    id: "standard",
    name: { bm: "Biasa", zh: "标准", en: "Standard" },
    monthlyAiQuota: TBD_PRICING(100),
    maxRootOrgs: TBD_PRICING(1),
    maxBranches: null,
    features: { branchHierarchy: false, einvois: true },
    priceRm: null, // TBD_PRICING — announced when costs are measured
  },
  hq: {
    id: "hq",
    name: { bm: "Ibu Pejabat", zh: "总部", en: "HQ" },
    monthlyAiQuota: TBD_PRICING(300),
    maxRootOrgs: TBD_PRICING(1),
    maxBranches: TBD_PRICING(25),
    features: { branchHierarchy: true, einvois: true },
    priceRm: null, // TBD_PRICING
  },
};

/** Fail-closed: an unknown plan string behaves as the most restricted plan. */
export function planById(raw: string | null | undefined): Plan {
  if (raw === "standard" || raw === "hq") return PLANS[raw];
  return PLANS.trial;
}

/** The comparison-table order. */
export const PLAN_ORDER: PlanId[] = ["trial", "standard", "hq"];
