import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, tooManyPagesError, USER_ERRORS } from "@/lib/user-errors";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { getSupabaseServer } from "@/db/supabase-server";
import { checkPageLimit, countPdfPages } from "@/lib/pdf-pages";
import { isJobSourcePathForOrg, looksLikePdf } from "@/lib/upload-relay";
import {
  estimateJob,
  isJobKind,
  needsQueue,
  planJobBatches,
} from "@/lib/jobs-core";
import { createJob } from "@/lib/jobs-server";
import { getUsage } from "@/lib/ai/usage";

// ---------------------------------------------------------------------------
// START A QUEUED READ (work order 105 §1). The browser has already put the
// original in Storage at {orgId}/jobs/… — this route counts its pages, checks
// the page cap for the kind the classifier decided, and writes the ai_jobs row.
//
// 🔴 IT CHARGES NOTHING AT ALL — not an AI action, not a free-plan page.
// Nothing has been read yet, and the person has not yet said go: this route
// exists to produce the estimate they agree to first (§1-2:
// 「預估講在前面」) — pages, batches, actions, and what that is as a share of
// this month's pool. The first /api/job/step is where the money starts, which
// is also where the reading starts.
//
// FAILS SOFT: without migration 43 the answer is `{ available: false }` and
// the door reads the document the way it always has (which, for a document
// this long, is the honest refusal it has always given).
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const storagePath = String(form.get("storagePath") ?? "");
    const kindRaw = String(form.get("kind") ?? "");
    const context = String(form.get("context") ?? "").trim().slice(0, 2000);

    if (!isJobKind(kindRaw)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 400 },
      );
    }
    const kind = kindRaw;

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json(
        {
          error:
            "Pilih pertubuhan dahulu / choose an organisation first (log masuk diperlukan / login required).",
          code: "NO_ORG",
        },
        { status: 401 },
      );
    }
    // Same gate the extraction routes use: an auditor_readonly account may
    // not spend the organisation's quota, and the refusal happens before any
    // page is counted or charged.
    if (!can(org.role, "upload")) {
      return NextResponse.json(
        { error: permissionError("upload"), code: "NO_PERMISSION" },
        { status: 403 },
      );
    }
    if (!isJobSourcePathForOrg(storagePath, org.id)) {
      // A malformed or foreign path is a client bug or tampering, not
      // something the person can fix. Storage RLS would refuse it anyway.
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 400 },
      );
    }

    // The bytes, through the USER-scoped client — storage RLS is the boundary.
    const supabase = await getSupabaseServer();
    const { data: blob, error: dlError } = await supabase.storage
      .from("uploads")
      .download(storagePath);
    if (dlError || !blob) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 400 },
      );
    }
    const bytes = await blob.arrayBuffer();
    // Only a PDF can be cut into page batches. Anything else must not be able
    // to open a job at all — it would queue a document nobody can slice.
    if (!looksLikePdf(bytes)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.unsupportedLedgerFile) },
        { status: 400 },
      );
    }

    const totalPages = (await countPdfPages(bytes)) ?? 0;
    if (!needsQueue(totalPages)) {
      // Short enough for one request: the door's ordinary road is cheaper and
      // is already tested. Saying so is not an error.
      return NextResponse.json({ available: false, reason: "short", totalPages });
    }

    // The page cap for the kind the classifier decided — the same check
    // /api/intake makes, and for the same reason: a 40-page "meeting record"
    // is a scanner left on the wrong setting, and the queue would happily
    // read all of it.
    const limit = await checkPageLimit(
      bytes,
      "application/pdf",
      kind === "meeting_notes" ? "minutes" : kind === "ledger_page" ? "ledger" : "constitution",
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: joinUserError(tooManyPagesError(limit.pages, limit.limit)) },
        { status: 400 },
      );
    }

    const batches = planJobBatches(totalPages);
    const created = await createJob({
      orgId: org.id,
      kind,
      sourcePath: storagePath,
      fileName: String(form.get("fileName") ?? "").trim() || "document.pdf",
      context,
      totalPages,
      totalBatches: batches.length,
    });
    if (!created.ok) {
      if (created.reason === "unavailable") {
        // Migration 43 is not applied yet. The door falls back; nothing was
        // charged, and the person is never told about a migration.
        return NextResponse.json({ available: false, reason: "not_ready" });
      }
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 500 },
      );
    }

    const usage = await getUsage(org.id);
    // 104 §5: the ONE denominator — used + remaining, never the bare
    // monthly quota, so this estimate and every meter in the app agree.
    const estimate = estimateJob(totalPages, usage?.quotaPool ?? null);
    return NextResponse.json({
      available: true,
      jobId: created.job.id,
      kind,
      fileName: created.job.fileName,
      totalPages,
      totalBatches: batches.length,
      estimate,
    });
  } catch (e) {
    void captureAppError("/api/job/start", e);
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
