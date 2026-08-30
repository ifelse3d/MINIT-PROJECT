"use client";

// 97 §6: ONE way to turn a stored original's storage path into a short-lived
// signed URL — shared by every "look back at the original" surface in the
// minutes flow (workspace thumbs, attendance, the finished-document strip).
// signPhotoPaths runs user-scoped on the server; storage RLS decides whose
// files sign (Hard Rule 5). null = could not sign; the caller stays honest.

import { signPhotoPaths } from "./draft-actions";

export async function signedUrlForOriginal(
  storagePath: string,
): Promise<string | null> {
  try {
    const signed = await signPhotoPaths([storagePath]);
    return signed[0]?.url ?? null;
  } catch {
    return null;
  }
}
