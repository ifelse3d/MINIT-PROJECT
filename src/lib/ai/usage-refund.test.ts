import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// A REFUND MUST GIVE THE QUOTA BACK AND KEEP THE COST (2026-08-21)
//
// 0bd7c6b shipped refundUsage() as a DELETE and said so in its own commit
// message: "a refund also erases the cost figure for a call we really did pay
// the vendor for". Nothing failed when it did that — the row was simply gone,
// the meter looked right, and the only casualty was the one number the whole
// commercial case rests on (docs/方案与权益设计.md section 5.1).
//
// That is exactly the kind of bug a test has to hold, because no user, no type
// and no build ever notices it. These tests mock the database client and assert
// the SHAPE of what refundUsage sends: an update stamping refunded_at, and
// never a delete while the column exists.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; payload?: unknown; filters: string[] };

const calls: Call[] = [];
/** Set to an error to simulate a database WITHOUT the refunded_at column. */
let updateError: { message: string; code?: string } | null = null;
/** 122 §3: whether migration 45's functions exist in the fake database.
 *  Default false = the old path, which is what the tests above were written
 *  against and what a database behind the migration still runs. */
let rpcAvailable = false;
const rpcCalls: { fn: string; args: unknown }[] = [];

function builder(table: string, op: string, payload?: unknown) {
  const call: Call = { table, op, payload, filters: [] };
  calls.push(call);
  const chain = {
    eq(col: string, val: unknown) {
      call.filters.push(`${col}=${String(val)}`);
      return chain;
    },
    is(col: string, val: unknown) {
      call.filters.push(`${col} is ${String(val)}`);
      return chain;
    },
    gte(col: string) {
      call.filters.push(`${col}>=`);
      return chain;
    },
    lt(col: string) {
      call.filters.push(`${col}<`);
      return chain;
    },
    select() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({ data: { extra_credits: 3 } });
    },
    then(resolve: (v: { error: unknown }) => unknown) {
      return Promise.resolve({
        error: op === "update" && table === "ai_usage" ? updateError : null,
      }).then(resolve);
    },
  };
  return chain;
}

const fakeClient = {
  rpc(fn: string, args: unknown) {
    rpcCalls.push({ fn, args });
    if (!rpcAvailable) {
      return Promise.resolve({
        data: null,
        error: {
          code: "PGRST202",
          message: `Could not find the function public.${fn} in the schema cache`,
        },
      });
    }
    return Promise.resolve({ data: true, error: null });
  },
  from(table: string) {
    return {
      update: (payload: unknown) => builder(table, "update", payload),
      delete: () => builder(table, "delete"),
      select: () => builder(table, "select"),
      insert: (payload: unknown) => builder(table, "insert", payload),
    };
  },
};

vi.mock("@/db/supabase", () => ({ getSupabase: () => fakeClient }));
vi.mock("@/db/supabase-server", () => ({
  getSupabaseServer: async () => fakeClient,
}));
vi.mock("@/lib/active-org", () => ({ getActiveOrg: async () => null }));

const { refundUsage } = await import("./usage");

describe("refundUsage", () => {
  beforeEach(() => {
    calls.length = 0;
    rpcCalls.length = 0;
    updateError = null;
    rpcAvailable = false;
  });

  it("stamps refunded_at instead of deleting the row", async () => {
    await refundUsage(7, { rowId: 42, spentCredit: false });

    const usageCalls = calls.filter((c) => c.table === "ai_usage");
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0].op).toBe("update");
    expect(usageCalls[0].payload).toHaveProperty("refunded_at");
    // The cost figure lives on this row. Deleting it is the bug.
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("scopes the stamp to one row of one org", async () => {
    await refundUsage(7, { rowId: 42, spentCredit: false });
    expect(calls[0].filters).toContain("id=42");
    expect(calls[0].filters).toContain("org_id=7");
  });

  it("gives a spent credit back as well", async () => {
    await refundUsage(7, { rowId: 42, spentCredit: true });
    const orgUpdate = calls.find(
      (c) => c.table === "orgs" && c.op === "update",
    );
    expect(orgUpdate?.payload).toEqual({ extra_credits: 4 });
  });

  it("still refunds on a database where the column does not exist yet", async () => {
    // D8 says schema first, code second. If the order slips, the member must
    // still get their action back rather than silently paying for a call that
    // never reached a vendor.
    updateError = { message: 'column "refunded_at" does not exist' };
    await refundUsage(7, { rowId: 42, spentCredit: false });

    const ops = calls.filter((c) => c.table === "ai_usage").map((c) => c.op);
    expect(ops).toEqual(["update", "delete"]);
  });

  // 122 §3 (2026-09-07): the delete fallback is for ONE error only.
  it("deletes on 42703 (undefined column) by code, not just by wording", async () => {
    updateError = { code: "42703", message: "column does not exist" };
    await refundUsage(7, { rowId: 42, spentCredit: false });
    const ops = calls.filter((c) => c.table === "ai_usage").map((c) => c.op);
    expect(ops).toEqual(["update", "delete"]);
  });

  it("does NOT delete the row — and its cost — on any other error", async () => {
    // A network blip while stamping used to erase the cost record along with
    // the refund. The row must stay; the failure is recorded instead.
    updateError = { code: "57014", message: "canceling statement due to statement timeout" };
    await refundUsage(7, { rowId: 42, spentCredit: false });
    const ops = calls.filter((c) => c.table === "ai_usage").map((c) => c.op);
    expect(ops).toEqual(["update"]);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
    // and it was reported, not swallowed
    expect(calls.some((c) => c.table === "app_errors" && c.op === "insert")).toBe(true);
  });

  it("gives a spent credit back through refund_ai_credit once migration 45 is in", async () => {
    rpcAvailable = true;
    await refundUsage(7, { rowId: 42, spentCredit: true });
    expect(rpcCalls).toEqual([{ fn: "refund_ai_credit", args: { p_org_id: 7 } }]);
    // no read-then-write on orgs any more
    expect(calls.some((c) => c.table === "orgs")).toBe(false);
  });

  it("falls back to the read-then-write credit refund while 45 is not applied", async () => {
    rpcAvailable = false;
    await refundUsage(7, { rowId: 42, spentCredit: true });
    expect(rpcCalls[0]?.fn).toBe("refund_ai_credit");
    const orgUpdate = calls.find((c) => c.table === "orgs" && c.op === "update");
    expect(orgUpdate?.payload).toEqual({ extra_credits: 4 });
  });
});

describe("what the member is charged vs what we paid", () => {
  it("the monthly meter excludes refunded rows", async () => {
    const { getUsage } = await import("./usage");
    calls.length = 0;
    await getUsage(7);

    const countCall = calls.find((c) => c.table === "ai_usage");
    // Refunded actions were never charged to the member, so they must not
    // appear in the meter. They DO stay in the table with their cost.
    expect(countCall?.filters).toContain("refunded_at is null");
  });
});
