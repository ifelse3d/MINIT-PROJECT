import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  signContinuation,
  verifyContinuation,
  type ConstitutionContinuation,
} from "./constitution-continuation";

const SECRET = "test-secret";
const NOW = 1_756_500_000_000;

const fresh = (over: Partial<ConstitutionContinuation> = {}): ConstitutionContinuation => ({
  rowId: 42,
  orgId: 7,
  pagesLeft: 26,
  pagesDone: 4,
  exp: NOW + 60_000,
  ...over,
});

describe("constitution continuation token", () => {
  it("round-trips what was signed", () => {
    const token = signContinuation(fresh(), SECRET);
    expect(verifyContinuation(token, SECRET, NOW)).toEqual(fresh());
  });

  it("rejects a tampered payload (pagesLeft is the abuse bound)", () => {
    const token = signContinuation(fresh(), SECRET);
    const [payload, sig] = token.split(".");
    const inflated = Buffer.from(
      JSON.stringify({ ...fresh(), pagesLeft: 9999 }),
      "utf8",
    ).toString("base64url");
    expect(verifyContinuation(`${inflated}.${sig}`, SECRET, NOW)).toBeNull();
    expect(payload).not.toBe(inflated);
  });

  it("rejects the wrong secret and an empty secret", () => {
    const token = signContinuation(fresh(), SECRET);
    expect(verifyContinuation(token, "other-secret", NOW)).toBeNull();
    // An empty secret must never verify anything — otherwise a deployment
    // missing the env var would accept ANY well-formed token.
    expect(verifyContinuation(signContinuation(fresh(), ""), "", NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signContinuation(fresh({ exp: NOW - 1 }), SECRET);
    expect(verifyContinuation(token, SECRET, NOW)).toBeNull();
  });

  it("rejects malformed and exhausted shapes", () => {
    expect(verifyContinuation("not-a-token", SECRET, NOW)).toBeNull();
    expect(verifyContinuation("", SECRET, NOW)).toBeNull();
    // pagesLeft 0 must never be signed, and never verifies if it somehow was.
    const spent = signContinuation(fresh({ pagesLeft: 0 }), SECRET);
    expect(verifyContinuation(spent, SECRET, NOW)).toBeNull();
    const badRow = signContinuation(fresh({ rowId: -1 }), SECRET);
    expect(verifyContinuation(badRow, SECRET, NOW)).toBeNull();
  });

  it("rejects the pre-D47 shape (no pagesDone) — the client then starts a fresh charged read", () => {
    // What an in-flight pre-89 token looked like: same fields minus pagesDone.
    const old: Record<string, unknown> = { ...fresh() };
    delete old.pagesDone;
    const payload = Buffer.from(JSON.stringify(old), "utf8").toString("base64url");
    // Signed correctly (this really was a valid old token), still refused.
    const legit = signContinuation(fresh(), SECRET).split(".")[0];
    expect(legit).not.toBe(payload);
    // Re-sign the old payload with the real secret to prove it is the SHAPE
    // that is refused, not the signature.
    const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifyContinuation(`${payload}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("a tampered pagesDone (cheaper blocks forever) breaks the signature", () => {
    const token = signContinuation(fresh({ pagesDone: 20 }), SECRET);
    const sig = token.split(".")[1];
    const forged = Buffer.from(
      JSON.stringify(fresh({ pagesDone: 1 })),
      "utf8",
    ).toString("base64url");
    expect(verifyContinuation(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });
});
