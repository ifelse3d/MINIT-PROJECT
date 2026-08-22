// ---------------------------------------------------------------------------
// OPENAI provider — SERVER-SIDE ONLY. Same shape as gemini.ts on purpose:
// timeout, transient retry, an output ceiling, and captured usage.
//
// Uses the **Responses API** (`/v1/responses`), which is what the GPT-5.x
// family expects. Image goes in as a base64 data URL, exactly as the official
// vision guide shows.
//
// ⚠ TWO THINGS TO KNOW BEFORE TRUSTING THIS OVER GEMINI
//
// 1. OpenAI's own vision guide says, verbatim: "Non-English: the model may not
//    perform optimally when handling images with text of non-Latin alphabets."
//    Minit reads HANDWRITTEN CHINESE. So do NOT switch on price — run
//    `npm run eval` and compare. That is the entire reason the eval exists.
//
// 2. On GPT-5.6 models, `detail: "auto"` (and omitting it) means "original" —
//    the image is NOT resized. A 3000x4000 phone photo becomes
//    ceil(3000/32) * ceil(4000/32) = 11,750 patches of input. That is why
//    OPENAI_IMAGE_DETAIL defaults to "high" here, and why resizing the photo
//    before upload is worth more than any model choice (see the note at the
//    bottom of `2026-08-03-AI-API-选型与成本.md`).
// ---------------------------------------------------------------------------

import "server-only";

import type {
  ToolChatProvider,
  ToolChatRequest,
  TokenUsage,
  VisionJsonProvider,
  VisionJsonRequest,
} from "./provider";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TEMPERATURE, parseModelJson } from "./provider";
import type { ToolTurn } from "./tool-core";
import { openAiToolBody, readOpenAiTurn } from "./tool-wire";
import { postVendorJson } from "./http";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 900, 2_600];

// Prices per 1M tokens in USD — developers.openai.com/api/docs/pricing,
// checked 2026-08-03. Same rule as gemini.ts: a missing model yields a null
// cost, never a guess. Add the date when you add a row.
export const PRICES_PER_MTOK_USD: Record<string, { in: number; out: number }> = {
  "gpt-5.6-luna": { in: 0.2, out: 1.2 },
  "gpt-5.6-terra": { in: 2.0, out: 12.0 },
  "gpt-5.6-sol": { in: 5.0, out: 30.0 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
  "gpt-5-mini": { in: 0.25, out: 2.0 },
  "gpt-5.4-nano": { in: 0.2, out: 1.25 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
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

/**
 * Models that answered "Unsupported parameter: 'temperature'" once already.
 * Process-lifetime memory, deliberately not configuration: it is discovered
 * from the vendor's own reply, so it stays right when OpenAI changes its mind.
 */
const MODELS_REJECTING_TEMPERATURE = new Set<string>();

/** Pulls the text out of a Responses API payload without the SDK's
 *  `output_text` helper (we speak raw HTTP here, no SDK dependency). */
function outputTextOf(json: {
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
}): string {
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

export function createOpenAiProvider(model: string): VisionJsonProvider {
  return {
    name: "openai",

    async extractJson({
      prompt,
      imageBase64,
      mimeType,
      maxOutputTokens,
      temperature,
      onUsage,
    }: VisionJsonRequest): Promise<unknown> {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        throw new Error(
          "OPENAI_API_KEY tiada dalam .env.local / missing — add it and restart the server."
        );
      }

      // "high" not "auto": see note 2 in the header. Override per deployment
      // if a measurement says otherwise — do not change it on a hunch.
      const detail = process.env.OPENAI_IMAGE_DETAIL ?? "high";

      const content: Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string; detail: string }
      > = [{ type: "input_text", text: prompt }];
      if (imageBase64 && mimeType) {
        content.push({
          type: "input_image",
          image_url: `data:${mimeType};base64,${imageBase64}`,
          detail,
        });
      }

      // Rebuildable, because of the fallback below: some models in the GPT-5
      // reasoning family reject `temperature` outright ("Unsupported parameter")
      // instead of ignoring it, and which ones do is not something this file can
      // know in advance — it is a per-model fact that changes when OpenAI ships.
      // So: send it, and if THIS model says no, drop it and remember for the
      // rest of the process. Refusing to send it at all would leave every
      // OpenAI call running at the vendor default of 1 (see DEFAULT_TEMPERATURE).
      const buildBody = (withTemperature: boolean) =>
        JSON.stringify({
          model,
          input: [{ role: "user", content }],
          max_output_tokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          text: { format: { type: "json_object" } },
          ...(withTemperature
            ? { temperature: temperature ?? DEFAULT_TEMPERATURE }
            : {}),
        });

      let body = buildBody(!MODELS_REJECTING_TEMPERATURE.has(model));

      let lastError: Error = new Error("OpenAI: no attempt was made.");

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const res = await fetch("https://api.openai.com/v1/responses", {
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
            const err = new Error(`OpenAI API ${res.status}: ${detailText.slice(0, 300)}`);

            // "this model does not take a temperature" — not a failure, a fact
            // about the model. Learn it, resend without the parameter. Only
            // once per model per process; the flag makes the second call skip
            // straight to the accepted shape.
            if (
              res.status === 400 &&
              /temperature/i.test(detailText) &&
              !MODELS_REJECTING_TEMPERATURE.has(model)
            ) {
              MODELS_REJECTING_TEMPERATURE.add(model);
              body = buildBody(false);
              lastError = err;
              continue;
            }

            if (isTransient(res.status) && attempt < MAX_ATTEMPTS - 1) {
              lastError = err;
              continue;
            }
            throw err;
          }

          const json = (await res.json()) as {
            status?: string;
            incomplete_details?: { reason?: string };
            output?: { type?: string; content?: { type?: string; text?: string }[] }[];
            usage?: { input_tokens?: number; output_tokens?: number };
          };

          // Report cost even if the answer turns out unusable — it was billed.
          if (onUsage && json.usage) {
            const inTok = json.usage.input_tokens ?? 0;
            const outTok = json.usage.output_tokens ?? 0;
            const usage: TokenUsage = {
              inputTokens: inTok,
              outputTokens: outTok,
              model,
              provider: "openai",
              costMicros: costMicrosFor(model, inTok, outTok),
            };
            try {
              onUsage(usage);
            } catch {
              // bookkeeping must never break the user's request
            }
          }

          if (json.incomplete_details?.reason === "max_output_tokens") {
            throw new Error(
              "OpenAI stopped at max_output_tokens — the document is too large for one pass. " +
                "Split it into smaller parts."
            );
          }

          const text = outputTextOf(json);
          if (!text) throw new Error("OpenAI returned an empty response.");
          return parseModelJson(text);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          const isAbort = err.name === "AbortError";
          const worthRetrying =
            isAbort || err.message.includes("fetch failed") || err.message.includes("ECONN");
          if (worthRetrying && attempt < MAX_ATTEMPTS - 1) {
            lastError = isAbort
              ? new Error(`OpenAI timed out after ${REQUEST_TIMEOUT_MS}ms`)
              : err;
            continue;
          }
          throw isAbort ? new Error(`OpenAI timed out after ${REQUEST_TIMEOUT_MS}ms`) : err;
        } finally {
          clearTimeout(timer);
        }
      }

      throw lastError;
    },
  };
}


// ---------------------------------------------------------------------------
// FUNCTION CALLING (2026-08-23). Same endpoint and key as extractJson; the
// body and the reply parser live in tool-wire.ts, with no network in them.
//
// The `temperature` dance is the same one extractJson does and for the same
// reason: some models in the GPT-5 reasoning family REJECT the parameter
// outright ("Unsupported parameter") rather than ignoring it, and which ones do
// is a per-model fact that changes when OpenAI ships. So: send it, and if THIS
// model says no, drop it, remember, and retry once. MODELS_REJECTING_TEMPERATURE
// is shared with extractJson, so one model only has to teach us once.
//
// 🔴 UNVERIFIED AGAINST THE LIVE API, for the same reason as the Gemini one.
// ---------------------------------------------------------------------------
export function createOpenAiToolProvider(model: string): ToolChatProvider {
  return {
    name: "openai",

    async chatWithTools(req: ToolChatRequest): Promise<ToolTurn> {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        throw new Error(
          "OPENAI_API_KEY tiada dalam .env.local / missing — add it and restart the server."
        );
      }

      const send = async (withTemperature: boolean): Promise<unknown> =>
        postVendorJson({
          vendor: "OpenAI",
          url: "https://api.openai.com/v1/responses",
          headers: { Authorization: `Bearer ${key}` },
          body: openAiToolBody({
            model,
            system: req.system,
            messages: req.messages,
            tools: req.tools,
            temperature: withTemperature ? req.temperature ?? DEFAULT_TEMPERATURE : null,
            maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
            forceAnswer: req.forceAnswer,
          }),
        });

      let json: unknown;
      const sendTemperature = !MODELS_REJECTING_TEMPERATURE.has(model);
      try {
        json = await send(sendTemperature);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (sendTemperature && message.includes("temperature")) {
          MODELS_REJECTING_TEMPERATURE.add(model);
          json = await send(false);
        } else {
          throw e;
        }
      }

      const usage = (json as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      if (req.onUsage && usage) {
        const inTok = usage.input_tokens ?? 0;
        const outTok = usage.output_tokens ?? 0;
        const u: TokenUsage = {
          inputTokens: inTok,
          outputTokens: outTok,
          model,
          provider: "openai",
          costMicros: costMicrosFor(model, inTok, outTok),
        };
        try {
          req.onUsage(u);
        } catch {
          // Cost bookkeeping must never break the user's request.
        }
      }

      return readOpenAiTurn(json);
    },
  };
}
