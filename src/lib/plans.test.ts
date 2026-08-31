import { describe, expect, it } from "vitest";
import { PLANS, PLAN_ORDER, planById } from "./plans";

describe("plans (S-1, 2026-08-25)", () => {
  it("the trial covers exactly ONE organisation (J's decision, 2026-08-22)", () => {
    expect(PLANS.trial.maxRootOrgs).toBe(1);
  });

  it("the trial quota is 15 actions/month (J's decision, 2026-08-25 — NOT 100)", () => {
    // Deliberately enough to prove the value and not enough to live on free
    // forever. The DB default matches (migration 20260901000000).
    expect(PLANS.trial.monthlyAiQuota).toBe(15);
  });

  it("no plan announces a price yet — pricing waits for real cost data", () => {
    for (const id of PLAN_ORDER) {
      expect(PLANS[id].priceRm).toBeNull();
    }
  });

  it("§0-5 (102): the tiers keep J's ratios — Trial 15%, Standard 100%, Plus 200%", () => {
    const std = PLANS.standard.monthlyAiQuota;
    expect(Math.round((PLANS.trial.monthlyAiQuota / std) * 100)).toBe(15);
    expect(Math.round((PLANS.plus.monthlyAiQuota / std) * 100)).toBe(200);
    expect(planById("plus").id).toBe("plus");
  });

  it("fails CLOSED: an unknown plan string behaves as the trial", () => {
    expect(planById("enterprise-ultra").id).toBe("trial");
    expect(planById(null).id).toBe("trial");
    expect(planById(undefined).id).toBe("trial");
    expect(planById("hq").id).toBe("hq");
    expect(planById("standard").id).toBe("standard");
  });

  it("only HQ carries the branch hierarchy", () => {
    expect(PLANS.hq.features.branchHierarchy).toBe(true);
    expect(PLANS.trial.features.branchHierarchy).toBe(false);
    expect(PLANS.standard.features.branchHierarchy).toBe(false);
  });
});
