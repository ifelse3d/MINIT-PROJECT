import { describe, expect, it } from "vitest";
import {
  geminiToolBody,
  openAiToolBody,
  readGeminiTurn,
  readOpenAiTurn,
} from "@/lib/ai/tool-wire";
import type { ToolMessage, ToolSpec } from "@/lib/ai/tool-core";

const tools: ToolSpec[] = [
  {
    name: "cari_derma",
    description: "Money the society received.",
    parameters: { month: { type: "string", description: "YYYY-MM" } },
    required: ["month"],
  },
];

const conversation: ToolMessage[] = [
  { role: "user", text: "Berapa kita kutip bulan Julai?" },
  { role: "assistant_calls", calls: [{ id: "call_1", name: "cari_derma", args: { month: "2026-07" } }] },
  { role: "tool_result", id: "call_1", name: "cari_derma", result: [{ total_cents: 120000 }] },
];

// ---------------------------------------------------------------------------
// 🔴 These test the shape against the DOCUMENTED formats. Nobody writing this
// can call the live vendors — the keys are J's and the calls are metered
// against a real society's credit. So this is not proof the wire is right; it
// is proof the wire is CONSISTENT and that a mistake is one line to fix.
// ---------------------------------------------------------------------------

describe("geminiToolBody", () => {
  const body = geminiToolBody({
    system: "You are Minit.",
    messages: conversation,
    tools,
    temperature: 0,
    maxOutputTokens: 2048,
  });

  it("puts the system prompt in systemInstruction, not in the conversation", () => {
    expect(body.systemInstruction?.parts[0].text).toBe("You are Minit.");
    expect(JSON.stringify(body.contents)).not.toContain("You are Minit.");
  });

  it("uses only the two roles Gemini knows", () => {
    for (const c of body.contents) expect(["user", "model"]).toContain(c.role);
  });

  // The classic Gemini tool bug: send the result as "model" and the model sees
  // its own function call echoed back as if it had answered, then loops.
  it("sends a tool RESULT as a user turn carrying functionResponse", () => {
    const last = body.contents[body.contents.length - 1];
    expect(last.role).toBe("user");
    expect(JSON.stringify(last.parts)).toContain("functionResponse");
  });

  it("sends the model's own call back as a model turn", () => {
    const middle = body.contents[1];
    expect(middle.role).toBe("model");
    expect(JSON.stringify(middle.parts)).toContain("functionCall");
  });

  // Gemini rejects a functionResponse whose `response` is not an object, with
  // a schema error that names no field. Every one of our tools returns an array.
  it("wraps an array result in an object", () => {
    const last = body.contents[body.contents.length - 1];
    const part = last.parts[0] as { functionResponse: { response: Record<string, unknown> } };
    expect(Array.isArray(part.functionResponse.response)).toBe(false);
    expect(part.functionResponse.response).toHaveProperty("result");
  });

  it("passes an object result through unwrapped", () => {
    const b = geminiToolBody({
      system: "s",
      messages: [{ role: "tool_result", id: "", name: "x", result: { total: 1 } }],
      tools,
      temperature: 0,
      maxOutputTokens: 100,
    });
    const part = b.contents[0].parts[0] as {
      functionResponse: { response: Record<string, unknown> };
    };
    expect(part.functionResponse.response).toEqual({ total: 1 });
  });

  it("declares every tool with its JSON schema", () => {
    expect(body.tools?.[0].functionDeclarations).toHaveLength(1);
    expect(JSON.stringify(body.tools)).toContain("cari_derma");
    expect(JSON.stringify(body.tools)).toContain("month");
  });

  // A model that can still see a tool will still call it. Politeness is not a
  // spending limit.
  it("WITHHOLDS the tools on the final round rather than asking nicely", () => {
    const forced = geminiToolBody({
      system: "s",
      messages: conversation,
      tools,
      temperature: 0,
      maxOutputTokens: 100,
      forceAnswer: true,
    });
    expect(forced.tools).toBeUndefined();
  });

  it("carries the temperature through, including 0", () => {
    expect(body.generationConfig.temperature).toBe(0);
  });
});

describe("readGeminiTurn", () => {
  it("reads a plain text answer", () => {
    const turn = readGeminiTurn({
      candidates: [{ content: { parts: [{ text: "RM 1,200." }] } }],
    });
    expect(turn).toEqual({ kind: "text", text: "RM 1,200." });
  });

  it("reads a function call", () => {
    const turn = readGeminiTurn({
      candidates: [
        { content: { parts: [{ functionCall: { name: "cari_derma", args: { month: "2026-07" } } }] } },
      ],
    });
    expect(turn).toEqual({
      kind: "calls",
      calls: [{ id: "", name: "cari_derma", args: { month: "2026-07" } }],
    });
  });

  // Some models narrate what they are about to look up. Treating that as the
  // answer shows the user "let me check the donations…" and stops there.
  it("prefers the call when the model narrates AND calls", () => {
    const turn = readGeminiTurn({
      candidates: [
        {
          content: {
            parts: [
              { text: "Let me check the donations…" },
              { functionCall: { name: "cari_derma", args: {} } },
            ],
          },
        },
      ],
    });
    expect(turn.kind).toBe("calls");
  });

  it("survives a reply with no candidates at all", () => {
    expect(readGeminiTurn({})).toEqual({ kind: "text", text: "" });
    expect(readGeminiTurn(null)).toEqual({ kind: "text", text: "" });
  });

  it("defaults missing args to an empty object rather than undefined", () => {
    const turn = readGeminiTurn({
      candidates: [{ content: { parts: [{ functionCall: { name: "x" } }] } }],
    });
    if (turn.kind !== "calls") throw new Error("expected calls");
    expect(turn.calls[0].args).toEqual({});
  });
});

describe("openAiToolBody", () => {
  const body = openAiToolBody({
    model: "gpt-5.6-luna",
    system: "You are Minit.",
    messages: conversation,
    tools,
    temperature: 0,
    maxOutputTokens: 2048,
  });

  it("puts the system prompt in instructions", () => {
    expect(body.instructions).toBe("You are Minit.");
  });

  // OpenAI 400s on a function_call_output whose call_id does not match a
  // function_call earlier in the same input. This is why ToolCall has an id.
  it("keeps the call_id the same on the call and on its result", () => {
    const call = body.input.find((i) => "type" in i && i.type === "function_call");
    const output = body.input.find((i) => "type" in i && i.type === "function_call_output");
    expect(call && "call_id" in call ? call.call_id : null).toBe("call_1");
    expect(output && "call_id" in output ? output.call_id : null).toBe("call_1");
  });

  // The other classic mistake: sending objects where the API wants JSON strings.
  it("serialises arguments and output as JSON STRINGS", () => {
    const call = body.input.find((i) => "type" in i && i.type === "function_call");
    const output = body.input.find((i) => "type" in i && i.type === "function_call_output");
    expect(typeof (call as { arguments: unknown }).arguments).toBe("string");
    expect(typeof (output as { output: unknown }).output).toBe("string");
    expect(JSON.parse((call as { arguments: string }).arguments)).toEqual({ month: "2026-07" });
  });

  it("lets the model choose a tool on a normal round", () => {
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toHaveLength(1);
  });

  // The declarations must STAY, or OpenAI cannot make sense of the function_call
  // items already in `input` — but tool_choice stops another one being added.
  it("keeps the declarations but forbids new calls on the final round", () => {
    const forced = openAiToolBody({
      model: "m",
      system: "s",
      messages: conversation,
      tools,
      temperature: 0,
      maxOutputTokens: 100,
      forceAnswer: true,
    });
    expect(forced.tool_choice).toBe("none");
    expect(forced.tools).toHaveLength(1);
  });

  // Some GPT-5 reasoning models reject `temperature` outright rather than
  // ignoring it, so the caller must be able to leave it off entirely.
  it("omits temperature when told to, and sends 0 when told 0", () => {
    expect(body.temperature).toBe(0);
    const none = openAiToolBody({
      model: "m",
      system: "s",
      messages: [],
      tools,
      temperature: null,
      maxOutputTokens: 100,
    });
    expect("temperature" in none).toBe(false);
  });
});

describe("readOpenAiTurn", () => {
  it("reads a plain text answer", () => {
    const turn = readOpenAiTurn({
      output: [{ type: "message", content: [{ type: "output_text", text: "RM 1,200." }] }],
    });
    expect(turn).toEqual({ kind: "text", text: "RM 1,200." });
  });

  it("reads a function call, parsing its argument string", () => {
    const turn = readOpenAiTurn({
      output: [
        {
          type: "function_call",
          call_id: "call_9",
          name: "cari_derma",
          arguments: '{"month":"2026-07"}',
        },
      ],
    });
    expect(turn).toEqual({
      kind: "calls",
      calls: [{ id: "call_9", name: "cari_derma", args: { month: "2026-07" } }],
    });
  });

  // Malformed arguments are the model asking for a tool with no arguments, not
  // a crash: checkToolArgs then reports the missing field and the model gets a
  // round to fix itself, which is what function calling is for.
  it("treats unparseable arguments as no arguments, not as an error", () => {
    const turn = readOpenAiTurn({
      output: [{ type: "function_call", call_id: "c", name: "cari_derma", arguments: "{oops" }],
    });
    if (turn.kind !== "calls") throw new Error("expected calls");
    expect(turn.calls[0].args).toEqual({});
  });

  it("falls back to the item id when there is no call_id", () => {
    const turn = readOpenAiTurn({
      output: [{ type: "function_call", id: "fc_1", name: "x", arguments: "{}" }],
    });
    if (turn.kind !== "calls") throw new Error("expected calls");
    expect(turn.calls[0].id).toBe("fc_1");
  });

  it("survives a reply with no output at all", () => {
    expect(readOpenAiTurn({})).toEqual({ kind: "text", text: "" });
    expect(readOpenAiTurn(null)).toEqual({ kind: "text", text: "" });
  });
});
