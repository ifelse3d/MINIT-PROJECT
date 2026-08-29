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

/**
 * D0-2 (2026-08-29, work order 56) — per-attempt timeout for DOCUMENT READS,
 * the time-side twin of EXTRACT_OUTPUT_CEILING: "a limit must fit the largest
 * item the other limits on the same path admit".
 *
 * THE INCIDENT. J uploaded a constitution on 2026-08-29 and got "The AI took
 * too long" (app_errors: VendorTimeoutError, org 91, ai_usage refunded 49s
 * after the charge). Work order 51 had raised EXTRACT_OUTPUT_CEILING.
 * constitution to 64k so long reads stop dying at MAX_TOKENS — but the
 * per-attempt timeout stayed at 20s. Measured on the same org's 8-27 rows,
 * gemini-3.5-flash-lite generates ≥410 output tokens/second, so any read
 * needing more than ~8k output tokens now outlives one 20s attempt. The
 * route then burned its whole 50s budget on THREE aborted attempts (20s +
 * 20s + capped remainder), each thrown away mid-generation — a single long
 * attempt would have finished.
 *
 * THE ARITHMETIC (all three walls, so nobody re-breaks one of them):
 *   * Vercel maxDuration = 60s — after a platform kill NOTHING runs, so the
 *     vendor budget must end well before it.
 *   * ROUTE_AI_DEADLINE_MS = 50s — leaves 10s for the refund write, the
 *     app_errors insert and the response.
 *   * 45s per attempt — one long attempt inside the 50s budget. If it times
 *     out, the remaining <5s is under MIN_ATTEMPT_BUDGET_MS, so no doomed
 *     retry starts; a TRANSIENT failure (429/503 answers in <1s) still
 *     leaves ~44s for a real second attempt.
 *
 * What 45s buys at ≥410 tok/s is ~18k output tokens ≈ 10–18 dense pages.
 * A document beyond that fails deterministically — the route must tell the
 * person to SPLIT the file (documentTooLong), never "try again".
 */
export const EXTRACT_ATTEMPT_TIMEOUT_MS = 45_000;

/**
 * Above this many pages, a read that TIMED OUT was almost certainly a
 * generation the 45s attempt cannot fit (see the arithmetic above), so the
 * route answers with the "split the file" advice instead of "try again" —
 * a retry of a too-long document fails identically and helps nobody.
 */
export const TIMEOUT_SPLIT_ADVICE_PAGES = 10;

/**
 * P-1 (2026-08-27, work order 31): the overall time budget an AI route gives
 * its vendor calls, measured from the top of the route.
 *
 * WHY THIS EXISTS — the "ai_usage id=5" incident. The per-attempt timeout above
 * bounds ONE attempt, but a route makes up to SIX (3 transient attempts × the
 * rule-7 validation retry), plus a classify step on the intake path, plus
 * database round trips. Worst case that is comfortably past Vercel's
 * maxDuration = 60s — and when Vercel kills the function, NO code runs after
 * the kill: no refund, no app_errors row, no token recording. The person saw
 * "the connection dropped", the charge stayed, and nothing anywhere said why.
 *
 * 50s leaves ~10s of the 60 for the refund write, the app_errors insert and
 * the response itself. Routes create `Date.now() + ROUTE_AI_DEADLINE_MS` once
 * at the top and pass it to every extractJson call, so it is the TOTAL budget
 * across all of a route's vendor calls, not a per-call one.
 */
export const ROUTE_AI_DEADLINE_MS = 50_000;

/** Under this much remaining budget, starting another vendor attempt is
 *  pointless — it could not finish. Give up honestly instead. */
const MIN_ATTEMPT_BUDGET_MS = 2_000;

/**
 * The vendor did not answer in time — either one attempt hit its own timeout
 * and the retries ran out, or the route's overall deadline left no room for
 * another attempt. Distinct from other failures so routes can say, honestly,
 * "Minit stopped waiting — your quota was returned" instead of a generic
 * "could not be reached". The vendor never delivered an answer, so the refund
 * rule (CLAUDE.md rule 10) applies exactly as for an unreached vendor.
 */
export class VendorTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorTimeoutError";
  }
}
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
  /**
   * Epoch-ms moment the CALLING ROUTE must be done with vendors, shared across
   * all its calls (see ROUTE_AI_DEADLINE_MS). Attempts are capped to the
   * remaining budget, and when too little remains for another attempt the call
   * fails with VendorTimeoutError instead of letting Vercel kill the function
   * mid-flight — a kill runs no refund, writes no app_errors row, and leaves
   * the user's quota silently eaten (the ai_usage id=5 incident).
   */
  deadlineAt?: number;
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
  deadlineAt,
}: VendorHttpInput): Promise<unknown> {
  const payload = JSON.stringify(body);
  let lastError: Error = new Error(`${vendor}: no attempt was made.`);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // The deadline is checked BEFORE the backoff sleep, projecting the sleep
    // in: waiting 2.6s to then discover there is no time left is time the
    // route needed for its refund write.
    let attemptTimeout = timeoutMs;
    if (deadlineAt !== undefined) {
      const remaining = deadlineAt - Date.now() - (backoffMs[attempt] ?? 0);
      if (remaining < MIN_ATTEMPT_BUDGET_MS) {
        throw lastError instanceof VendorTimeoutError
          ? lastError
          : new VendorTimeoutError(
              `${vendor} ran out of the route's time budget before answering.`,
            );
      }
      attemptTimeout = Math.min(timeoutMs, remaining);
    }
    if (backoffMs[attempt]) await sleep(backoffMs[attempt]);

    // AbortController, not a Promise.race: this actually cancels the socket, so
    // a hung vendor call stops occupying the serverless function rather than
    // merely being ignored by us while it keeps the process alive.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeout);

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
        lastError = isAbort
          ? new VendorTimeoutError(`${vendor} timed out after ${attemptTimeout}ms`)
          : err;
        continue;
      }
      throw isAbort
        ? new VendorTimeoutError(`${vendor} timed out after ${attemptTimeout}ms`)
        : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
