// ---------------------------------------------------------------------------
// GEMINI provider — SERVER-SIDE ONLY (key comes from .env.local, never the
// browser). REST call, no SDK needed. Model is env-configurable because
// Google retires models (2.0 Flash was shut down Jun 2026); default is the
// current free-tier model, verified 12 Jul 2026.
//
// 2026-08-03 — four things added, all of them about money (see
// `2026-08-03-AI-API-选型与成本.md`):
//
//   1. TIMEOUT. There was none. A hung vendor call held the serverless
//      function open until maxDuration (60s) and the user just waited.
//   2. RETRY on 429 / 503 / network. The free tier returns 429 as a matter of
//      course — on 18 Jul an ENTIRE eval run died this way (all 10 cases,
//      chat-backup-2026-07-21/08). In production the same failure is called
//      "the treasurer's quota was charged and no receipt came out".
//      (1 and 2 moved to ./http.ts on 2026-08-23 — openai.ts had grown its own
//      slightly different copy, and neither had ever been tested. One copy, 15
//      tests.)
//   3. maxOutputTokens. Output costs 3–5x input, so a runaway generation is
//      the most expensive possible failure (D3 item 3).
//   4. usageMetadata is CAPTURED instead of discarded. Google was already
//      returning the token counts; we were throwing them away, which is why
//      gross margin is currently unknowable (D2).
//
// PDPA (Hard Rule 5): nothing here logs prompts, images or responses.
// ---------------------------------------------------------------------------

// Enforced, not just documented: the build fails if a client component
// imports this file, so GEMINI_API_KEY can never reach the browser.
import "server-only";

import type {
  ToolChatProvider,
  ToolChatRequest,
  TokenUsage,
  VisionJsonProvider,
  VisionJsonRequest,
} from "./provider";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  parseModelJson,
  VendorOutputTruncatedError,
} from "./provider";
import type { ToolTurn } from "./tool-core";
import { geminiToolBody, readGeminiTurn } from "./tool-wire";
import { postVendorJson } from "./http";

export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";

// ---------------------------------------------------------------------------
// Prices per 1M tokens in USD, from ai.google.dev/gemini-api/docs/pricing,
// checked 2026-08-03.
//
// ⚠ THIS TABLE GOES STALE. It exists so that cost is worked out and stored at
// the moment of the call — a historical row must never re-price itself when
// Google changes their rates (D2). When you add a model here, add the date you
// checked it. If a model is missing, costMicros comes back null rather than
// wrong; a null is honest, a guess is not.
// ---------------------------------------------------------------------------
export const PRICES_PER_MTOK_USD: Record<string, { in: number; out: number }> = {
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 }, // checked 2026-08-03
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 }, // checked 2026-08-18 — the extractor
  "gemini-3-flash": { in: 0.5, out: 3.0 }, // checked 2026-08-03
  "gemini-3.5-flash": { in: 1.5, out: 9.0 }, // checked 2026-08-18
  // ⏳ 3.6 and 3.7 are on a promotion that ENDS 2026-12-31; both double to
  // $1.50 / $7.50 on 2027-01-01. Stored rows keep the price they were charged
  // at, so this only has to be right for calls made from today onwards.
  "gemini-3.6-flash": { in: 0.75, out: 3.75 }, // checked 2026-08-18
  "gemini-3.7-flash": { in: 0.75, out: 3.75 }, // checked 2026-08-18
};

function costMicrosFor(model: string, inTok: number, outTok: number): number | null {
  const p = PRICES_PER_MTOK_USD[model];
  if (!p) return null;
  const usd = (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
  return Math.round(usd * 1e6);
}

export function createGeminiProvider(model: string): VisionJsonProvider {
  return {
    name: "gemini",

    async extractJson({
      prompt,
      imageBase64,
      mimeType,
      maxOutputTokens,
      temperature,
      onUsage,
      deadlineAt,
      timeoutMs,
    }: VisionJsonRequest): Promise<unknown> {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error(
          "GEMINI_API_KEY tiada dalam .env.local / missing — add it and restart the server."
        );
      }

      const parts: Array<
        { text: string } | { inline_data: { mime_type: string; data: string } }
      > = [{ text: prompt }];
      if (imageBase64 && mimeType) {
        parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
      }

      // The timeout, the transient retry and the backoff live in ./http.ts —
      // ONE copy, 15 tests. They used to be written out here and again in
      // openai.ts, and the two copies had already drifted apart. (2026-08-23.)
      const json = (await postVendorJson({
        vendor: "Gemini",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: { "x-goog-api-key": key },
        deadlineAt,
        timeoutMs,
        body: {
          contents: [{ parts }],
          generationConfig: {
            // 0 unless a caller overrides it — see DEFAULT_TEMPERATURE in provider.ts.
            temperature: temperature ?? DEFAULT_TEMPERATURE,
            responseMimeType: "application/json",
            maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          },
        },
      })) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
        }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };

      const candidate = json.candidates?.[0];

      // Report the cost even when the answer turns out unusable — it was
      // still charged by Google, so it must still appear in our numbers.
      if (onUsage && json.usageMetadata) {
        const inTok = json.usageMetadata.promptTokenCount ?? 0;
        const outTok = json.usageMetadata.candidatesTokenCount ?? 0;
        const usage: TokenUsage = {
          inputTokens: inTok,
          outputTokens: outTok,
          model,
          provider: "gemini",
          costMicros: costMicrosFor(model, inTok, outTok),
        };
        try {
          onUsage(usage);
        } catch {
          // Cost bookkeeping must never break the user's request.
        }
      }

      // MAX_TOKENS means our ceiling cut the JSON in half. Typed, so the route
      // can say the true thing ("split the document") instead of "could not be
      // reached, try again" — a retry fails identically and bills again.
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new VendorOutputTruncatedError("Gemini");
      }

      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (!text) throw new Error("Gemini returned an empty response.");
      return parseModelJson(text);
    },
  };
}

// ---------------------------------------------------------------------------
// FUNCTION CALLING (2026-08-23).
//
// Same endpoint, same key, same retry rules — a different body and a different
// reading of the reply, both of which live in tool-wire.ts with no network in
// them so they can be tested. This function is the thin part: get the key,
// post, report the cost, hand the reply to the parser.
//
// 🔴 UNVERIFIED AGAINST THE LIVE API. Nobody writing this could call Gemini:
// the key is J's and the call is metered against a real society's credit. The
// shape follows Google's documented functionCall/functionResponse format and is
// unit-tested for consistency; the first real call is still the moment of truth.
// ---------------------------------------------------------------------------
export function createGeminiToolProvider(model: string): ToolChatProvider {
  return {
    name: "gemini",

    async chatWithTools(req: ToolChatRequest): Promise<ToolTurn> {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error(
          "GEMINI_API_KEY tiada dalam .env.local / missing — add it and restart the server."
        );
      }

      const json = await postVendorJson({
        vendor: "Gemini",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: { "x-goog-api-key": key },
        deadlineAt: req.deadlineAt,
        body: geminiToolBody({
          system: req.system,
          messages: req.messages,
          tools: req.tools,
          temperature: req.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          forceAnswer: req.forceAnswer,
        }),
      });

      // Reported even when the reply turns out unusable: Google charged for it
      // either way, so it must still appear in our numbers (D2).
      const usage = (json as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
        .usageMetadata;
      if (req.onUsage && usage) {
        const inTok = usage.promptTokenCount ?? 0;
        const outTok = usage.candidatesTokenCount ?? 0;
        const u: TokenUsage = {
          inputTokens: inTok,
          outputTokens: outTok,
          model,
          provider: "gemini",
          costMicros: costMicrosFor(model, inTok, outTok),
        };
        try {
          req.onUsage(u);
        } catch {
          // Cost bookkeeping must never break the user's request.
        }
      }

      // MAX_TOKENS means our ceiling cut the reply in half. Say so plainly,
      // rather than letting it surface as an assistant that answered nothing.
      const finish = (json as { candidates?: { finishReason?: string }[] }).candidates?.[0]
        ?.finishReason;
      if (finish === "MAX_TOKENS") {
        throw new Error(
          "Gemini stopped at maxOutputTokens — the answer was too long for one pass."
        );
      }

      return readGeminiTurn(json);
    },
  };
}
