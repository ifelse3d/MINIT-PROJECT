// ---------------------------------------------------------------------------
// FUNCTION CALLING — the vendor-independent half.
//
// WHY THIS EXISTS. The assistant can already read this org's confirmed minutes
// (`cari_minit`), but it does so RETRIEVAL-FIRST: every single turn runs a
// vector search over the minutes whether the question needs one or not. That
// was the right way to ship the first tool and the wrong way to ship the next
// five. Asked "how much did we collect in July", a retrieval-first assistant
// searches the MINUTES, finds nothing about July's total, and says so — while
// the answer sits in the donations table it never thought to look at.
//
// The fix is the model choosing. That needs function calling across vendors,
// which the provider layer did not have — the reason `docs/助手重做-设计.md` §5
// lists it as the prerequisite for tools 2 through 6.
//
// THIS FILE HAS NO NETWORK IN IT ON PURPOSE. Everything here is pure: the tool
// contract, the argument checking, and the loop's stopping rules. That is the
// part where a bug is expensive and invisible — a runaway loop is a bill, and a
// mis-parsed argument is the assistant quietly answering about the wrong month.
// The vendor-specific wire formats live in gemini.ts / openai.ts.
//
// 🔴 CLAUDE.md Hard Rule 2 still holds: a tool may READ money and RETURN it.
// No tool computes money. Every total these tools hand back is one Postgres or
// TypeScript already worked out.
//
// 🔴 CLAUDE.md Hard Rule 5 still holds: every tool runs through the USER-SCOPED
// Supabase client. RLS is the boundary, not a sentence in a prompt. This file
// never sees a query — it only decides which named tool the model asked for.
// ---------------------------------------------------------------------------

/** The subset of JSON Schema every vendor here accepts for a parameter. */
export type ToolParamSchema = {
  type: "string" | "number" | "integer" | "boolean";
  description: string;
  /** Allowed values, when the parameter is a closed set. */
  enum?: readonly string[];
};

export type ToolSpec = {
  /** snake_case, stable — it goes on the wire and into the citation trail. */
  name: string;
  /**
   * What this tool is for, written for the MODEL to choose by.
   *
   * The single highest-leverage string in the whole feature. "Search
   * donations" tells a model nothing about when to reach for it; "Use this to
   * answer questions about money the society received — totals, a particular
   * donor, a month" tells it exactly.
   */
  description: string;
  parameters: Record<string, ToolParamSchema>;
  /** Names from `parameters` the model must supply. */
  required?: readonly string[];
};

/** One request from the model to run a tool. */
export type ToolCall = {
  /** Vendor-assigned id, echoed back with the result. "" when the vendor
   *  does not use ids (Gemini matches by function name instead). */
  id: string;
  name: string;
  args: Record<string, unknown>;
};

/** What one turn of the conversation produced. */
export type ToolTurn =
  /** The model wants one or more tools run before it will answer. */
  | { kind: "calls"; calls: ToolCall[] }
  /** The model answered. */
  | { kind: "text"; text: string };

/** One entry in the running conversation, in our own vendor-neutral shape. */
export type ToolMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "assistant_calls"; calls: ToolCall[] }
  | { role: "tool_result"; id: string; name: string; result: unknown };

/**
 * How many times the model may go round before it has to answer in words.
 *
 * Three is enough for the real shapes ("look up the AGM date, then look up the
 * deadline that follows from it"), and it is a CEILING on a bill, not a
 * quality knob. Every round is a metered vendor call: an assistant that can
 * loop freely is one bad prompt away from spending a society's whole month of
 * credit on a question nobody asked twice.
 */
export const MAX_TOOL_ROUNDS = 3;

export type ArgCheck =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Check the model's arguments against the tool's own schema.
 *
 * Rejecting bad arguments is not defensive tidiness — it is the difference
 * between the assistant saying "I could not read that month" and the assistant
 * confidently reporting July's takings when it was asked about June. A model
 * that passes `{"month": "last month"}` where `YYYY-MM` was asked for must be
 * TOLD, so it can correct itself on the next round, which is exactly what
 * function calling is for.
 *
 * Unknown keys are dropped rather than rejected: models add stray fields, the
 * tool would ignore them anyway, and failing the whole call over one would
 * spend a round achieving nothing.
 */
export function checkToolArgs(spec: ToolSpec, raw: unknown): ArgCheck {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: `${spec.name}: arguments must be an object.` };
  }
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(spec.parameters)) {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      if ((spec.required ?? []).includes(key)) {
        return { ok: false, error: `${spec.name}: "${key}" is required.` };
      }
      continue;
    }
    switch (schema.type) {
      case "string": {
        if (typeof value !== "string") {
          return { ok: false, error: `${spec.name}: "${key}" must be text.` };
        }
        if (schema.enum && !schema.enum.includes(value)) {
          return {
            ok: false,
            error: `${spec.name}: "${key}" must be one of ${schema.enum.join(", ")}.`,
          };
        }
        out[key] = value;
        break;
      }
      case "number":
      case "integer": {
        // Models routinely send numbers as strings. Accepting the string is not
        // laxity: refusing it spends a whole round teaching the model something
        // this line can fix for free.
        const n = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(n)) {
          return { ok: false, error: `${spec.name}: "${key}" must be a number.` };
        }
        if (schema.type === "integer" && !Number.isInteger(n)) {
          return { ok: false, error: `${spec.name}: "${key}" must be a whole number.` };
        }
        out[key] = n;
        break;
      }
      case "boolean": {
        if (typeof value === "boolean") out[key] = value;
        else if (value === "true") out[key] = true;
        else if (value === "false") out[key] = false;
        else return { ok: false, error: `${spec.name}: "${key}" must be true or false.` };
        break;
      }
    }
  }
  return { ok: true, args: out };
}

/** JSON Schema for one tool, in the shape both vendors' APIs accept. */
export function toJsonSchema(spec: ToolSpec): {
  type: "object";
  properties: Record<string, ToolParamSchema>;
  required: string[];
} {
  return {
    type: "object",
    properties: spec.parameters,
    required: [...(spec.required ?? [])],
  };
}

export type LoopDecision =
  /** Run these tools and go round again. */
  | { kind: "run"; calls: ToolCall[] }
  /** Hand this text to the user; the conversation is finished. */
  | { kind: "answer"; text: string }
  /**
   * The model kept asking for tools past the ceiling. Tell it to answer with
   * what it already has, and do not run anything else.
   */
  | { kind: "force_answer"; reason: "rounds" };

/**
 * The loop's one decision, as a pure function of the turn and the round.
 *
 * Extracted so the stopping rule can be tested without a vendor. A loop that
 * fails to stop does not throw — it silently spends money, which is the class
 * of bug that only shows up on an invoice.
 */
export function decideNext(turn: ToolTurn, roundsUsed: number): LoopDecision {
  if (turn.kind === "text") return { kind: "answer", text: turn.text };
  if (turn.calls.length === 0) {
    // A "calls" turn with nothing in it is a vendor quirk, not an instruction.
    // Going round again on it would loop forever on some models.
    return { kind: "force_answer", reason: "rounds" };
  }
  if (roundsUsed >= MAX_TOOL_ROUNDS) return { kind: "force_answer", reason: "rounds" };
  return { kind: "run", calls: turn.calls };
}

/**
 * The result a tool hands back to the model when it was called wrongly.
 *
 * Shaped like a normal result rather than thrown, because the model has to SEE
 * it to fix its own call. An exception here would end the conversation with
 * "something went wrong on Minit's side" over a typo the model could have
 * corrected itself.
 */
export function toolArgError(name: string, error: string): { error: string; tool: string } {
  return { tool: name, error };
}
