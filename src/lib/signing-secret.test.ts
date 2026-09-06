import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 122 §2 (2026-09-07): which secret signs, and which secrets verify. The two
// rules under test are the ones that make the switch harmless in production:
// a deployment WITHOUT the new variable behaves exactly as before, and a
// deployment WITH it still verifies everything signed before it existed.

vi.mock("server-only", () => ({}));

const { primarySigningSecret, verifySigningSecrets } = await import(
  "./signing-secret"
);

const saved: Record<string, string | undefined> = {};
const KEYS = ["RECEIPT_SIGNING_SECRET", "SUPABASE_SERVICE_ROLE_KEY"] as const;

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("primarySigningSecret", () => {
  it("prefers the dedicated secret when it is set", () => {
    process.env.RECEIPT_SIGNING_SECRET = "dedicated";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    expect(primarySigningSecret()).toBe("dedicated");
  });

  it("falls back to the service-role key when the dedicated one is unset or blank (D8: unset must not break)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    expect(primarySigningSecret()).toBe("service");
    process.env.RECEIPT_SIGNING_SECRET = "";
    expect(primarySigningSecret()).toBe("service");
  });

  it("is the empty string when neither exists — callers treat that as 'cannot sign'", () => {
    expect(primarySigningSecret()).toBe("");
  });
});

describe("verifySigningSecrets", () => {
  it("lists the dedicated secret first, then the service-role key", () => {
    process.env.RECEIPT_SIGNING_SECRET = "dedicated";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    expect(verifySigningSecrets()).toEqual(["dedicated", "service"]);
  });

  it("drops blanks and never returns an empty string as a secret", () => {
    process.env.RECEIPT_SIGNING_SECRET = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    expect(verifySigningSecrets()).toEqual(["service"]);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(verifySigningSecrets()).toEqual([]);
  });

  it("does not list the same value twice", () => {
    process.env.RECEIPT_SIGNING_SECRET = "same";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "same";
    expect(verifySigningSecrets()).toEqual(["same"]);
  });
});
