import { describe, expect, it } from "vitest";

// Phase 0 smoke test: proves the vitest harness works so that every phase can
// end with a passing `npm run test`. Real deterministic-logic tests (receipt
// numbering, custody state machine, e-Invois consolidation, deadline math)
// land in /src/lib from Phase 2 onward — money math is TypeScript, never the
// LLM (CLAUDE.md Hard Rule 2).
describe("test harness", () => {
  it("sums integer cents deterministically", () => {
    const amountsCents = [1500, 2500, 10000];
    const totalCents = amountsCents.reduce((sum, cents) => sum + cents, 0);
    expect(totalCents).toBe(14000);
  });
});
