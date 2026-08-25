import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import {
  joinUserError,
  tooManyPagesError,
  USER_ERRORS,
} from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseExpenseExtraction } from "@/lib/extraction";
import { extractExpensePrompt } from "@/prompts/extract-expense";
import { dayIsoMalaysia } from "@/lib/history";
import { recordUpload } from "@/lib/record-upload";
import { checkPageLimit } from "@/lib/pdf-pages";

// ---------------------------------------------------------------------------
// Expense receipt/invoice photo → validated {vendor, description, amount,
// date} extraction (Stage E, work order 27). Mirrors /api/extract-ledger:
// zod-validated, retry ONCE with the errors appended (rule 7), refund when
// the vendor was never usefully reached (rule 10). The LLM reads the printed
// total only — all arithmetic is TypeScript (rule 2). PDPA (Hard Rule 5):
// the photo and the extracted facts are NEVER logged.
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

/** One shop receipt or invoice — a few pages at most, never a book. */
const EXPENSE_MAX_PAGES = 5;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.noPhoto) },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME.has(photo.type)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.unsupportedLedgerFile) },
        { status: 400 }
      );
    }
    if (photo.size > MAX_BYTES) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.fileTooLarge) },
        { status: 400 }
      );
    }

    // Pages counted BEFORE the quota is charged (2026-08-21 rule).
    const bytes = await photo.arrayBuffer();
    const pages = await checkPageLimit(bytes, photo.type, EXPENSE_MAX_PAGES);
    if (!pages.ok) {
      return NextResponse.json(
        { error: joinUserError(tooManyPagesError(pages.pages, pages.limit)) },
        { status: 400 },
      );
    }

    // Charge BEFORE the vendor call. Cap "upload": every member except the
    // read-only auditor may photograph a receipt (a claim is submitted by
    // ordinary members; the role gate for what happens NEXT lives in the
    // expense server actions).
    const gate = await requireAiQuota(["extract_expense"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }
    const orgName = gate.org.name;

    const imageBase64 = Buffer.from(bytes).toString("base64");
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const prompt = extractExpensePrompt({ orgName, todayIso });
    const provider = getVisionProvider();
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // Attempt 1
    let raw: unknown;
    try {
      raw = await provider.extractJson({ prompt, imageBase64, mimeType: photo.type, onUsage });
    } catch {
      // The vendor was never usefully reached — the action is refunded.
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiUnavailable) },
        { status: 502 }
      );
    }

    let parsed = parseExpenseExtraction(raw);
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
        raw = await provider.extractJson({ prompt: retryPrompt, imageBase64, mimeType: photo.type, onUsage });
        parsed = parseExpenseExtraction(raw);
      } catch {
        // fall through to the failure response below
      }
    }

    if (!parsed || !parsed.success) {
      // Two attempts, nothing readable: the person keeps their action (rule 10).
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiCouldNotRead) },
        { status: 422 }
      );
    }

    // Keep the photo + a history row for the active org (best-effort).
    await recordUpload(photo, "expense");

    return NextResponse.json({ extraction: parsed.data, provider: provider.name });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/extract-expense", e);
    return NextResponse.json({ error: joinUserError(USER_ERRORS.serverError) }, { status: 500 });
  }
}
