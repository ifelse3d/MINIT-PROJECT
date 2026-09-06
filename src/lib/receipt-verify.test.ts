import { describe, expect, it } from "vitest";
import {
  buildReceiptVerifyUrl,
  signReceiptVerify,
  verifyReceiptVerify,
  verifyReceiptVerifyAny,
} from "./receipt-verify";
import { signContinuation } from "./constitution-continuation";

const SECRET = "test-secret-for-receipt-verify";

describe("receipt verify token", () => {
  it("round-trips a claim", () => {
    const token = signReceiptVerify(
      { orgId: 15, receiptNo: "MIN-2026-0001" },
      SECRET,
    );
    expect(verifyReceiptVerify(token, SECRET)).toEqual({
      orgId: 15,
      receiptNo: "MIN-2026-0001",
    });
  });

  it("rejects a tampered payload", () => {
    const token = signReceiptVerify(
      { orgId: 15, receiptNo: "MIN-2026-0001" },
      SECRET,
    );
    const forged = signReceiptVerify(
      { orgId: 15, receiptNo: "MIN-2026-0002" },
      SECRET,
    );
    // splice the forged payload onto the genuine signature
    const mixed = `${forged.split(".")[0]}.${token.split(".")[1]}`;
    expect(verifyReceiptVerify(mixed, SECRET)).toBeNull();
  });

  it("rejects the wrong secret and the empty secret", () => {
    const token = signReceiptVerify({ orgId: 1, receiptNo: "A-1" }, SECRET);
    expect(verifyReceiptVerify(token, "other-secret")).toBeNull();
    // empty secret must never verify anything — including a token that was
    // (wrongly) signed with an empty secret
    const unsigned = signReceiptVerify({ orgId: 1, receiptNo: "A-1" }, "");
    expect(verifyReceiptVerify(unsigned, "")).toBeNull();
  });

  it("rejects garbage shapes", () => {
    for (const bad of ["", ".", "abc", "a.b", "🙂.🙂"]) {
      expect(verifyReceiptVerify(bad, SECRET)).toBeNull();
    }
    // wrong field types inside a correctly signed payload
    const payload = Buffer.from(JSON.stringify({ o: "15", n: 7 })).toString(
      "base64url",
    );
    const forgedShape = `${payload}.${signReceiptVerify({ orgId: 1, receiptNo: "x" }, SECRET).split(".")[1]}`;
    expect(verifyReceiptVerify(forgedShape, SECRET)).toBeNull();
  });

  it("never accepts a constitution continuation token (domain separation)", () => {
    // Both protocols rest on the same deployment secret; a continuation
    // signed with the RAW secret must not verify here (we sign with a
    // derived key).
    const continuation = signContinuation(
      { rowId: 1, orgId: 15, pagesLeft: 3, pagesDone: 4, exp: Date.now() + 60_000 },
      SECRET,
    );
    expect(verifyReceiptVerify(continuation, SECRET)).toBeNull();
  });

  it("builds the verify URL without doubled slashes", () => {
    expect(buildReceiptVerifyUrl("https://minit-project.vercel.app/", "abc")).toBe(
      "https://minit-project.vercel.app/verify/resit?t=abc",
    );
    expect(buildReceiptVerifyUrl("http://localhost:3000", "t.t")).toBe(
      "http://localhost:3000/verify/resit?t=t.t",
    );
  });

  it("token survives a URL round trip unchanged (base64url, no percent-escapes)", () => {
    const token = signReceiptVerify(
      { orgId: 197, receiptNo: "MIN-2026-9999" },
      SECRET,
    );
    const url = new URL(buildReceiptVerifyUrl("https://example.com", token));
    expect(url.searchParams.get("t")).toBe(token);
  });
});

// 122 §2 (2026-09-07): the signing secret moved from the service-role key to a
// dedicated RECEIPT_SIGNING_SECRET. The paper already printed carries tokens
// signed under the OLD secret, and those must keep verifying for as long as
// the paper exists — so the verifier takes a list and tries each.
describe("verifyReceiptVerifyAny (secret rotation without dark QRs)", () => {
  const OLD = "service-role-key-the-old-signer";
  const NEW = "dedicated-receipt-signing-secret";
  const claim = { orgId: 15, receiptNo: "MIN-2026-0003" };

  it("verifies a token signed under either secret in the list", () => {
    const signedOld = signReceiptVerify(claim, OLD);
    const signedNew = signReceiptVerify(claim, NEW);
    expect(verifyReceiptVerifyAny(signedOld, [NEW, OLD])).toEqual(claim);
    expect(verifyReceiptVerifyAny(signedNew, [NEW, OLD])).toEqual(claim);
  });

  it("does not care about the order of the list", () => {
    const signedOld = signReceiptVerify(claim, OLD);
    expect(verifyReceiptVerifyAny(signedOld, [OLD, NEW])).toEqual(claim);
    expect(verifyReceiptVerifyAny(signedOld, [NEW, OLD])).toEqual(claim);
  });

  it("rejects a token signed under a secret that is NOT in the list", () => {
    const stray = signReceiptVerify(claim, "some-other-deployment");
    expect(verifyReceiptVerifyAny(stray, [NEW, OLD])).toBeNull();
  });

  it("verifies nothing against an empty list or blank secrets", () => {
    const signedNew = signReceiptVerify(claim, NEW);
    expect(verifyReceiptVerifyAny(signedNew, [])).toBeNull();
    expect(verifyReceiptVerifyAny(signedNew, [""])).toBeNull();
  });
});
