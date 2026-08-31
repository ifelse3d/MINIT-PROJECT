import { describe, expect, it } from "vitest";
import {
  AI_ACTIONS,
  aiRateLimitPerMin,
  ASK_INTENT_COSTS,
  computeUsageState,
  decideCharge,
  DEFAULT_AI_RATE_LIMIT_PER_MIN,
  isAiAction,
  isRateLimited,
  QuotaExceededError,
  RATE_LIMITED_MESSAGE,
  RateLimitedError,
  usageMonthMalaysia,
  usageMonthUtcWindow,
  usedPercent,
} from "./usage-core";

describe("usedPercent", () => {
  it("is the spent share of the free quota, rounded", () => {
    expect(usedPercent(0, 100)).toBe(0);
    expect(usedPercent(1, 100)).toBe(1);
    expect(usedPercent(34, 100)).toBe(34);
    expect(usedPercent(100, 100)).toBe(100);
    // 2/3 rounds to 67, not 66 — the gauge should not under-report.
    expect(usedPercent(2, 3)).toBe(67);
  });

  it("clamps overspend to 100 instead of reporting 140%", () => {
    // Reachable: purchased credits let usage run past the free quota.
    expect(usedPercent(140, 100)).toBe(100);
  });

  it("treats a zero quota as fully spent rather than NaN", () => {
    expect(usedPercent(0, 0)).toBe(100);
    expect(usedPercent(5, 0)).toBe(100);
  });

  it("never goes below zero", () => {
    expect(usedPercent(-5, 100)).toBe(0);
  });
});

describe("computeUsageState", () => {
  it("normal month: remaining = quota - used + credits, not blocked", () => {
    const s = computeUsageState({
      usedThisMonth: 34,
      monthlyFreeQuota: 100,
      extraCredits: 20,
    });
    expect(s.freeRemaining).toBe(66);
    expect(s.totalRemaining).toBe(86);
    expect(s.blocked).toBe(false);
  });

  it("quota exactly reached with no credits → blocked", () => {
    const s = computeUsageState({
      usedThisMonth: 100,
      monthlyFreeQuota: 100,
      extraCredits: 0,
    });
    expect(s.freeRemaining).toBe(0);
    expect(s.totalRemaining).toBe(0);
    expect(s.blocked).toBe(true);
  });

  it("quota reached but credits left → not blocked", () => {
    const s = computeUsageState({
      usedThisMonth: 100,
      monthlyFreeQuota: 100,
      extraCredits: 5,
    });
    expect(s.totalRemaining).toBe(5);
    expect(s.blocked).toBe(false);
  });

  it("used can exceed quota (credits were spent) — freeRemaining never negative", () => {
    const s = computeUsageState({
      usedThisMonth: 130,
      monthlyFreeQuota: 100,
      extraCredits: 0,
    });
    expect(s.freeRemaining).toBe(0);
    expect(s.blocked).toBe(true);
  });

  it("zero-quota org with credits still works on credits", () => {
    const s = computeUsageState({
      usedThisMonth: 0,
      monthlyFreeQuota: 0,
      extraCredits: 3,
    });
    expect(s.totalRemaining).toBe(3);
    expect(s.blocked).toBe(false);
  });
});

describe("decideCharge", () => {
  it("under quota → free", () => {
    expect(
      decideCharge({ usedThisMonth: 99, monthlyFreeQuota: 100, extraCredits: 0 }),
    ).toBe("free");
  });
  it("at quota with credits → credit", () => {
    expect(
      decideCharge({ usedThisMonth: 100, monthlyFreeQuota: 100, extraCredits: 1 }),
    ).toBe("credit");
  });
  it("at quota, zero credits → blocked", () => {
    expect(
      decideCharge({ usedThisMonth: 100, monthlyFreeQuota: 100, extraCredits: 0 }),
    ).toBe("blocked");
  });
});

describe("Malaysian month boundary (UTC+8)", () => {
  it("31 Jul 23:00 UTC is already 1 Aug in Malaysia", () => {
    expect(usageMonthMalaysia(new Date("2026-07-31T23:00:00Z"))).toBe("2026-08");
  });
  it("31 Jul 15:59 UTC is still 31 Jul in Malaysia", () => {
    expect(usageMonthMalaysia(new Date("2026-07-31T15:59:00Z"))).toBe("2026-07");
  });
  it("window for July 2026 runs 30 Jun 16:00Z → 31 Jul 16:00Z", () => {
    const w = usageMonthUtcWindow(new Date("2026-07-19T04:00:00Z"));
    expect(w.startUtc).toBe("2026-06-30T16:00:00.000Z");
    expect(w.endUtc).toBe("2026-07-31T16:00:00.000Z");
  });
  it("December window rolls into January of the next year", () => {
    const w = usageMonthUtcWindow(new Date("2026-12-15T00:00:00Z"));
    expect(w.endUtc).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("action codes and ask costs", () => {
  it("every action code is short (PDPA: codes only, fits DB check)", () => {
    for (const a of AI_ACTIONS) {
      expect(a.length).toBeGreaterThan(0);
      expect(a.length).toBeLessThanOrEqual(40);
    }
  });
  it("isAiAction accepts known, rejects unknown", () => {
    expect(isAiAction("extract_minutes")).toBe(true);
    expect(isAiAction("donor_name")).toBe(false);
  });
  // 2026-08-21: out_of_scope went from 0 to 1. The classify call is what tells
  // us the question was out of scope, so the vendor was already paid by then.
  // Refunding it made off-topic chat free for the user and billable to us.
  it("out-of-scope costs the classify call it took to find out; search costs 2", () => {
    expect(ASK_INTENT_COSTS.out_of_scope).toBe(1);
    expect(ASK_INTENT_COSTS.record_search).toBe(2);
  });
});

describe("QuotaExceededError", () => {
  it("carries a typed code and the usage state", () => {
    const state = computeUsageState({
      usedThisMonth: 100,
      monthlyFreeQuota: 100,
      extraCredits: 0,
    });
    const err = new QuotaExceededError(state);
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.state.blocked).toBe(true);
  });
});

// --- rate limit (2026-08-21) -------------------------------------------------

describe("isRateLimited", () => {
  it("allows everything below the limit", () => {
    expect(isRateLimited(0, 20)).toBe(false);
    expect(isRateLimited(19, 20)).toBe(false);
  });

  it("refuses AT the limit, not one past it", () => {
    // The count is of actions already started in the window, so the 21st call
    // in a minute is the one that must be refused, not the 22nd.
    expect(isRateLimited(20, 20)).toBe(true);
    expect(isRateLimited(500, 20)).toBe(true);
  });
});

describe("aiRateLimitPerMin", () => {
  it("uses the provisional default when nothing is configured", () => {
    expect(aiRateLimitPerMin(undefined)).toBe(DEFAULT_AI_RATE_LIMIT_PER_MIN);
  });

  it("takes the number from the environment", () => {
    expect(aiRateLimitPerMin("5")).toBe(5);
  });

  it("falls back rather than switching the limiter off on a bad value", () => {
    // "0" is the dangerous one: read literally it means "allow nothing", but a
    // 0 in an env var is almost always a typo or an unset variable that
    // stringified. Falling back is the safe reading in both directions.
    for (const bad of ["", "abc", "0", "-1", "NaN"]) {
      expect(aiRateLimitPerMin(bad)).toBe(DEFAULT_AI_RATE_LIMIT_PER_MIN);
    }
  });
});

describe("RateLimitedError", () => {
  it("carries the limit it tripped on", () => {
    const e = new RateLimitedError(20);
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.limitPerMin).toBe(20);
    expect(e instanceof Error).toBe(true);
  });

  it("has a message in all three languages that says nothing was charged", () => {
    // The first thing someone asks after being refused is whether it cost them
    // anything, and a Chinese-only treasurer must be able to read the answer.
    for (const lang of ["bm", "zh", "en"] as const) {
      expect(RATE_LIMITED_MESSAGE[lang].length).toBeGreaterThan(20);
    }
    expect(RATE_LIMITED_MESSAGE.zh).toContain("没有用掉");
    expect(RATE_LIMITED_MESSAGE.en).toContain("did not use");
  });
});

// ---------------------------------------------------------------------------
// §5 (work order 104) — THE TWO NUMBERS MUST NOT CALL EACH OTHER LIARS.
//
// J, 2026-08-31 evening: 「607% extra credit 是什麽鬼」. His Plan page showed
// "100% used · 0% left" next to "+607% extra credits" on an account that could
// still do 91 things — because usedPct measured the FREE quota alone while the
// credits were spent quietly behind it.
//
// The invariant these tests exist for, both ways round:
//   * the screen says 0% left  ⇒ the next action really is refused;
//   * the next action goes through ⇒ the screen does not say 0% left.
// ---------------------------------------------------------------------------

describe("§5 — percentages include the top-up", () => {
  /** J's actual state on 2026-08-31. */
  const JS_STATE = { usedThisMonth: 15, monthlyFreeQuota: 15, extraCredits: 91 };

  it("J's state no longer reads 0% left while 91 actions remain", () => {
    const s = computeUsageState(JS_STATE);
    expect(s.blocked).toBe(false);
    expect(s.usedPct).toBeLessThan(100);
    expect(100 - s.usedPct).toBeGreaterThan(0);
  });

  it("the pool is the month's allowance plus the top-up", () => {
    const s = computeUsageState(JS_STATE);
    expect(s.quotaPool).toBe(106);
    expect(s.usedPct).toBe(14); // 15 / 106
  });

  it("the pool stays honest after credits have been SPENT", () => {
    // 20 used = 15 free + 5 credits; 95 credits left of the 100 granted.
    const s = computeUsageState({
      usedThisMonth: 20,
      monthlyFreeQuota: 15,
      extraCredits: 95,
    });
    // used + remaining, so the percentages describe the same 115 things.
    expect(s.quotaPool).toBe(115);
    expect(s.totalRemaining).toBe(95);
    expect(s.usedPct).toBe(17);
  });

  it("blocked really is 100% used and 0% left", () => {
    const s = computeUsageState({
      usedThisMonth: 15,
      monthlyFreeQuota: 15,
      extraCredits: 0,
    });
    expect(s.blocked).toBe(true);
    expect(s.usedPct).toBe(100);
  });

  it("never reads 100% used while ONE action is still available", () => {
    // 199/200 rounds to 100% — and this account can still do one thing.
    const s = computeUsageState({
      usedThisMonth: 199,
      monthlyFreeQuota: 200,
      extraCredits: 0,
    });
    expect(s.blocked).toBe(false);
    expect(s.usedPct).toBe(99);
  });

  it("never reads 0% used after a real action was spent", () => {
    // 1/500 rounds to 0% — and something WAS charged.
    const s = computeUsageState({
      usedThisMonth: 1,
      monthlyFreeQuota: 500,
      extraCredits: 0,
    });
    expect(s.usedPct).toBe(1);
  });

  it("an untouched month is 0% used and 100% left", () => {
    const s = computeUsageState({
      usedThisMonth: 0,
      monthlyFreeQuota: 15,
      extraCredits: 0,
    });
    expect(s.usedPct).toBe(0);
    expect(s.quotaPool).toBe(15);
  });

  it("an org with no allowance at all is fully spent, not NaN", () => {
    const s = computeUsageState({
      usedThisMonth: 0,
      monthlyFreeQuota: 0,
      extraCredits: 0,
    });
    expect(s.quotaPool).toBe(0);
    expect(s.usedPct).toBe(100);
    expect(s.blocked).toBe(true);
  });

  it("the invariant holds across a sweep of states", () => {
    for (const quota of [0, 1, 15, 100, 200]) {
      for (const credits of [0, 1, 91]) {
        for (const used of [0, 1, 14, 15, 99, 199, 300]) {
          const s = computeUsageState({
            usedThisMonth: used,
            monthlyFreeQuota: quota,
            extraCredits: credits,
          });
          const saysNothingLeft = 100 - s.usedPct === 0;
          expect(saysNothingLeft).toBe(s.blocked);
        }
      }
    }
  });
});
