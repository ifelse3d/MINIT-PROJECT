// ---------------------------------------------------------------------------
// CONTINUATION TOKEN for a segmented constitution read (work order 81, I1).
//
// THE PROBLEM IT SOLVES. A segmented read is several REQUESTS reading ONE
// document, and the bill must follow the DOCUMENT, not the request count:
// under D47 (work order 89 ⑧, replacing 81's flat one-action ruling) each
// segment pays only the actions its own pages ADD to the running total —
// which means later segments must prove how much is already paid. "Trust
// me, I am page 17 of a document that paid for 16" cannot be a bare client
// claim: the server must be able to check it. This token is that check.
//
// WHAT IT IS. An HMAC-signed statement from the previous segment's response:
// "org O has read D pages of this document (cost accumulates on ai_usage
// row R) and may read up to P more until time T". Each later segment
// presents it; the route verifies the signature, the org, the row (right
// action, not refunded) and the remaining page budget, charges the D47
// delta for its own pages, then answers with a NEW token carrying the
// updated pagesDone/pagesLeft. A failed segment gets NO new token, so
// retrying it re-uses the same one — a retry never shrinks the budget (or
// grows the paid count) it did not deliver.
//
// WHY pagesLeft IS IN THE TOKEN. It is the abuse bound: the first segment
// declared (and was fence-charged for) the document's total pages, so the
// whole chain can never read more pages than that declaration — tampering
// with the number breaks the signature. Stateless on purpose: no table, no
// migration (this work order expects zero).
//
// The signing secret is the caller's business (the route passes one derived
// from server env). Pure so it can be unit-tested with an injected secret.
// 🔴 Server-side use only — never import this from a client component.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from "node:crypto";

export type ConstitutionContinuation = {
  /** The ai_usage row the read's vendor COST accumulates onto (the first
   *  segment's first charged row — see createUsageRecorder's seed). */
  rowId: number;
  /** The org that row belongs to — must match the active org on use. */
  orgId: number;
  /** How many more pages this chain may read. Always ≥ 1 in a live token. */
  pagesLeft: number;
  /** D47 (work order 89 ⑧): pages the chain has ALREADY read — the next
   *  segment's charge is the delta constitutionActionsDelta(pagesDone,
   *  pagesDone + itsPages), so the bill follows the read page by page and a
   *  resume never pays for pages already delivered. Always ≥ 1 (segment 1
   *  read at least one page before any token existed). */
  pagesDone: number;
  /** Epoch ms after which the token is dead. */
  exp: number;
};

/**
 * 30 minutes: long enough for a slow phone to walk a 50-page document
 * segment by segment (plus a human pause to retry a failed one), short
 * enough that a leaked token is not a standing free-read pass.
 */
export const CONTINUATION_TTL_MS = 30 * 60 * 1000;

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signContinuation(
  c: ConstitutionContinuation,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/**
 * The continuation the token asserts, or null for anything else: bad
 * signature, wrong shape, expired, exhausted. Null is always "start a fresh
 * charged read", never an exception — a stale token is an ordinary event
 * (a tab left open), not an attack to report.
 */
export function verifyContinuation(
  token: string,
  secret: string,
  now: number = Date.now(),
): ConstitutionContinuation | null {
  if (secret === "") return null; // an unsigned token must never verify
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = signPayload(payload, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const r = parsed as Record<string, unknown>;
  if (
    !isPositiveInt(r.rowId) ||
    !isPositiveInt(r.orgId) ||
    !isPositiveInt(r.pagesLeft) ||
    // D47: a token without pagesDone (the pre-89 shape) fails verification —
    // the client then falls back to a fresh charged read, which is honest.
    // The old shape only ever lived inside a 30-minute TTL anyway.
    !isPositiveInt(r.pagesDone) ||
    typeof r.exp !== "number" ||
    !Number.isFinite(r.exp)
  ) {
    return null;
  }
  if (r.exp <= now) return null;
  return {
    rowId: r.rowId,
    orgId: r.orgId,
    pagesLeft: r.pagesLeft,
    pagesDone: r.pagesDone,
    exp: r.exp,
  };
}
