// ---------------------------------------------------------------------------
// THE QUEUE'S ARITHMETIC — batching, pricing and the little state machine that
// says what a half-read document should do next. Pure logic, no I/O, unit
// tested (CLAUDE.md rule 13: the pure part lands in src/lib BEFORE the routes
// and the UI divide, or four callers grow four copies of it).
//
// WHY A QUEUE AT ALL (work order 105 §1, J 2026-08-31 night: 「超過 10 頁的
// FILE 讀不到」). The wall is physical and it is written out at the top of
// src/lib/ai/http.ts: Vercel kills one request at 60s, the route gives the
// vendor 50s, one attempt gets 45s, and 45s of generation at the measured
// ≥410 tok/s is ~18k output tokens ≈ 10–18 dense pages. A constitution has
// been split since work order 81; EVERY OTHER long document still went to the
// vendor whole and died there — a 12-page ledger PDF dropped on the home page
// was classified, charged, read for 45 seconds and refused.
//
// So the same trick the constitution reader already uses becomes the base for
// all of them, with one thing added: the progress lives in the DATABASE
// (ai_jobs), not in a browser variable. Closing the tab is then not a
// failure — the row is still there, and the person (or a colleague on another
// phone) picks the document up from the batch it stopped on.
//
// WHAT DRIVES IT. The BROWSER does: it holds a job id and calls
// /api/job/step until the job says it is finished. §1-1 of the work order
// asked which driver to use and this file's answer is written into the
// report — the deployment is Vercel HOBBY (DEPLOY.md), whose cron runs once a
// DAY, so a server-side pusher cannot exist there at any useful cadence.
// A browser loop needs no plan, no new vendor and no new secret, and it gives
// the progress line away for free.
//
// PRICING — D47, now the one formula for every queued read (see
// constitution-pages.ts for the ruling and the pinned numbers). A document
// that still fits ONE request is charged exactly as it was before this file
// existed: one extract action. Only documents that have to be cut — the ones
// that used to fail — are priced by the page formula, because each batch is a
// real vendor call and five vendor calls for one action is the arithmetic
// D47 was written to stop.
// ---------------------------------------------------------------------------

import { pctOfQuota } from "@/lib/quota-display";
import {
  CONSTITUTION_SEGMENT_PAGES,
  constitutionActionsDelta,
  constitutionReadActions,
  planConstitutionSegments,
  type ConstitutionSegmentRange,
} from "@/lib/constitution-pages";

/** Pages per batch. Deliberately the constitution reader's own number: it was
 *  measured (CONTOH, 8 pages in 24.8s ⇒ ~3.1s/page, so a 4-page batch is
 *  ~12s) and it leaves a full rule-7 retry inside the same 50s budget. */
export const JOB_BATCH_PAGES = CONSTITUTION_SEGMENT_PAGES;

/** 1-based inclusive page range of one batch. */
export type JobBatchRange = ConstitutionSegmentRange;

/** The three kinds of paperwork the one door reads. */
export type JobKind = "meeting_notes" | "ledger_page" | "constitution";

export function isJobKind(v: unknown): v is JobKind {
  return v === "meeting_notes" || v === "ledger_page" || v === "constitution";
}

/**
 * Where a job is.
 *
 *   queued  — created, nothing read yet
 *   reading — at least one batch is in, more to go (this is ALSO the state a
 *             failed-but-retryable batch leaves behind: the queue does not
 *             have a "wobbling" state, it has attempts)
 *   done    — every batch is in; `result` is the finished extraction
 *   failed  — gave up (too many attempts, or the quota ran out mid-document);
 *             everything read so far is still in `result`
 */
export type JobStatus = "queued" | "reading" | "done" | "failed";

export function isJobStatus(v: unknown): v is JobStatus {
  return v === "queued" || v === "reading" || v === "done" || v === "failed";
}

/** A batch that fails this many times in a row stops the job. Three is the
 *  same ladder the segmented constitution read uses (one in-place retry plus
 *  the person's own "send again"), written down instead of implied. */
export const JOB_MAX_ATTEMPTS = 3;

/**
 * How long one /api/job/step may hold a batch before another tab is allowed
 * to take it. Longer than the route's own 50s vendor budget plus its refund
 * and error writes — a lease that expires while the first tab is still
 * legitimately working would read the same pages twice and charge for them
 * twice.
 */
export const JOB_LEASE_MS = 75_000;

/** Cut a document into batches. 8 pages → 1–4, 5–8. Zero or unknown pages →
 *  one batch covering the whole file, which is exactly how every read behaved
 *  before the queue existed. */
export function planJobBatches(totalPages: number): JobBatchRange[] {
  const planned = planConstitutionSegments(totalPages);
  return planned.length > 0 ? planned : [{ from: 1, to: 1 }];
}

/** True when this document has to be cut at all. A 4-page PDF never enters
 *  the queue — it fits one request, and its price must not change. */
export function needsQueue(totalPages: number): boolean {
  return Math.floor(totalPages) > JOB_BATCH_PAGES;
}

/** D47: total AI actions a queued read of `pages` pages costs. */
export function jobReadActions(pages: number): number {
  return constitutionReadActions(pages);
}

/** D47: what a batch covering pages `donePages+1 … afterPages` adds to the
 *  bill. Summing the deltas over any cut of N pages gives jobReadActions(N)
 *  exactly, so a batch inside an already-paid block of five costs nothing. */
export function jobActionsDelta(donePages: number, afterPages: number): number {
  return constitutionActionsDelta(donePages, afterPages);
}

/** The rows of ai_jobs this module reasons about. The route reads more
 *  columns; nothing in here needs them. */
export type JobCounters = {
  status: JobStatus;
  totalPages: number;
  batchesDone: number;
  totalBatches: number;
  pagesDone: number;
  attempts: number;
  /** ISO timestamp another tab's step must wait for, or null. */
  leasedUntil: string | null;
};

/** The batch a step should do next — null when the job is finished or dead. */
export function nextBatchIndex(job: JobCounters): number | null {
  if (job.status === "done" || job.status === "failed") return null;
  if (job.batchesDone >= job.totalBatches) return null;
  return job.batchesDone;
}

/** Is another tab (or a step that has not returned yet) holding this job? */
export function isLeased(job: JobCounters, now: number = Date.now()): boolean {
  if (!job.leasedUntil) return false;
  const until = Date.parse(job.leasedUntil);
  return Number.isFinite(until) && until > now;
}

/**
 * A job the browser may pick up again after a reload — the row is real work
 * that was paid for and is not finished. A failed job is NOT resumable by
 * itself: whatever it read is kept and handed over, but the queue does not
 * quietly re-charge for a document that has already given up.
 */
export function isResumable(job: JobCounters): boolean {
  return (
    (job.status === "queued" || job.status === "reading") &&
    job.batchesDone < job.totalBatches
  );
}

/** 0–100, for the progress bar. A job with no batches shows 0, never NaN. */
export function jobPercent(job: Pick<JobCounters, "batchesDone" | "totalBatches">): number {
  if (job.totalBatches <= 0) return 0;
  const pct = Math.round((job.batchesDone / job.totalBatches) * 100);
  return Math.max(0, Math.min(100, pct));
}

export type BatchOutcome =
  | { kind: "ok" }
  | { kind: "retry" }
  /** Out of quota / out of free pages — no number of retries fixes it. */
  | { kind: "stop" };

/**
 * The whole state machine, in one place: given where the job is and how the
 * batch went, what does the row look like afterwards?
 *
 * 🔴 `pagesDone` only ever moves on `ok`. It is what the NEXT batch's price
 * is measured from (jobActionsDelta), so a batch that failed and was refunded
 * must leave it exactly where it was — otherwise the retry pays for pages
 * nobody has been given.
 */
export function advanceJob(
  job: JobCounters,
  batch: JobBatchRange,
  outcome: BatchOutcome,
): JobCounters {
  if (outcome.kind === "ok") {
    const batchesDone = job.batchesDone + 1;
    const pagesDone = Math.max(job.pagesDone, batch.to);
    return {
      ...job,
      batchesDone,
      pagesDone,
      attempts: 0,
      leasedUntil: null,
      status: batchesDone >= job.totalBatches ? "done" : "reading",
    };
  }
  if (outcome.kind === "stop") {
    return { ...job, attempts: job.attempts + 1, leasedUntil: null, status: "failed" };
  }
  const attempts = job.attempts + 1;
  return {
    ...job,
    attempts,
    leasedUntil: null,
    status: attempts >= JOB_MAX_ATTEMPTS ? "failed" : job.status === "queued" ? "queued" : "reading",
  };
}

/**
 * What the person is told BEFORE the queue starts (§1-2: 「預估講在前面」).
 * `quotaPool` is the org's own denominator for the month — 104 §5's
 * 「已用 ÷（月額度＋充值）」, the SAME number every other percentage in the
 * app divides by. 0 or missing means the caller shows no percentage rather
 * than dividing by zero.
 */
export type JobEstimate = {
  pages: number;
  batches: number;
  actions: number;
  /** Percent of this month's pool, through the app's ONE percentage helper
   *  (pctOfQuota), which never flatters a real deduction to 0% — an estimate
   *  that says "0%" and then deducts something is the kind of number J
   *  stopped trusting (104 §5). null when the pool is unknown. */
  quotaPct: number | null;
  /** Rough wall-clock seconds, from the same measured 3.1s/page. */
  seconds: number;
};

/** Measured reading speed — see CONSTITUTION_SECONDS_PER_PAGE. */
export const JOB_SECONDS_PER_PAGE = 3.1;

export function estimateJob(
  totalPages: number,
  quotaPool: number | null = null,
): JobEstimate {
  const pages = Math.max(1, Math.floor(totalPages));
  const actions = jobReadActions(pages);
  return {
    pages,
    batches: planJobBatches(pages).length,
    actions,
    quotaPct: pctOfQuota(actions, quotaPool),
    seconds: Math.ceil(pages * JOB_SECONDS_PER_PAGE),
  };
}
