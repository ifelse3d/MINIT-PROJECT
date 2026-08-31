import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { getActiveOrg } from "@/lib/active-org";
import { jobPercent } from "@/lib/jobs-core";
import { openJobs } from "@/lib/jobs-server";

// ---------------------------------------------------------------------------
// "IS THIS SOCIETY STILL READING SOMETHING?" (work order 105 §1).
//
// The queue's promise is that closing the tab is not a failure. A browser
// remembers its own job id in localStorage, which covers the same device —
// but a document read half-way on the treasurer's phone must also be
// findable from the secretary's laptop, and localStorage cannot do that.
// This is that road: the org's own unfinished jobs, through RLS.
//
// Read-only and free. It charges nothing, calls no vendor, and returns no
// extracted content — only "this file, this far along" (PDPA: the counters
// are not the document).
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET() {
  try {
    const org = await getActiveOrg();
    if (!org) return NextResponse.json({ jobs: [] });
    const jobs = await openJobs(org.id);
    return NextResponse.json({
      jobs: jobs.map((j) => ({
        jobId: j.id,
        kind: j.kind,
        fileName: j.fileName,
        batchesDone: j.batchesDone,
        totalBatches: j.totalBatches,
        totalPages: j.totalPages,
        percent: jobPercent(j),
      })),
    });
  } catch (e) {
    void captureAppError("/api/job/open", e);
    // A door that cannot ask this question simply shows nothing to pick up.
    return NextResponse.json({ jobs: [] });
  }
}
