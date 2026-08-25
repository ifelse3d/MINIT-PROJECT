import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// K-3 (work order 27): the grant wrapper is thin ON PURPOSE — the SECURITY
// DEFINER function in the database is the authority. These tests pin what the
// wrapper itself owes: garbage never reaches the RPC, and the database's
// refusals surface as the right honest reason instead of a generic error.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/db/supabase-server", () => ({
  getSupabaseServer: async () => ({ rpc }),
  getSessionUser: async () => ({ id: "u-1", email: "ops@example.com" }),
}));

const { adminGrantCredits } = await import("./actions");

describe("adminGrantCredits", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("refuses garbage input WITHOUT calling the database", async () => {
    for (const bad of [
      { orgId: 0, delta: 10 },
      { orgId: 1.5, delta: 10 },
      { orgId: 1, delta: 0 },
      { orgId: 1, delta: 3.14 },
      { orgId: 1, delta: 1_000_000 },
    ]) {
      const r = await adminGrantCredits(bad);
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes org, delta and the trimmed note through to the audited RPC", async () => {
    rpc.mockResolvedValue({
      data: [{ org_id: 7, org_name: "Persatuan X", credits_before: 3, credits_after: 103 }],
      error: null,
    });
    const r = await adminGrantCredits({ orgId: 7, delta: 100, note: "  pilot top-up  " });
    expect(rpc).toHaveBeenCalledWith("admin_grant_credits", {
      p_org_id: 7,
      p_delta: 100,
      p_note: "pilot top-up",
    });
    expect(r).toEqual({
      ok: true,
      orgName: "Persatuan X",
      creditsBefore: 3,
      creditsAfter: 103,
    });
  });

  it("maps the database's fail-closed refusal to not_admin", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Not a platform admin" } });
    const r = await adminGrantCredits({ orgId: 7, delta: 100 });
    expect(r).toEqual({ ok: false, reason: "not_admin" });
  });

  it("maps a missing RPC (migration 25 not applied) to db_behind", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.admin_grant_credits" },
    });
    const r = await adminGrantCredits({ orgId: 7, delta: 100 });
    expect(r).toEqual({ ok: false, reason: "db_behind" });
  });
});
