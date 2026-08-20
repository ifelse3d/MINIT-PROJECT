// Server-side Supabase client (service-role key — bypasses RLS).
//
// The `server-only` import makes the build FAIL LOUDLY if this file is ever
// imported from client-side code, so the service-role key can never leak to
// the browser (CLAUDE.md Hard Rule 4).
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
        "Copy .env.example to .env.local and fill in your Supabase project values, then restart the dev server.",
    );
  }

  if (!client) {
    client = createClient(url, serviceRoleKey, {
      auth: {
        // No user sessions server-side; auth arrives in Phase 7.
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}
