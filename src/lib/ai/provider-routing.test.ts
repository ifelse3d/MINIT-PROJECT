import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requiredAiKeyEnvVars, resolveModel, routedProviders } from "@/lib/ai/provider";

// ---------------------------------------------------------------------------
// P-2 (work order 31): /health must require the keys the ACTUAL routing needs.
//
// The bug: /health derived its one required AI key from the legacy AI_PROVIDER
// value, while the app routes each task by AI_MODEL_* through resolveModel().
// Route chat to OpenAI with no OPENAI_API_KEY and /health still said OK — a
// deployment whose assistant could not answer at all reported itself healthy.
// These tests pin the shared function both /health and `npm run check:ai` now
// read, so the two can never drift apart again.
// ---------------------------------------------------------------------------

const TASK_VARS = [
  "AI_MODEL_CLASSIFY",
  "AI_MODEL_EXTRACT",
  "AI_MODEL_CHAT",
  "AI_MODEL_LONG_DOC",
  "AI_MODEL_WRITE",
] as const;

const saved: Record<string, string | undefined> = {};
function setEnv(vars: Partial<Record<(typeof TASK_VARS)[number] | "AI_PROVIDER", string>>) {
  for (const name of [...TASK_VARS, "AI_PROVIDER"]) {
    if (!(name in saved)) saved[name] = process.env[name];
    const next = vars[name as keyof typeof vars];
    if (next === undefined) delete process.env[name];
    else process.env[name] = next;
  }
}

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("requiredAiKeyEnvVars (P-2)", () => {
  it("chat routed to openai requires OPENAI_API_KEY — the /health blind spot", () => {
    setEnv({ AI_MODEL_CHAT: "openai:gpt-5-nano" });
    expect(requiredAiKeyEnvVars()).toContain("OPENAI_API_KEY");
  });

  it("with no routing set, only the default provider's key is required", () => {
    setEnv({});
    const keys = requiredAiKeyEnvVars();
    expect(keys).toContain("GEMINI_API_KEY");
    expect(keys).not.toContain("OPENAI_API_KEY");
  });

  it("never demands a key for an empty slot nothing is routed to", () => {
    setEnv({ AI_MODEL_CHAT: "openai:gpt-5-nano" });
    const keys = requiredAiKeyEnvVars();
    expect(keys).not.toContain("ANTHROPIC_API_KEY");
    expect(keys).not.toContain("XAI_API_KEY");
  });

  // 97 §8: the "write" dial must be a NO-OP until somebody sets it.
  it('unset AI_MODEL_WRITE resolves "write" to exactly what "long_doc" resolves', () => {
    setEnv({ AI_MODEL_LONG_DOC: "gemini:gemini-3.5-flash-lite" });
    expect(resolveModel("write")).toEqual(resolveModel("long_doc"));
    // And with NOTHING set at all, it still mirrors long_doc's legacy path.
    setEnv({});
    expect(resolveModel("write")).toEqual(resolveModel("long_doc"));
  });

  it("set AI_MODEL_WRITE wins over the long_doc fallback", () => {
    setEnv({
      AI_MODEL_LONG_DOC: "gemini:gemini-3.5-flash-lite",
      AI_MODEL_WRITE: "openai:gpt-5-mini",
    });
    expect(resolveModel("write")).toEqual({ provider: "openai", model: "gpt-5-mini" });
    expect(resolveModel("long_doc")).toEqual({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
    });
  });

  it("an invalid routing value is skipped here, not thrown on", () => {
    // check:ai reports the invalid value as its own problem line; the key list
    // still answers for the tasks that DO resolve.
    setEnv({ AI_MODEL_CHAT: "notavendor:whatever" });
    expect(() => routedProviders()).not.toThrow();
    expect(requiredAiKeyEnvVars()).toContain("GEMINI_API_KEY");
  });
});
