// ---------------------------------------------------------------------------
// AI PROVIDER LAYER — SERVER-SIDE ONLY. Never import from client components.
//
// The app talks to "a vision model that returns JSON", never to a specific
// vendor. Swap vendors with the AI_PROVIDER env var; compare quality without
// touching feature code. Current providers: gemini (dev, free tier).
// Anthropic slots in here later as another ~40-line file.
//
// PDPA WARNING (CLAUDE.md Hard Rule 5): free-tier providers may use inputs
// for training. Sample/fictional data only until a paid tier is configured.
// ---------------------------------------------------------------------------
// "server-only" makes that first line ENFORCED, not just a comment: the build
// now fails if any client component ever imports this file, instead of quietly
// shipping the AI key path into the browser bundle.
import "server-only";

import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from "./gemini";
import { createOpenAiProvider } from "./openai";

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
};

/** Default ceiling on generated tokens. Generous enough for a 30-clause
 *  constitution extraction, small enough that a runaway generation stops. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export interface VisionJsonProvider {
  name: string;
  /** Sends prompt (+ optional image), returns the model's parsed JSON (unknown — caller zod-validates). */
  extractJson(req: VisionJsonRequest): Promise<unknown>;
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
// Format is "provider:model". Provider is `gemini` or `openai`.
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

export type ResolvedModel = { provider: "gemini" | "openai"; model: string };

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
    if ((provider === "gemini" || provider === "openai") && model) {
      return { provider, model };
    }
    throw new Error(
      `${TASK_ENV[task]}="${raw}" is not valid. Use "gemini:<model>" or "openai:<model>", ` +
        `e.g. AI_MODEL_EXTRACT=gemini:${GEMINI_DEFAULT_MODEL}`,
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
  return provider === "openai" ? createOpenAiProvider(model) : createGeminiProvider(model);
}

/** Strips markdown fences some models wrap around JSON, then parses. */
export function parseModelJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}
