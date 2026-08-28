// User-scoped Supabase client for SERVER code (server components, server
// actions, route handlers).
//
// HOW IT DIFFERS FROM src/db/supabase.ts:
//   - supabase.ts        → service-role key. Bypasses RLS. Server-only admin
//                          work (AI pipeline, create/delete org, seeding).
//   - supabase-server.ts → public (anon) key + the logged-in user's session
//                          cookie. Every query is filtered by the Phase 7
//                          RLS policies, so this client can only ever see
//                          the user's own orgs. PREFER THIS ONE for reads.
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSupabaseServer(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
        "Copy .env.example to .env.local and fill in your Supabase project values, then restart the dev server.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore: src/proxy.ts refreshes the session cookie.
        }
      },
    },
  });
}

/**
 * The logged-in user, or null. Verified against the auth server — which means
 * a NETWORK ROUND TRIP to Supabase Auth, not a cookie decode.
 *
 * 🔴 cache() is why rendering a page is not four of those. React's cache is
 * scoped to ONE server request, so every caller in a single render shares one
 * answer, and the next request starts clean. Before this (2026-08-28), drawing
 * the home page asked the auth server who you were three or four separate
 * times: getActiveOrg asks, roleForOrg asks again inside it, getUsage asks
 * again, and the shell asks once more on its own. Each of those is a real
 * round trip, in series, before a single card is drawn.
 *
 * Safe because the user cannot change halfway through rendering one page. It
 * is NOT a cross-request cache and must never become one — that would serve
 * one member's session to another.
 */
export const getSessionUser = cache(async () => {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
