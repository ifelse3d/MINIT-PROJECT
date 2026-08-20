import { describe, expect, it } from "vitest";
import {
  MODEL_PRICES,
  SCENARIOS,
  SCENARIO_GEMINI_ONLY,
  SCENARIO_ROUTED,
  SCENARIO_ROUTED_SAFE,
  SCENARIO_TODAY,
  SCENARIO_WORST,
  TIERS_100,
  WORK_ITEMS,
  aiCostUsdPerOrg,
  callCostUsd,
  evaluate,
  monthlyRevenueMyr,
  orgCount,
  type WorkItem,
} from "./unit-economics";

/**
 * These tests exist because this arithmetic ends up on a competition slide.
 * A wrong margin here is a misrepresentation risk, not a rounding error.
 */

const item = (over: Partial<WorkItem> = {}): WorkItem => ({
  key: "t",
  label: "t",
  task: "extract",
  volume: 1,
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  source: "test",
  ...over,
});

describe("callCostUsd", () => {
  it("charges exactly the list price for one million tokens each way", () => {
    expect(callCostUsd(item(), MODEL_PRICES.gemini35Flash)).toBeCloseTo(1.5 + 9.0, 10);
  });

  it("scales linearly with token count", () => {
    const one = callCostUsd(item({ inputTokens: 1_000, outputTokens: 500 }), MODEL_PRICES.gpt5Nano);
    const ten = callCostUsd(item({ inputTokens: 10_000, outputTokens: 5_000 }), MODEL_PRICES.gpt5Nano);
    expect(ten).toBeCloseTo(one * 10, 12);
  });

  it("reproduces the published per-page figures in docs/AI-API-选型与成本.md", () => {
    // A ledger page: 3,100 in / 2,200 out on gemini-3.5-flash was published as $0.0244.
    const ledger = item({ inputTokens: 3_100, outputTokens: 2_200 });
    expect(callCostUsd(ledger, MODEL_PRICES.gemini35Flash)).toBeCloseTo(0.0244, 4);
    // The same page on 3.5-flash-lite was published as $0.0064.
    expect(callCostUsd(ledger, MODEL_PRICES.gemini35FlashLite)).toBeCloseTo(0.0064, 4);
  });
});

describe("revenue", () => {
  it("counts organisations without counting the HQ account as one", () => {
    expect(orgCount(SCENARIO_TODAY)).toBe(100);
  });

  it("sums the published mix to RM7,340 per month", () => {
    expect(monthlyRevenueMyr(SCENARIO_TODAY)).toBe(7_340);
  });

  it("keeps the tier mix weighted towards the cheapest tier", () => {
    const cheapest = TIERS_100.reduce((a, b) => (a.price < b.price ? a : b));
    const others = TIERS_100.filter((t) => t !== cheapest).reduce((n, t) => n + t.count, 0);
    expect(cheapest.count).toBeGreaterThan(others);
  });
});

describe("aiCostUsdPerOrg", () => {
  it("applies the retry buffer on top of raw call cost", () => {
    const withBuffer = aiCostUsdPerOrg(SCENARIO_TODAY);
    const withoutBuffer = aiCostUsdPerOrg({ ...SCENARIO_TODAY, retryBuffer: 0 });
    expect(withBuffer).toBeCloseTo(withoutBuffer * 1.2, 10);
  });

  it("gets cheaper when an easy task is routed to a cheaper model", () => {
    expect(aiCostUsdPerOrg(SCENARIO_ROUTED)).toBeLessThan(aiCostUsdPerOrg(SCENARIO_TODAY));
  });
});

describe("evaluate", () => {
  it("makes COGS the sum of AI, cloud and payment fees", () => {
    const r = evaluate(SCENARIO_TODAY);
    expect(r.cogsMyr).toBeCloseTo(r.aiMyr + r.cloudMyr + r.paymentFeesMyr, 6);
  });

  it("derives gross margin from revenue and COGS", () => {
    const r = evaluate(SCENARIO_ROUTED);
    expect(r.grossMarginPct).toBeCloseTo(((r.revenueMyr - r.cogsMyr) / r.revenueMyr) * 100, 10);
  });

  it("reports cost per organisation consistently with COGS", () => {
    const r = evaluate(SCENARIO_ROUTED);
    expect(r.costPerOrgMyr * r.orgs).toBeCloseTo(r.cogsMyr, 6);
  });

  /**
   * The published claim. If this test fails, the competition documents are
   * stale — update them from `npm run economics`, do not relax the test.
   *
   * CHANGED 2026-08-05: the headline moved from C (75.4%) to E (73.4%).
   * C prices the handwriting job on gpt-5.6-luna, a model that has never been
   * run against our eval set, so its margin depended on an untested accuracy
   * substitution. E only moves classification and chat.
   */
  it("holds the published headline: defensible routing clears 73% on pessimistic inputs", () => {
    const r = evaluate(SCENARIO_ROUTED_SAFE);
    expect(r.grossMarginPct).toBeGreaterThan(73);
    expect(r.grossMarginPct).toBeLessThan(74);
    expect(r.costPerOrgMyr).toBeGreaterThan(19);
    expect(r.costPerOrgMyr).toBeLessThan(20);
  });

  /**
   * The headline must never quietly depend on moving `extract` to a model we
   * have not measured. If someone re-points E's extractor at an OpenAI model
   * without running the eval, this fails and says why.
   */
  it("keeps the published routing's extractor on the model we have measured", () => {
    expect(SCENARIO_ROUTED_SAFE.routing.extract.name).toBe("gemini-3.5-flash-lite");
    expect(SCENARIO_ROUTED_SAFE.routing.longDoc.name).toBe("gemini-3.5-flash-lite");
    // ...while the easy, high-volume tasks are where the saving comes from.
    expect(SCENARIO_ROUTED_SAFE.routing.classify.name).toBe("gpt-5-nano");
    expect(SCENARIO_ROUTED_SAFE.routing.chat.name).toBe("gpt-5-nano");
  });

  it("costs more than the all-OpenAI routing but less than one model everywhere", () => {
    const safe = evaluate(SCENARIO_ROUTED_SAFE).grossMarginPct;
    expect(safe).toBeLessThan(evaluate(SCENARIO_ROUTED).grossMarginPct);
    expect(safe).toBeGreaterThan(evaluate(SCENARIO_GEMINI_ONLY).grossMarginPct);
  });

  it("records that one frontier model for every task does not clear a software margin", () => {
    expect(evaluate(SCENARIO_TODAY).grossMarginPct).toBeLessThan(30);
    expect(evaluate(SCENARIO_WORST).grossMarginPct).toBeLessThan(0);
  });

  /**
   * Scenario D is the one we can switch on with the key that exists. It has to
   * be good enough to be worth switching on TODAY, otherwise the advice in
   * `.env.example` is telling someone to do pointless work.
   */
  it("shows the Gemini-only fallback already clears a software margin", () => {
    const d = evaluate(SCENARIO_GEMINI_ONLY);
    expect(d.grossMarginPct).toBeGreaterThan(60);
    // ...but still costs more than the OpenAI routing we actually recommend,
    // so nobody mistakes D for a reason to skip C.
    expect(d.grossMarginPct).toBeLessThan(evaluate(SCENARIO_ROUTED).grossMarginPct);
  });

  it("keeps every published scenario reachable from SCENARIOS", () => {
    expect(SCENARIOS).toContain(SCENARIO_GEMINI_ONLY);
    expect(SCENARIOS).toContain(SCENARIO_ROUTED);
  });
});

describe("assumptions stay pessimistic", () => {
  it("uses the weaker ringgit of the two documented rates", () => {
    expect(SCENARIO_TODAY.usdToMyr).toBeGreaterThanOrEqual(4.7);
  });

  it("charges a retry buffer and a payment take rate", () => {
    expect(SCENARIO_TODAY.retryBuffer).toBeGreaterThanOrEqual(0.2);
    expect(SCENARIO_TODAY.paymentFeeRate).toBeGreaterThanOrEqual(0.03);
  });

  it("carries cloud at twice the original RM667 estimate", () => {
    expect(SCENARIO_TODAY.cloudMyrPerMonth).toBeGreaterThanOrEqual(1_334);
  });

  it("prices Claude Sonnet 5 at its post-promotion rate, not the promotion", () => {
    expect(MODEL_PRICES.claudeSonnet5.inputPerMTok).toBe(3.0);
    expect(MODEL_PRICES.claudeSonnet5.outputPerMTok).toBe(15.0);
  });

  it("charges every vision extraction at the top of the documented token range", () => {
    const vision = WORK_ITEMS.filter((i) => i.task === "extract");
    expect(vision.length).toBeGreaterThan(0);
    for (const i of vision) {
      expect(i.inputTokens).toBeGreaterThanOrEqual(3_100);
      expect(i.outputTokens).toBeGreaterThanOrEqual(2_200);
    }
  });
});
