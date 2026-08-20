"use client";

// User-scoped Supabase client for BROWSER code (client components).
// Uses ONLY the public (anon) key — safe to ship to the browser because the
// Phase 7 RLS policies decide what each logged-in user can see (Hard Rule 4:
// the service-role key never appears here).
//
// The @supabase/ssr browser client stores the session in COOKIES (not
// localStorage) so the server (src/proxy.ts, server components) sees the
// same login.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
          "Copy .env.example to .env.local and fill them in, then restart the dev server.",
      );
    }
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
