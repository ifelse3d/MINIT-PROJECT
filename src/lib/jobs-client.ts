"use client";

// ---------------------------------------------------------------------------
// THE QUEUE'S BROWSER HALF (work order 105 §1) — the loop that drives a long
// read to the end, and the little bit of memory that makes closing the tab
// harmless.
//
// WHY THE BROWSER DRIVES (§1-1, answered before the code was written): this
// project deploys on Vercel HOBBY, whose cron fires once a DAY — a server-side
// pusher cannot exist there at any useful cadence. A browser loop needs no
// plan change, no new vendor and no new secret, and the progress line comes
// free with it. If the deployment ever moves to a plan with minute crons, a
// server pusher can be added BESIDE this; this road must keep working on its
// own either way.
//
// WHAT "CLOSING THE TAB IS NOT A FAILURE" MEANS HERE. The work lives in the
// ai_jobs row, not in this file. All this keeps is the job id, so the same
// browser offers to carry on where it was; a different device finds the same
// document through /api/job/open instead. Neither is the source of truth.
// ---------------------------------------------------------------------------

import { getSupabaseBrowser } from "@/db/supabase-browser";
import { jobSourcePathFor } from "@/lib/upload-relay";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import type { JobEstimate, JobKind } from "@/lib/jobs-core";

/** Where the "you were reading this" note lives. Per device, per browser. */
const OPEN_JOB_KEY = "minit.openJob";

export type OpenJobNote = {
  jobId: number;
  kind: JobKind;
  fileName: string;
  totalBatches: number;
};

export function rememberOpenJob(note: OpenJobNote): void {
  try {
    window.localStorage.setItem(OPEN_JOB_KEY, JSON.stringify(note));
  } catch {
    // Private mode / storage disabled: the read still works, it just cannot
    // be picked up again from THIS device by memory alone.
  }
}

export function forgetOpenJob(): void {
  try {
    window.localStorage.removeItem(OPEN_JOB_KEY);
  } catch {
    // ignore
  }
}

export function readOpenJob(): OpenJobNote | null {
  try {
    const raw = window.localStorage.getItem(OPEN_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OpenJobNote>;
    if (typeof parsed?.jobId !== "number" || !Number.isInteger(parsed.jobId)) return null;
    return {
      jobId: parsed.jobId,
      kind: (parsed.kind ?? "meeting_notes") as JobKind,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : "",
      totalBatches: typeof parsed.totalBatches === "number" ? parsed.totalBatches : 1,
    };
  } catch {
    return null;
  }
}

/** The active org, the same way the relay reads it. NOT a security boundary —
 *  a tampered cookie only makes storage RLS refuse the upload. */
function activeOrgIdFromCookie(): number | null {
  const match = document.cookie.match(/(?:^|;\s*)minit_active_org=(\d+)/);
  return match ? Number(match[1]) : null;
}

export type JobStartOutcome =
  | {
      ok: true;
      jobId: number;
      kind: JobKind;
      fileName: string;
      totalBatches: number;
      totalPages: number;
      estimate: JobEstimate;
    }
  /** Not a failure: this document does not need the queue (or the queue is
   *  not ready on this deployment). The door takes its ordinary road. */
  | { ok: false; fallback: true; reason: string }
  | { ok: false; fallback: false; message: string };

/**
 * Put the original where the queue can reach it, and open the job.
 * Charges nothing — the estimate comes back so the person can agree to it
 * first (§1-2: 「預估講在前面」).
 */
export async function startJob(
  file: File,
  kind: JobKind,
  context: string,
): Promise<JobStartOutcome> {
  const orgId = activeOrgIdFromCookie();
  if (orgId === null) {
    return { ok: false, fallback: false, message: joinUserError(USER_ERRORS.serverError) };
  }
  const path = jobSourcePathFor(orgId, file.name);
  try {
    const { error } = await getSupabaseBrowser()
      .storage.from("uploads")
      .upload(path, file, { contentType: "application/pdf" });
    if (error) {
      // The upload never left — nothing charged, and the ordinary road may
      // still manage this document.
      return { ok: false, fallback: true, reason: "upload" };
    }
  } catch {
    return { ok: false, fallback: true, reason: "upload" };
  }

  const form = new FormData();
  form.append("storagePath", path);
  form.append("kind", kind);
  form.append("fileName", file.name);
  if (context.trim() !== "") form.append("context", context.trim());

  let res: Response;
  try {
    res = await fetch("/api/job/start", { method: "POST", body: form });
  } catch {
    return { ok: false, fallback: true, reason: "network" };
  }
  const body = (await res.json().catch(() => null)) as
    | {
        available?: boolean;
        reason?: string;
        jobId?: number;
        kind?: JobKind;
        fileName?: string;
        totalBatches?: number;
        totalPages?: number;
        estimate?: JobEstimate;
        error?: string;
      }
    | null;
  if (!res.ok) {
    return {
      ok: false,
      fallback: false,
      message: body?.error ?? joinUserError(USER_ERRORS.serverError),
    };
  }
  if (!body?.available || typeof body.jobId !== "number") {
    return { ok: false, fallback: true, reason: body?.reason ?? "unavailable" };
  }
  return {
    ok: true,
    jobId: body.jobId,
    kind: body.kind ?? kind,
    fileName: body.fileName ?? file.name,
    totalBatches: body.totalBatches ?? 1,
    totalPages: body.totalPages ?? 0,
    estimate: body.estimate as JobEstimate,
  };
}

export type JobProgress = {
  batchesDone: number;
  totalBatches: number;
  percent: number;
  /** True while another tab is holding this batch. */
  waiting: boolean;
};

export type JobRunOutcome =
  | { ok: true; extraction: unknown; kind: JobKind; fileName: string; storagePath: string | null }
  | {
      ok: false;
      message: string;
      /** True when the job is only paused: pressing again continues it, and
       *  the parts already read are never charged twice. */
      resumable: boolean;
      batchesDone: number;
      totalBatches: number;
    };

type StepBody = {
  status?: string;
  batchesDone?: number;
  totalBatches?: number;
  percent?: number;
  busy?: boolean;
  extraction?: unknown;
  kind?: JobKind;
  fileName?: string;
  storagePath?: string | null;
  error?: string;
};

/**
 * Drive the job to the end, one batch per request. Every call is well inside
 * the platform's 60s wall; the loop is what makes the DOCUMENT unbounded.
 *
 * A busy answer (another tab has the lease) is waited out rather than fought
 * over — two tabs reading the same document must never read the same pages
 * twice, because pages are money.
 */
export async function runJob(
  jobId: number,
  opts: { onProgress?: (p: JobProgress) => void; signal?: AbortSignal } = {},
): Promise<JobRunOutcome> {
  let batchesDone = 0;
  let totalBatches = 1;
  let waits = 0;

  // Bounded on purpose: the longest document the page caps admit is 50 pages
  // = 13 batches, and a batch may legitimately be retried. This ceiling only
  // stops a runaway loop, it is never reached by a real document.
  for (let i = 0; i < 200; i++) {
    if (opts.signal?.aborted) {
      return {
        ok: false,
        resumable: true,
        batchesDone,
        totalBatches,
        message: joinUserError({
          bm: "Bacaan dihentikan. Apa yang sudah dibaca disimpan — sambung bila-bila masa.",
          zh: "读取停下来了。已经读好的都留着 —— 随时可以接着读。",
          en: "The read was stopped. What has been read is kept — continue any time.",
        }),
      };
    }
    let res: Response;
    try {
      res = await fetch("/api/job/step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
        signal: opts.signal,
      });
    } catch {
      return {
        ok: false,
        resumable: true,
        batchesDone,
        totalBatches,
        message: joinUserError(USER_ERRORS.networkNoCharge),
      };
    }
    const body = (await res.json().catch(() => null)) as StepBody | null;
    if (!body) {
      return {
        ok: false,
        resumable: true,
        batchesDone,
        totalBatches,
        message: joinUserError(USER_ERRORS.serverError),
      };
    }
    batchesDone = body.batchesDone ?? batchesDone;
    totalBatches = body.totalBatches ?? totalBatches;
    opts.onProgress?.({
      batchesDone,
      totalBatches,
      percent: body.percent ?? 0,
      waiting: body.busy === true,
    });

    if (body.busy) {
      // Another tab holds it. Wait a beat and ask again, backing off a little
      // so a forgotten tab does not turn into a hot loop.
      waits += 1;
      if (waits > 40) {
        return {
          ok: false,
          resumable: true,
          batchesDone,
          totalBatches,
          message: joinUserError({
            bm: "Dokumen ini sedang dibaca di tetingkap lain. Tunggu sebentar, atau tutup tetingkap itu dan cuba lagi.",
            zh: "这份文件正在另一个视窗里读。请等一下，或者关掉那个视窗再试。",
            en: "This document is being read in another window. Wait a moment, or close that window and try again.",
          }),
        };
      }
      await new Promise((r) => setTimeout(r, Math.min(1000 + waits * 500, 5000)));
      continue;
    }
    waits = 0;

    if (body.status === "done") {
      return {
        ok: true,
        extraction: body.extraction,
        kind: (body.kind ?? "meeting_notes") as JobKind,
        fileName: body.fileName ?? "",
        storagePath: body.storagePath ?? null,
      };
    }
    if (body.status === "failed" || res.status === 402) {
      return {
        ok: false,
        resumable: false,
        batchesDone,
        totalBatches,
        message: body.error ?? joinUserError(USER_ERRORS.serverError),
      };
    }
    if (!res.ok) {
      // A single batch wobbled (503). The row already knows; going round
      // again retries THAT batch, and it was refunded, so this costs nothing
      // extra. The attempts counter is what stops it forever.
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return {
    ok: false,
    resumable: true,
    batchesDone,
    totalBatches,
    message: joinUserError(USER_ERRORS.serverError),
  };
}
