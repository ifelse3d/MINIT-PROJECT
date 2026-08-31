import { describe, expect, it } from "vitest";
import { pctOfQuota, remainingPct } from "./quota-display";

describe("quota display percentages (work order 102 §0-4)", () => {
  it("translates actions into a share of the org's own pool", () => {
    expect(pctOfQuota(3, 15)).toBe(20);
    expect(pctOfQuota(1, 100)).toBe(1);
    expect(pctOfQuota(6, 100)).toBe(6);
  });

  it("never shows a real action as 0%", () => {
    // 1 action on a 1000-action pool rounds to 0 — displayed as 1%, because
    // "0%" reads as free and the action is metered.
    expect(pctOfQuota(1, 1000)).toBe(1);
  });

  it("caps at 100 and refuses to guess with no pool", () => {
    expect(pctOfQuota(50, 15)).toBe(100);
    expect(pctOfQuota(1, null)).toBeNull();
    expect(pctOfQuota(1, 0)).toBeNull();
    expect(pctOfQuota(0, 15)).toBeNull();
  });

  it("remainingPct mirrors usedPct and clamps", () => {
    expect(remainingPct(7)).toBe(93);
    expect(remainingPct(0)).toBe(100);
    expect(remainingPct(100)).toBe(0);
    expect(remainingPct(null)).toBeNull();
  });
});
