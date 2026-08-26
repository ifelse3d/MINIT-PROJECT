// ---------------------------------------------------------------------------
// AI PROVIDER LAYER — SERVER-SIDE ONLY. Never import from client components.
//
// The app talks to "a vision model that returns JSON", never to a specific
// vendor. Swap vendors with the AI_MODEL_* env vars; compare quality without
// touching feature code. Providers as of 2026-08-22: gemini and openai (in
// use), anthropic and xai (slots built 2026-08-22, keys not set yet — an unset
// key costs nothing until a task is actually routed there; see AI_PROVIDERS).
//
// PDPA WARNING (CLAUDE.md Hard Rule 5): free-tier providers may use inputs
// for training. Sample/fictional data only until a paid tier is configured.
// ---------------------------------------------------------------------------
// "server-only" makes that first line ENFORCED, not just a comment: the build
// now fails if any client component ever imports this file, instead of quietly
// shipping the AI key path into the browser bundle.
import "server-only";

import type { ToolMessage, ToolSpec, ToolTurn } from "./tool-core";
import { createAnthropicProvider } from "./anthropic";
import { createGeminiProvider, createGeminiToolProvider, GEMINI_DEFAULT_MODEL } from "./gemini";
import { createOpenAiProvider, createOpenAiToolProvider } from "./openai";
import { createXaiProvider } from "./xai";

/**
 * What one vendor call actually cost. Captured from the vendor's own response
 * (Gemini returns `usageMetadata`; it was previously thrown away).
 *
 * `costMicros` is worked out AT THE TIME OF THE CALL and stored, never
 * recomputed later: vendors change their prices, and a historical row that
 * silently re-prices itself makes gross margin impossible to calculate.
 * (2026-07-29 交接与设计决策, D2.)
 */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Exact model id the vendor served, e.g. "gemini-3.5-flash-lite". */
  model: string;
  /** Provider name, e.g. "gemini". */
  provider: string;
  /** Cost in USD millionths (integer). 1_000_000 = US$1. null = no price known. */
  costMicros: number | null;
};

export type VisionJsonRequest = {
  /** Full instruction prompt (from /src/prompts) */
  prompt: string;
  /** Base64 image data (no data: prefix). Omit for text-only requests. */
  imageBase64?: string;
  /** e.g. "image/jpeg" — required when imageBase64 is present */
  mimeType?: string;
  /**
   * Cap on generated tokens. Output is 3–5x the price of input, so an
   * unbounded generation is the single most expensive way to fail
   * (2026-07-29 交接与设计决策, D3 item 3). Defaults to DEFAULT_MAX_OUTPUT_TOKENS.
   */
  maxOutputTokens?: number;
  /**
   * OPTIONAL. Called once per successful vendor call with what it cost.
   * Deliberately optional so that adding cost tracking did not require
   * touching all 16 existing call sites at once — routes opt in one line
   * at a time. See src/app/api/extract-ledger/route.ts for the pattern.
   */
  onUsage?: (usage: TokenUsage) => void;
  /**
   * Sampling temperature. Defaults to DEFAULT_TEMPERATURE — see there for why
   * this product never wants a creative answer. Only set it if a measurement
   * says a particular task is better with variation.
   */
  temperature?: number;
  /**
   * P-1 (2026-08-27): epoch-ms moment the calling route must be done with
   * vendor calls — `Date.now() + ROUTE_AI_DEADLINE_MS` computed ONCE at the top
   * of the route and shared by all its calls. Without it, retries can outlive
   * Vercel's maxDuration and the kill runs no refund and logs nothing (the
   * ai_usage id=5 incident). Honoured by the gemini and openai providers (the
   * two with keys); optional so the rest keep compiling unchanged.
   */
  deadlineAt?: number;
};

/**
 * 0. Not a hedge — a product decision (J, 2026-08-22: "这我不懂，所以你看怎样合适").
 *
 * Every single thing Minit asks a model to do is a reading job with one right
 * answer: what does this handwritten page say, which of three document types is
 * this, what do these minutes state. Temperature is the knob that makes a model
 * pick a less likely word on purpose; there is no version of "less likely" that
 * helps here. It costs accuracy on extraction (Hard Rule 1: never invent) and
 * it makes bugs unreproducible — the same photo giving two different totals on
 * two taps is a support call nobody can answer.
 *
 * It also makes the eval mean something: `npm run eval` compares models against
 * golden cases, and a run that varies at random compares noise.
 *
 * Gemini has always used 0 here. OpenAI was silently running at ITS default of
 * 1, which is why chat answers moved around between identical questions.
 */
export const DEFAULT_TEMPERATURE = 0;

/** Default ceiling on generated tokens. Generous enough for a 30-clause
 *  constitution extraction, small enough that a runaway generation stops. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export interface VisionJsonProvider {
  name: string;
  /** Sends prompt (+ optional image), returns the model's parsed JSON (unknown — caller zod-validates). */
  extractJson(req: VisionJsonRequest): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// FUNCTION CALLING — a SECOND, separate interface, on purpose.
//
// Every existing call site wants exactly one thing: prompt in, JSON out. Tool
// use is a conversation with several round trips, its own stopping rules and
// its own failure modes. Folding it into VisionJsonProvider would put a
// `tools?` on sixteen call sites that will never pass one, and would make an
// unrelated change to the path every extraction in the product runs through.
//
// Two vendors implement it: gemini and openai — the two with keys, and what
// docs/助手重做-设计.md §5 asks for ("gemini ＋ openai 两家就够"). anthropic and
// xai keep working for everything else and simply report that they cannot do
// tools, so the caller falls back to the retrieval-first assistant that has
// been shipping since 2026-08-22. Adding one later is a file, not a redesign.
// ---------------------------------------------------------------------------

export type ToolChatRequest = {
  /** The system prompt. Kept out of the message list; both vendors want it apart. */
  system: string;
  messages: readonly ToolMessage[];
  tools: readonly ToolSpec[];
  /**
   * Last round: the model must answer in words now.
   *
   * Enforced on the wire (tools withheld / tool_choice "none"), never by asking
   * the model nicely — see tool-wire.ts.
   */
  forceAnswer?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  onUsage?: (usage: TokenUsage) => void;
  /** P-1: same contract as VisionJsonRequest.deadlineAt — the route's shared
   *  budget across every round of a tool conversation. */
  deadlineAt?: number;
};

export interface ToolChatProvider {
  name: string;
  chatWithTools(req: ToolChatRequest): Promise<ToolTurn>;
}

// ---------------------------------------------------------------------------
// ONE MODEL PER TASK — the point of this section
//
// Minit does four jobs with very different difficulty, and until 2026-08-03 it
// used the SAME (expensive) model for all four:
//
//   classify  "is this a meeting note or a ledger page?" — a 3-way choice.
//             A flagship here is pure waste; it is 35 of ~120 calls a month.
//   extract   handwritten mixed-language pages. THE HARD ONE. Accuracy is the
//             product; do not economise here — measure and then choose.
//   chat      short text Q&A.
//   long_doc  a 30-page constitution. The only genuinely expensive item.
//
// Splitting them cuts the bill ~80–90% with almost no accuracy risk, because
// the savings come from classify and chat, where a small model is as good as a
// large one. See `2026-08-03-AI-API-选型与成本.md` §1.5.
//
// HOW TO CHANGE A MODEL (this is the whole answer to "what if a new model
// comes out?"): set the env var for that ONE task in Vercel and redeploy.
// No code change, no new file, no risk to the other three tasks.
//
//     AI_MODEL_EXTRACT = openai:gpt-5.6-luna
//     AI_MODEL_CLASSIFY = openai:gpt-5-nano
//
// Format is "provider:model". Provider is one of AI_PROVIDERS below
// (gemini · openai · anthropic · xai).
// Full runbook: `2026-08-03-换模型手册.md`.
// ---------------------------------------------------------------------------

export type AiTask = "classify" | "extract" | "chat" | "long_doc";

/** Where a task's model comes from when no env var is set.
 *  Conservative on purpose: everything defaults to what the app already used,
 *  so adding this routing layer changed NOTHING until someone opts in. */
const TASK_ENV: Record<AiTask, string> = {
  classify: "AI_MODEL_CLASSIFY",
  extract: "AI_MODEL_EXTRACT",
  chat: "AI_MODEL_CHAT",
  long_doc: "AI_MODEL_LONG_DOC",
};

/**
 * Every vendor this app can be pointed at. Adding a name here is HALF the job —
 * the other half is a file in this folder and a row in PROVIDER_KEY_ENV below,
 * or the routing will resolve to a vendor nothing knows how to call.
 *
 * 2026-08-22: anthropic and xai were added as EMPTY SLOTS, so that comparing
 * Claude / Grok against Gemini becomes "paste a key, change one line" instead
 * of "wait for a code change". Neither key is set yet; see AiProviderName below
 * for what an unset key does (and does not) break.
 */
export const AI_PROVIDERS = ["gemini", "openai", "anthropic", "xai"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

/**
 * Which env var holds each vendor's key. Used by `npm run check:ai` to report
 * "key present / key missing" WITHOUT ever printing a key.
 *
 * 🔴 A MISSING KEY IS NOT A CRASH. Every provider file reads its key inside
 * extractJson(), i.e. at call time. An unset ANTHROPIC_API_KEY does nothing at
 * all until some task is actually routed to anthropic — and then it fails that
 * one request with a named error. The app boots, builds, and runs every other
 * task normally. That is what makes an empty slot safe to ship.
 */
export const PROVIDER_KEY_ENV: Record<AiProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
};

function isProviderName(s: string): s is AiProviderName {
  return (AI_PROVIDERS as readonly string[]).includes(s);
}

export type ResolvedModel = { provider: AiProviderName; model: string };

/**
 * Resolve one task to a provider + model.
 *
 * Order: the task's own env var → AI_PROVIDER/GEMINI_MODEL (the old settings,
 * still honoured so nothing breaks) → the built-in default.
 */
export function resolveModel(task: AiTask): ResolvedModel {
  const raw = process.env[TASK_ENV[task]];
  if (raw && raw.includes(":")) {
    const [provider, ...rest] = raw.split(":");
    const model = rest.join(":").trim();
    if (isProviderName(provider) && model) {
      return { provider, model };
    }
    throw new Error(
      `${TASK_ENV[task]}="${raw}" is not valid. Use one of ` +
        AI_PROVIDERS.map((p) => `"${p}:<model>"`).join(" / ") +
        `, e.g. AI_MODEL_EXTRACT=gemini:${GEMINI_DEFAULT_MODEL}`,
    );
  }

  // Legacy settings — kept working on purpose (D8: never break the running app
  // to introduce a new mechanism).
  const legacy = process.env.AI_PROVIDER ?? "gemini";
  if (legacy === "openai") {
    return { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna" };
  }
  if (legacy === "gemini") {
    return { provider: "gemini", model: process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL };
  }
  throw new Error(`Unknown AI_PROVIDER "${legacy}" — supported: gemini, openai`);
}

/**
 * The provider to use for a task, already bound to that task's model.
 *
 * Defaults to "extract" so that every existing call site keeps working
 * unchanged — and keeps using the careful model, not the cheap one. A route
 * opts into a cheaper tier by saying what it is actually doing:
 *
 *     getVisionProvider("classify")
 */
export function getVisionProvider(task: AiTask = "extract"): VisionJsonProvider {
  const { provider, model } = resolveModel(task);
  switch (provider) {
    case "openai":
      return createOpenAiProvider(model);
    case "anthropic":
      return createAnthropicProvider(model);
    case "xai":
      return createXaiProvider(model);
    case "gemini":
      return createGeminiProvider(model);
  }
}

/** Vendors that can run tools today. Everything else still works — it just
 *  cannot be the one holding the tools. */
export const TOOL_CAPABLE_PROVIDERS: readonly AiProviderName[] = ["gemini", "openai"];

export function providerSupportsTools(provider: AiProviderName): boolean {
  return TOOL_CAPABLE_PROVIDERS.includes(provider);
}

/**
 * The tool-calling provider for a task, or null when the configured vendor
 * cannot do tools.
 *
 * null is a normal answer, not an error: the caller falls back to the
 * retrieval-first assistant. Throwing here would mean that pointing
 * AI_MODEL_CHAT at Claude — a perfectly reasonable thing to try — broke the
 * assistant outright instead of making it slightly less clever.
 */
export function getToolProvider(task: AiTask = "chat"): ToolChatProvider | null {
  const { provider, model } = resolveModel(task);
  switch (provider) {
    case "gemini":
      return createGeminiToolProvider(model);
    case "openai":
      return createOpenAiToolProvider(model);
    default:
      return null;
  }
}

/** Strips markdown fences some models wrap around JSON, then parses. */
export function parseModelJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}
