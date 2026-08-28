import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// THE PAGE-LIMIT REJECTION MUST NOT EAT A CHARGED ACTION (26 号报告 2-2)
//
// The forced-kind path ("Minit was not sure — the person tapped the type and
// re-sent") charges the EXTRACT action at the quota gate, before the per-kind
// page limit runs. When that limit then rejects the file, no vendor was ever
// reached — and "the vendor was never reached" is the one thing a refund means
// (CLAUDE.md rule 10). Before this fix, retrying the same too-big PDF three
// times burned a fifth of a month's trial quota while the AI read nothing.
//
// The classify path is the mirror-image control: there the only charge so far
// paid for a classify call that really ran, so nothing is refunded.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const refundUsage = vi.fn(async () => {});
const checkAndRecordUsage = vi.fn(async () => ({ rowId: 99, spentCredit: false }));
const gateCharge = { rowId: 42, spentCredit: false };

vi.mock("@/lib/ai/usage", () => ({
  refundUsage,
  checkAndRecordUsage,
  createUsageRecorder: () => () => {},
  requireAiQuota: async () => ({
    ok: true,
    org: { id: 7, name: "Persatuan Ujian" },
    charges: [gateCharge],
  }),
}));

const extractJson = vi.fn(async () => ({
  kind: "meeting_notes",
  language_detected: "ms",
}));
vi.mock("@/lib/ai/provider", () => ({
  getVisionProvider: () => ({ name: "fake", extractJson }),
}));

// The two page-limit calls: the generic "unknown" cap at the top of the route
// passes; the per-kind cap (checked once the kind is known) rejects.
// importOriginal keeps countPdfPages (the D44 fence uses it) — the STATE §6
// trap: a vi.mock that misses a newly-imported export 500s the whole file.
vi.mock("@/lib/pdf-pages", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/pdf-pages")>();
  return {
    ...real,
    checkPageLimit: async (_bytes: ArrayBuffer, _mime: string, kind: string) =>
      kind === "unknown"
        ? { ok: true, pages: 10 }
        : { ok: false, pages: 10, limit: 5 },
  };
});

vi.mock("@/lib/glossary-server", () => ({ loadGlossary: async () => [] }));
vi.mock("@/lib/record-upload", () => ({ recordUpload: async () => {} }));
vi.mock("@/lib/app-errors", () => ({ captureAppError: async () => {} }));

const { POST } = await import("./route");

function requestWith(kind?: string): Request {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "ledger.pdf", {
      type: "application/pdf",
    }),
  );
  if (kind) form.append("kind", kind);
  return new Request("http://localhost/api/intake", {
    method: "POST",
    body: form,
  });
}

describe("intake page-limit rejection vs the quota (26 号报告 2-2)", () => {
  beforeEach(() => {
    refundUsage.mockClear();
    checkAndRecordUsage.mockClear();
    extractJson.mockClear();
  });

  it("forced kind: refunds the extract charge the gate took up front", async () => {
    const res = await POST(requestWith("meeting_notes"));
    expect(res.status).toBe(400);
    // No vendor call happened on this path at all.
    expect(extractJson).not.toHaveBeenCalled();
    expect(refundUsage).toHaveBeenCalledTimes(1);
    expect(refundUsage).toHaveBeenCalledWith(7, gateCharge);
  });

  it("classify path: the classify call really ran, so nothing is refunded", async () => {
    const res = await POST(requestWith());
    expect(res.status).toBe(400);
    // The classifier was paid for and used; the extract action was never
    // charged (the rejection happens before checkAndRecordUsage).
    expect(extractJson).toHaveBeenCalledTimes(1);
    expect(checkAndRecordUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });
});
