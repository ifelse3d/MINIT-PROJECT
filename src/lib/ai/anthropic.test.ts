// ---------------------------------------------------------------------------
// 125 §6 — claude-sonnet-5 could not be called at all: the provider sent
// `temperature` unconditionally and the Claude 5 family answers 400
// "temperature is deprecated for this model". Pins the request body: sent for
// a model that takes it, absent for one that does not. No network: fetch is
// stubbed. (8/31 real-paper finding §4.)
// ---------------------------------------------------------------------------
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acceptsTemperature, createAnthropicProvider } from "./anthropic";

const okReply = {
  content: [{ type: "text", text: '{"ok":true}' }],
  usage: { input_tokens: 10, output_tokens: 5 },
  stop_reason: "end_turn",
};

function stubFetch() {
  const calls: { body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return { ok: true, status: 200, json: async () => okReply, text: async () => "" } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("125 §6 — acceptsTemperature", () => {
  it("the Claude 5 family does not take it; earlier families do", () => {
    expect(acceptsTemperature("claude-sonnet-5")).toBe(false);
    expect(acceptsTemperature("claude-opus-5")).toBe(false);
    expect(acceptsTemperature("claude-fable-5-1")).toBe(false);
    expect(acceptsTemperature("claude-haiku-4-5")).toBe(true);
    expect(acceptsTemperature("claude-haiku-4-5-20251001")).toBe(true);
    expect(acceptsTemperature("claude-sonnet-4-5")).toBe(true);
  });
});

describe("125 §6 — the request body", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.ANTHROPIC_EFFORT;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("claude-sonnet-5: no temperature in the body", async () => {
    const calls = stubFetch();
    const provider = createAnthropicProvider("claude-sonnet-5");
    await provider.extractJson({ prompt: "hi" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).not.toHaveProperty("temperature");
    expect(calls[0].body.model).toBe("claude-sonnet-5");
  });

  it("claude-haiku-4-5: temperature is still sent", async () => {
    const calls = stubFetch();
    const provider = createAnthropicProvider("claude-haiku-4-5");
    await provider.extractJson({ prompt: "hi", temperature: 0 });
    expect(calls[0].body).toHaveProperty("temperature", 0);
  });
});
