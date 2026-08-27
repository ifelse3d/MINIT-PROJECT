// ---------------------------------------------------------------------------
// xAI (GROK) provider — SERVER-SIDE ONLY. Same shape as the other three.
//
// xAI serves an OpenAI-COMPATIBLE endpoint (/v1/chat/completions with the same
// request and response fields), so this file is deliberately a near-copy of
// openai.ts with a different base URL and key. That similarity is the point: if
// Grok scores differently in `npm run eval`, it is the model that differs, not
// the request shape.
//
// 🔴 THE PRICE TABLE BELOW IS EMPTY, ON PURPOSE.
//    Every other vendor file in this folder carries prices that were checked on
//    a stated date. Nobody has checked xAI's yet. The house rule (gemini.ts) is:
//    a model missing from the table yields costMicros = null — "we do not know"
//    — instead of a number someone invented. A null shows up in /admin as a
//    blank cost cell, which is the correct and visible consequence.
//
//    TO TURN GROK ON PROPERLY, two things, in this order:
//      1. J: get a key at console.x.ai and put it in XAI_API_KEY
//      2. read the current per-million input/output prices off x.ai's pricing
//         page and add one row per model below, WITH the date you checked
//    Until step 2, Grok will answer questions but will not report what it cost.
//
// 🔴 XAI_API_KEY is read at CALL time. An empty key breaks exactly one thing —
//    a request actually routed here — and nothing else in the app.
// ---------------------------------------------------------------------------

import "server-only";

import type { TokenUsage, VisionJsonProvider, VisionJsonRequest } from "./provider";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  parseModelJson,
  VendorOutputTruncatedError,
} from "./provider";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 900, 2_600];

const API_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Prices per 1M tokens in USD. STILL EMPTY — see the header for why an empty
 * table is the correct state rather than a guessed one.
 *
 * J read these off console.x.ai on 2026-08-22. They are recorded here as a
 * COMMENT, not as rows, because the console shows DISPLAY NAMES and the table
 * below is keyed by API MODEL ID — and nobody has confirmed the mapping yet.
 * A row under a guessed id would price nothing (the id never matches) or, worse,
 * price the wrong model. Confirm the ids from GET https://api.x.ai/v1/models,
 * then move these into the table with the date.
 *
 *   Grok 4.6              in 2.00  out 6.00   (cached in 0.50)  500K ctx
 *   Grok 4.5              in 2.00  out 6.00   (cached in 0.30)  500K ctx
 *   Grok 4.3              in 1.25  out 2.50   (cached in 0.20)  1M ctx
 *   Grok 4.20             in 1.25  out 2.50   (cached in 0.20)  1M ctx
 *   Grok 4.20 (Non-Reas.) in 1.25  out 2.50   (cached in 0.20)  1M ctx
 *   Grok Build 0.1        in 1.00  out 2.00   (cached in 0.20)  256K ctx
 *
 * ⚠ Worth knowing before anyone spends time wiring this up: the CHEAPEST Grok
 *   above (1.00 / 2.00) is still 3.3x the input price of the incumbent
 *   gemini-3.5-flash-lite (0.30 / 2.50), and 20x the price of gpt-5-nano on the
 *   classify slot (0.05 / 0.40). Grok is not the cheap option for Minit's
 *   workload; if it wins anything it will be on accuracy, not on price.
 *
 * Add rows as: "grok-x-y": { in: 0.00, out: 0.00 }, // checked YYYY-MM-DD
 */
export const PRICES_PER_MTOK_USD: Record<string, { in: number; out: number }> = {};

function costMicrosFor(model: string, inTok: number, outTok: number): number | null {
  const p = PRICES_PER_MTOK_USD[model];
  if (!p) return null;
  return Math.round(((inTok / 1e6) * p.in + (outTok / 1e6) * p.out) * 1e6);
}

function isTransient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type XaiResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function createXaiProvider(model: string): VisionJsonProvider {
  return {
    name: "xai",

    async extractJson({
      prompt,
      imageBase64,
      mimeType,
      maxOutputTokens,
      temperature,
      onUsage,
    }: VisionJsonRequest): Promise<unknown> {
      const key = process.env.XAI_API_KEY;
      if (!key) {
        throw new Error(
          "XAI_API_KEY tiada dalam .env.local / missing — add it and restart the server."
        );
      }

      // Same "high" default as openai.ts, and for the same reason: a 3000x4000
      // phone photo sent at full resolution is the single most expensive way to
      // ask a cheap question.
      const detail = process.env.OPENAI_IMAGE_DETAIL ?? "high";

      const content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail: string } }
      > = [{ type: "text", text: prompt }];
      if (imageBase64 && mimeType) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail },
        });
      }

      const body = JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        max_tokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: temperature ?? DEFAULT_TEMPERATURE,
        response_format: { type: "json_object" },
      });

      let lastError: Error = new Error("xAI: no attempt was made.");

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const res = await fetch(API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body,
            signal: controller.signal,
          });

          if (!res.ok) {
            // PDPA: status + vendor message only, never the request contents.
            const detailText = await res.text().catch(() => "");
            const err = new Error(`xAI API ${res.status}: ${detailText.slice(0, 300)}`);
            if (isTransient(res.status) && attempt < MAX_ATTEMPTS - 1) {
              lastError = err;
              continue;
            }
            throw err;
          }

          const json = (await res.json()) as XaiResponse;

          // Report cost even if the answer turns out unusable — it was billed.
          if (onUsage && json.usage) {
            const inTok = json.usage.prompt_tokens ?? 0;
            const outTok = json.usage.completion_tokens ?? 0;
            const usage: TokenUsage = {
              inputTokens: inTok,
              outputTokens: outTok,
              model,
              provider: "xai",
              costMicros: costMicrosFor(model, inTok, outTok),
            };
            try {
              onUsage(usage);
            } catch {
              // bookkeeping must never break the user's request
            }
          }

          const choice = json.choices?.[0];
          if (choice?.finish_reason === "length") {
            throw new VendorOutputTruncatedError("xAI");
          }

          const text = choice?.message?.content;
          if (!text) throw new Error("xAI returned an empty response.");
          return parseModelJson(text);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          const isAbort = err.name === "AbortError";
          const worthRetrying =
            isAbort || err.message.includes("fetch failed") || err.message.includes("ECONN");
          if (worthRetrying && attempt < MAX_ATTEMPTS - 1) {
            lastError = isAbort ? new Error(`xAI timed out after ${REQUEST_TIMEOUT_MS}ms`) : err;
            continue;
          }
          throw isAbort ? new Error(`xAI timed out after ${REQUEST_TIMEOUT_MS}ms`) : err;
        } finally {
          clearTimeout(timer);
        }
      }

      throw lastError;
    },
  };
}
