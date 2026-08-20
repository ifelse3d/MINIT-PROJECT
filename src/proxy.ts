// Runs on the server BEFORE every page/API request (Next.js 16 calls this
// file "proxy" — it is the renamed middleware convention).
//
// Two jobs:
//   1. Keep the Supabase session cookie fresh (tokens expire; this renews
//      them so users are not logged out mid-task).
//   2. Gate the app: anyone not logged in is sent to /login.
//      Public without login: /login. Nothing else. There is no second entry
//      and no route that inherits a bypass.
//
// 2026-08-21: the R1 competition demo (/competition-demo + /api/competition-demo)
// was removed with the whole src/lib/r1-demo subsystem. It used to open two
// loopback-only routes here and author x-minit-r1-demo headers for RootLayout.
// A route that can never open in production has no business branching inside
// the authentication boundary.
//
// 2026-07-28 AUDIT (P0): /health used to be public. It runs a SERVICE-ROLE
// database query, renders "Connected — N orgs on record" (your tenant count),
// enumerates which secrets are configured, and echoes raw Postgres error
// strings in development. Any anonymous visitor could read your infrastructure
// layout and trigger unlimited service-role round-trips. It now requires a
// session like every other page. The `!url || !anonKey` escape hatch below
// still lets a fresh checkout with no env reach it, which is the one case the
// page exists for.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forwardedHeaders = new Headers(request.headers);

  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Env not configured yet (fresh checkout): there is no auth to check against,
  // so let /health explain the problem instead of dying on every route.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        forwardedHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({
          request: { headers: forwardedHeaders },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the token with the auth server (do NOT trust
  // getSession() here — it only reads the cookie without verifying it).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(pathname)) {
    // API calls get a JSON 401; pages get redirected to the login screen.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Sila log masuk / Please log in" },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    // Keep any refreshed auth cookies on the redirect response too.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    const redirect = NextResponse.redirect(homeUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}

export const config = {
  // Run on everything except Next.js internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
