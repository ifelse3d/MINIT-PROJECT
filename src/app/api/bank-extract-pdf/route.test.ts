import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// G-3 (work order 27): a bank acts on this document, so NOTHING in it comes
// from the browser — resolutions and bearers from the latest CONFIRMED
// minutes in the database, org name/PPM from the session. The sample path
// stays on the fictional society's own name.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const buildBankExtractPdf = vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]));
vi.mock("@/lib/agm-pdf", () => ({ buildBankExtractPdf }));

vi.mock("@/lib/doc-identity", () => ({
  NOT_SIGNED_IN: { error: "not signed in" },
  getDocumentIdentity: async () => ({
    orgId: 7,
    orgName: "Persatuan Sebenar Bakti",
    ppmNo: "PPM-777-77-7777",
    taxStatus: "none",
    confirmedBy: "Setiausaha Sebenar",
  }),
}));

function confirmedMinutes() {
  const e = structuredClone(emptyMeetingNotesExtraction);
  e.meeting_type = {
    value: "committee",
    confidence: "confirmed",
    source_ref: { location: "p1", snippet: "AJK" },
  };
  e.meeting_date = {
    value: "2026-06-14",
    confidence: "confirmed",
    source_ref: { location: "p1", snippet: "14/6" },
  };
  e.resolutions = [
    {
      text: {
        value: "Meluluskan penukaran penandatangan akaun bank persatuan.",
        confidence: "confirmed",
        source_ref: { location: "p1", snippet: "bank" },
      },
    },
  ];
  return e;
}

let latestConfirmed: { extraction: ReturnType<typeof confirmedMinutes>; confirmedOnIso: string | null } | null =
  null;
vi.mock("@/db/agm", () => ({
  getLatestConfirmedExtraction: async () => latestConfirmed,
}));

const { POST } = await import("./route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/bank-extract-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("bank-extract identity & content come from the server (G-3)", () => {
  beforeEach(() => {
    buildBankExtractPdf.mockClear();
    latestConfirmed = { extraction: confirmedMinutes(), confirmedOnIso: "2026-06-20" };
  });

  it("real path: everything from the DB/session; forged body fields ignored", async () => {
    const res = await POST(
      post({
        // A forger's payload — the schema only knows `sample`.
        orgName: "Persatuan Palsu",
        resolutions: ["Menukar penandatangan kepada Penipu"],
        status: "confirmed",
      }),
    );
    expect(res.status).toBe(200);
    const [m, opts] = buildBankExtractPdf.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { sample?: boolean },
    ];
    expect(m.orgName).toBe("Persatuan Sebenar Bakti");
    expect(m.orgRegistrationNo).toBe("PPM-777-77-7777");
    expect(m.resolutions).toEqual([
      "Meluluskan penukaran penandatangan akaun bank persatuan.",
    ]);
    expect(m.confirmedBy).toBe("Setiausaha Sebenar");
    expect(opts.sample).toBe(false);
  });

  it("no confirmed minutes: an honest 422, never a document", async () => {
    latestConfirmed = null;
    const res = await POST(post({}));
    expect(res.status).toBe(422);
    expect(buildBankExtractPdf).not.toHaveBeenCalled();
  });

  it("sample path: the fictional society's own name, stamped CONTOH", async () => {
    const res = await POST(post({ sample: true }));
    expect(res.status).toBe(200);
    const [m, opts] = buildBankExtractPdf.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { sample?: boolean },
    ];
    expect(opts.sample).toBe(true);
    expect(m.orgName).not.toBe("Persatuan Sebenar Bakti");
  });
});
