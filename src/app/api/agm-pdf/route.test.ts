import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// G-3 (work order 27): the AGM pack's identity and membership come from the
// SERVER — org name and PPM from the session, the committee from the database
// roster. Whatever the browser claims about either is DISCARDED. And the
// sample path never wears the real organisation's letterhead.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const buildAgmPackPdf = vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]));
vi.mock("@/lib/agm-pdf", () => ({ buildAgmPackPdf }));

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

let rosterRows: { name: string; position: string; nameOfficial: string | null }[] = [];
vi.mock("@/app/minutes/roster-actions", () => ({
  loadFilingRoster: async () => rosterRows,
}));

const { POST } = await import("./route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/agm-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const REAL_FACTS = {
  year: 2026,
  meetingDateIso: "2026-09-20",
  meetingTimeText: "10:00 pagi",
  venue: "Dewan utama",
};

describe("agm-pdf identity comes from the server (G-3)", () => {
  beforeEach(() => {
    buildAgmPackPdf.mockClear();
    rosterRows = [{ name: "陈大明", position: "Pengerusi", nameOfficial: "TAN TAI BENG" }];
  });

  it("real path: org name, PPM and roster are the DATABASE's, not the body's", async () => {
    const res = await POST(
      post({
        ...REAL_FACTS,
        // A forger's payload: identity/membership claims the schema ignores.
        orgName: "Persatuan Palsu",
        orgRegistrationNo: "PPM-FAKE",
        roster: [{ position: "Pengerusi", personName: "Penipu" }],
      }),
    );
    expect(res.status).toBe(200);
    const [params, opts] = buildAgmPackPdf.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { sample?: boolean },
    ];
    expect(params.orgName).toBe("Persatuan Sebenar Bakti");
    expect(params.orgRegistrationNo).toBe("PPM-777-77-7777");
    expect(params.roster).toEqual([{ position: "Pengerusi", personName: "陈大明" }]);
    expect(opts.sample).toBe(false);
  });

  it("real path with an EMPTY roster: refused honestly, no fiction", async () => {
    rosterRows = [];
    const res = await POST(post(REAL_FACTS));
    expect(res.status).toBe(409);
    expect(buildAgmPackPdf).not.toHaveBeenCalled();
  });

  it("sample path: fictional society's own name, CONTOH — never the real letterhead", async () => {
    const res = await POST(post({ sample: true }));
    expect(res.status).toBe(200);
    const [params, opts] = buildAgmPackPdf.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { sample?: boolean },
    ];
    expect(opts.sample).toBe(true);
    expect(params.orgName).not.toBe("Persatuan Sebenar Bakti");
  });
});
