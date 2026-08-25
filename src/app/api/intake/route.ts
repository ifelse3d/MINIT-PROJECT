import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import {
  joinUserError,
  tooManyPagesError,
  USER_ERRORS,
} from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import {
  checkAndRecordUsage,
  createUsageRecorder,
  refundUsage,
  requireAiQuota,
  type UsageCharge,
} from "@/lib/ai/usage";
import { glossaryPromptBlockForReading } from "@/lib/glossary";
import { loadGlossary } from "@/lib/glossary-server";
import { demoteSuspectPhones } from "@/lib/verbatim";
import { QuotaExceededError } from "@/lib/ai/usage-core";
import {
  classificationSchema,
  parseConstitutionExtraction,
  parseLedgerExtraction,
  parseMeetingNotesExtraction,
} from "@/lib/extraction";
import { classifyPrompt } from "@/prompts/classify";
import { untrustedBlock } from "@/prompts/untrusted";
import { extractMeetingNotesPrompt } from "@/prompts/extract-meeting-notes";
import { extractLedgerPrompt } from "@/prompts/extract-ledger";
import { extractConstitutionPrompt } from "@/prompts/extract-constitution";
import { dayIsoMalaysia } from "@/lib/history";
import { recordUpload } from "@/lib/record-upload";
import { checkPageLimit } from "@/lib/pdf-pages";

// ---------------------------------------------------------------------------
// ONE DOOR: drop any page of society paperwork here and Minit works out what it
// is, then reads it.
//
// WHY THIS EXISTS (user request, 2026-07-28)
// The home page used to ask "What did you photograph?" and offer three cards.
// That question puts the burden on the person: they have to know that a donation
// ledger goes to /money and handwritten notes go to /minutes before anything can
// happen. For someone who has never used a computer, "I have a piece of paper and
// I don't know where it goes" is the actual starting state.
//
// So: one box. The file goes in, this route CLASSIFIES it first (the cheap
// classify prompt, which had been written since Phase 1 and had zero importers),
// then runs the matching extractor, and returns both. The browser then puts the
// extraction where it belongs and sends the person to that page with the work
// already done.
//
// COST (the product owner asked for this to be metered):
//   1 × classify_upload  + 1 × extract_* per file = 2 AI actions.
// Both are charged BEFORE the vendor call they pay for, and the response reports
// how many actions are left so the box can show it live.
//
// Rule 7: every model reply is zod-validated and retried ONCE with the errors
// appended, then fails cleanly. Rule 5 (PDPA): the file and the extracted facts
// are NEVER logged.
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

/** Where each kind of page is reviewed, and what to call it in plain words. */
const DESTINATION = {
  meeting_notes: { page: "/minutes", store: "minutes" },
  ledger_page: { page: "/money", store: "ledger" },
  constitution: { page: "/constitution", store: "constitution" },
} as const;

type Handled = keyof typeof DESTINATION;

function isHandled(kind: string): kind is Handled {
  return kind === "meeting_notes" || kind === "ledger_page" || kind === "constitution";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
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
    const pages = await checkPageLimit(bytes, file.type, "unknown");
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

    // A-2 (2026-08-25): the box can answer the "what IS this?" question FOR
    // the classifier — when Minit could not place a page, the box asks the
    // person and re-sends with the answer. A forced kind skips the classify
    // model call AND its charge: the person did the classifying.
    const forcedRaw = String(form.get("kind") ?? "");
    const forcedKind: Handled | null = isHandled(forcedRaw) ? forcedRaw : null;

    // A-2: what the person typed alongside the file — spellings, which column
    // is which, dates. User text, so it reaches every prompt as LABELLED DATA
    // (untrustedBlock), never as instructions. PDPA: never logged.
    const personalContext = String(form.get("context") ?? "").trim().slice(0, 2000);
    const contextBlock =
      personalContext === ""
        ? ""
        : `\n\n${untrustedBlock(
            "NOTES THE PERSON TYPED ALONGSIDE THIS UPLOAD (their own abbreviations, spellings and hints — prefer these spellings when the page matches)",
            personalContext,
          )}`;

    // Charge the first step. requireAiQuota also resolves the org, so the org
    // name never comes from the browser (prompt-injection surface). With a
    // forced kind the ONE charge is the extract action itself.
    const firstAction = forcedKind
      ? forcedKind === "meeting_notes"
        ? "extract_minutes"
        : forcedKind === "ledger_page"
          ? "extract_ledger"
          : "extract_constitution"
      : "classify_upload";
    const gate = await requireAiQuota([firstAction], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }
    const orgName = gate.org.name;
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const imageBase64 = Buffer.from(bytes).toString("base64");
    // Two tiers on purpose (2026-08-03): "which of three kinds of page is
    // this?" is a trivial question and a small model answers it as well as a
    // large one — but it is ~30% of all AI calls. Step 2 below, reading the
    // actual handwriting, keeps the careful model.
    // Configure with AI_MODEL_CLASSIFY / AI_MODEL_EXTRACT; both default to the
    // same model as before, so this change is a no-op until you set them.
    const classifier = getVisionProvider("classify");
    const provider = getVisionProvider("extract");

    let classification: { kind: string; language_detected: string } | null = null;
    if (!forcedKind) {
      // 2026-08-18: attach what the vendor actually charged to the ai_usage row
      // that paid for it — the pattern extract-ledger has had since 2026-08-03.
      // Two charged rows here, so two recorders: the classify row is billed
      // and priced separately from the extract row it decides.
      const onClassifyUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

      // --- step 1: what IS this page? -------------------------------------
      try {
        const raw = await classifier.extractJson({
          prompt: classifyPrompt({ filename: file.name }),
          imageBase64,
          mimeType: file.type,
          onUsage: onClassifyUsage,
        });
        const parsed = classificationSchema.safeParse(raw);
        if (parsed.success) classification = parsed.data;
      } catch {
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.aiUnavailable) },
          { status: 502 },
        );
      }

      if (!classification || !isHandled(classification.kind)) {
        // Honest outcome, not a guess: we know we could not place this page.
        // The classify action is still charged — the model did run. The box
        // turns this into a question ("is it minutes, a ledger page, or the
        // constitution?") and re-sends with kind= set.
        return NextResponse.json(
          {
            kind: "unknown",
            error: joinUserError({
              bm: "Minit tidak pasti halaman ini jenis apa. Kalau ia nota mesyuarat, buka halaman Minit Mesyuarat dan ambil gambar di sana. Kalau ia halaman lejar derma, buka halaman Wang & Resit. Kalau ia perlembagaan, buka halaman Perlembagaan.",
              zh: "Minit 不太确定这一页是什么。如果是会议笔记，请到「会议记录」页拍；如果是捐款账页，请到「财务与收据」页；如果是章程，请到「章程」页。",
              en: "Minit is not sure what this page is. If it is meeting notes, open the Meeting Minutes page and take the photo there. If it is a donation ledger page, open Money & Receipts. If it is your constitution, open the Constitution page.",
            }),
          },
          { status: 422 },
        );
      }
    }

    const kind: Handled = forcedKind ?? (classification!.kind as Handled);

    // --- the page cap, again, now that we know WHAT this is ----------------
    //
    // The check at the top of this route had to use the most generous limit,
    // because at that point a 40-page upload could still have been a perfectly
    // ordinary constitution. Now the classifier has answered, so the real cap
    // for this kind applies — and it applies BEFORE the extract action is
    // charged, which is the whole point: a 40-page "meeting record" is a
    // scanner left on the wrong setting, and reading it is the expensive half.
    // (2026-08-22, J: minutes are 5 pages; a constitution gets more.)
    const kindLimit = await checkPageLimit(
      bytes,
      file.type,
      kind === "meeting_notes" ? "minutes" : kind === "ledger_page" ? "ledger" : "constitution",
    );
    if (!kindLimit.ok) {
      // 26 号报告 2-2: on the forced-kind path the gate charged the EXTRACT
      // action up front, and this rejection happens before any vendor call —
      // "the vendor was never reached" is exactly the refund rule (CLAUDE.md
      // rule 10). Without this, retrying the same too-big PDF burned a month's
      // trial quota while the AI never read a word. On the classify path only
      // classify_upload has been charged so far, and that model DID run.
      if (forcedKind) {
        await refundUsage(gate.org.id, gate.charges[0]);
      }
      return NextResponse.json(
        {
          kind,
          error: joinUserError(tooManyPagesError(kindLimit.pages, kindLimit.limit)),
        },
        { status: 400 },
      );
    }

    // --- step 2: charge and run the matching extractor ---------------------
    const extractAction =
      kind === "meeting_notes"
        ? "extract_minutes"
        : kind === "ledger_page"
          ? "extract_ledger"
          : "extract_constitution";
    let extractCharge: UsageCharge | undefined;
    if (forcedKind) {
      // The forced-kind path charged the extract action up front (there is no
      // classify step) — gate.charges[0] IS the extract charge.
      extractCharge = gate.charges[0];
    } else try {
      extractCharge = await checkAndRecordUsage(gate.org.id, extractAction);
    } catch (e) {
      // Only a real quota exhaustion gets the "come back on the 1st" message.
      // checkAndRecordUsage also throws on a transient metering/DB failure, and
      // telling someone their month is used up when they should simply retry is a
      // dead end. (Found in review, 2026-07-28.)
      if (!(e instanceof QuotaExceededError)) {
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.serverError) },
          { status: 500 },
        );
      }
      // Quota ran out between the two charges: tell them the file was recognised
      // so the classify action was not wasted from their point of view.
      return NextResponse.json(
        {
          kind,
          error: joinUserError({
            bm: "Minit kenal halaman ini, tetapi bantuan AI untuk bulan ini sudah habis sebelum ia dapat membacanya. Ia bermula semula pada 1 hari bulan depan.",
            zh: "Minit 认出这一页了，但这个月的 AI 用量在读完之前刚好用尽。下个月 1 号会重新开始。",
            en: "Minit recognised the page, but this month's AI help ran out before it could read it. It starts again on the 1st of next month.",
          }),
        },
        { status: 402 },
      );
    }

    const onExtractUsage = createUsageRecorder(gate.org.id, extractCharge);

    // F-2 (2026-08-25): the home page's "one door" now reads with the SAME
    // prompt the /minutes camera uses — including the society's own glossary.
    // Before this, the same photo read differently depending on which page it
    // was dropped on, and nobody could see why.
    const glossaryBlock =
      kind === "meeting_notes"
        ? glossaryPromptBlockForReading(await loadGlossary(gate.org.id))
        : "";
    const prompt =
      kind === "meeting_notes"
        ? extractMeetingNotesPrompt({ orgName, todayIso, glossaryBlock, contextBlock })
        : kind === "ledger_page"
          ? extractLedgerPrompt({ orgName, todayIso, contextBlock })
          : extractConstitutionPrompt({ orgName, contextBlock });

    const validate =
      kind === "meeting_notes"
        ? parseMeetingNotesExtraction
        : kind === "ledger_page"
          ? parseLedgerExtraction
          : parseConstitutionExtraction;

    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt,
        imageBase64,
        mimeType: file.type,
        onUsage: onExtractUsage,
      });
    } catch {
      // F-2 parity with /api/extract-minutes: the vendor was never reached (or
      // threw) — the extract action is refunded (CLAUDE.md rule 10). Until
      // tonight this was the ONE reading path that charged for a failure.
      await refundUsage(gate.org.id, extractCharge);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiUnavailable) },
        { status: 502 },
      );
    }

    let parsed = validate(raw);
    if (!parsed.success) {
      // Rule 7: retry ONCE with the validation errors appended, not charged again.
      const issues = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
      try {
        raw = await provider.extractJson({
          prompt: `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${issues}`,
          imageBase64,
          mimeType: file.type,
          onUsage: onExtractUsage,
        });
        parsed = validate(raw);
      } catch {
        // fall through
      }
    }

    if (!parsed.success) {
      // Two attempts, nothing readable came back: the person is left with
      // nothing, so the extract action is refunded (rule 10) — same as
      // /api/extract-minutes. The classify action stays charged: the file WAS
      // recognised.
      await refundUsage(gate.org.id, extractCharge);
      return NextResponse.json(
        { kind, error: joinUserError(USER_ERRORS.aiCouldNotRead) },
        { status: 422 },
      );
    }

    // S0-7 parity: a "confirmed" phone with the wrong digit count is an
    // unflagged truncation — demote to "check" before it reaches the review.
    const extraction =
      kind === "ledger_page"
        ? demoteSuspectPhones(parsed.data as Parameters<typeof demoteSuspectPhones>[0]).extraction
        : parsed.data;

    // Keep the page + a history row (best-effort), so the original stays
    // checkable against every field Minit read off it.
    await recordUpload(
      file,
      kind === "meeting_notes"
        ? "meeting_notes"
        : kind === "ledger_page"
          ? "ledger_page"
          : "constitution",
    );

    return NextResponse.json({
      kind,
      store: DESTINATION[kind].store,
      page: DESTINATION[kind].page,
      // On the forced-kind path no classifier ran, so no detected language.
      language: classification?.language_detected ?? "unknown",
      fileName: file.name,
      extraction,
      provider: provider.name,
    });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/intake", e);
    // No contents in logs (PDPA).
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
