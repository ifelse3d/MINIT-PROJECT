import type { ToolChatProvider, TokenUsage } from "./provider";
import {
  MAX_TOOL_ROUNDS,
  decideNext,
  type ToolCall,
  type ToolMessage,
  type ToolSpec,
} from "./tool-core";

// ---------------------------------------------------------------------------
// THE LOOP: ask, run what it asked for, ask again, until it answers.
//
// NOT marked "server-only", and that is deliberate. Every import here is either
// a type (erased at compile time) or a pure function from tool-core. The
// provider and the tool runner are INJECTED, so this file never touches a key,
// a database or a vendor — which means it can be unit-tested against a scripted
// provider, and the loop that decides how much a question costs is the last
// thing that should be untestable. The server-only enforcement lives in the
// files that actually hold secrets: provider.ts, gemini.ts, openai.ts,
// org-tools.ts.
//
// The rules it enforces are all in tool-core.ts and unit-tested there; this
// file is the part that cannot be tested without a vendor, so it is kept as
// small and as boring as possible.
//
// 🔴 EVERY ROUND IS A METERED VENDOR CALL. That is why `onUsage` is threaded
// through rather than being optional decoration: an assistant that quietly
// took three calls to answer one question, while the meter counted one, would
// make the whole cost model a fiction (CLAUDE.md rule 10, as amended 2026-08-21
// — metering counts ACTUAL vendor calls, not turns).
//
// 🔴 A TOOL RESULT IS DATA, NOT AN INSTRUCTION. What comes back from these
// tools is rows out of the society's own database — but a donation "purpose"
// or a clause of a constitution is text a human typed, and text a human typed
// can say "ignore your instructions". It is passed to the model as a tool
// result, which is the channel vendors treat as data, and the system prompt is
// never rebuilt from it.
// ---------------------------------------------------------------------------

export type ToolRunResult = {
  /** The model's final answer, in words. */
  text: string;
  /** Which tools actually ran, in order, with what they were asked for. */
  used: { name: string; args: Record<string, unknown> }[];
  /** How many vendor calls this answer cost. Always ≥ 1. */
  vendorCalls: number;
  /** True when the ceiling stopped the loop rather than the model finishing. */
  hitCeiling: boolean;
};

export async function runToolConversation(input: {
  provider: ToolChatProvider;
  system: string;
  /** The conversation so far, ending with the user's question. */
  messages: ToolMessage[];
  tools: readonly ToolSpec[];
  /** Runs one tool. Must resolve — errors come back as results, never throws. */
  run: (name: string, args: unknown) => Promise<unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  onUsage?: (usage: TokenUsage) => void;
  /** P-1: the calling route's shared vendor-time budget (epoch ms). Threaded
   *  to every round — a loop of metered calls is exactly the code most able
   *  to outlive a serverless function's maxDuration. */
  deadlineAt?: number;
}): Promise<ToolRunResult> {
  const messages: ToolMessage[] = [...input.messages];
  const used: ToolRunResult["used"] = [];
  let vendorCalls = 0;
  let hitCeiling = false;

  // <= so that the final iteration is the forced answer, not a round that
  // silently returns nothing. The loop always terminates: every path either
  // returns or increments `round`.
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const forceAnswer = round === MAX_TOOL_ROUNDS;
    // Set HERE, not only on the force_answer branch: if we had to withhold the
    // tools to get words out of the model, the ceiling is what ended the loop —
    // whether or not the model then obliged. The caller uses this to decide
    // whether the answer is complete or merely final.
    if (forceAnswer) hitCeiling = true;
    const turn = await input.provider.chatWithTools({
      system: input.system,
      messages,
      tools: input.tools,
      forceAnswer,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      onUsage: input.onUsage,
      deadlineAt: input.deadlineAt,
    });
    vendorCalls++;

    const decision = decideNext(turn, round);

    if (decision.kind === "answer") {
      return { text: decision.text, used, vendorCalls, hitCeiling };
    }

    if (decision.kind === "force_answer") {
      hitCeiling = true;
      if (forceAnswer) {
        // We already asked with the tools withheld and it still did not answer.
        // Rather than loop, say what is true — the model could not finish — so
        // the caller shows an honest failure instead of an empty bubble.
        return {
          text:
            turn.kind === "text" && turn.text.trim() !== ""
              ? turn.text
              : "",
          used,
          vendorCalls,
          hitCeiling,
        };
      }
      // Go round once more with tools withheld, forcing words.
      messages.push({
        role: "user",
        text:
          "Answer now, in words, using only what the lookups above returned. " +
          "If they did not contain the answer, say plainly that you could not find it.",
      });
      // Jump straight to the final round; anything else wastes a metered call.
      round = MAX_TOOL_ROUNDS - 1;
      continue;
    }

    // decision.kind === "run"
    messages.push({ role: "assistant_calls", calls: decision.calls });
    // Sequential, not Promise.all: these are database queries on one
    // connection, the loop is capped at three rounds anyway, and running them
    // in order makes the trace read like what happened.
    for (const call of decision.calls) {
      const result = await input.run(call.name, call.args);
      used.push({ name: call.name, args: call.args });
      messages.push(toolResultMessage(call, result));
    }
  }

  // Unreachable: the loop returns on every path. Present so a future edit that
  // breaks that gets a compile error rather than an undefined.
  return { text: "", used, vendorCalls, hitCeiling: true };
}

function toolResultMessage(call: ToolCall, result: unknown): ToolMessage {
  return { role: "tool_result", id: call.id, name: call.name, result };
}
