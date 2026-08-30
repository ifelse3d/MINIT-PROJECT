"use client";

// ---------------------------------------------------------------------------
// THE CONSTITUTION READER — browser half of the segmented read (I1, work
// order 81, 2026-08-30). One helper, every door: /constitution, create-org,
// and the home door's long-PDF path all read a constitution through here.
//
// WHAT IT DOES. Counts the pages of what the person picked; a long PDF is
// SPLIT in the browser (pdf-lib is already a dependency) into segments of
// CONSTITUTION_SEGMENT_PAGES pages, and each segment goes to
// /api/extract-constitution as its own request — so no single request ever
// meets the platform's 60s wall, which is what "The AI took too long" was.
// Several staged PHOTOS of one constitution are the same thing with the
// segments already cut. The clause lists merge in page order
// (mergeConstitutionExtractions), exactly like the multi-photo path always
// has.
//
// BILLING (J's ruling): the FIRST segment declares the document's total
// pages, pays the one extract action + the one A6 fence charge, and gets a
// continuation token; later segments ride the token and pay nothing.
//
// FAILURE (D0-1 semantics): a failed segment is retried once in place; if it
// still fails, everything read SO FAR is kept in the returned `resume`, and
// calling again with that resume continues from the failed segment on the
// same token — no second action, nothing re-read, nothing lost. The resume
// is bound to the exact files it came from (fingerprint), so a changed pick
// starts fresh.
// ---------------------------------------------------------------------------

import type { ConstitutionExtraction } from "@/lib/extraction";
import { mergeConstitutionExtractions } from "@/lib/extraction-merge";
import { prepareUploadForSend } from "@/lib/upload-relay-client";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { uploadErrorMessage } from "@/lib/shrink-photo";
import {
  needsSegmenting,
  planConstitutionSegments,
} from "@/lib/constitution-pages";

export type ConstitutionSegmentFile = {
  file: File;
  /** Pages in THIS piece (a photo is 1). */
  pages: number;
};

export type ConstitutionReadProgress = {
  /** 1-based segment being read right now. */
  segment: number;
  totalSegments: number;
  fileName: string;
};

/**
 * Everything needed to CONTINUE a partly-read document instead of paying for
 * it again. Held in memory by the door (a ref), never persisted — the token
 * inside expires server-side anyway.
 */
export type ConstitutionReadResume = {
  fingerprint: string;
  segments: ConstitutionSegmentFile[];
  totalPages: number | null;
  nextIndex: number;
  token: string | null;
  merged: ConstitutionExtraction | null;
  provider: string | null;
};

export type ConstitutionReadOutcome =
  | { ok: true; extraction: ConstitutionExtraction; provider: string | null }
  | {
      ok: false;
      message: string;
      /** null when there is nothing worth continuing (nothing read yet on a
       *  single-piece document, or the pick itself was refused). */
      resume: ConstitutionReadResume | null;
      /** 1-based segment that failed, for the door's progress sentence. */
      failedSegment: number;
      totalSegments: number;
    };

/** A resume is only good for EXACTLY the files it came from. */
export function fingerprintFiles(files: File[]): string {
  return files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
}

/**
 * ④ (work order 85): how many pages is this pick? For the price-and-time line
 * shown BEFORE a read starts. A single PDF is counted with pdf-lib (same as
 * planUploadSegments, without the splitting work); anything else is one page
 * per file. null = could not count (encrypted / odd scanner output) — the
 * door then shows no estimate rather than a wrong one.
 */
export async function countConstitutionPages(
  files: File[],
): Promise<number | null> {
  if (files.length === 0) return null;
  if (files.length === 1 && files[0].type === "application/pdf") {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(await files[0].arrayBuffer(), {
        updateMetadata: false,
        ignoreEncryption: true,
      });
      const total = doc.getPageCount();
      return Number.isInteger(total) && total > 0 ? total : null;
    } catch {
      return null;
    }
  }
  return files.length;
}

/**
 * Cut what was picked into segments. Photos are natural one-page segments;
 * a single long PDF is split with pdf-lib. A PDF whose pages cannot be
 * counted (or split) travels whole — the server then treats it exactly as it
 * always has, so the helper can never make an upload IMPOSSIBLE that used to
 * work.
 */
export async function planUploadSegments(
  files: File[],
): Promise<{ segments: ConstitutionSegmentFile[]; totalPages: number | null }> {
  if (files.length === 1 && files[0].type === "application/pdf") {
    const file = files[0];
    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes, {
        updateMetadata: false,
        ignoreEncryption: true,
      });
      const total = doc.getPageCount();
      if (!Number.isInteger(total) || total <= 0) {
        return { segments: [{ file, pages: 1 }], totalPages: null };
      }
      if (!needsSegmenting(total)) {
        return { segments: [{ file, pages: total }], totalPages: total };
      }
      const ranges = planConstitutionSegments(total);
      const segments: ConstitutionSegmentFile[] = [];
      for (const r of ranges) {
        const piece = await PDFDocument.create();
        const indices = Array.from(
          { length: r.to - r.from + 1 },
          (_, i) => r.from - 1 + i,
        );
        const copied = await piece.copyPages(doc, indices);
        for (const p of copied) piece.addPage(p);
        const saved = await piece.save();
        const base = file.name.replace(/\.pdf$/i, "");
        segments.push({
          file: new File([new Uint8Array(saved)], `${base} (ms ${r.from}-${r.to}).pdf`, {
            type: "application/pdf",
          }),
          pages: indices.length,
        });
      }
      return { segments, totalPages: total };
    } catch {
      // Encrypted / odd scanner output: send it whole, like before I1.
      return { segments: [{ file, pages: 1 }], totalPages: null };
    }
  }
  // Photos (possibly several pages of one constitution) — and, defensively,
  // anything else: each picked file is one segment.
  const segments = files.map((file) => ({ file, pages: 1 }));
  return { segments, totalPages: segments.length };
}

type RouteBody = {
  extraction?: unknown;
  error?: string;
  code?: string;
  continuation?: string | null;
  provider?: string;
};

/** One segment through the route. */
async function postSegment(
  seg: ConstitutionSegmentFile,
  opts: { token: string | null; declareTotal: number | null },
): Promise<
  | { outcome: "ok"; extraction: ConstitutionExtraction; provider: string | null; continuation: string | null }
  | { outcome: "stale-token" }
  | { outcome: "error"; message: string }
> {
  // 48 + A-4: shrink photos in the browser; relay a big PDF via Storage;
  // refuse honestly what neither road can carry. One helper, every door.
  const prepared = await prepareUploadForSend(seg.file);
  if (prepared.send === "refuse") return { outcome: "error", message: prepared.error };
  const form = new FormData();
  if (prepared.send === "file") form.append("photo", prepared.file);
  else form.append("storagePath", prepared.storagePath);
  if (opts.token) form.append("continuation", opts.token);
  else if (opts.declareTotal !== null) form.append("docPages", String(opts.declareTotal));
  let res: Response;
  try {
    res = await fetch("/api/extract-constitution", { method: "POST", body: form });
  } catch {
    // The request never left — nothing was charged, and saying so matters.
    return { outcome: "error", message: joinUserError(USER_ERRORS.networkNoCharge) };
  }
  const body = (await res.json().catch(() => null)) as RouteBody | null;
  if (res.status === 409 && body?.code === "CONTINUATION_INVALID") {
    // The pass expired (a long pause) — the caller starts a fresh CHARGED
    // request for what is left, which is honest, never silent double-billing.
    return { outcome: "stale-token" };
  }
  if (!res.ok || !body?.extraction) {
    return {
      outcome: "error",
      message: uploadErrorMessage(res.status, body?.error),
    };
  }
  return {
    outcome: "ok",
    extraction: body.extraction as ConstitutionExtraction,
    provider: body.provider ?? null,
    continuation: body.continuation ?? null,
  };
}

/**
 * Read everything the person staged as ONE constitution. `resume` (from an
 * earlier failure) continues instead of restarting; it is ignored unless it
 * matches these exact files.
 */
export async function readConstitutionFiles(
  files: File[],
  opts: {
    onProgress?: (p: ConstitutionReadProgress) => void;
    resume?: ConstitutionReadResume | null;
  } = {},
): Promise<ConstitutionReadOutcome> {
  const fingerprint = fingerprintFiles(files);
  const usable =
    opts.resume && opts.resume.fingerprint === fingerprint ? opts.resume : null;
  const { segments, totalPages } = usable
    ? { segments: usable.segments, totalPages: usable.totalPages }
    : await planUploadSegments(files);
  const total = segments.length;

  let merged: ConstitutionExtraction | null = usable?.merged ?? null;
  let provider: string | null = usable?.provider ?? null;
  let token: string | null = usable?.token ?? null;

  for (let i = usable?.nextIndex ?? 0; i < total; i++) {
    const seg = segments[i];
    opts.onProgress?.({ segment: i + 1, totalSegments: total, fileName: seg.file.name });

    /** Pages this and the remaining segments still hold — what a FRESH
     *  charged request must declare so the server can price and budget it. */
    const remaining = segments.slice(i).reduce((n, s) => n + s.pages, 0);
    const declareTotal = total - i > 1 ? remaining : null;

    /** One try, with the expired-pass fallback folded in: a stale token
     *  drops to a FRESH charged request for what is left (honest, never
     *  silent double-billing — and a fresh request refunds itself on
     *  failure). Without a token the server can never answer "stale". */
    const attempt = async (): Promise<
      | { outcome: "ok"; extraction: ConstitutionExtraction; provider: string | null; continuation: string | null }
      | { outcome: "error"; message: string }
    > => {
      const first = await postSegment(seg, { token, declareTotal });
      if (first.outcome !== "stale-token") return first;
      token = null;
      const second = await postSegment(seg, { token: null, declareTotal });
      return second.outcome === "stale-token"
        ? { outcome: "error", message: joinUserError(USER_ERRORS.serverError) }
        : second;
    };

    let r = await attempt();
    if (r.outcome === "error") {
      // One in-place retry: a transient hiccup should not stop a 30-page
      // walk at page 17. (The route refunds a fresh request's own charges on
      // failure, and a continuation charged nothing — retrying is free.)
      r = await attempt();
    }
    if (r.outcome === "error") {
      return {
        ok: false,
        message: r.message,
        resume:
          merged === null && total === 1
            ? null
            : {
                fingerprint,
                segments,
                totalPages,
                nextIndex: i,
                token,
                merged,
                provider,
              },
        failedSegment: i + 1,
        totalSegments: total,
      };
    }
    // From here r.outcome === "ok".
    merged = merged === null ? r.extraction : mergeConstitutionExtractions(merged, r.extraction);
    provider = r.provider ?? provider;
    token = r.continuation;
  }

  if (merged === null) {
    // Zero segments can only mean an empty pick — treat as unreadable.
    return {
      ok: false,
      message: joinUserError(USER_ERRORS.aiCouldNotRead),
      resume: null,
      failedSegment: 1,
      totalSegments: Math.max(total, 1),
    };
  }
  return { ok: true, extraction: merged, provider };
}
