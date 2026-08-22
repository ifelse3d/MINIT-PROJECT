import { describe, expect, it } from "vitest";
import { runToolConversation } from "@/lib/ai/tool-runner";
import { MAX_TOOL_ROUNDS, type ToolSpec, type ToolTurn } from "@/lib/ai/tool-core";
import type { ToolChatProvider, ToolChatRequest } from "@/lib/ai/provider";

const tools: ToolSpec[] = [
  {
    name: "cari_derma",
    description: "Money received.",
    parameters: { month: { type: "string", description: "YYYY-MM" } },
  },
];

/** A provider that reads from a script instead of a vendor. */
function scripted(turns: ToolTurn[]): ToolChatProvider & { seen: ToolChatRequest[] } {
  const seen: ToolChatRequest[] = [];
  let i = 0;
  return {
    name: "scripted",
    seen,
    async chatWithTools(req) {
      seen.push(req);
      const turn = turns[Math.min(i, turns.length - 1)];
      i++;
      return turn;
    },
  };
}

const call = (name: string, args: Record<string, unknown> = {}) => ({ id: "c1", name, args });

// ---------------------------------------------------------------------------
// The loop that decides how much one question costs. Every round is a metered
// vendor call, so "does it stop" is not a style question.
// ---------------------------------------------------------------------------
describe("runToolConversation", () => {
  it("answers in one vendor call when the model needs no tool", async () => {
    const provider = scripted([{ kind: "text", text: "Selamat pagi." }]);
    const r = await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "hello" }],
      tools,
      run: async () => ({}),
    });
    expect(r).toMatchObject({ text: "Selamat pagi.", vendorCalls: 1, hitCeiling: false });
    expect(r.used).toEqual([]);
  });

  it("runs the tool, feeds the result back, and answers", async () => {
    const provider = scripted([
      { kind: "calls", calls: [call("cari_derma", { month: "2026-07" })] },
      { kind: "text", text: "RM 1,200 in July." },
    ]);
    const ran: string[] = [];
    const r = await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "how much in July?" }],
      tools,
      run: async (name) => {
        ran.push(name);
        return { total_cents: 120000 };
      },
    });
    expect(r.text).toBe("RM 1,200 in July.");
    expect(ran).toEqual(["cari_derma"]);
    expect(r.used).toEqual([{ name: "cari_derma", args: { month: "2026-07" } }]);
    expect(r.vendorCalls).toBe(2);
  });

  // The model must SEE what it asked for and what came back, or the second
  // round is it answering from nothing.
  it("shows the model its own call and the result on the next round", async () => {
    const provider = scripted([
      { kind: "calls", calls: [call("cari_derma", { month: "2026-07" })] },
      { kind: "text", text: "done" },
    ]);
    await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async () => ({ total_cents: 1 }),
    });
    const second = provider.seen[1];
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant_calls", "tool_result"]);
  });

  it("runs several tools in one round, in the order asked", async () => {
    const provider = scripted([
      { kind: "calls", calls: [call("a"), call("b")] },
      { kind: "text", text: "ok" },
    ]);
    const ran: string[] = [];
    await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async (name) => {
        ran.push(name);
        return {};
      },
    });
    expect(ran).toEqual(["a", "b"]);
  });

  // THE ONE THAT MATTERS. A loop that fails to stop does not throw — it
  // silently spends a society's whole month of credit.
  it("stops a model that never stops asking for tools", async () => {
    const provider = scripted([{ kind: "calls", calls: [call("cari_derma")] }]);
    let runs = 0;
    const r = await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async () => {
        runs++;
        return {};
      },
    });
    expect(r.hitCeiling).toBe(true);
    // Bounded, and bounded tightly: the ceiling plus the forced final answer.
    expect(r.vendorCalls).toBeLessThanOrEqual(MAX_TOOL_ROUNDS + 1);
    expect(runs).toBeLessThanOrEqual(MAX_TOOL_ROUNDS);
  });

  it("asks with the tools withheld on the final round", async () => {
    const provider = scripted([{ kind: "calls", calls: [call("cari_derma")] }]);
    await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async () => ({}),
    });
    expect(provider.seen[provider.seen.length - 1].forceAnswer).toBe(true);
  });

  // A model that answers on the way out should be believed, even though the
  // ceiling was what made it answer.
  it("keeps the text when the forced round finally produces one", async () => {
    let i = 0;
    const provider: ToolChatProvider = {
      name: "scripted",
      async chatWithTools(req) {
        i++;
        return req.forceAnswer
          ? { kind: "text", text: "I could not find it." }
          : { kind: "calls", calls: [call("cari_derma")] };
      },
    };
    const r = await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async () => ({}),
    });
    expect(r.text).toBe("I could not find it.");
    expect(r.hitCeiling).toBe(true);
    expect(i).toBeGreaterThan(1);
  });

  // A "calls" turn with nothing in it is a vendor quirk. Going round again on
  // it loops forever on some models.
  it("does not loop on an empty list of calls", async () => {
    const provider = scripted([{ kind: "calls", calls: [] }]);
    const r = await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async () => ({}),
    });
    expect(r.vendorCalls).toBeLessThanOrEqual(MAX_TOOL_ROUNDS + 1);
    expect(r.hitCeiling).toBe(true);
  });

  // Metering counts ACTUAL vendor calls, not turns (CLAUDE.md rule 10, as
  // amended 2026-08-21). An assistant that took three calls while the meter
  // counted one would make the cost model a fiction.
  it("passes onUsage to every round, so all of them are metered", async () => {
    const provider = scripted([
      { kind: "calls", calls: [call("cari_derma")] },
      { kind: "text", text: "ok" },
    ]);
    let seen = 0;
    await runToolConversation({
      provider,
      system: "s",
      messages: [{ role: "user", text: "q" }],
      tools,
      run: async () => ({}),
      onUsage: () => {
        seen++;
      },
    });
    expect(provider.seen.every((r) => typeof r.onUsage === "function")).toBe(true);
    expect(seen).toBe(0); // the fake provider never calls it; the wiring is what is asserted
  });

  it("does not mutate the caller's message array", async () => {
    const messages = [{ role: "user" as const, text: "q" }];
    const provider = scripted([
      { kind: "calls", calls: [call("cari_derma")] },
      { kind: "text", text: "ok" },
    ]);
    await runToolConversation({
      provider,
      system: "s",
      messages,
      tools,
      run: async () => ({}),
    });
    expect(messages).toHaveLength(1);
  });
});
