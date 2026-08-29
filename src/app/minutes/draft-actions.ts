"use server";

// ---------------------------------------------------------------------------
// CLOUD DRAFTS for the minutes workspace (C-13, work order 51, 拍板 8).
//
// The half-finished workspace used to live only in one browser's
// localStorage. J's scenario: last week's record is unfinished and this
// week's meeting is starting — BOTH must survive, on any device. One row per
// draft in minutes_drafts (migration 33), upserted by a client-minted key.
//
// FAIL-OPEN (D8): the table may not exist yet. Every function answers
// "db_behind" (or an empty list) instead of throwing, and the workspace then
// behaves exactly as before — localStorage only. Nothing here ever blocks
// typing: the client fires these best-effort.
//
// D36 stands: a draft is only the NOT-YET-SAVED. Saving to History deletes
// the row (the store calls dropDraft in the same breath as the save).
//
// User-scoped client: RLS is the boundary (Hard Rule 5). PDPA: payloads are
// meeting facts — never logged; photo previews are not stored (paths only).
// ---------------------------------------------------------------------------

import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";

export type DraftListItem = {
  clientKey: string;
  title: string | null;
  updatedAt: string;
};

/** The payload is the client's own workspace blob — the server stores it
 *  opaquely and returns it as-is; the CLIENT validates on load (the same
 *  don't-trust-what-crossed-a-boundary rule as intake-handoff). */
export type DraftSaveResult = { ok: true } | { ok: false; reason: "db_behind" | "failed" | "no_org" };

const MAX_PAYLOAD_BYTES = 400_000;

function isMissingTable(message: string | undefined): boolean {
  return /minutes_drafts|schema cache/i.test(message ?? "");
}

/**
 * G3-1 (work order 68 §5-1, closes 未决 15): short-lived signed links for the
 * ORIGINAL photos behind a resumed draft. A draft stores storage paths only;
 * on another device the workspace then showed grey placeholder tiles
 * mislabelled as PDFs (J put in WhatsApp JPEGs). The originals never left the
 * uploads bucket — sign them and show them. User-scoped client: the storage
 * RLS policy decides whose files sign (Hard Rule 5). Failures return [] —
 * the tiles stay placeholders, nothing breaks.
 */
export async function signPhotoPaths(
  paths: string[],
): Promise<{ path: string; url: string }[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const clean = paths
    .filter((p): p is string => typeof p === "string" && p !== "")
    .slice(0, 12);
  if (clean.length === 0) return [];
  try {
    const supabase = await getSupabaseServer();
    const out: { path: string; url: string }[] = [];
    for (const path of clean) {
      const { data } = await supabase.storage
        .from("uploads")
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) out.push({ path, url: data.signedUrl });
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveDraft(input: {
  clientKey: string;
  title: string | null;
  payload: unknown;
}): Promise<DraftSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "failed" };
  const active = await getActiveOrg();
  if (!active || !can(active.role, "minutes_write")) {
    return { ok: false, reason: "no_org" };
  }
  const clientKey = String(input.clientKey ?? "").slice(0, 80);
  if (clientKey === "") return { ok: false, reason: "failed" };
  // A runaway payload (someone pasted a novel) must not sit in every autosave.
  try {
    if (JSON.stringify(input.payload).length > MAX_PAYLOAD_BYTES) {
      return { ok: false, reason: "failed" };
    }
  } catch {
    return { ok: false, reason: "failed" };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("minutes_drafts").upsert(
    {
      org_id: active.id,
      client_key: clientKey,
      title:
        typeof input.title === "string" && input.title.trim() !== ""
          ? input.title.trim().slice(0, 200)
          : null,
      payload: input.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,client_key" },
  );
  if (error) {
    return { ok: false, reason: isMissingTable(error.message) ? "db_behind" : "failed" };
  }
  return { ok: true };
}

/** Newest first. Empty on any failure — the picker then simply shows nothing
 *  (fail-open); an empty cloud and a missing table look the same on purpose. */
export async function listDrafts(): Promise<DraftListItem[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("minutes_drafts")
    .select("client_key, title, updated_at")
    .eq("org_id", active.id)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.flatMap((r) => {
    if (typeof r.client_key !== "string") return [];
    return [
      {
        clientKey: r.client_key,
        title: typeof r.title === "string" ? r.title : null,
        updatedAt: typeof r.updated_at === "string" ? r.updated_at : "",
      },
    ];
  });
}

export async function loadDraft(clientKey: string): Promise<unknown | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const active = await getActiveOrg();
  if (!active) return null;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("minutes_drafts")
    .select("payload")
    .eq("org_id", active.id)
    .eq("client_key", String(clientKey).slice(0, 80))
    .maybeSingle();
  if (error || !data) return null;
  return data.payload ?? null;
}

/** Fire-and-forget: called when the draft became a SAVED document (D36) or
 *  the person discarded it. Failing to delete only leaves a stale row the
 *  picker shows once more — never worth failing a save over. */
export async function dropDraft(clientKey: string): Promise<void> {
  try {
    const user = await getSessionUser();
    if (!user) return;
    const active = await getActiveOrg();
    if (!active) return;
    const supabase = await getSupabaseServer();
    await supabase
      .from("minutes_drafts")
      .delete()
      .eq("org_id", active.id)
      .eq("client_key", String(clientKey).slice(0, 80));
  } catch {
    // best-effort
  }
}
