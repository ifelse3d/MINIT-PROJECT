import "server-only";

// ---------------------------------------------------------------------------
// ONE HTTP CALL TO A VENDOR: timeout, transient retry, backoff.
//
// gemini.ts and openai.ts each grew their own copy of this loop in August, and
// the copies are already not identical. Adding function calling would have made
// four. So the loop moves here before it is used again.
//
// ⚠ The existing extractJson() paths are deliberately NOT switched over in the
// same commit that introduces this. They are the paths every extraction in the
// product runs through, they work, and "tidy them up while adding a feature" is
// how a working extractor breaks at three in the morning. They move next, on
// their own, where a regression has somewhere obvious to point.
//
// What the retry is FOR (and what it is not): 429 and 5xx are the vendor asking
// us to wait — Gemini's free tier returns 429 as a matter of course, and on
// 2026-07-18 an entire eval run died that way. In production the same failure
// reads as "the treasurer's quota was charged and no receipt came out". A 4xx
// that is not 429 is OUR mistake, and retrying it just burns time and money.
//
// PDPA (Hard Rule 5): nothing here logs a prompt, an image or a response.
// Errors carry the status and the vendor's own message, truncated — never the
// request.
// ---------------------------------------------------------------------------

/** Give up on one attempt after this long. Route maxDuration is 60s, which
 *  leaves room for one retry plus the response. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Attempts for TRANSIENT failures only. Bad JSON is rule 7's separate retry,
 *  one level up, and is not this function's business. */
export const MAX_ATTEMPTS = 3;
/**
 * How long to wait before each attempt, in ms. Index 0 is the first attempt,
 * so it is always 0.
 *
 * A real knob, not a test hook: Gemini's free tier hands out 429s as routine
 * traffic control and deserves patience, while a paid endpoint returning 503
 * is usually either fixed instantly or not for minutes. Overriding it also
 * happens to keep the unit tests off a nine-second wall clock, which is the
 * difference between a suite people run and one they skip.
 */
export const DEFAULT_BACKOFF_MS = [0, 900, 2_600];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 = rate limited, 408 = timeout, 5xx = vendor trouble. All worth waiting
 *  out. Anything else 4xx is our own bad request. */
export function isTransient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

export type VendorHttpInput = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Name used in error messages, e.g. "Gemini". Never contains a key. */
  vendor: string;
  timeoutMs?: number;
  /** Defaults to DEFAULT_BACKOFF_MS. */
  backoffMs?: readonly number[];
};

/**
 * POST JSON, get JSON back, retrying only what is worth retrying.
 *
 * Throws on final failure with a message safe to show a user: the vendor's
 * name, the status, and at most 300 characters of the vendor's own text.
 */
export async function postVendorJson({
  url,
  headers,
  body,
  vendor,
  timeoutMs = REQUEST_TIMEOUT_MS,
  backoffMs = DEFAULT_BACKOFF_MS,
}: VendorHttpInput): Promise<unknown> {
  const payload = JSON.stringify(body);
  let lastError: Error = new Error(`${vendor}: no attempt was made.`);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (backoffMs[attempt]) await sleep(backoffMs[attempt]);

    // AbortController, not a Promise.race: this actually cancels the socket, so
    // a hung vendor call stops occupying the serverless function rather than
    // merely being ignored by us while it keeps the process alive.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: payload,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const err = new Error(`${vendor} API ${res.status}: ${detail.slice(0, 300)}`);
        if (isTransient(res.status) && attempt < MAX_ATTEMPTS - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return (await res.json()) as unknown;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const isAbort = err.name === "AbortError";
      const worthRetrying =
        isAbort || err.message.includes("fetch failed") || err.message.includes("ECONN");
      if (worthRetrying && attempt < MAX_ATTEMPTS - 1) {
        lastError = isAbort ? new Error(`${vendor} timed out after ${timeoutMs}ms`) : err;
        continue;
      }
      throw isAbort ? new Error(`${vendor} timed out after ${timeoutMs}ms`) : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
