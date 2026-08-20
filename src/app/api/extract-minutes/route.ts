import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { extractMeetingNotesPrompt } from "@/prompts/extract-meeting-notes";
import { dayIsoMalaysia } from "@/lib/history";
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
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

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
        { error: joinUserError(USER_ERRORS.unsupportedImage) },
        { status: 400 }
      );
    }
    if (photo.size > MAX_BYTES) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.fileTooLarge) },
        { status: 400 }
      );
    }


    // Phase 7.5a: charge the quota BEFORE any AI vendor is called.
    // One extraction = one action (the rule-7 retry below is not charged).
    const gate = await requireAiQuota(["extract_minutes"]);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    // 2026-07-28 audit: the organisation name used to come from the multipart
    // FORM, i.e. from the browser, and was then interpolated straight into the
    // LLM prompt — a prompt-injection surface for no benefit at all, since the
    // signed-in user's organisation is already resolved server-side by the quota
    // gate above. It now comes from there.
    const orgName = gate.org.name;

    const imageBase64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    // 2026-08-19: the org's own vocabulary. Knowing that a member is called
    // 昶源 is what stops the model reading it as the commoner 湘源 — the exact
    // misread seen on 2026-08-18. Framed as "these words exist here", never as
    // a closed list, so an unfamiliar word is still transcribed and marked
    // "check" rather than snapped to the nearest entry.
    const glossaryBlock = glossaryPromptBlockForReading(
      await loadGlossary(gate.org.id),
    );
    const prompt = extractMeetingNotesPrompt({ orgName, todayIso, glossaryBlock });
    const provider = getVisionProvider();

    // 2026-08-18: attach what the vendor actually charged to the ai_usage row
    // that paid for it — the pattern extract-ledger has had since 2026-08-03.
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // Attempt 1
    let raw: unknown;
    try {
      raw = await provider.extractJson({ prompt, imageBase64, mimeType: photo.type, onUsage });
    } catch {
      // A refusal must never eat someone's quota (CLAUDE.md rule 10). Reading a
      // photo is the most expensive action and the one most likely to fail, and
      // until 2026-08-20 it was the only one that charged for failing.
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiUnavailable) },
        { status: 502 }
      );
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
        raw = await provider.extractJson({ prompt: retryPrompt, imageBase64, mimeType: photo.type, onUsage });
        parsed = parseMeetingNotesExtraction(raw);
      } catch {
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
  } catch {
    // No contents in logs (PDPA).
    return NextResponse.json({ error: joinUserError(USER_ERRORS.serverError) }, { status: 500 });
  }
}
