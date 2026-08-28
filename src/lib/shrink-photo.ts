// ---------------------------------------------------------------------------
// CLIENT-SIDE PHOTO SHRINKING — so a phone photo survives the trip to Vercel.
//
// WHY THIS EXISTS (工作单 48, 2026-08-28, proven by scripts/probe-payload.mjs):
// Vercel rejects any serverless request body over ~4.5MB with a PLATFORM-level
// 413 ("FUNCTION_PAYLOAD_TOO_LARGE", plain text) — the request never reaches
// our code, so no app_errors row, no ai_usage row, and the browser's fallback
// sentence blamed the AI. Our own server limit is 8MB (MAX_BYTES in the
// extract routes), which a phone photo (3–8MB) fits but the platform does not.
// This is the mirror of the STATE.md trap "a limit must fit the largest thing
// another limit on the same path allows": the platform's limit is SMALLER than
// our promise. Local dev has no such limit, which is why "it works on my
// machine" was true.
//
// The fix: shrink photos IN THE BROWSER before upload (long edge ≤2000px is
// plenty for reading handwriting), and refuse honestly when even that cannot
// get the file under the transport limit. A shrink failure must never become a
// new dead end: any error here returns the ORIGINAL file (HEIC the browser
// cannot decode included — the server accepts HEIC).
// ---------------------------------------------------------------------------

import { joinUserError, USER_ERRORS } from "@/lib/user-errors";

/**
 * Anything bigger than this is refused BEFORE the fetch, with a sentence that
 * says what to do — because sending it would get the platform's text/plain 413
 * instead of our JSON. 4MB, not 4.5MB: multipart boundaries, the context
 * field, and header overhead all ride in the same body.
 */
export const UPLOAD_HARD_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Shrinking aims below this, with margin under the hard limit, so a photo that
 * "just fits" can never be tipped over the edge by form overhead.
 */
export const SHRINK_TARGET_BYTES = 3.5 * 1024 * 1024;

/**
 * Tried in order until the result is under SHRINK_TARGET_BYTES. 2000px on the
 * long edge is comfortably enough for the model to read handwriting (the eval
 * photos are smaller); the later steps only exist for pathological inputs.
 */
export const SHRINK_LADDER = [
  { maxEdge: 2000, quality: 0.8 },
  { maxEdge: 2000, quality: 0.65 },
  { maxEdge: 1600, quality: 0.6 },
  { maxEdge: 1280, quality: 0.55 },
] as const;

/**
 * Baking the EXIF rotation into the pixels is part of the contract: the
 * re-encoded JPEG has no EXIF tag any more, so a phone photo shot in portrait
 * must be rotated HERE or the model reads it sideways.
 */
export const EXIF_DECODE_OPTIONS = { imageOrientation: "from-image" } as const;

/** Only images can be shrunk, and only when they are actually too big. */
export function needsShrink(type: string, bytes: number): boolean {
  return type.startsWith("image/") && bytes > SHRINK_TARGET_BYTES;
}

export function isTooLargeToUpload(bytes: number): boolean {
  return bytes > UPLOAD_HARD_LIMIT_BYTES;
}

/** Scale (width, height) to fit maxEdge on the long side. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The message for every "refused before the fetch / platform 413" case, in one
 * place so the pre-check and the response handler cannot drift apart.
 */
export function tooLargeToUploadMessage(): string {
  return joinUserError(USER_ERRORS.fileTooLargeForUpload);
}

/**
 * What to show when an AI upload's response was not usable. `serverError` is
 * the JSON `error` the server sent, when there was one — always preferred,
 * it is specific. 413 without JSON is the transport refusing the file (the
 * platform's text/plain page): say "too large", never "AI unreachable".
 */
export function uploadErrorMessage(
  status: number,
  serverError: string | null | undefined,
): string {
  if (serverError) return serverError;
  if (status === 413) return tooLargeToUploadMessage();
  return joinUserError(USER_ERRORS.aiUnavailable);
}

// --- the shrink loop, with its IO injectable so vitest (node) can test it ---

export type ShrinkIo = {
  /** Decode to pixel dimensions + an opaque drawable source. May throw. */
  decode: (file: File) => Promise<{
    width: number;
    height: number;
    source: unknown;
    close?: () => void;
  }>;
  /** Re-encode at the given size/quality; null when encoding is unavailable. */
  encode: (
    source: unknown,
    width: number,
    height: number,
    quality: number,
  ) => Promise<Blob | null>;
};

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

/**
 * Shrink `file` until it fits SHRINK_TARGET_BYTES, walking SHRINK_LADDER.
 * Returns the ORIGINAL file untouched when: it does not need shrinking, it is
 * not an image, decoding fails (HEIC on a browser without a decoder), or no
 * attempt produced something smaller. Never throws.
 */
export async function shrinkWithIo(file: File, io: ShrinkIo): Promise<File> {
  if (!needsShrink(file.type, file.size)) return file;
  try {
    const decoded = await io.decode(file);
    try {
      let best: Blob | null = null;
      for (const step of SHRINK_LADDER) {
        const { width, height } = fitWithin(
          decoded.width,
          decoded.height,
          step.maxEdge,
        );
        const blob = await io.encode(decoded.source, width, height, step.quality);
        if (!blob || blob.size === 0) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= SHRINK_TARGET_BYTES) break;
      }
      if (best && best.size < file.size) {
        return new File([best], jpegName(file.name), { type: "image/jpeg" });
      }
      return file;
    } finally {
      decoded.close?.();
    }
  } catch {
    // A shrink failure must never become the new reason an upload dies.
    return file;
  }
}

const browserIo: ShrinkIo = {
  decode: async (file) => {
    const bitmap = await createImageBitmap(file, EXIF_DECODE_OPTIONS);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  encode: async (source, width, height, quality) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source as ImageBitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
  },
};

/** The browser entry point every photo gate calls before building FormData. */
export function shrinkPhotoForUpload(file: File): Promise<File> {
  return shrinkWithIo(file, browserIo);
}
