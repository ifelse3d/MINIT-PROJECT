// 2026-08-21: the R1 demo cases were removed here together with
// src/lib/r1-demo, /competition-demo and /api/competition-demo. Everything that
// tested AUTHENTICATION stayed — including the two it.each blocks, whose
// assertion was always "this path is gated"; only their example paths changed
// from the deleted demo routes to routes the product actually serves.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: supabaseMocks.createServerClient,
}));

import { config, proxy } from "./proxy";

const ORIGIN = "http://127.0.0.1:3140";

function request(path: string): NextRequest {
  const url = new URL(path, ORIGIN);
  return new NextRequest(url, { headers: new Headers({ host: url.host }) });
}

function redirectPath(response: Response): string {
  const location = response.headers.get("location");
  if (!location) throw new Error("Expected redirect location");
  return new URL(location).pathname;
}

describe("Next.js Proxy authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    supabaseMocks.getUser.mockResolvedValue({ data: { user: null } });
    supabaseMocks.createServerClient.mockImplementation(() => ({
      auth: { getUser: supabaseMocks.getUser },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the intentionally broad matcher for legacy authentication", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
    ]);
  });

  // The guard on PUBLIC_PATHS. Removing the demo branch touched exactly the
  // code that decides who gets in without a session, so this pins the answer:
  // two exact paths, and nothing that merely looks like either of them.
  // 2026-08-22: /reset-password was added — it must be public because the
  // recovery session arrives with the page load, not before it.
  // 2026-08-22: /terms and /privacy joined them — sign-up asks people to agree
  // to those documents, and a consent link you need an account to open is not
  // consent.
  it("treats login, reset-password, terms and privacy as the only public paths", async () => {
    for (const path of ["/login", "/reset-password", "/terms", "/privacy"]) {
      const open = await proxy(request(path));
      expect(open.status, `${path} must be public`).toBe(200);
      expect(open.headers.get("x-middleware-next")).toBe("1");
    }

    for (const lookalike of [
      "/login/",
      "/login/extra",
      "/loginx",
      "/reset-password/",
      "/reset-password/extra",
      "/reset-passwordx",
      "/terms/",
      "/termsx",
      "/privacy/extra",
      "/health",
      "/orgs/new",
      "/",
    ]) {
      const response = await proxy(request(lookalike));
      expect(
        response.status,
        `${lookalike} must not be public`,
      ).toBe(307);
      expect(["/login", "/login/"]).toContain(redirectPath(response));
    }
  });

  it.each(["/", "/members", "/minutes", "/money", "/agm-pack"])(
    "keeps the page path %s behind legacy authentication",
    async (path) => {
      const response = await proxy(request(path));

      expect(response.status).toBe(307);
      expect(["/login", "/login/"]).toContain(redirectPath(response));
      expect(supabaseMocks.createServerClient).toHaveBeenCalledOnce();
    },
  );

  it.each([
    "/api/ask",
    "/api/draft-minutes",
    "/api/extract-minutes",
    "/api/import-roster",
    "/api/receipt-pdf",
  ])("keeps the API path %s behind legacy authentication", async (path) => {
    const response = await proxy(request(path));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sila log masuk / Please log in",
    });
    expect(supabaseMocks.createServerClient).toHaveBeenCalledOnce();
  });

  it("preserves anonymous and authenticated login behavior", async () => {
    const anonymous = await proxy(request("/login"));
    expect(anonymous.status).toBe(200);
    expect(anonymous.headers.get("x-middleware-next")).toBe("1");

    supabaseMocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "test-user" } },
    });
    const authenticated = await proxy(request("/login?next=/settings"));
    expect(authenticated.status).toBe(307);
    expect(redirectPath(authenticated)).toBe("/");
  });

  it("preserves protected page and API behavior", async () => {
    const protectedPage = await proxy(request("/settings"));
    expect(protectedPage.status).toBe(307);
    expect(redirectPath(protectedPage)).toBe("/login");

    const protectedApi = await proxy(request("/api/chat"));
    expect(protectedApi.status).toBe(401);

    supabaseMocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "test-user" } },
    });
    const authenticatedPage = await proxy(request("/settings"));
    expect(authenticatedPage.status).toBe(200);
    expect(authenticatedPage.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a fresh checkout with no auth env through instead of dying", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await proxy(request("/health"));

    expect(response.status).toBe(200);
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
  });
});
