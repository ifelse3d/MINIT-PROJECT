import { describe, expect, it } from "vitest";
import {
  MAX_TOOL_ROUNDS,
  checkToolArgs,
  decideNext,
  toJsonSchema,
  type ToolSpec,
} from "@/lib/ai/tool-core";

const moneySpec: ToolSpec = {
  name: "cari_derma",
  description: "Money the society received.",
  parameters: {
    month: { type: "string", description: "YYYY-MM" },
    limit: { type: "integer", description: "How many rows" },
    include_unreceipted: { type: "boolean", description: "Include rows with no receipt" },
    order: { type: "string", description: "Sort order", enum: ["newest", "largest"] },
  },
  required: ["month"],
};

describe("checkToolArgs", () => {
  it("passes a well-formed call through", () => {
    const r = checkToolArgs(moneySpec, { month: "2026-07", limit: 20 });
    expect(r).toEqual({ ok: true, args: { month: "2026-07", limit: 20 } });
  });

  it("refuses a missing required argument", () => {
    const r = checkToolArgs(moneySpec, { limit: 5 });
    expect(r.ok).toBe(false);
  });

  // Rejecting bad arguments is the difference between "I could not read that
  // month" and confidently reporting July when asked about June.
  it("refuses a required argument that is empty", () => {
    expect(checkToolArgs(moneySpec, { month: "" }).ok).toBe(false);
    expect(checkToolArgs(moneySpec, { month: null }).ok).toBe(false);
  });

  it("refuses a value outside a closed set", () => {
    const r = checkToolArgs(moneySpec, { month: "2026-07", order: "cheapest" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("newest");
  });

  it("accepts a value inside a closed set", () => {
    expect(checkToolArgs(moneySpec, { month: "2026-07", order: "largest" }).ok).toBe(true);
  });

  // Models routinely send numbers as strings. Refusing would spend a whole
  // metered round teaching the model what one line can fix for free.
  it("accepts a number sent as a string, and returns it as a number", () => {
    const r = checkToolArgs(moneySpec, { month: "2026-07", limit: "20" });
    expect(r).toEqual({ ok: true, args: { month: "2026-07", limit: 20 } });
  });

  it("refuses a number that is not one", () => {
    expect(checkToolArgs(moneySpec, { month: "2026-07", limit: "twenty" }).ok).toBe(false);
    expect(checkToolArgs(moneySpec, { month: "2026-07", limit: "NaN" }).ok).toBe(false);
  });

  it("refuses a fraction where a whole number was asked for", () => {
    expect(checkToolArgs(moneySpec, { month: "2026-07", limit: 2.5 }).ok).toBe(false);
  });

  it("accepts a boolean sent as a string", () => {
    const r = checkToolArgs(moneySpec, { month: "2026-07", include_unreceipted: "true" });
    expect(r).toEqual({ ok: true, args: { month: "2026-07", include_unreceipted: true } });
  });

  it("refuses a boolean that is neither true nor false", () => {
    expect(checkToolArgs(moneySpec, { month: "2026-07", include_unreceipted: "maybe" }).ok).toBe(
      false,
    );
  });

  // Models add stray fields. The tool would ignore them anyway, and failing the
  // call over one would spend a round achieving nothing.
  it("drops unknown keys instead of failing the call", () => {
    const r = checkToolArgs(moneySpec, { month: "2026-07", reasoning: "because" });
    expect(r).toEqual({ ok: true, args: { month: "2026-07" } });
  });

  it("omits optional arguments that were not supplied", () => {
    const r = checkToolArgs(moneySpec, { month: "2026-07" });
    if (!r.ok) throw new Error("expected ok");
    expect(Object.keys(r.args)).toEqual(["month"]);
  });

  it("refuses arguments that are not an object at all", () => {
    expect(checkToolArgs(moneySpec, null).ok).toBe(false);
    expect(checkToolArgs(moneySpec, "2026-07").ok).toBe(false);
    expect(checkToolArgs(moneySpec, ["2026-07"]).ok).toBe(false);
  });
});

describe("toJsonSchema", () => {
  it("produces the object schema both vendors accept", () => {
    const schema = toJsonSchema(moneySpec);
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toContain("month");
    expect(schema.required).toEqual(["month"]);
  });

  it("gives an empty required list rather than undefined", () => {
    const schema = toJsonSchema({ ...moneySpec, required: undefined });
    expect(schema.required).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The stopping rule. A loop that fails to stop does not throw — it silently
// spends money, which is the class of bug that only shows up on an invoice.
// ---------------------------------------------------------------------------
describe("decideNext", () => {
  const call = { id: "1", name: "cari_derma", args: { month: "2026-07" } };

  it("answers when the model answered", () => {
    expect(decideNext({ kind: "text", text: "RM 1,200." }, 0)).toEqual({
      kind: "answer",
      text: "RM 1,200.",
    });
  });

  it("runs the tools the model asked for", () => {
    expect(decideNext({ kind: "calls", calls: [call] }, 0)).toEqual({
      kind: "run",
      calls: [call],
    });
  });

  it("still runs on the last allowed round", () => {
    expect(decideNext({ kind: "calls", calls: [call] }, MAX_TOOL_ROUNDS - 1).kind).toBe("run");
  });

  it("stops at the ceiling and makes the model answer with what it has", () => {
    expect(decideNext({ kind: "calls", calls: [call] }, MAX_TOOL_ROUNDS)).toEqual({
      kind: "force_answer",
      reason: "rounds",
    });
  });

  it("never runs past the ceiling, however many rounds have gone by", () => {
    expect(decideNext({ kind: "calls", calls: [call] }, 99).kind).toBe("force_answer");
  });

  // A "calls" turn with nothing in it is a vendor quirk, not an instruction.
  // Treating it as "go round again" loops forever on some models.
  it("does not go round again on an empty list of calls", () => {
    expect(decideNext({ kind: "calls", calls: [] }, 0).kind).toBe("force_answer");
  });

  it("has a ceiling low enough to bound one question's cost", () => {
    // Not a style assertion: every round is a metered vendor call, and this
    // number is the multiplier on what one question can cost.
    expect(MAX_TOOL_ROUNDS).toBeLessThanOrEqual(4);
  });
});
