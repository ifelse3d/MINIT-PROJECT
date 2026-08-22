import { afterEach, describe, expect, it, vi } from "vitest";

// The established pattern in this folder (see usage-refund.test.ts): the
// "server-only" marker throws outside a React Server Component, so it is
// stubbed away. Nothing else about the module under test changes.
vi.mock("server-only", () => ({}));

import {
  DEFAULT_BACKOFF_MS,
  MAX_ATTEMPTS,
  isTransient,
  postVendorJson,
} from "@/lib/ai/http";

// ---------------------------------------------------------------------------
// THIS LOOP HAD NEVER BEEN TESTED, in either of the two copies it existed in.
//
// It is the code that decides whether a treasurer's receipt comes out or not
// when Google returns 429 — which the free tier does as a matter of course, and
// which killed an entire eval run on 2026-07-18. Before consolidating the two
// copies into one, the one gets a net.
// ---------------------------------------------------------------------------

const okResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const errResponse = (status: number, text = "boom") =>
  ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  }) as unknown as Response;

const call = (overrides: Partial<Parameters<typeof postVendorJson>[0]> = {}) =>
  postVendorJson({
    url: "https://example.test/v1",
    headers: { Authorization: "Bearer secret-value" },
    body: { hello: "world" },
    vendor: "TestVendor",
    // No waiting between attempts. The backoff schedule is exercised by the
    // fact that it EXISTS and is honoured (DEFAULT_BACKOFF_MS is one constant,
    // read in one place); making every retry test sit through 3.5 real seconds
    // would buy nothing and cost a suite people actually run.
    backoffMs: [0, 0, 0],
    ...overrides,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the backoff schedule", () => {
  it("does not wait before the first attempt", () => {
    expect(DEFAULT_BACKOFF_MS[0]).toBe(0);
  });

  it("has one delay per allowed attempt, and they grow", () => {
    expect(DEFAULT_BACKOFF_MS).toHaveLength(MAX_ATTEMPTS);
    for (let i = 1; i < DEFAULT_BACKOFF_MS.length; i++) {
      expect(DEFAULT_BACKOFF_MS[i]).toBeGreaterThan(DEFAULT_BACKOFF_MS[i - 1]);
    }
  });

  // The whole retry budget has to fit inside the route's 60s maxDuration,
  // alongside the calls themselves. Two timeouts plus the waiting is the worst
  // case, and it must still leave room for the third attempt to answer.
  it("leaves room inside the route's 60s ceiling", () => {
    const totalWait = DEFAULT_BACKOFF_MS.reduce((a, b) => a + b, 0);
    expect(totalWait).toBeLessThan(5_000);
  });
});

describe("isTransient", () => {
  // 429 = rate limited, 408 = timeout, 5xx = their trouble. Anything else 4xx
  // is OUR bad request, and retrying it just burns time and money.
  it("retries what is worth waiting out", () => {
    expect(isTransient(429)).toBe(true);
    expect(isTransient(408)).toBe(true);
    expect(isTransient(500)).toBe(true);
    expect(isTransient(503)).toBe(true);
  });

  it("does not retry our own mistakes", () => {
    expect(isTransient(400)).toBe(false);
    expect(isTransient(401)).toBe(false);
    expect(isTransient(404)).toBe(false);
  });
});

describe("postVendorJson", () => {
  it("returns the parsed body on a first-attempt success", async () => {
    const fetchMock = vi.fn(async () => okResponse({ answer: 42 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).resolves.toEqual({ answer: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends JSON, with the caller's headers on top of the content type", async () => {
    const fetchMock = vi.fn(async () => okResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await call();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-value");
    expect(init.body).toBe(JSON.stringify({ hello: "world" }));
  });

  // The 2026-07-18 failure: an entire eval run died because 429 was fatal.
  it("retries a 429 and returns the answer when it clears", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      return n === 1 ? errResponse(429, "rate limited") : okResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after MAX_ATTEMPTS and reports the vendor's last word", async () => {
    const fetchMock = vi.fn(async () => errResponse(503, "upstream down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow(/TestVendor API 503/);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  // Retrying our own bad request wastes the user's time and our money, and the
  // second attempt is guaranteed to fail the same way.
  it("does not retry a 400", async () => {
    const fetchMock = vi.fn(async () => errResponse(400, "bad request"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow(/TestVendor API 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // PDPA (Hard Rule 5): the error a user may see carries the status and the
  // vendor's own words — never the request, which is the document they
  // photographed.
  it("never puts the request into the error message", async () => {
    const fetchMock = vi.fn(async () => errResponse(400, "bad request"));
    vi.stubGlobal("fetch", fetchMock);
    // Asserted by reading the message rather than with a negative-lookahead
    // regex: the /s flag needs an es2018 target, and a plain `.toContain` says
    // what is being checked far more clearly anyway.
    await expect(
      call({ body: { prompt: "MEETING NOTES: Tan Ah Kow donated RM500" } }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof Error && !e.message.includes("Tan Ah Kow"),
    );
  });

  it("truncates a very long vendor message rather than passing it all on", async () => {
    const fetchMock = vi.fn(async () => errResponse(400, "x".repeat(5000)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow(
      /^TestVendor API 400: x{300}$/,
    );
  });

  // AbortController, not Promise.race: a hung vendor call must stop occupying
  // the serverless function, not merely be ignored while it keeps it alive.
  it("aborts a hung call and says which vendor hung", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(call({ timeoutMs: 20 })).rejects.toThrow(/TestVendor timed out after 20ms/);
    // A timeout is transient, so it is retried like a 429 rather than given up on.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("retries a network-level failure", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error("fetch failed");
      return okResponse({ recovered: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).resolves.toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an error that will not fix itself", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Invalid URL");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow(/Invalid URL/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
