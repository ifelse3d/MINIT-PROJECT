import "server-only";

// ---------------------------------------------------------------------------
// THE QUEUE'S DATABASE HALF (work order 105 §1). One place that knows the
// ai_jobs table's column names, so the two routes and the doors do not each
// grow their own spelling of them.
//
// 🔴 THE USER-SCOPED CLIENT, ALWAYS. RLS is the boundary (CLAUDE.md rule 10's
// 🔴 line and Hard Rule 5): a job id is a number in a URL, and the only thing
// stopping one society from stepping another society's document is that the
// database refuses to hand the row over. Nothing in this file uses the
// service-role client.
//
// 🔴 FAILS SOFT. Before migration 43 is applied the table does not exist;
// every function here answers "unavailable" and the doors fall back to the
// single-request read they have always done. A missing migration must never
// take away a road that worked yesterday.
// ---------------------------------------------------------------------------

import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { JOB_LEASE_MS, type JobKind, type JobStatus } from "@/lib/jobs-core";

export type JobRow = {
  id: number;
  orgId: number;
  kind: JobKind;
  status: JobStatus;
  sourcePath: string;
  fileName: string;
  context: string;
  totalPages: number;
  totalBatches: number;
  batchesDone: number;
  pagesDone: number;
  attempts: number;
  result: unknown;
  actionsCharged: number;
  fencePages: number;
  leasedUntil: string | null;
  lastError: string | null;
};

const COLUMNS =
  "id, org_id, kind, status, source_path, file_name, context, total_pages, total_batches, batches_done, pages_done, attempts, result, actions_charged, fence_pages, leased_until, last_error";

type DbRow = {
  id: number;
  org_id: number;
  kind: string;
  status: string;
  source_path: string;
  file_name: string;
  context: string | null;
  total_pages: number;
  total_batches: number;
  batches_done: number;
  pages_done: number;
  attempts: number;
  result: unknown;
  actions_charged: number;
  fence_pages: number;
  leased_until: string | null;
  last_error: string | null;
};

function toJob(row: DbRow): JobRow {
  return {
    id: row.id,
    orgId: row.org_id,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    sourcePath: row.source_path,
    fileName: row.file_name,
    context: row.context ?? "",
    totalPages: row.total_pages,
    totalBatches: row.total_batches,
    batchesDone: row.batches_done,
    pagesDone: row.pages_done,
    attempts: row.attempts,
    result: row.result ?? null,
    actionsCharged: row.actions_charged,
    fencePages: row.fence_pages,
    leasedUntil: row.leased_until,
    lastError: row.last_error,
  };
}

/** PostgREST's own way of saying "that table (or function) is not there". */
function looksLikeMissingTable(message: string | undefined): boolean {
  return /could not find the table|schema cache|does not exist|PGRST205|PGRST202/i.test(
    message ?? "",
  );
}

export type JobsUnavailable = { ok: false; reason: "unavailable" | "error" };

export async function createJob(input: {
  orgId: number;
  kind: JobKind;
  sourcePath: string;
  fileName: string;
  context: string;
  totalPages: number;
  totalBatches: number;
}): Promise<{ ok: true; job: JobRow } | JobsUnavailable> {
  const supabase = await getSupabaseServer();
  let createdBy: string | null = null;
  try {
    createdBy = (await getSessionUser())?.id ?? null;
  } catch {
    createdBy = null;
  }
  const { data, error } = await supabase
    .from("ai_jobs")
    .insert({
      org_id: input.orgId,
      created_by: createdBy,
      kind: input.kind,
      source_path: input.sourcePath,
      file_name: input.fileName.slice(0, 200),
      context: input.context === "" ? null : input.context.slice(0, 2000),
      total_pages: input.totalPages,
      total_batches: input.totalBatches,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, reason: looksLikeMissingTable(error?.message) ? "unavailable" : "error" };
  }
  return { ok: true, job: toJob(data as DbRow) };
}

/** Read one job. RLS decides whether it exists as far as this caller goes. */
export async function loadJob(jobId: number): Promise<JobRow | null> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("ai_jobs")
    .select(COLUMNS)
    .eq("id", jobId)
    .maybeSingle();
  return data ? toJob(data as DbRow) : null;
}

/**
 * Take the lease, atomically (claim_ai_job). null means somebody else has it
 * or there is nothing left to do — both normal answers, never errors.
 */
export async function claimJob(jobId: number): Promise<JobRow | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("claim_ai_job", {
    p_job_id: jobId,
    p_lease_ms: JOB_LEASE_MS,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return toJob(data[0] as DbRow);
}

/** Write the counters back and drop the lease. */
export async function saveJob(
  jobId: number,
  patch: {
    status?: JobStatus;
    batchesDone?: number;
    pagesDone?: number;
    attempts?: number;
    result?: unknown;
    actionsCharged?: number;
    fencePages?: number;
    lastError?: string | null;
    /** Always cleared by a finished step — the next one takes its own. */
    releaseLease?: boolean;
  },
): Promise<void> {
  const supabase = await getSupabaseServer();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.batchesDone !== undefined) row.batches_done = patch.batchesDone;
  if (patch.pagesDone !== undefined) row.pages_done = patch.pagesDone;
  if (patch.attempts !== undefined) row.attempts = patch.attempts;
  if (patch.result !== undefined) row.result = patch.result;
  if (patch.actionsCharged !== undefined) row.actions_charged = patch.actionsCharged;
  if (patch.fencePages !== undefined) row.fence_pages = patch.fencePages;
  if (patch.lastError !== undefined) row.last_error = patch.lastError;
  if (patch.releaseLease) row.leased_until = null;
  await supabase.from("ai_jobs").update(row).eq("id", jobId);
}

/**
 * The unfinished documents this org left behind — what the home door shows
 * as "still reading, pick it up" after a reload or on another phone.
 */
export async function openJobs(orgId: number): Promise<JobRow[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("ai_jobs")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .in("status", ["queued", "reading"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data) return [];
  return (data as DbRow[]).map(toJob);
}

/** The original is only kept while it is still being read. */
export async function deleteJobSource(sourcePath: string): Promise<void> {
  try {
    const supabase = await getSupabaseServer();
    await supabase.storage.from("uploads").remove([sourcePath]);
  } catch {
    // Housekeeping — never a reason to fail the person's read.
  }
}
