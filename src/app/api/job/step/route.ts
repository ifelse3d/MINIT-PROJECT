import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { getSupabaseServer } from "@/db/supabase-server";
import {
  EXTRACT_OUTPUT_CEILING,
  getVisionProvider,
  VendorOutputTruncatedError,
} from "@/lib/ai/provider";
import {
  checkAndRecordUsage,
  createUsageRecorder,
  refundUsage,
  type UsageCharge,
} from "@/lib/ai/usage";
import { QuotaExceededError } from "@/lib/ai/usage-core";
import { refundFence } from "@/lib/fence";
import {
  parseConstitutionExtraction,
  parseLedgerExtraction,
  parseMeetingNotesExtraction,
  type ConstitutionExtraction,
  type LedgerExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";
import {
  mergeConstitutionExtractions,
  mergeLedgerExtractions,
  mergeMeetingExtractions,
} from "@/lib/extraction-merge";
import { extractMeetingNotesPrompt } from "@/prompts/extract-meeting-notes";
import { extractLedgerPrompt } from "@/prompts/extract-ledger";
import { extractConstitutionPrompt } from "@/prompts/extract-constitution";
import { untrustedBlock } from "@/prompts/untrusted";
import { glossaryPromptBlockForReading } from "@/lib/glossary";
import { loadGlossary } from "@/lib/glossary-server";
import { demoteSuspectPhones } from "@/lib/verbatim";
import { dayIsoMalaysia } from "@/lib/history";
import {
  EXTRACT_ATTEMPT_TIMEOUT_MS,
  ROUTE_AI_DEADLINE_MS,
  VendorTimeoutError,
} from "@/lib/ai/http";
import { slicePdfPages } from "@/lib/pdf-slice";
import {
  advanceJob,
  jobActionsDelta,
  jobPercent,
  planJobBatches,
  type BatchOutcome,
  type JobKind,
} from "@/lib/jobs-core";
import { claimJob, deleteJobSource, loadJob, saveJob, type JobRow } from "@/lib/jobs-server";
import { recordUpload } from "@/lib/record-upload";

// ---------------------------------------------------------------------------
// ONE BATCH OF A QUEUED READ (work order 105 §1). The browser calls this in a
// loop until the answer says the document is finished.
//
// EVERY CALL DOES EXACTLY ONE BATCH, and a batch is four pages — measured at
// ~12s, comfortably inside the 45s attempt inside the 50s vendor budget
// inside Vercel's 60s kill (the arithmetic at the top of src/lib/ai/http.ts).
// That is the whole trick: the platform's wall stops being something to
// outrun and becomes something to step around.
//
// 💰 §1-2, THE MONEY RULES, all four of them:
//   * the estimate is quoted BEFORE the queue starts (/api/job/start);
//   * each batch charges only the DELTA its own pages add (D47), so nothing
//     is estimated-to-death up front;
//   * a batch that fails refunds exactly what IT charged and leaves
//     pages_done alone, so the retry cannot pay for the same pages twice;
//   * one document is ONE job row, so a reload, a second tab or a colleague's
//     phone continues the same read instead of buying it again.
//
// 🔴 RLS is the boundary. A job id is a number in a URL; the only thing
// stopping one society from stepping another society's document is that the
// user-scoped client cannot see the row (jobs-server.ts).
//
// PDPA (Hard Rule 5): the page bytes, the prompt and the extracted facts are
// never logged. `last_error` holds a short CODE, never a message.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

type StepBody = {
  jobId: number;
  status: string;
  batchesDone: number;
  totalBatches: number;
  totalPages: number;
  percent: number;
  actionsCharged: number;
  /** True while another tab holds the lease — the caller waits and asks again. */
  busy?: boolean;
  /** Only on the last batch: the finished, merged extraction. */
  extraction?: unknown;
  fileName?: string;
  kind?: JobKind;
  /** Only on the last batch: where the original was kept in the org history. */
  storagePath?: string | null;
  error?: string;
};

function progress(job: JobRow, extra: Partial<StepBody> = {}): StepBody {
  return {
    jobId: job.id,
    status: job.status,
    batchesDone: job.batchesDone,
    totalBatches: job.totalBatches,
    totalPages: job.totalPages,
    percent: jobPercent(job),
    actionsCharged: job.actionsCharged,
    kind: job.kind,
    fileName: job.fileName,
    ...extra,
  };
}

const EXTRACT_ACTION = {
  meeting_notes: "extract_minutes",
  ledger_page: "extract_ledger",
  constitution: "extract_constitution",
} as const;

const OUTPUT_CEILING = {
  meeting_notes: EXTRACT_OUTPUT_CEILING.minutes,
  ledger_page: EXTRACT_OUTPUT_CEILING.ledger,
  constitution: EXTRACT_OUTPUT_CEILING.constitution,
} as const;

/** The kind-specific merge — the same rules every review page uses. */
function mergeByKind(kind: JobKind, a: unknown, b: unknown): unknown {
  if (a === null || a === undefined) return b;
  if (kind === "meeting_notes")
    return mergeMeetingExtractions(a as MeetingNotesExtraction, b as MeetingNotesExtraction);
  if (kind === "ledger_page")
    return mergeLedgerExtractions(a as LedgerExtraction, b as LedgerExtraction);
  return mergeConstitutionExtractions(a as ConstitutionExtraction, b as ConstitutionExtraction);
}

export async function POST(req: Request) {
  let claimed: JobRow | null = null;
  try {
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
    const payload = (await req.json().catch(() => null)) as { jobId?: unknown } | null;
    const jobId = Number(payload?.jobId);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 400 },
      );
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError), code: "NO_ORG" },
        { status: 401 },
      );
    }
    if (!can(org.role, "upload")) {
      return NextResponse.json(
        { error: permissionError("upload"), code: "NO_PERMISSION" },
        { status: 403 },
      );
    }

    // RLS decides whether this row exists for this caller at all.
    const existing = await loadJob(jobId);
    if (!existing || existing.orgId !== org.id) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 404 },
      );
    }
    if (existing.status === "done" || existing.status === "failed") {
      // Already finished (or given up): hand back what there is. A second tab
      // that arrives late gets the document, not an error.
      return NextResponse.json(
        progress(existing, { extraction: existing.result ?? undefined }),
      );
    }

    const job = await claimJob(jobId);
    if (!job) {
      // Somebody else holds the lease. Not an error — the caller waits.
      const fresh = (await loadJob(jobId)) ?? existing;
      return NextResponse.json(progress(fresh, { busy: true }));
    }
    claimed = job;

    const batches = planJobBatches(job.totalPages);
    const batch = batches[job.batchesDone];
    if (!batch) {
      await saveJob(job.id, { status: "done", releaseLease: true });
      return NextResponse.json(
        progress({ ...job, status: "done" }, { extraction: job.result ?? undefined }),
      );
    }

    // --- money, before the vendor (D47 delta for THIS batch's pages) --------
    const owed = jobActionsDelta(job.pagesDone, batch.to);
    const charges: UsageCharge[] = [];
    try {
      for (let i = 0; i < owed; i++) {
        charges.push(await checkAndRecordUsage(org.id, EXTRACT_ACTION[job.kind]));
      }
    } catch (e) {
      for (const c of charges) await refundUsage(org.id, c);
      const outOfQuota = e instanceof QuotaExceededError;
      const after = advanceJob(job, batch, { kind: outOfQuota ? "stop" : "retry" });
      await saveJob(job.id, {
        status: after.status,
        attempts: after.attempts,
        lastError: outOfQuota ? "quota" : "metering",
        releaseLease: true,
      });
      return NextResponse.json(
        {
          ...progress({ ...job, status: after.status }),
          error: outOfQuota
            ? joinUserError({
                bm: `MinitAI sudah membaca ${job.batchesDone} daripada ${job.totalBatches} bahagian dokumen ini apabila bantuan AI bulan ini habis. Apa yang sudah dibaca disimpan — sambung semula selepas kuota ditambah atau pada 1 hari bulan depan.`,
                zh: `这份文件读到第 ${job.batchesDone}／${job.totalBatches} 批的时候，这个月的 AI 用量用完了。已经读好的都留着 —— 充值后或下个月 1 号回来，从这一批接着读。`,
                en: `MinitAI had read ${job.batchesDone} of ${job.totalBatches} parts of this document when this month's AI help ran out. What was read is kept — top up, or come back on the 1st, and it continues from here.`,
              })
            : joinUserError(USER_ERRORS.serverError),
        },
        { status: outOfQuota ? 402 : 500 },
      );
    }

    // --- the bytes, cut to this batch --------------------------------------
    const supabase = await getSupabaseServer();
    const { data: blob, error: dlError } = await supabase.storage
      .from("uploads")
      .download(job.sourcePath);
    if (dlError || !blob) {
      for (const c of charges) await refundUsage(org.id, c);
      return await failBatch(job, batch, "source", charges.length);
    }
    const whole = await blob.arrayBuffer();
    const sliced = await slicePdfPages(whole, batch.from, batch.to);
    // null means "the whole document IS this batch" (or it could not be cut,
    // which before the queue is exactly what was sent anyway).
    const pieceBytes = sliced ? sliced.slice().buffer : whole;

    // --- the prompt (the SAME prompts every other door uses) ----------------
    const orgName = org.name;
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const contextBlock =
      job.context === ""
        ? ""
        : `\n\n${untrustedBlock(
            "NOTES THE PERSON TYPED ALONGSIDE THIS UPLOAD (their own abbreviations, spellings and hints — prefer these spellings when the page matches)",
            job.context,
          )}`;
    const glossaryBlock =
      job.kind === "meeting_notes"
        ? glossaryPromptBlockForReading(await loadGlossary(org.id))
        : "";
    const prompt =
      job.kind === "meeting_notes"
        ? extractMeetingNotesPrompt({ orgName, todayIso, glossaryBlock, contextBlock })
        : job.kind === "ledger_page"
          ? extractLedgerPrompt({ orgName, todayIso, contextBlock })
          : extractConstitutionPrompt({ orgName, contextBlock });
    const validate =
      job.kind === "meeting_notes"
        ? parseMeetingNotesExtraction
        : job.kind === "ledger_page"
          ? parseLedgerExtraction
          : parseConstitutionExtraction;

    const provider = getVisionProvider("extract");
    const onUsage = createUsageRecorder(org.id, charges[0]);
    const media = {
      imageBase64: Buffer.from(pieceBytes).toString("base64"),
      mimeType: "application/pdf",
    };

    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt,
        ...media,
        maxOutputTokens: OUTPUT_CEILING[job.kind],
        onUsage: charges.length > 0 ? onUsage : undefined,
        deadlineAt,
        timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
      });
    } catch (e) {
      for (const c of charges) await refundUsage(org.id, c);
      void captureAppError("/api/job/step", e, { orgId: org.id });
      return await failBatch(
        job,
        batch,
        e instanceof VendorTimeoutError
          ? "timeout"
          : e instanceof VendorOutputTruncatedError
            ? "truncated"
            : "vendor",
        charges.length,
      );
    }

    let parsed = validate(raw);
    if (!parsed.success) {
      // Rule 7: retry ONCE with the validation errors appended, not charged.
      const issues = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
      try {
        raw = await provider.extractJson({
          prompt: `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${issues}`,
          ...media,
          maxOutputTokens: OUTPUT_CEILING[job.kind],
          onUsage: charges.length > 0 ? onUsage : undefined,
          deadlineAt,
          timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
        });
        parsed = validate(raw);
      } catch (e) {
        void captureAppError("/api/job/step", e, { orgId: org.id });
      }
    }
    if (!parsed.success) {
      for (const c of charges) await refundUsage(org.id, c);
      void captureAppError(
        "/api/job/step",
        new Error("batch failed validation twice"),
        { orgId: org.id, code: "unreadable_twice" },
      );
      return await failBatch(job, batch, "unreadable", charges.length);
    }

    // S0-7 parity: a "confirmed" phone with the wrong digit count is an
    // unflagged truncation — demote before it reaches the review.
    const piece =
      job.kind === "ledger_page"
        ? demoteSuspectPhones(
            parsed.data as Parameters<typeof demoteSuspectPhones>[0],
          ).extraction
        : parsed.data;

    const merged = mergeByKind(job.kind, job.result, piece);
    const after = advanceJob(job, batch, { kind: "ok" } satisfies BatchOutcome);
    await saveJob(job.id, {
      status: after.status,
      batchesDone: after.batchesDone,
      pagesDone: after.pagesDone,
      attempts: 0,
      result: merged,
      actionsCharged: job.actionsCharged + charges.length,
      lastError: null,
      releaseLease: true,
    });

    const finished = after.status === "done";
    let storagePath: string | null = null;
    if (finished) {
      // Same promise the single-request road keeps: the ORIGINAL stays in the
      // org's history, so every field Minit read can be checked against the
      // page it came from. Best-effort (recordUpload never breaks a read).
      storagePath = await recordUpload(
        new File([new Uint8Array(whole)], job.fileName, { type: "application/pdf" }),
        job.kind,
      );
      // The working copy has done its job. A finished read leaves no second
      // copy of the person's document lying in the jobs folder.
      await deleteJobSource(job.sourcePath);
    }
    return NextResponse.json(
      progress(
        {
          ...job,
          status: after.status,
          batchesDone: after.batchesDone,
          actionsCharged: job.actionsCharged + charges.length,
        },
        finished ? { extraction: merged, storagePath } : {},
      ),
    );
  } catch (e) {
    void captureAppError("/api/job/step", e);
    if (claimed) {
      // Never leave a lease behind on a route that threw — the document would
      // look "busy" to every tab for the next 75 seconds.
      await saveJob(claimed.id, { releaseLease: true });
    }
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}

/**
 * One batch did not deliver. Its own charges have ALREADY been refunded by
 * the caller (the refund and the reason are two different decisions and the
 * refund must not depend on this function being reached).
 *
 * 🔴 pages_done is not touched, so the retry pays for these pages exactly
 * once, whenever it happens.
 */
async function failBatch(
  job: JobRow,
  batch: { from: number; to: number },
  code: string,
  refunded: number,
): Promise<NextResponse> {
  const after = advanceJob(job, batch, { kind: "retry" });
  await saveJob(job.id, {
    status: after.status,
    attempts: after.attempts,
    lastError: code.slice(0, 60),
    releaseLease: true,
  });
  const givenUp = after.status === "failed";
  if (givenUp && after.batchesDone === 0) {
    // Nothing was ever read: the free plan's page meter gives everything back.
    await refundFence(
      job.fencePages > 0 ? { orgId: job.orgId, delta: { pages: job.fencePages } } : null,
    );
    await saveJob(job.id, { fencePages: 0 });
  }
  return NextResponse.json(
    {
      ...progress({ ...job, status: after.status }),
      error: joinUserError(
        givenUp
          ? {
              bm: `MinitAI tidak dapat membaca bahagian ${job.batchesDone + 1} daripada ${job.totalBatches} dokumen ini. Bahagian yang sudah dibaca disimpan dan tidak dicaj semula. Cuba muat naik bahagian itu sendiri sebagai fail berasingan.`,
              zh: `这份文件的第 ${job.batchesDone + 1}／${job.totalBatches} 批，MinitAI 读不出来。已经读好的都留着，也不会重扣。可以把那几页单独存成一份再传一次。`,
              en: `MinitAI could not read part ${job.batchesDone + 1} of ${job.totalBatches} of this document. The parts already read are kept and are not charged again. Try uploading those pages on their own.`,
            }
          : {
              bm: `Bahagian ${job.batchesDone + 1} daripada ${job.totalBatches} tidak menjadi kali ini. Tiada apa-apa dicaj untuk bahagian itu — MinitAI akan cuba lagi.`,
              zh: `第 ${job.batchesDone + 1}／${job.totalBatches} 批这次没成功。这一批一分都没扣 —— MinitAI 会再试一次。`,
              en: `Part ${job.batchesDone + 1} of ${job.totalBatches} did not go through this time. Nothing was charged for it — MinitAI will try again.`,
            },
      ),
      refunded,
    },
    { status: givenUp ? 422 : 503 },
  );
}
