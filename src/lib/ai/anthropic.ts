// ---------------------------------------------------------------------------
// ANTHROPIC provider — SERVER-SIDE ONLY. Same shape as gemini.ts / openai.ts on
// purpose: timeout, transient retry, an output ceiling, and captured usage.
//
// Raw HTTP against POST /v1/messages, no SDK — deliberately, and this is the
// one place this file departs from Anthropic's own house style:
//   · the other two vendor files here are ~200 lines of `fetch` with no
//     dependency; adding @anthropic-ai/sdk for one of three vendors would make
//     this layer asymmetric and put a package install between J and a model
//     comparison. The Messages API surface used below (messages, image block,
//     usage, stop_reason) is stable and documented.
//   · if this file ever needs tool use, streaming, or structured outputs with a
//     schema, STOP and add the SDK properly. Do not grow this by hand.
//
// ⚠ TWO THINGS TO KNOW BEFORE COMPARING THIS AGAINST GEMINI
//
// 1. JSON comes from the PROMPT, not from a schema. Anthropic supports
//    structured outputs (output_config.format), but Minit's prompts already ask
//    for JSON and parseModelJson() already strips markdown fences, which is what
//    the other two providers rely on. Keeping all three identical is what makes
//    `npm run eval` a comparison of MODELS rather than of three differently
//    tuned request shapes.
//
// 2. Thinking is left at the model's own default (no `thinking` parameter).
//    That is on purpose but it is NOT free: on claude-sonnet-5 the default is
//    adaptive thinking, which is slower and bills thinking tokens as output.
//    Hence REQUEST_TIMEOUT_MS below is 45s, not the 20s the other two use —
//    timing a vendor out mid-thought would report "Anthropic is broken" when the
//    honest answer is "we did not wait for it".
//    Set ANTHROPIC_EFFORT=low|medium to trade depth for cost and latency.
//
// 🔴 ANTHROPIC_API_KEY is read at CALL time, not at import time. An empty key
//    breaks exactly one thing — a request actually routed here — and nothing
//    else in the app. That is what makes this a safe empty slot.
// ---------------------------------------------------------------------------

import "server-only";

import type { TokenUsage, VisionJsonProvider, VisionJsonRequest } from "./provider";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  parseModelJson,
  VendorOutputTruncatedError,
} from "./provider";

/** 45s, not 20s. See note 2 in the header — this is a fairness setting. */
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 900, 2_600];

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

// ---------------------------------------------------------------------------
// Prices per 1M tokens in USD, from Anthropic's published pricing, checked
// 2026-08-22. Same rule as gemini.ts / openai.ts: a model that is not in this
// table yields costMicros = null, never a guess.
//
// ⚠ claude-sonnet-5 is on an INTRO price of $2 / $10 that ENDS 2026-08-31 —
//   from 2026-09-01 it is $3 / $15. The number below is the POST-INTRO price,
//   because a cost comparison made this month must not quote a floor that
//   disappears in nine days. Stored rows keep the price they were charged at
//   (D2), so this only affects calls made from today onwards.
// ---------------------------------------------------------------------------
export const PRICES_PER_MTOK_USD: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1.0, out: 5.0 }, // checked 2026-08-22 — 200K context
  "claude-sonnet-5": { in: 3.0, out: 15.0 }, // post-intro; intro $2/$10 until 2026-08-31
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 }, // checked 2026-08-22
  "claude-opus-5": { in: 5.0, out: 25.0 }, // checked 2026-08-22 — almost certainly overkill here
};

function costMicrosFor(model: string, inTok: number, outTok: number): number | null {
  const p = PRICES_PER_MTOK_USD[model];
  if (!p) return null;
  return Math.round(((inTok / 1e6) * p.in + (outTok / 1e6) * p.out) * 1e6);
}

function isTransient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type AnthropicContentBlock = { type?: string; text?: string };
type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** Joins every text block. Non-text blocks (thinking) are skipped: their text is
 *  not part of the answer and must never reach JSON.parse. */
function outputTextOf(json: AnthropicResponse): string {
  return (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

export function createAnthropicProvider(model: string): VisionJsonProvider {
  return {
    name: "anthropic",

    async extractJson({
      prompt,
      imageBase64,
      mimeType,
      maxOutputTokens,
      temperature,
      onUsage,
    }: VisionJsonRequest): Promise<unknown> {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        throw new Error(
          "ANTHROPIC_API_KEY tiada dalam .env.local / missing — add it and restart the server."
        );
      }

      // Image first, then the instruction: Anthropic's vision guidance is that a
      // single image placed before the text performs better.
      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      > = [];
      if (imageBase64 && mimeType) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: mimeType, data: imageBase64 },
        });
      }
      content.push({ type: "text", text: prompt });

      const effort = process.env.ANTHROPIC_EFFORT;
      const body = JSON.stringify({
        model,
        max_tokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content }],
        temperature: temperature ?? DEFAULT_TEMPERATURE,
        ...(effort ? { output_config: { effort } } : {}),
      });

      let lastError: Error = new Error("Anthropic: no attempt was made.");

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const res = await fetch(API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": API_VERSION,
            },
            body,
            signal: controller.signal,
          });

          if (!res.ok) {
            // PDPA: status + vendor message only, never the request contents.
            const detailText = await res.text().catch(() => "");
            const err = new Error(`Anthropic API ${res.status}: ${detailText.slice(0, 300)}`);
            if (isTransient(res.status) && attempt < MAX_ATTEMPTS - 1) {
              lastError = err;
              continue;
            }
            throw err;
          }

          const json = (await res.json()) as AnthropicResponse;

          // Report cost even if the answer turns out unusable — it was billed.
          if (onUsage && json.usage) {
            const inTok = json.usage.input_tokens ?? 0;
            const outTok = json.usage.output_tokens ?? 0;
            const usage: TokenUsage = {
              inputTokens: inTok,
              outputTokens: outTok,
              model,
              provider: "anthropic",
              costMicros: costMicrosFor(model, inTok, outTok),
            };
            try {
              onUsage(usage);
            } catch {
              // bookkeeping must never break the user's request
            }
          }

          if (json.stop_reason === "max_tokens") {
            throw new VendorOutputTruncatedError("Anthropic");
          }

          // A safety decline arrives as HTTP 200. Without this branch it would
          // surface as "empty response", which sends the reader looking for a
          // network problem that is not there.
          if (json.stop_reason === "refusal") {
            throw new Error(
              `Anthropic declined this request (${json.stop_details?.category ?? "no category"}).`
            );
          }

          const text = outputTextOf(json);
          if (!text) throw new Error("Anthropic returned an empty response.");
          return parseModelJson(text);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          const isAbort = err.name === "AbortError";
          const worthRetrying =
            isAbort || err.message.includes("fetch failed") || err.message.includes("ECONN");
          if (worthRetrying && attempt < MAX_ATTEMPTS - 1) {
            lastError = isAbort
              ? new Error(`Anthropic timed out after ${REQUEST_TIMEOUT_MS}ms`)
              : err;
            continue;
          }
          throw isAbort ? new Error(`Anthropic timed out after ${REQUEST_TIMEOUT_MS}ms`) : err;
        } finally {
          clearTimeout(timer);
        }
      }

      throw lastError;
    },
  };
}
