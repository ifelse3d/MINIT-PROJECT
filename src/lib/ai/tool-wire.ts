// ---------------------------------------------------------------------------
// FUNCTION CALLING — the two wire formats, as pure functions.
//
// WHY THIS IS A SEPARATE FILE FROM gemini.ts / openai.ts.
//
// 🔴 Nobody writing this code can call the live vendors to check it. The keys
// are J's, the calls are metered against a real society's credit, and the whole
// point of the provider layer is that a vendor can be swapped without anyone
// re-testing feature code. So the shape of the request and the reading of the
// response — the part most likely to be subtly wrong — is written here, with no
// network in it, and unit-tested against the documented formats.
//
// That does NOT make it verified. It makes a wire mistake findable in one file
// and fixable in one line, instead of buried in a retry loop. The first real
// call against each vendor is still the moment of truth; see
// `C:\dev\_J-要做的事\18-HANDOFF-…` for what to check.
//
// Two vendors, deliberately, not four: gemini and openai are the two with keys
// (docs/助手重做-设计.md §5 — "gemini ＋ openai 两家就够"). anthropic and xai
// keep working for everything else; they simply report that they cannot do
// tools, and the caller falls back to the retrieval-first path that has been
// shipping since 2026-08-22.
// ---------------------------------------------------------------------------

import {
  toJsonSchema,
  type ToolCall,
  type ToolMessage,
  type ToolSpec,
  type ToolTurn,
} from "./tool-core";

// ===========================================================================
// GEMINI — generateContent with `tools[].functionDeclarations`
// ===========================================================================

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiToolBody = {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: GeminiPart[] }[];
  tools?: { functionDeclarations: unknown[] }[];
  generationConfig: { temperature: number; maxOutputTokens: number };
};

/**
 * Build one generateContent request.
 *
 * Gemini's `contents` only knows two roles, "user" and "model". A tool RESULT
 * is not a role of its own: it is a `functionResponse` part sent as "user",
 * because from the model's point of view the result is something the outside
 * world told it. Getting this wrong is the classic Gemini tool bug — the model
 * sees its own function call echoed as if it had answered, and loops.
 */
export function geminiToolBody(input: {
  system: string;
  messages: readonly ToolMessage[];
  tools: readonly ToolSpec[];
  temperature: number;
  maxOutputTokens: number;
  /** True on the final round: the model must answer in words now. */
  forceAnswer?: boolean;
}): GeminiToolBody {
  const contents: GeminiToolBody["contents"] = [];

  for (const m of input.messages) {
    switch (m.role) {
      case "user":
        contents.push({ role: "user", parts: [{ text: m.text }] });
        break;
      case "assistant":
        contents.push({ role: "model", parts: [{ text: m.text }] });
        break;
      case "assistant_calls":
        contents.push({
          role: "model",
          parts: m.calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        });
        break;
      case "tool_result":
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.name,
                // Gemini requires an OBJECT here. A tool that returns an array
                // (every one of ours does) has to be wrapped, or the request is
                // rejected with a schema error that names no field.
                response: wrapResult(m.result),
              },
            },
          ],
        });
        break;
    }
  }

  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents,
    // On the final round the tools are WITHHELD rather than the model being
    // asked nicely to stop. A model that can still see a tool will still call
    // it, and politeness is not a spending limit.
    tools: input.forceAnswer
      ? undefined
      : [
          {
            functionDeclarations: input.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: toJsonSchema(t),
            })),
          },
        ],
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
    },
  };
}

/** Gemini needs a JSON object; our tools return arrays and scalars too. */
function wrapResult(result: unknown): Record<string, unknown> {
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { result };
}

/** Read one generateContent reply. */
export function readGeminiTurn(json: unknown): ToolTurn {
  const parts =
    (json as { candidates?: { content?: { parts?: GeminiPart[] } }[] })?.candidates?.[0]?.content
      ?.parts ?? [];

  const calls: ToolCall[] = [];
  const texts: string[] = [];
  for (const p of parts) {
    if ("functionCall" in p && p.functionCall?.name) {
      calls.push({
        // Gemini matches a result to a call BY NAME — there is no id on the
        // wire. Ours stays empty so nothing downstream invents one and then
        // relies on it.
        id: "",
        name: p.functionCall.name,
        args: (p.functionCall.args ?? {}) as Record<string, unknown>,
      });
    } else if ("text" in p && typeof p.text === "string") {
      texts.push(p.text);
    }
  }
  // Calls win over text when both are present: some models narrate what they
  // are about to look up. Treating that narration as the answer would show the
  // user "let me check the donations…" and stop there.
  if (calls.length > 0) return { kind: "calls", calls };
  return { kind: "text", text: texts.join("").trim() };
}

// ===========================================================================
// OPENAI — the Responses API, `tools[].type = "function"`
// ===========================================================================

type OpenAiInputItem =
  | { role: "user" | "assistant"; content: { type: "input_text" | "output_text"; text: string }[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

export type OpenAiToolBody = {
  model: string;
  instructions: string;
  input: OpenAiInputItem[];
  tools?: unknown[];
  tool_choice?: "auto" | "none";
  max_output_tokens: number;
  temperature?: number;
};

/**
 * Build one /v1/responses request.
 *
 * Unlike Gemini, OpenAI matches a result to a call by `call_id`, and it is
 * strict about it: a `function_call_output` whose id does not match a
 * `function_call` earlier in the same input is a 400. That is why ToolCall
 * carries an id at all.
 *
 * `arguments` and `output` are JSON STRINGS, not objects. Sending objects is
 * the other classic mistake here.
 */
export function openAiToolBody(input: {
  model: string;
  system: string;
  messages: readonly ToolMessage[];
  tools: readonly ToolSpec[];
  temperature: number | null;
  maxOutputTokens: number;
  forceAnswer?: boolean;
}): OpenAiToolBody {
  const items: OpenAiInputItem[] = [];

  for (const m of input.messages) {
    switch (m.role) {
      case "user":
        items.push({ role: "user", content: [{ type: "input_text", text: m.text }] });
        break;
      case "assistant":
        items.push({ role: "assistant", content: [{ type: "output_text", text: m.text }] });
        break;
      case "assistant_calls":
        for (const c of m.calls) {
          items.push({
            type: "function_call",
            call_id: c.id,
            name: c.name,
            arguments: JSON.stringify(c.args ?? {}),
          });
        }
        break;
      case "tool_result":
        items.push({
          type: "function_call_output",
          call_id: m.id,
          output: JSON.stringify(m.result ?? null),
        });
        break;
    }
  }

  const body: OpenAiToolBody = {
    model: input.model,
    instructions: input.system,
    input: items,
    max_output_tokens: input.maxOutputTokens,
  };
  if (input.temperature !== null) body.temperature = input.temperature;
  if (input.forceAnswer) {
    // tool_choice: "none" rather than dropping the tools: OpenAI needs the
    // declarations to still be present to make sense of the function_call items
    // already in `input`, but must not be allowed to add another.
    body.tools = input.tools.map(toolDeclaration);
    body.tool_choice = "none";
  } else {
    body.tools = input.tools.map(toolDeclaration);
    body.tool_choice = "auto";
  }
  return body;
}

function toolDeclaration(t: ToolSpec) {
  return {
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: toJsonSchema(t),
  };
}

/** Read one /v1/responses reply. */
export function readOpenAiTurn(json: unknown): ToolTurn {
  const output =
    (
      json as {
        output?: {
          type?: string;
          call_id?: string;
          id?: string;
          name?: string;
          arguments?: string;
          content?: { type?: string; text?: string }[];
        }[];
      }
    )?.output ?? [];

  const calls: ToolCall[] = [];
  const texts: string[] = [];
  for (const item of output) {
    if (item.type === "function_call" && item.name) {
      calls.push({
        id: item.call_id ?? item.id ?? "",
        name: item.name,
        // A model that emits malformed JSON arguments is asking for a tool with
        // no arguments, not a crash: checkToolArgs then reports the missing
        // required field and the model gets a round to fix it.
        args: safeParseArgs(item.arguments),
      });
    } else {
      for (const c of item.content ?? []) {
        if (typeof c.text === "string") texts.push(c.text);
      }
    }
  }
  if (calls.length > 0) return { kind: "calls", calls };
  return { kind: "text", text: texts.join("").trim() };
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
