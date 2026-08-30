// ---------------------------------------------------------------------------
// RECEIPT VERIFY TOKEN (work order 87, ①  — 24號單建議② shipped).
//
// WHAT IT IS. Every receipt PDF now prints a QR code pointing at the public
// page /verify/resit?t=<token>. The token is an HMAC-signed statement:
// "receipt number N of org O was issued by this system". The page verifies
// the signature, reads the row back under that exact (org, number) pair and
// repeats ONLY what the paper already prints: org name, date, amount.
//
// WHY A SIGNED TOKEN AND NOT A LOOKUP FORM. A "type in a receipt number"
// search would let anyone enumerate the whole receipts table (numbers are
// sequential and gap-free BY DESIGN — Hard Rule 2 — so guessing them is
// trivial). With the HMAC, the only people who can reach the verify page for
// a receipt are people physically holding that receipt's QR. No token, no
// query — the enumeration surface is zero.
//
// WHY NO EXPIRY. A continuation token (constitution-continuation.ts) guards
// a 30-minute read budget; THIS token is printed on paper that lives in a
// donor's drawer for seven years (record-keeping horizon). An expired QR on
// a genuine receipt would make the real thing look fake — the worst possible
// failure for an anti-impersonation feature. The token grants nothing but a
// read of facts already printed on the paper it is attached to, so an
// eternal lifetime leaks nothing.
//
// DOMAIN SEPARATION. The signing key is DERIVED from the deployment secret
// with a fixed label, so a receipt token can never verify as a constitution
// continuation (which signs with the raw secret) or vice versa — the two
// protocols cannot be confused even though both ultimately rest on the same
// env var. Zero migration, zero env change (same pattern as work order 81).
//
// Pure so it can be unit-tested with an injected secret.
// 🔴 Server-side use only — never import this from a client component.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from "node:crypto";

export type ReceiptVerifyClaim = {
  /** The org the receipt belongs to. */
  orgId: number;
  /** The printed receipt number, e.g. "MIN-2026-0001". */
  receiptNo: string;
};

/** Longest receipt number a token will carry or accept. The real series is
 *  far shorter; the cap only bounds hostile payloads. */
const RECEIPT_NO_MAX_CHARS = 64;

/** The derived signing key — never the raw deployment secret. */
function verifyKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("minit-receipt-verify-v1").digest();
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", verifyKey(secret))
    .update(payload)
    .digest("base64url");
}

export function signReceiptVerify(
  claim: ReceiptVerifyClaim,
  secret: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({ o: claim.orgId, n: claim.receiptNo }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

/**
 * The claim the token asserts, or null for anything else: bad signature,
 * wrong shape, empty secret. Null is always "this system did not issue this"
 * — a mangled QR is an ordinary event (bad print, bad scan), never a crash.
 */
export function verifyReceiptVerify(
  token: string,
  secret: string,
): ReceiptVerifyClaim | null {
  if (secret === "") return null; // an unsigned token must never verify
  if (token.length > 512) return null;
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
    typeof r.o !== "number" ||
    !Number.isInteger(r.o) ||
    r.o <= 0 ||
    typeof r.n !== "string" ||
    r.n.length === 0 ||
    r.n.length > RECEIPT_NO_MAX_CHARS
  ) {
    return null;
  }
  return { orgId: r.o, receiptNo: r.n };
}

/** The path the QR points at (also the page's route — one constant). */
export const RECEIPT_VERIFY_PATH = "/verify/resit";

/** The absolute URL printed into the QR. `origin` = scheme + host of the
 *  deployment that generated the PDF (derived from the request, so localhost
 *  PDFs point at localhost and production PDFs at production). */
export function buildReceiptVerifyUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${RECEIPT_VERIFY_PATH}?t=${token}`;
}
