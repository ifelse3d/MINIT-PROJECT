// ---------------------------------------------------------------------------
// CONTINUATION TOKEN for a segmented constitution read (work order 81, I1).
//
// THE PROBLEM IT SOLVES. A segmented read is several REQUESTS reading ONE
// document, and J's billing ruling is "one constitution = one extract
// action" — so segments after the first must not charge again. But "do not
// charge me, I am a continuation" cannot be a bare client claim: the server
// must be able to check it. This token is that check.
//
// WHAT IT IS. An HMAC-signed statement from the first segment's response:
// "ai_usage row R of org O may read up to P more pages until time T". Each
// later segment presents it; the route verifies the signature, the org, the
// row (right action, not refunded) and the remaining page budget, then
// answers with a NEW token carrying `pagesLeft` minus what was just read.
// A failed segment gets NO new token, so retrying it re-uses the same one —
// a retry never shrinks the budget it did not spend.
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
  /** The ai_usage row the whole document's ONE action was charged to. */
  rowId: number;
  /** The org that row belongs to — must match the active org on use. */
  orgId: number;
  /** How many more pages this chain may read. Always ≥ 1 in a live token. */
  pagesLeft: number;
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
    exp: r.exp,
  };
}
