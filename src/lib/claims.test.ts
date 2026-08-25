import { describe, expect, it } from "vitest";
import {
  canDecideClaim,
  canSubmitClaim,
  ClaimError,
  claimTransition,
  isExpenseStatus,
  normalizeRejectReason,
} from "@/lib/claims";

// Stage E (work order 27): the claim flow is money, so the state machine gets
// the same treatment as custody — forward-only, tested before wired.

describe("claimTransition (forward-only)", () => {
  it("walks the happy path: submitted → approved → paid", () => {
    expect(claimTransition("submitted", "approve")).toBe("approved");
    expect(claimTransition("approved", "mark_paid")).toBe("paid");
  });

  it("rejects from submitted only", () => {
    expect(claimTransition("submitted", "reject")).toBe("rejected");
    expect(() => claimTransition("approved", "reject")).toThrow(ClaimError);
    expect(() => claimTransition("paid", "reject")).toThrow(ClaimError);
  });

  it("blocks every out-of-order move (double taps, stale screens)", () => {
    expect(() => claimTransition("approved", "approve")).toThrow(ClaimError);
    expect(() => claimTransition("paid", "mark_paid")).toThrow(ClaimError);
    expect(() => claimTransition("rejected", "approve")).toThrow(ClaimError);
    expect(() => claimTransition("submitted", "mark_paid")).toThrow(ClaimError);
    // A treasurer's own recorded expense has no approval flow at all.
    expect(() => claimTransition("recorded", "approve")).toThrow(ClaimError);
    expect(() => claimTransition("recorded", "mark_paid")).toThrow(ClaimError);
  });
});

describe("who can press what (fail-closed)", () => {
  it("everyone except the auditor may submit a claim", () => {
    for (const role of ["hq_admin", "secretary", "treasurer", "collector", "committee"]) {
      expect(canSubmitClaim(role)).toBe(true);
    }
    expect(canSubmitClaim("auditor_readonly")).toBe(false);
  });

  it("only money writers may decide (approve / reject / pay)", () => {
    expect(canDecideClaim("hq_admin")).toBe(true);
    expect(canDecideClaim("treasurer")).toBe(true);
    for (const role of ["secretary", "collector", "committee", "auditor_readonly"]) {
      expect(canDecideClaim(role)).toBe(false);
    }
  });

  it("unknown and empty roles can do nothing", () => {
    for (const bad of ["", "hacker", null, undefined]) {
      expect(canSubmitClaim(bad)).toBe(false);
      expect(canDecideClaim(bad)).toBe(false);
    }
  });
});

describe("small helpers", () => {
  it("isExpenseStatus accepts the five statuses only", () => {
    for (const s of ["recorded", "submitted", "approved", "paid", "rejected"]) {
      expect(isExpenseStatus(s)).toBe(true);
    }
    expect(isExpenseStatus("pending")).toBe(false);
    expect(isExpenseStatus(null)).toBe(false);
  });

  it("a rejection needs a real reason", () => {
    expect(normalizeRejectReason("   ")).toBeNull();
    expect(normalizeRejectReason(" resit tiada ")).toBe("resit tiada");
  });
});
