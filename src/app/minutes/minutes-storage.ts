"use client";

import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// Where a half-finished set of minutes lives between visits.
//
// Pulled out of minutes-review.tsx on 2026-08-23 when /minutes was split into
// four pages: the store (minutes-store.tsx) is the only caller now, but the KEY
// and the SHAPE are load-bearing — /filings reads the same key — so they get a
// file of their own rather than being buried in a screen.
//
// 🔴 The format is deliberately unchanged by the split: work saved by the old
// single-page build reads straight back into the new one.
// ---------------------------------------------------------------------------

// --- keep work on this device so navigating away loses NOTHING (Phase 7
// moves this into the shared database). Photo is stored compressed so the
// original handwriting can always be checked against the extraction.
export const MINUTES_STORE_KEY = "minit.minutes.v1";

export type SavedMinutes = {
  extraction: MeetingNotesExtraction;
  sourceLabel: string | null;
  photoDataUrl: string | null;
  /**
   * True when this set of minutes was TYPED, not photographed — so there is no
   * file name and no original image, and that is correct rather than missing.
   *
   * Optional on purpose: a blob written before 2026-08-23 has no such key, and
   * `undefined` reads as false, which is exactly right for work that did come
   * from a photo. Nothing has to be migrated.
   */
  typed?: boolean;
  /**
   * True when a human has said, in so many words, that this meeting's notes do
   * not record who attended.
   *
   * Optional for the same reason `typed` is: a blob written before 2026-08-23
   * has no such key, `undefined` reads as false, and the person is asked once.
   */
  noAttendees?: boolean;
};

export function loadSavedMinutes(): SavedMinutes | null {
  try {
    const raw = localStorage.getItem(MINUTES_STORE_KEY);
    return raw ? (JSON.parse(raw) as SavedMinutes) : null;
  } catch {
    return null;
  }
}

/** "ok" | "photo-dropped" | "failed" — the caller must tell the user. */
export type SaveOutcome = "ok" | "photo-dropped" | "failed";

export function saveMinutes(state: SavedMinutes): SaveOutcome {
  try {
    localStorage.setItem(MINUTES_STORE_KEY, JSON.stringify(state));
    return "ok";
  } catch {
    // Quota exceeded — keep the fields rather than losing everything, but the
    // photo is the ONLY way to check the extraction against the handwriting, so
    // silently dropping it (the old behaviour) meant the audit evidence
    // vanished with no notice and the failing write repeated on every keystroke.
    // We now report the outcome so the UI can say so. (2026-07-28 audit.)
    try {
      localStorage.setItem(
        MINUTES_STORE_KEY,
        JSON.stringify({ ...state, photoDataUrl: null }),
      );
      return "photo-dropped";
    } catch {
      return "failed";
    }
  }
}

/** Downscale the photo to ≤1400px JPEG so it fits localStorage. */
export async function compressPhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}
