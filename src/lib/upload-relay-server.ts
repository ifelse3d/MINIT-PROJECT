// ---------------------------------------------------------------------------
// STORAGE RELAY — server half (A-4, work order 51). See upload-relay.ts for
// the why and the path shape. This file turns a relay path sent by the
// browser back into a File the extract routes can treat EXACTLY like a
// directly-uploaded one, so each route changes by four lines, not forty.
//
// Trust model: the path is browser input. Three walls, in order —
//   1. isRelayPathForOrg(): well-formed and claims the ACTIVE org;
//   2. the download runs on the USER-scoped client, so storage RLS (the real
//      boundary) rejects anything the user cannot read regardless of claim;
//   3. looksLikePdf(): the bytes must prove they are a PDF before any quota
//      is charged for reading them.
//
// "Read it, then clean it": the relay object is deleted as soon as its bytes
// are in memory — success or failure downstream, nothing lingers. The
// permanent copy (org history) is made by the routes' existing recordUpload()
// on the success path, same as a direct upload. Files whose POST never came
// (tab closed) are swept client-side by the next relay upload (see
// upload-relay-client.ts).
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { USER_ERRORS, type UserError } from "@/lib/user-errors";
import {
  RELAY_MAX_BYTES,
  isRelayPathForOrg,
  looksLikePdf,
  relayFileName,
} from "./upload-relay";

export type RelayedFileResult =
  | { ok: true; file: File }
  | { ok: false; status: number; error: UserError };

/**
 * `null` when the form carried no storagePath at all — the caller then falls
 * through to its ordinary "no photo chosen" answer.
 */
export async function fileFromRelay(
  relayPathRaw: unknown,
): Promise<RelayedFileResult | null> {
  if (typeof relayPathRaw !== "string" || relayPathRaw === "") return null;

  const active = await getActiveOrg();
  if (!active || !isRelayPathForOrg(relayPathRaw, active.id)) {
    // A malformed or foreign path is not a user mistake the person can fix —
    // it is a client bug or tampering. Generic sentence, no charge happened.
    return { ok: false, status: 400, error: USER_ERRORS.serverError };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.storage
    .from("uploads")
    .download(relayPathRaw);
  if (error || !data) {
    // The browser said it uploaded this moments ago; if it is not there the
    // storage hiccuped (or the sweeper of a very stale tab won). Nothing was
    // charged — "try again" is honest.
    return { ok: false, status: 400, error: USER_ERRORS.serverError };
  }
  const bytes = await data.arrayBuffer();

  // Read it, then clean it — before any verdict, so no branch can forget.
  // Best-effort: a failed delete only means the client sweeper gets it later.
  try {
    await supabase.storage.from("uploads").remove([relayPathRaw]);
  } catch {
    // ignore
  }

  if (bytes.byteLength > RELAY_MAX_BYTES) {
    return { ok: false, status: 400, error: USER_ERRORS.pdfTooBigForAi };
  }
  if (!looksLikePdf(bytes)) {
    // Only PDFs ride the relay (photos shrink; Office files are small text).
    return { ok: false, status: 400, error: USER_ERRORS.unsupportedLedgerFile };
  }

  return {
    ok: true,
    file: new File([new Uint8Array(bytes)], relayFileName(relayPathRaw), {
      type: "application/pdf",
    }),
  };
}
