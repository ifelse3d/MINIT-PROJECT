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

/**
 * The free fence (D44, J's numbers, 2026-08-28). LIFETIME totals — they never
 * reset, and deleting a document does not give the count back ("數做過的，
 * 不是數現存的"). `null` on a plan = no fence at all.
 */
export type FenceLimits = {
  /** Official documents made: minutes saved to history + clean pack exports. */
  docsMade: number;
  /** Numbered receipts issued (counted from the receipts table itself). */
  receipts: number;
  /** Pages the AI has read: 1 photo = 1 page, 1 PDF page = 1 page. */
  uploadPages: number;
  /** Clean (no-watermark) document downloads. Receipts never count here. */
  cleanDownloads: number;
};

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
  /** Lifetime free-fence caps (D44). null = unlimited (paid plans). */
  fence: FenceLimits | null;
  /** RM/month. null = price not announced yet (all of them, deliberately). */
  priceRm: number | null;
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: { bm: "Percubaan", zh: "试用", en: "Trial" },
    // DECIDED (J 2026-08-25, work order 24 建議③): 15 actions/month — enough
    // to prove the value (a constitution + a meeting + a few ledger pages +
    // questions), deliberately not enough to live on free forever. Not
    // TBD_PRICING any more. DB default: migration 20260901000000.
    monthlyAiQuota: 15,
    // DECIDED (J 2026-08-22): the trial covers exactly one organisation.
    maxRootOrgs: 1,
    maxBranches: null,
    features: { branchHierarchy: false, einvois: true },
    // DECIDED (J 2026-08-28, D44) — LIFETIME, not monthly: a society only
    // meets 1-2 times a month, so a monthly reset would never run out. The
    // conversion engine is the money side (20 receipts), by design.
    fence: { docsMade: 5, receipts: 20, uploadPages: 20, cleanDownloads: 3 },
    priceRm: null, // free while it lasts; duration TBD
  },
  standard: {
    id: "standard",
    name: { bm: "Biasa", zh: "标准", en: "Standard" },
    monthlyAiQuota: TBD_PRICING(100),
    maxRootOrgs: TBD_PRICING(1),
    maxBranches: null,
    features: { branchHierarchy: false, einvois: true },
    fence: null, // paid = no fence (D44)
    priceRm: null, // TBD_PRICING — announced when costs are measured
  },
  hq: {
    id: "hq",
    name: { bm: "Ibu Pejabat", zh: "总部", en: "HQ" },
    monthlyAiQuota: TBD_PRICING(300),
    maxRootOrgs: TBD_PRICING(1),
    maxBranches: TBD_PRICING(25),
    features: { branchHierarchy: true, einvois: true },
    fence: null, // paid = no fence (D44)
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
