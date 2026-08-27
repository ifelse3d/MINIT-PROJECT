import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, tooManyPagesError, USER_ERRORS } from "@/lib/user-errors";
import {
  EXTRACT_OUTPUT_CEILING,
  getVisionProvider,
  VendorOutputTruncatedError,
} from "@/lib/ai/provider";
import { ROUTE_AI_DEADLINE_MS, VendorTimeoutError } from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { extractMeetingNotesPrompt } from "@/prompts/extract-meeting-notes";
import { untrustedBlock } from "@/prompts/untrusted";
import { dayIsoMalaysia } from "@/lib/history";
import { checkPageLimit } from "@/lib/pdf-pages";
import { recordUpload } from "@/lib/record-upload";
import { glossaryPromptBlockForReading } from "@/lib/glossary";
import { loadGlossary } from "@/lib/glossary-server";

// ---------------------------------------------------------------------------
// THE REAL AI CALL — photo of handwritten notes → validated extraction JSON.
// zod-validated; on parse failure retry ONCE with the error appended, then
// fail cleanly (CLAUDE.md rule 7). PDPA (Hard Rule 5): the photo and the
// extracted facts are NEVER logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
// 2026-08-23: PDF added. /money has taken PDFs since it shipped
// (extract-ledger/route.ts), and /minutes has not — the same photograph, sent
// from a scanner instead of a phone, was refused on one page and accepted on
// the other. J's UX list, N1: 「只收照片和部分 PDF」. A set of minutes that
// arrives as a scan is the commonest way a secretary who uses a computer sends
// one; refusing it teaches them the product is for phones only.
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
    // P-1: ONE deadline for every vendor call this request makes, so the
    // route's own error handling — refund, app_errors, an honest message —
    // always runs before Vercel's 60s kill would erase all three.
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
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
        // The wording that mentions PDF, now that PDFs are accepted. Telling
        // somebody to re-save as JPEG when a PDF would have worked is the kind
        // of instruction that gets followed and wastes their time.
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

    // 2026-08-21, and now here too: pages are counted BEFORE the quota is
    // charged. A 200-page PDF is one tap and a large part of a month's AI
    // quota, and there is no confirmation screen between the two. The limit for
    // minutes is 5 — a handwritten meeting record is one to three pages, so a
    // 40-page scan is not a long meeting, it is the wrong file.
    // See src/lib/pdf-pages.ts.
    const bytes = await photo.arrayBuffer();
    const pages = await checkPageLimit(bytes, photo.type, "minutes");
    if (!pages.ok) {
      return NextResponse.json(
        { error: joinUserError(tooManyPagesError(pages.pages, pages.limit)) },
        { status: 400 },
      );
    }

    // Phase 7.5a: charge the quota BEFORE any AI vendor is called.
    // One extraction = one action (the rule-7 retry below is not charged).
    const gate = await requireAiQuota(["extract_minutes"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    // 2026-07-28 audit: the organisation name used to come from the multipart
    // FORM, i.e. from the browser, and was then interpolated straight into the
    // LLM prompt — a prompt-injection surface for no benefit at all, since the
    // signed-in user's organisation is already resolved server-side by the quota
    // gate above. It now comes from there.
    const orgName = gate.org.name;

    // `bytes` was already read for the page count above — reading the stream a
    // second time would yield an empty buffer.
    const imageBase64 = Buffer.from(bytes).toString("base64");
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    // 2026-08-19: the org's own vocabulary. Knowing that a member is called
    // 昶源 is what stops the model reading it as the commoner 湘源 — the exact
    // misread seen on 2026-08-18. Framed as "these words exist here", never as
    // a closed list, so an unfamiliar word is still transcribed and marked
    // "check" rather than snapped to the nearest entry.
    const glossaryBlock = glossaryPromptBlockForReading(
      await loadGlossary(gate.org.id),
    );
    // F-2 (2026-08-25): the supplement box — abbreviations, names, which date
    // is which. User text, so it arrives as LABELLED DATA (untrustedBlock),
    // never as instructions. Absent → the prompt is byte-identical to what the
    // eval measured. PDPA: like the photo, never logged.
    const personalContext = String(form.get("context") ?? "").trim().slice(0, 2000);
    const contextBlock =
      personalContext === ""
        ? ""
        : `\n\n${untrustedBlock(
            "NOTES THE PERSON TYPED BEFORE THIS READING (their own abbreviations, spellings and date hints — prefer these spellings when the handwriting matches)",
            personalContext,
          )}`;
    const prompt = extractMeetingNotesPrompt({ orgName, todayIso, glossaryBlock, contextBlock });
    const provider = getVisionProvider();

    // 2026-08-18: attach what the vendor actually charged to the ai_usage row
    // that paid for it — the pattern extract-ledger has had since 2026-08-03.
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // Attempt 1
    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt,
        imageBase64,
        mimeType: photo.type,
        maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
        onUsage,
        deadlineAt,
      });
    } catch (e) {
      // A refusal must never eat someone's quota (CLAUDE.md rule 10). Reading a
      // photo is the most expensive action and the one most likely to fail, and
      // until 2026-08-20 it was the only one that charged for failing.
      // P-1: the failure is also RECORDED now — `catch {}` here is how the
      // ai_usage id=5 incident left app_errors at 0 rows.
      await refundUsage(gate.org.id, gate.charges[0]);
      return vendorFailureResponse("/api/extract-minutes", e, gate.org.id);
    }

    let parsed = parseMeetingNotesExtraction(raw);
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
          maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
          onUsage,
          deadlineAt,
        });
        parsed = parseMeetingNotesExtraction(raw);
      } catch (e) {
        // P-1: a timeout on the retry is reported as a timeout — camera advice
        // for a slow vendor sends the person chasing the wrong fix. A
        // truncation means "split the file". Anything else still falls
        // through to "could not read"; every path refunds.
        if (e instanceof VendorTimeoutError || e instanceof VendorOutputTruncatedError) {
          await refundUsage(gate.org.id, gate.charges[0]);
          return vendorFailureResponse("/api/extract-minutes", e, gate.org.id);
        }
        void captureAppError("/api/extract-minutes", e, { orgId: gate.org.id });
        // fall through to the failure response below
      }
    }

    if (!parsed || !parsed.success) {
      // Two attempts, nothing readable came back: the person is left with
      // nothing, so they keep their credit (rule 10).
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        {
          error: joinUserError(USER_ERRORS.aiCouldNotRead),
        },
        { status: 422 }
      );
    }

    // Phase 7: keep the photo + a history row for the active org (best-effort).
    await recordUpload(photo, "meeting_notes");

    return NextResponse.json({ extraction: parsed.data, provider: provider.name });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/extract-minutes", e);
    // No contents in logs (PDPA).
    return NextResponse.json({ error: joinUserError(USER_ERRORS.serverError) }, { status: 500 });
  }
}
