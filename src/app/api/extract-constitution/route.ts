import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import {
  joinUserError,
  tooManyPagesError,
  USER_ERRORS,
} from "@/lib/user-errors";
import {
  EXTRACT_OUTPUT_CEILING,
  getVisionProvider,
  VendorOutputTruncatedError,
} from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseConstitutionExtraction } from "@/lib/extraction";
import { extractConstitutionPrompt } from "@/prompts/extract-constitution";
import { recordUpload } from "@/lib/record-upload";
import { checkPageLimit } from "@/lib/pdf-pages";
import { ROUTE_AI_DEADLINE_MS, VendorTimeoutError } from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";

// ---------------------------------------------------------------------------
// PHOTO / SCAN OF THE SOCIETY CONSTITUTION → validated clause JSON.
//
// WHY THIS ROUTE EXISTS (2026-07-28 audit — the biggest promise gap in the app)
//
// The home page has always offered a card reading "Perlembagaan · 章程 ·
// Constitution" under the heading "What did you photograph?". Tapping it landed
// on /constitution, whose only input was a text question box: there was NO file
// input anywhere on the page and no route to send one to. The user was invited
// to photograph their constitution and then could never upload it, with no error
// and no explanation. Meanwhile the clause Q&A answered from `sampleClauses` —
// a fictional constitution — while the page printed "Every answer cites the real
// clause".
//
// The prompt (src/prompts/extract-constitution.ts), the zod contract
// (constitutionExtractionSchema) and the Q&A logic (src/lib/constitution.ts)
// were all already written and correct. Only this route and a file input were
// missing.
//
// Mirrors /api/extract-minutes exactly: zod-validated, retry ONCE with the
// validation errors appended, then fail cleanly (CLAUDE.md rule 7). The org name
// comes from the server-resolved session, never from the request body.
// PDPA (Hard Rule 5): the image and the extracted clause text are NEVER logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
// A constitution is usually a photocopy, so PDF is as likely as a photo here.
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export async function POST(req: Request) {
  try {
    // P-1: ONE deadline for every vendor call in this request — a constitution
    // is the longest read in the app, so this route is the likeliest to blow
    // past Vercel's 60s kill, after which NO refund and NO app_errors row runs.
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.noPhoto) },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.unsupportedLedgerFile) },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.fileTooLarge) },
        { status: 400 },
      );
    }

    // 2026-08-21: pages are counted BEFORE the quota is charged. A 200-page PDF
    // is one tap and a large part of a month's AI quota, and there is no
    // confirmation screen between the two. See src/lib/pdf-pages.ts.
    const bytes = await file.arrayBuffer();
    const pages = await checkPageLimit(bytes, file.type, "constitution");
    if (!pages.ok) {
      return NextResponse.json(
        {
          error: joinUserError(
            tooManyPagesError(pages.pages, pages.limit),
          ),
        },
        { status: 400 },
      );
    }

    // Charge the quota BEFORE any AI vendor is called. One page = one action;
    // the rule-7 retry below is not charged again.
    const gate = await requireAiQuota(["extract_constitution"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const imageBase64 = Buffer.from(bytes).toString("base64");
    const prompt = extractConstitutionPrompt({ orgName: gate.org.name });
    // A constitution can run to 30+ pages — the one genuinely expensive job.
    // Kept on its own tier so it can be pointed at a long-context or Batch
    // model without touching the other three tasks.
    const provider = getVisionProvider("long_doc");

    // 2026-08-18: attach what the vendor actually charged to the ai_usage row
    // that paid for it — the pattern extract-ledger has had since 2026-08-03.
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // Attempt 1. The explicit ceiling is the fix for J's new-user test
    // (2026-08-28): an 8-page constitution died at output token 8188 under
    // the 8192 default — billed, failed, and told to "try again". The ceiling
    // now fits the 50-page cap this route itself admits.
    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt,
        imageBase64,
        mimeType: file.type,
        maxOutputTokens: EXTRACT_OUTPUT_CEILING.constitution,
        onUsage,
        deadlineAt,
      });
    } catch (e) {
      // A refusal must never eat someone's quota (CLAUDE.md rule 10). A
      // constitution is the single most expensive job in the app, so charging
      // for a failed read hurt most exactly here.
      // P-1: the failure is also recorded now (app_errors) — see id=5.
      await refundUsage(gate.org.id, gate.charges[0]);
      return vendorFailureResponse("/api/extract-constitution", e, gate.org.id);
    }

    let parsed = parseConstitutionExtraction(raw);
    if (!parsed.success) {
      // Retry once with the validation errors appended (rule 7).
      const issues = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
      const retryPrompt = `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${issues}`;
      try {
        raw = await provider.extractJson({
          prompt: retryPrompt,
          imageBase64,
          mimeType: file.type,
          maxOutputTokens: EXTRACT_OUTPUT_CEILING.constitution,
          onUsage,
          deadlineAt,
        });
        parsed = parseConstitutionExtraction(raw);
      } catch (e) {
        // P-1: a timeout is a timeout — not "retake the photo"; a truncation
        // means "split the file", not "retake the photo". Both refund.
        if (e instanceof VendorTimeoutError || e instanceof VendorOutputTruncatedError) {
          await refundUsage(gate.org.id, gate.charges[0]);
          return vendorFailureResponse("/api/extract-constitution", e, gate.org.id);
        }
        void captureAppError("/api/extract-constitution", e, { orgId: gate.org.id });
        // fall through to the failure response below
      }
    }

    if (!parsed || !parsed.success) {
      // Two attempts, nothing readable came back: the person keeps the credit.
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiCouldNotRead) },
        { status: 422 },
      );
    }

    // Keep the page + a history row for the active org (best-effort), so the
    // original photocopy stays checkable against every quoted clause.
    await recordUpload(file, "constitution");

    return NextResponse.json({
      extraction: parsed.data,
      provider: provider.name,
    });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/extract-constitution", e);
    // No contents in logs (PDPA).
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
