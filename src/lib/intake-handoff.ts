"use client";

// ---------------------------------------------------------------------------
// HAND-OFF from the home page's "one door" upload box to the page that reviews
// the result.
//
// WHY (user request, 2026-07-28)
// The home page now takes ANY page of society paperwork, works out what it is
// (/api/intake), and reads it — so by the time the person arrives at /minutes or
// /money the work is already done. The extraction therefore has to survive one
// client-side navigation.
//
// Deliberately a ONE-SHOT parcel, not another store:
//   * written by the home page, read exactly once by the destination, then
//     deleted (`consumeIntake`). It is a courier, not a source of truth.
//   * stamped with a time and ignored if stale, so a tab left open for a day
//     cannot silently drop yesterday's ledger into today's review screen.
//   * shape-checked on read: this crosses a page boundary, so the reader must
//     not trust it (the same lesson as usePersistentState).
//
// PDPA: it holds extracted facts, so it lives only in this browser and is
// removed as soon as it has been used.
// ---------------------------------------------------------------------------

const KEY = "minit.intake.v1";
/** Older than this and we assume the person moved on. */
const MAX_AGE_MS = 30 * 60 * 1000;

export type IntakeKind = "meeting_notes" | "ledger_page" | "constitution";

export type IntakeParcel = {
  kind: IntakeKind;
  /** The file it came from, so the destination can show "📄 nota-jun.jpg". */
  fileName: string;
  /** Validated on the server by the matching zod schema before it got here. */
  extraction: unknown;
  /**
   * 28/8 evening — where /api/intake stored the ORIGINAL in the uploads
   * bucket, so a meeting that came through the front door links its photo
   * into the saved document (minutes_docs.photo_paths) exactly like one
   * photographed on /minutes. Optional: older parcels and failed uploads.
   */
  storagePath?: string | null;
  /** A small JPEG preview of the page, when the home page could make one —
   *  what the workspace thumbnails show. Optional (PDFs have none). */
  photoDataUrl?: string | null;
  /** Date.now() when the home page wrote it. */
  at: number;
};

function isKind(v: unknown): v is IntakeKind {
  return v === "meeting_notes" || v === "ledger_page" || v === "constitution";
}

export function writeIntake(parcel: Omit<IntakeParcel, "at">): void {
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...parcel, at: Date.now() }),
    );
  } catch {
    // Storage unavailable: the caller falls back to sending the person to the
    // page empty-handed, which is recoverable (they can re-take the photo).
  }
}

/**
 * Read and DELETE the parcel, if there is a fresh one of the expected kind.
 * Returns null otherwise — the destination then behaves exactly as before.
 */
export function consumeIntake(expected: IntakeKind): IntakeParcel | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;

  let parcel: IntakeParcel | null = null;
  try {
    parcel = asParcel(JSON.parse(raw));
  } catch {
    parcel = null;
  }

  // Unreadable or stale: delete it so it cannot surprise someone later.
  // A parcel for a DIFFERENT page is deliberately LEFT ALONE — /minutes must not
  // eat a ledger page on its way to /money.
  if (!parcel || parcel.kind !== expected || Date.now() - parcel.at > MAX_AGE_MS) {
    if (!parcel || Date.now() - (parcel?.at ?? 0) > MAX_AGE_MS) clearIntake();
    return null;
  }

  clearIntake();
  return parcel;
}

/** Shape guard: this parcel crossed a page boundary, so it is not trusted. */
function asParcel(v: unknown): IntakeParcel | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (!isKind(r.kind)) return null;
  if (typeof r.fileName !== "string") return null;
  if (typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  if (r.extraction === undefined || r.extraction === null) return null;
  return {
    kind: r.kind,
    fileName: r.fileName,
    extraction: r.extraction,
    storagePath: typeof r.storagePath === "string" ? r.storagePath : null,
    photoDataUrl: typeof r.photoDataUrl === "string" ? r.photoDataUrl : null,
    at: r.at,
  };
}

export function clearIntake(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
