"use client";

// ---------------------------------------------------------------------------
// STORAGE RELAY — browser half (A-4, work order 51). See upload-relay.ts for
// the why. A document too big for Vercel's ~4.5MB body cap goes STRAIGHT to
// Supabase Storage from here (the user-scoped browser client — storage RLS is
// the boundary, exactly like every other client write), and the API route is
// sent only the path. D0-3 (work order 56): PDFs AND .docx/.pptx ride it.
//
// Every door calls maybeRelayLargeDocument() right after the shrink+size
// check:
//   null        → not a relay case (no relay road for this type) — the door
//                 keeps its existing honest "too large" refusal.
//   {ok:true}   → append storagePath to the form INSTEAD of the file.
//   {ok:false}  → show the error, send nothing.
// ---------------------------------------------------------------------------

import { getSupabaseBrowser } from "@/db/supabase-browser";
import {
  isTooLargeToUpload,
  shrinkPhotoForUpload,
  tooLargeToUploadMessage,
} from "@/lib/shrink-photo";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import {
  RELAY_MAX_BYTES,
  RELAY_MIME,
  relayKindFor,
  relayPathFor,
  staleRelayNames,
} from "@/lib/upload-relay";

export type RelayOutcome =
  | { ok: true; storagePath: string }
  | { ok: false; error: string };

/** The active org, the same way org-chip.tsx reads it. NOT a security
 *  boundary — a tampered cookie just makes storage RLS reject the upload. */
function activeOrgIdFromCookie(): number | null {
  const match = document.cookie.match(/(?:^|;\s*)minit_active_org=(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Relay `file` via Storage when it is a PDF / .docx / .pptx that cannot ride
 * the request body. Files with no relay road return null and take their
 * existing path (the honest refusal).
 */
export async function maybeRelayLargeDocument(
  file: File,
): Promise<RelayOutcome | null> {
  const kind = relayKindFor(file.name, file.type);
  if (kind === null) return null;
  if (file.size > RELAY_MAX_BYTES) {
    // The honest wall that remains: the AI vendor's own request ceiling.
    return {
      ok: false,
      error: joinUserError(
        kind === "pdf" ? USER_ERRORS.pdfTooBigForAi : USER_ERRORS.officeTooBigForAi,
      ),
    };
  }

  const orgId = activeOrgIdFromCookie();
  if (orgId === null) {
    // The doors are disabled without an organisation, so reaching this means
    // the cookie vanished mid-session — a refresh restores it.
    return { ok: false, error: joinUserError(USER_ERRORS.serverError) };
  }

  const storage = getSupabaseBrowser().storage.from("uploads");

  // Sweep abandoned relay files (uploaded, never sent — a closed tab) while
  // we are here. Best-effort; the org's own folder only, bounded list.
  try {
    const { data: listed } = await storage.list(`${orgId}/relay`, { limit: 100 });
    const stale = staleRelayNames((listed ?? []).map((o) => o.name));
    if (stale.length > 0) {
      await storage.remove(stale.map((n) => `${orgId}/relay/${n}`));
    }
  } catch {
    // Sweeping is housekeeping, never a reason to fail the person's upload.
  }

  const path = relayPathFor(orgId, file.name);
  const { error } = await storage.upload(path, file, {
    contentType: RELAY_MIME[kind],
  });
  if (error) {
    // The upload never left (or storage refused it): nothing was charged.
    return { ok: false, error: joinUserError(USER_ERRORS.networkNoCharge) };
  }
  return { ok: true, storagePath: path };
}

export type PreparedUpload =
  | { send: "file"; file: File }
  | { send: "relay"; storagePath: string }
  | { send: "refuse"; error: string };

/**
 * The WHOLE pre-flight every upload door runs, in one call: shrink a photo,
 * relay a big PDF / Word / PowerPoint file via Storage, refuse honestly what
 * neither road can carry. Doors append `file` or `storagePath` to the form
 * accordingly and show `error` verbatim — no door invents its own limit
 * logic again.
 */
export async function prepareUploadForSend(file: File): Promise<PreparedUpload> {
  // 48: shrink photos in the browser first — a phone photo (3–8MB) dies on
  // Vercel's ~4.5MB body cap with a text/plain 413 our code never sees.
  const sent = await shrinkPhotoForUpload(file);
  if (!isTooLargeToUpload(sent.size)) return { send: "file", file: sent };
  // A-4 + D0-3: too big for the request body — documents take the relay.
  const relayed = await maybeRelayLargeDocument(sent);
  if (relayed === null) return { send: "refuse", error: tooLargeToUploadMessage() };
  if (!relayed.ok) return { send: "refuse", error: relayed.error };
  return { send: "relay", storagePath: relayed.storagePath };
}
