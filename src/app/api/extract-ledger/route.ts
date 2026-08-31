import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { demoteSuspectPhones } from "@/lib/verbatim";
import {
  docKindOfUpload,
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
import { parseLedgerExtraction } from "@/lib/extraction";
import { extractLedgerPrompt } from "@/prompts/extract-ledger";
import { dayIsoMalaysia } from "@/lib/history";
import { recordUpload } from "@/lib/record-upload";
import { chargeFence, refundFence } from "@/lib/fence";
import { checkPageLimit, countPdfPages } from "@/lib/pdf-pages";
import {
  EXTRACT_ATTEMPT_TIMEOUT_MS,
  ROUTE_AI_DEADLINE_MS,
  TIMEOUT_SPLIT_ADVICE_PAGES,
  VendorTimeoutError,
} from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import { fileFromRelay } from "@/lib/upload-relay-server";

// ---------------------------------------------------------------------------
// Ledger photo → validated donation-row extraction JSON (mirrors
// /api/extract-minutes). zod-validated; on parse failure retry ONCE with the
// error appended, then fail cleanly (CLAUDE.md rule 7). The LLM never sums —
// amounts come back per row and all arithmetic is TypeScript (rule 2).
// PDPA (Hard Rule 5): the photo and the extracted facts are NEVER logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
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
    // P-1: one deadline for every vendor call in this request — refund,
    // app_errors and the honest message must all run before Vercel's 60s kill.
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
    const form = await req.formData();
    const posted = form.get("photo");
    let photo: File;
    let viaRelay = false;
    if (posted instanceof File) {
      photo = posted;
    } else {
      // A-4 (work order 51): a PDF too big for Vercel's body cap arrives as a
      // Storage path instead of a file. fileFromRelay validates, downloads
      // and deletes the relay object; from here on it IS a File.
      const relayed = await fileFromRelay(form.get("storagePath"));
      if (!relayed) {
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.noPhoto) },
          { status: 400 }
        );
      }
      if (!relayed.ok) {
        return NextResponse.json(
          { error: joinUserError(relayed.error) },
          { status: relayed.status },
        );
      }
      photo = relayed.file;
      viaRelay = true;
    }
    if (!ALLOWED_MIME.has(photo.type)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.unsupportedLedgerFile) },
        { status: 400 }
      );
    }
    // Relay files were already size-checked against the vendor ceiling.
    if (!viaRelay && photo.size > MAX_BYTES) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.fileTooLarge) },
        { status: 400 }
      );
    }

    // 2026-08-21: pages are counted BEFORE the quota is charged. A 200-page PDF
    // is one tap and a large part of a month's AI quota, and there is no
    // confirmation screen between the two. See src/lib/pdf-pages.ts.
    const bytes = await photo.arrayBuffer();
    const pages = await checkPageLimit(bytes, photo.type, "ledger");
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


    // Charge the quota BEFORE any AI vendor is called.
    // One extraction = one action (the rule-7 retry below is not charged).
    const gate = await requireAiQuota(["extract_ledger"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    // D44 fence: the free plan's AI reading is a LIFETIME 20 pages (1 photo =
    // 1 page). Charged with the action; refunded wherever the action is.
    const pageCount =
      photo.type === "application/pdf" ? ((await countPdfPages(bytes)) ?? 1) : 1;
    const fenceGate = await chargeFence(gate.org, { pages: pageCount });
    if (!fenceGate.ok) {
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(fenceGate.body, { status: fenceGate.status });
    }
    const fenceCharge = fenceGate.charge;

    // 2026-07-28 audit: the organisation name used to come from the multipart
    // FORM, i.e. from the browser, and was then interpolated straight into the
    // LLM prompt — a prompt-injection surface for no benefit at all, since the
    // signed-in user's organisation is already resolved server-side by the quota
    // gate above. It now comes from there.
    const orgName = gate.org.name;

    const imageBase64 = Buffer.from(bytes).toString("base64");
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const prompt = extractLedgerPrompt({ orgName, todayIso });
    const provider = getVisionProvider();

    // 2026-08-03: attach what the vendor actually charged to the ai_usage row
    // that paid for it. Best-effort and non-blocking — see recordTokens().
    // 2026-08-18: the recorder is shared and accumulating, so the rule-7 retry
    // below is counted as well — it is a second real vendor call.
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // Attempt 1
    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt,
        imageBase64,
        mimeType: photo.type,
        // A 20-page ledger is dense rows — the 8192 default cannot hold it.
        maxOutputTokens: EXTRACT_OUTPUT_CEILING.ledger,
        onUsage,
        deadlineAt,
        // D0-2: dense multi-page reads outlive a 20s attempt — long attempt.
        timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
      });
    } catch (e) {
      // A refusal must never eat someone's quota (CLAUDE.md rule 10). Reading
      // a document is the most expensive action and the most likely to fail,
      // and until 2026-08-20 it was the only one that charged for failing.
      // P-1: the failure is also recorded now (app_errors) — see id=5.
      await refundUsage(gate.org.id, gate.charges[0]);
      await refundFence(fenceCharge);
      return vendorFailureResponse("/api/extract-ledger", e, gate.org.id, {
        bigDocument: pageCount > TIMEOUT_SPLIT_ADVICE_PAGES,
        // §7 (104): advise about the file that was actually sent.
        docKind: docKindOfUpload(photo.type, photo.name),
      });
    }

    let parsed = parseLedgerExtraction(raw);
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
          mimeType: photo.type,
          maxOutputTokens: EXTRACT_OUTPUT_CEILING.ledger,
          onUsage,
          deadlineAt,
          timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
        });
        parsed = parseLedgerExtraction(raw);
      } catch (e) {
        // P-1: a timeout is a timeout — not "retake the photo"; a truncation
        // means "split the file". Both refund.
        if (e instanceof VendorTimeoutError || e instanceof VendorOutputTruncatedError) {
          await refundUsage(gate.org.id, gate.charges[0]);
          await refundFence(fenceCharge);
          return vendorFailureResponse("/api/extract-ledger", e, gate.org.id, {
            bigDocument: pageCount > TIMEOUT_SPLIT_ADVICE_PAGES,
            docKind: docKindOfUpload(photo.type, photo.name),
          });
        }
        void captureAppError("/api/extract-ledger", e, { orgId: gate.org.id });
        // fall through to the failure response below
      }
    }

    if (!parsed || !parsed.success) {
      // Two attempts, nothing readable came back: the person is left with
      // nothing, so they keep their credit (rule 10).
      await refundUsage(gate.org.id, gate.charges[0]);
      await refundFence(fenceCharge);
      // A-1: the REAL reason lands in app_errors (typed marker, no contents).
      void captureAppError(
        "/api/extract-ledger",
        new Error("extraction failed validation twice"),
        { orgId: gate.org.id, code: "unreadable_twice" },
      );
      return NextResponse.json(
        {
          // A-1: advice split by INPUT — camera talk only for actual photos.
          error: joinUserError(
            photo.type === "application/pdf"
              ? USER_ERRORS.aiCouldNotReadPdf
              : USER_ERRORS.aiCouldNotRead,
          ),
        },
        { status: 422 }
      );
    }

    // Keep the photo + a history row for the active org (best-effort).
    await recordUpload(photo, "ledger_page");

    // S0-7: a "confirmed" phone with the wrong digit count is a truncation the
    // model did not flag (proven by the 08-24 eval) — demote it to "check" so
    // a human looks before it is printed on a receipt.
    const { extraction: checked } = demoteSuspectPhones(parsed.data);

    return NextResponse.json({ extraction: checked, provider: provider.name });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/extract-ledger", e);
    // No contents in logs (PDPA).
    return NextResponse.json({ error: joinUserError(USER_ERRORS.serverError) }, { status: 500 });
  }
}
