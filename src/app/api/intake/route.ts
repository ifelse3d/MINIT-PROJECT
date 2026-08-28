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
import { chargeFence, refundFence } from "@/lib/fence";
import { checkPageLimit, countPdfPages } from "@/lib/pdf-pages";
import { ROUTE_AI_DEADLINE_MS, VendorTimeoutError } from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import {
  isLegacyOfficeFile,
  isOfficeFile,
  officeFileToText,
} from "@/lib/office-text";
import { fileFromRelay } from "@/lib/upload-relay-server";

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
    // P-1: ONE deadline shared by the classify call, the extract call and the
    // rule-7 retry, so this route's own refund + app_errors + honest message
    // always run before Vercel's 60s kill would erase all three. This is the
    // route the "ai_usage id=5" incident came through: charged, all-null,
    // unrefunded, unlogged — the signature of a function killed mid-flight.
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
    const form = await req.formData();
    const posted = form.get("file");
    let file: File;
    let viaRelay = false;
    if (posted instanceof File) {
      file = posted;
    } else {
      // A-4 (work order 51): a PDF too big for Vercel's body cap arrives as a
      // Storage path instead of a file. fileFromRelay validates, downloads
      // and deletes the relay object; from here on it IS a File.
      const relayed = await fileFromRelay(form.get("storagePath"));
      if (!relayed) {
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.noPhoto) },
          { status: 400 },
        );
      }
      if (!relayed.ok) {
        return NextResponse.json(
          { error: joinUserError(relayed.error) },
          { status: relayed.status },
        );
      }
      file = relayed.file;
      viaRelay = true;
    }
    // F-10 (拍板 41) + 拍板 3 (work order 51): .docx / .xlsx / .pptx are
    // welcome at this door — their text is pulled out DETERMINISTICALLY below
    // (no AI, no quota) and then read by the same extract prompts as labelled
    // text instead of an image. The pre-2007 binary formats get "save it as
    // .docx/.pptx" instead of the generic unsupported-file sentence.
    if (isLegacyOfficeFile(file.name, file.type)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.legacyOfficeFile) },
        { status: 400 },
      );
    }
    const officeFile = isOfficeFile(file.name, file.type);
    if (!officeFile && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.unsupportedLedgerFile) },
        { status: 400 },
      );
    }
    // Relay files were already size-checked against the vendor ceiling.
    if (!viaRelay && file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.fileTooLarge) },
        { status: 400 },
      );
    }

    // 2026-08-21: pages are counted BEFORE the quota is charged. A 200-page PDF
    // is one tap and a large part of a month's AI quota, and there is no
    // confirmation screen between the two. See src/lib/pdf-pages.ts.
    const bytes = await file.arrayBuffer();
    // F-10: an Office file is converted BEFORE anything is charged — a file
    // that cannot be converted costs nothing, and the person is told exactly
    // what to do instead (the old D-6 advice: save it as a PDF).
    let officeText: string | null = null;
    if (officeFile) {
      const converted = await officeFileToText(file.name, file.type, bytes);
      if (!converted.ok) {
        const msg =
          converted.reason === "too_long"
            ? {
                bm: "Fail Office ini terlalu panjang untuk dibaca sekali gus. Pecahkannya, atau simpan bahagian yang perlu sebagai PDF dan muat naik itu.",
                zh: "这个 Office 文件太长，没办法一次读完。请拆小一点，或把需要的部分另存为 PDF 再上传。",
                en: "This Office file is too long to read in one go. Split it up, or save the needed part as a PDF and upload that.",
              }
            : {
                bm: "Fail Office ini tidak dapat dibaca. Buka fail itu, simpan sebagai PDF, dan muat naik PDF itu.",
                zh: "这个 Office 文件读不出来。请打开文件另存为 PDF，再上传那个 PDF。",
                en: "This Office file could not be read. Open it, save it as a PDF, and upload that PDF.",
              };
        return NextResponse.json({ error: joinUserError(msg) }, { status: 400 });
      }
      officeText = converted.text;
    }
    // The page-count guard only understands images and PDFs; Office files are
    // bounded by the converter's own character cap instead.
    const pages = officeFile
      ? ({ ok: true } as const)
      : await checkPageLimit(bytes, file.type, "unknown");
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

    // D44 fence: lifetime 20 AI-read pages on the free plan (photo = 1,
    // Office file = 1 — its text is bounded by the converter's own cap).
    // Refunded on every path where the person ends up with nothing, including
    // "unknown kind": the forced re-send will charge the same file again.
    const pageCount = officeFile
      ? 1
      : file.type === "application/pdf"
        ? ((await countPdfPages(bytes)) ?? 1)
        : 1;
    const fenceGate = await chargeFence(gate.org, { pages: pageCount });
    if (!fenceGate.ok) {
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(fenceGate.body, { status: fenceGate.status });
    }
    const fenceCharge = fenceGate.charge;

    const orgName = gate.org.name;
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    // F-10: an Office file reaches the model as LABELLED TEXT, not an image.
    // Same untrusted framing as the person's own notes — document content is
    // data, never instructions.
    const officeBlock =
      officeText === null
        ? ""
        : `\n\n${untrustedBlock(
            "THE DOCUMENT'S FULL TEXT (converted from a Word/Excel/PowerPoint file on the server — there is no photo; read this text as the page itself)",
            officeText,
          )}`;
    const media =
      officeText === null
        ? { imageBase64: Buffer.from(bytes).toString("base64"), mimeType: file.type }
        : {};
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
          prompt: classifyPrompt({ filename: file.name }) + officeBlock,
          ...media,
          onUsage: onClassifyUsage,
          deadlineAt,
        });
        const parsed = classificationSchema.safeParse(raw);
        if (parsed.success) classification = parsed.data;
      } catch (e) {
        // P-1: the classifier never delivered — the person got NOTHING for
        // this charge, so it is refunded (CLAUDE.md rule 10: a throw before /
        // instead of an answer is the one thing a refund means). Until tonight
        // this path both kept the charge and swallowed the error.
        await refundUsage(gate.org.id, gate.charges[0]);
        await refundFence(fenceCharge);
        return vendorFailureResponse("/api/intake", e, gate.org.id);
      }

      if (!classification || !isHandled(classification.kind)) {
        // The forced re-send with kind= will charge these pages again —
        // one file must not cost its pages twice.
        await refundFence(fenceCharge);
        // Honest outcome, not a guess: we know we could not place this page.
        // The classify action is still charged — the model did run. The box
        // turns this into a question ("is it minutes, a ledger page, or the
        // constitution?") and re-sends with kind= set.
        return NextResponse.json(
          {
            kind: "unknown",
            error: joinUserError({
              bm: "MinitAI tidak pasti halaman ini jenis apa. Kalau ia nota mesyuarat, buka halaman Minit Mesyuarat dan ambil gambar di sana. Kalau ia halaman lejar derma, buka halaman Wang & Resit. Kalau ia perlembagaan, buka halaman Perlembagaan.",
              zh: "MinitAI 不太确定这一页是什么。如果是会议笔记，请到「会议记录」页拍；如果是捐款账页，请到「财务与收据」页；如果是章程，请到「章程」页。",
              en: "MinitAI is not sure what this page is. If it is meeting notes, open the Meeting Minutes page and take the photo there. If it is a donation ledger page, open Money & Receipts. If it is your constitution, open the Constitution page.",
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
    const kindLimit = officeFile
      ? ({ ok: true } as const) // bounded by the converter's character cap
      : await checkPageLimit(
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
      // Nothing was read — the fence pages go back on both branches.
      await refundFence(fenceCharge);
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
        await refundFence(fenceCharge);
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.serverError) },
          { status: 500 },
        );
      }
      // The extract never ran; the pages go back with it.
      await refundFence(fenceCharge);
      // Quota ran out between the two charges: tell them the file was recognised
      // so the classify action was not wasted from their point of view.
      return NextResponse.json(
        {
          kind,
          error: joinUserError({
            bm: "MinitAI kenal halaman ini, tetapi bantuan AI untuk bulan ini sudah habis sebelum ia dapat membacanya. Ia bermula semula pada 1 hari bulan depan.",
            zh: "MinitAI 认出这一页了，但这个月的 AI 用量在读完之前刚好用尽。下个月 1 号会重新开始。",
            en: "MinitAI recognised the page, but this month's AI help ran out before it could read it. It starts again on the 1st of next month.",
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
      (kind === "meeting_notes"
        ? extractMeetingNotesPrompt({ orgName, todayIso, glossaryBlock, contextBlock })
        : kind === "ledger_page"
          ? extractLedgerPrompt({ orgName, todayIso, contextBlock })
          : extractConstitutionPrompt({ orgName, contextBlock })) +
      // F-10: the converted Word/Excel text rides AFTER the prompt, exactly
      // like the person's own typed context — the prompt file itself is not
      // touched (拍板 42: no golden case, no prompt edits).
      officeBlock;

    const validate =
      kind === "meeting_notes"
        ? parseMeetingNotesExtraction
        : kind === "ledger_page"
          ? parseLedgerExtraction
          : parseConstitutionExtraction;

    // Output ceiling sized to what this kind of document actually produces —
    // the 8192 default is what killed the 8-page constitution (2026-08-28).
    const maxOutputTokens =
      kind === "meeting_notes"
        ? EXTRACT_OUTPUT_CEILING.minutes
        : kind === "ledger_page"
          ? EXTRACT_OUTPUT_CEILING.ledger
          : EXTRACT_OUTPUT_CEILING.constitution;

    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt,
        ...media,
        maxOutputTokens,
        onUsage: onExtractUsage,
        deadlineAt,
      });
    } catch (e) {
      // F-2 parity with /api/extract-minutes: the vendor was never reached (or
      // threw) — the extract action is refunded (CLAUDE.md rule 10). Until
      // tonight this was the ONE reading path that charged for a failure.
      // P-1: and the failure is recorded — `catch {}` is how app_errors stayed
      // at 0 rows through the id=5 incident.
      await refundUsage(gate.org.id, extractCharge);
      await refundFence(fenceCharge);
      return vendorFailureResponse("/api/intake", e, gate.org.id);
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
          ...media,
          maxOutputTokens,
          onUsage: onExtractUsage,
          deadlineAt,
        });
        parsed = validate(raw);
      } catch (e) {
        // P-1: a timeout on the retry is reported as a timeout — camera advice
        // for a slow vendor sends the person chasing the wrong fix. A
        // truncation means "split the file". Anything else still falls
        // through to "could not read"; every path refunds.
        if (e instanceof VendorTimeoutError || e instanceof VendorOutputTruncatedError) {
          await refundUsage(gate.org.id, extractCharge);
          await refundFence(fenceCharge);
          return vendorFailureResponse("/api/intake", e, gate.org.id);
        }
        void captureAppError("/api/intake", e, { orgId: gate.org.id });
        // fall through
      }
    }

    if (!parsed.success) {
      // Two attempts, nothing readable came back: the person is left with
      // nothing, so the extract action is refunded (rule 10) — same as
      // /api/extract-minutes. The classify action stays charged: the file WAS
      // recognised.
      await refundUsage(gate.org.id, extractCharge);
      await refundFence(fenceCharge);
      // A-1: the REAL reason lands in app_errors (typed marker, no contents).
      void captureAppError(
        "/api/intake",
        new Error("extraction failed validation twice"),
        { orgId: gate.org.id, code: "unreadable_twice" },
      );
      return NextResponse.json(
        {
          kind,
          // A-1: advice split by INPUT — camera talk only for actual photos.
          error: joinUserError(
            officeFile
              ? USER_ERRORS.aiCouldNotReadOffice
              : file.type === "application/pdf"
                ? USER_ERRORS.aiCouldNotReadPdf
                : USER_ERRORS.aiCouldNotRead,
          ),
        },
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
    // checkable against every field Minit read off it. The storage path rides
    // back (28/8 evening) so a meeting read at the front door links its photo
    // into the saved document, same as /api/extract-minutes.
    const storagePath = await recordUpload(
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
      storagePath,
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
