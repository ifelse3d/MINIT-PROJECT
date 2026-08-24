import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getSupabase } from "@/db/supabase";

// ---------------------------------------------------------------------------
// ERROR CAPTURE (S-7, 2026-08-25) — the ops console's data source.
//
// Today an API route dying leaves nothing but a red banner on one person's
// screen. This helper gives every route's catch block one line to call, and
// the admin console (S-6) a "errors, last 30 days" column to read.
//
// 🔴 PDPA (Hard Rule 5) IS THE DESIGN CONSTRAINT: no document contents, no
// donor data, no stacks, no raw error messages — those can echo user content
// (vendor errors quote the prompt). What is stored: route name, a coarse code,
// and the SHA-256 prefix of the message so identical errors group. What is
// sent to Sentry (only when SENTRY_DSN is set): the same three fields.
//
// BEST-EFFORT, ALWAYS: capturing an error must never create a second one. The
// insert fails silently while migration 20260831000000 is not applied; the
// Sentry post fails silently without a DSN or without network. Fire-and-forget
// (deliberately not awaited by callers) — an error report must not slow the
// error response.
// ---------------------------------------------------------------------------

function hashMessage(message: string): string {
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

/** `https://<key>@<host>/<project>` → the store URL, or null when unset/bad. */
function sentryStoreUrl(): { url: string; key: string } | null {
  const dsn = process.env.SENTRY_DSN ?? "";
  if (dsn === "") return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/\//g, "");
    if (!u.username || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

/**
 * Record that a route failed. Call as `void captureAppError(...)` from a catch
 * block — it never throws and never blocks the response.
 */
export async function captureAppError(
  route: string,
  err: unknown,
  opts?: { orgId?: number | null; code?: string | null },
): Promise<void> {
  const message =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const code =
    opts?.code ?? (err instanceof Error ? err.name : null);
  const messageHash = hashMessage(message);

  // 1. The database counter (service role — app_errors has no RLS policies).
  try {
    await getSupabase().from("app_errors").insert({
      route,
      code,
      message_hash: messageHash,
      org_id: opts?.orgId ?? null,
    });
  } catch {
    // Table not applied yet, or DB unreachable — the error response already
    // went out; this must stay silent.
  }

  // 2. Sentry, if (and only if) a DSN is configured. Same PDPA-safe fields.
  const sentry = sentryStoreUrl();
  if (!sentry) return;
  try {
    await fetch(sentry.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${sentry.key}, sentry_client=minit/1.0`,
      },
      body: JSON.stringify({
        event_id: randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        platform: "node",
        level: "error",
        logger: route,
        // The hash, never the message: a vendor error can quote the prompt,
        // and the prompt can carry a donor's name (PDPA).
        message: { formatted: `${route} failed (${code ?? "error"}) #${messageHash}` },
        tags: { route, code: code ?? "unknown" },
      }),
    });
  } catch {
    // Offline / DSN wrong — silent, same reasoning as above.
  }
}
