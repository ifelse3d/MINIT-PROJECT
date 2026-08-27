import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P-1 (work order 31, 2026-08-27) — THE FAILURE CHAIN MUST DO ALL THREE THINGS.
//
// The "ai_usage id=5" incident: a member's extract_minutes was charged, the
// vendor row stayed all-null, no refund ran and app_errors had 0 rows — the
// signature of a route whose vendor retries outlived Vercel's 60s maxDuration,
// so the platform killed the function and none of its own error handling ever
// ran. The person saw "The connection dropped" and lost an action silently.
//
// The contract under test, for the route that carried the incident:
//   1. REFUND  — a vendor throw before any answer refunds the charge (rule 10)
//   2. RECORD  — the failure lands in app_errors (a swallowed error can only
//                be re-experienced, never investigated)
//   3. RESPOND — a timeout says "your quota was returned" (504); any other
//                vendor failure keeps the generic unreachable message (502)
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const refundUsage = vi.fn(async () => {});
const gateCharge = { rowId: 42, spentCredit: false };

vi.mock("@/lib/ai/usage", () => ({
  refundUsage,
  createUsageRecorder: () => () => {},
  requireAiQuota: async () => ({
    ok: true,
    org: { id: 7, name: "Persatuan Ujian" },
    charges: [gateCharge],
  }),
}));

const extractJson = vi.fn<(req: unknown) => Promise<unknown>>();
vi.mock("@/lib/ai/provider", async (importOriginal) => {
  // Keep the real module (EXTRACT_OUTPUT_CEILING, VendorOutputTruncatedError —
  // the route and vendor-failure.ts both use them); fake only the provider.
  const real = await importOriginal<typeof import("@/lib/ai/provider")>();
  return { ...real, getVisionProvider: () => ({ name: "fake", extractJson }) };
});

vi.mock("@/lib/pdf-pages", () => ({
  checkPageLimit: async () => ({ ok: true, pages: 1 }),
}));

vi.mock("@/lib/glossary-server", () => ({ loadGlossary: async () => [] }));
vi.mock("@/lib/record-upload", () => ({ recordUpload: async () => {} }));

const captureAppError = vi.fn(async () => {});
vi.mock("@/lib/app-errors", () => ({
  captureAppError: (...args: unknown[]) => captureAppError(...(args as [])),
}));

const { VendorTimeoutError } = await import("@/lib/ai/http");
const { VendorOutputTruncatedError } = await import("@/lib/ai/provider");
const { POST } = await import("./route");

function photoRequest(): Request {
  const form = new FormData();
  form.append(
    "photo",
    new File([new Uint8Array([1, 2, 3])], "notes.jpg", { type: "image/jpeg" }),
  );
  return new Request("http://localhost/api/extract-minutes", {
    method: "POST",
    body: form,
  });
}

describe("extract-minutes vendor failure chain (P-1)", () => {
  beforeEach(() => {
    refundUsage.mockClear();
    captureAppError.mockClear();
    extractJson.mockReset();
  });

  it("vendor timeout: refunds, records, and says the quota came back (504)", async () => {
    extractJson.mockRejectedValue(new VendorTimeoutError("TestVendor timed out"));
    const res = await POST(photoRequest());
    expect(res.status).toBe(504);
    expect(refundUsage).toHaveBeenCalledTimes(1);
    expect(refundUsage).toHaveBeenCalledWith(7, gateCharge);
    expect(captureAppError).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { error: string };
    // The message must say, in so many words, that the action was returned —
    // "connection dropped" with a silently eaten action is the incident.
    expect(body.error).toContain("dipulangkan");
  });

  it("other vendor throw: refunds, records, generic unreachable message (502)", async () => {
    extractJson.mockRejectedValue(new Error("fetch failed"));
    const res = await POST(photoRequest());
    expect(res.status).toBe(502);
    expect(refundUsage).toHaveBeenCalledTimes(1);
    expect(captureAppError).toHaveBeenCalledTimes(1);
  });

  it("passes the shared route deadline to the vendor call", async () => {
    extractJson.mockResolvedValue({ not: "valid extraction" });
    await POST(photoRequest());
    const req = extractJson.mock.calls[0][0] as { deadlineAt?: number };
    expect(typeof req.deadlineAt).toBe("number");
    expect(req.deadlineAt).toBeGreaterThan(Date.now());
    // Under the 60s kill, with headroom for refund + app_errors + response.
    expect(req.deadlineAt).toBeLessThan(Date.now() + 60_000);
  });

  it("a timeout on the rule-7 retry also refunds and answers 504", async () => {
    extractJson
      .mockResolvedValueOnce({ not: "valid extraction" })
      .mockRejectedValueOnce(new VendorTimeoutError("TestVendor timed out"));
    const res = await POST(photoRequest());
    expect(res.status).toBe(504);
    expect(refundUsage).toHaveBeenCalledTimes(1);
    expect(captureAppError).toHaveBeenCalledTimes(1);
  });

  // 2026-08-28 (J's new-user test): a truncated generation is DETERMINISTIC —
  // the honest answer is "split the document" (413), never "wait a minute and
  // tap again" (502), which bills the member for an identical failure.
  it("output truncation: refunds, records, and says 'split the document' (413)", async () => {
    extractJson.mockRejectedValue(new VendorOutputTruncatedError("TestVendor"));
    const res = await POST(photoRequest());
    expect(res.status).toBe(413);
    expect(refundUsage).toHaveBeenCalledTimes(1);
    expect(captureAppError).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { error: string };
    // Must tell the person the actionable truth in all three languages…
    expect(body.error).toContain("Bahagikan");
    expect(body.error).toContain("分成");
    // …and must NOT invite a retry of the same file.
    expect(body.error).not.toContain("tap the button again");
  });

  it("passes the sized output ceiling to the vendor call", async () => {
    extractJson.mockResolvedValue({ not: "valid extraction" });
    await POST(photoRequest());
    const req = extractJson.mock.calls[0][0] as { maxOutputTokens?: number };
    // 8192 was the ceiling that killed an 8-page constitution at token 8188.
    expect(req.maxOutputTokens).toBeGreaterThan(8192);
  });
});
