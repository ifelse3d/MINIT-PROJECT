import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// D0-2 (work order 56, 2026-08-29) — the timeout answer must match the
// document. A timeout reading a MANY-page document is deterministic (the
// generation cannot fit the route's vendor budget — see
// EXTRACT_ATTEMPT_TIMEOUT_MS in http.ts), so "wait a minute and try again"
// bills the person again for an identical failure. Big document + timeout →
// the split-the-file advice; small document + timeout → the ordinary retry
// advice, because there a timeout really is transient.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("@/lib/app-errors", () => ({ captureAppError: vi.fn(async () => {}) }));

const { vendorFailureResponse } = await import("@/lib/ai/vendor-failure");
const { VendorTimeoutError } = await import("@/lib/ai/http");
const { VendorOutputTruncatedError } = await import("@/lib/ai/provider");
const { USER_ERRORS, joinUserError } = await import("@/lib/user-errors");

describe("vendorFailureResponse", () => {
  it("timeout on a small document: retry advice, 504", async () => {
    const res = vendorFailureResponse(
      "/api/test",
      new VendorTimeoutError("slow"),
      1,
    );
    expect(res.status).toBe(504);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(joinUserError(USER_ERRORS.aiTimeout));
  });

  it("timeout on a BIG document: split advice, never 'try again'", async () => {
    const res = vendorFailureResponse(
      "/api/test",
      new VendorTimeoutError("deterministically slow"),
      1,
      { bigDocument: true },
    );
    expect(res.status).toBe(504);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(joinUserError(USER_ERRORS.documentTooLong));
    expect(body.error).not.toContain("try again");
  });

  it("truncation keeps the split advice (413) regardless of the flag", async () => {
    const res = vendorFailureResponse(
      "/api/test",
      new VendorOutputTruncatedError("Gemini"),
      1,
      { bigDocument: false },
    );
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(joinUserError(USER_ERRORS.documentTooLong));
  });

  it("anything else stays the generic unreachable message (502)", async () => {
    const res = vendorFailureResponse("/api/test", new Error("boom"), 1, {
      bigDocument: true,
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(joinUserError(USER_ERRORS.aiUnavailable));
  });
});
