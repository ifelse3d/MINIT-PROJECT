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

import { adoptLegacyKey, scopedKey } from "@/lib/storage-scope-core";

/** Pre-S0-4 global key — adopted into the scoped key once, then removed. */
const MINUTES_STORE_LEGACY_KEY = "minit.minutes.v1";

/** S0-4: scoped per user+org, so a shared laptop cannot show one member's
 *  half-checked minutes (photo included) to the next member who signs in. */
export function minutesStoreKey(): string {
  return scopedKey("minutes:v1");
}

/** I-2 (26 号报告 §3-2): one merged page, with the photo it came from.
 *  `storagePath` (migration 30): where the ORIGINAL landed in the uploads
 *  bucket — the save hands these to minutes_docs.photo_paths so History can
 *  show the handwriting behind a saved document. Optional: older blobs, typed
 *  pages and failed uploads simply have none. */
export type PhotoPage = { name: string; dataUrl: string; storagePath?: string | null };

export type SavedMinutes = {
  extraction: MeetingNotesExtraction;
  sourceLabel: string | null;
  /** Legacy single-photo slot — still written (the LAST page) so an older
   *  build reading this blob keeps showing something. */
  photoDataUrl: string | null;
  /**
   * I-2: EVERY merged page's photo, in reading order. Before this, a
   * multi-page merge kept only the last photo — so "view the original"
   * opened page 2 while the amber field being checked came from page 1.
   * Optional: older blobs read as "one page at most".
   */
  photoPages?: PhotoPage[];
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
  /**
   * The society's own name for this document (J 28/8 item 3). Optional —
   * older blobs have none and the suggestion regenerates from the fields.
   */
  title?: string;
  /**
   * 0-1 (26 号报告 2-1): true when THIS workspace content has been saved to
   * the organisation's History. It has to survive a reload — next month's
   * photo must trigger the "same meeting, or a new one?" question, or the new
   * meeting silently merges into the saved one. Optional like the others:
   * older blobs read as "not saved", which only means the question is not
   * asked — the safe direction.
   */
  savedToHistory?: boolean;
};

export function loadSavedMinutes(): SavedMinutes | null {
  try {
    const key = minutesStoreKey();
    adoptLegacyKey(key, MINUTES_STORE_LEGACY_KEY);
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SavedMinutes) : null;
  } catch {
    return null;
  }
}

/** "ok" | "photo-dropped" | "failed" — the caller must tell the user. */
export type SaveOutcome = "ok" | "photo-dropped" | "failed";

export function saveMinutes(state: SavedMinutes): SaveOutcome {
  try {
    localStorage.setItem(minutesStoreKey(), JSON.stringify(state));
    return "ok";
  } catch {
    // Quota exceeded — keep the fields rather than losing everything, but the
    // photo is the ONLY way to check the extraction against the handwriting, so
    // silently dropping it (the old behaviour) meant the audit evidence
    // vanished with no notice and the failing write repeated on every keystroke.
    // We now report the outcome so the UI can say so. (2026-07-28 audit.)
    try {
      localStorage.setItem(
        minutesStoreKey(),
        JSON.stringify({ ...state, photoDataUrl: null, photoPages: [] }),
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
