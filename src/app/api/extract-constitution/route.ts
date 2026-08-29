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
  createUsageRecorder,
  refundUsage,
  requireAiQuota,
  type UsageCharge,
} from "@/lib/ai/usage";
import { parseConstitutionExtraction } from "@/lib/extraction";
import { extractConstitutionPrompt } from "@/prompts/extract-constitution";
import { recordUpload } from "@/lib/record-upload";
import { chargeFence, refundFence, type FenceCharge } from "@/lib/fence";
import { getActiveOrg, type ActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { getSupabase } from "@/db/supabase";
import {
  aiDocMaxPages,
  checkPageLimit,
  countPdfPages,
} from "@/lib/pdf-pages";
import {
  constitutionFencePages,
} from "@/lib/constitution-pages";
import {
  CONTINUATION_TTL_MS,
  signContinuation,
  verifyContinuation,
} from "@/lib/constitution-continuation";
import {
  EXTRACT_ATTEMPT_TIMEOUT_MS,
  ROUTE_AI_DEADLINE_MS,
  VendorTimeoutError,
} from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import { fileFromRelay } from "@/lib/upload-relay-server";

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
// SEGMENTED READS (I1, work order 81, 2026-08-30). One request cannot outrun
// the platform (60s kill / 50s vendor budget / 45s attempt), and a real
// constitution is the one document that regularly tries to. The BROWSER now
// splits a long document and sends each piece here as its own request:
//   * segment 1 declares the document's total pages (`docPages`), pays the
//     ONE extract action and the ONE A6 fence charge for the whole document,
//     and receives a signed continuation token;
//   * segments 2..n present the token (`continuation`) and are charged
//     NOTHING — their vendor cost accumulates onto the same ai_usage row
//     (createUsageRecorder's seed), so the member pays one action and the
//     cost record stays truthful. The token's page budget is what stops a
//     forged "continuation" from reading the world for free.
// The old advice telling PEOPLE to split the file retired with this: the app
// splits it itself, so this route no longer sends `bigDocument` hints.
//
// Mirrors /api/extract-minutes: zod-validated, retry ONCE with the validation
// errors appended, then fail cleanly (CLAUDE.md rule 7). The org name comes
// from the server-resolved session, never from the request body.
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

/**
 * The continuation token's HMAC secret. The service-role key is already the
 * one secret every deployment must have, is never sent anywhere, and here it
 * only ever feeds an HMAC — the derived signature reveals nothing about it.
 * Empty (a broken deployment) simply disables continuations: the client then
 * falls back to charging each segment, which is honest, never free.
 */
function continuationSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/** What both branches below must agree on before the vendor is called. */
type ChargeContext = {
  org: ActiveOrg;
  charge: UsageCharge;
  /** null on a continuation — nothing new was charged. */
  fenceCharge: FenceCharge | null;
  /** Continuation only: what the charged row already holds. */
  seed?: { inputTokens: number; outputTokens: number; costMicros: number | null };
  /** True when THIS request charged nothing (so it refunds nothing). */
  isContinuation: boolean;
  /** Pages the chain may still read after this segment. 0 = last one. */
  pagesLeftAfter: number;
};

export async function POST(req: Request) {
  try {
    // P-1: ONE deadline for every vendor call in this request — a constitution
    // is the longest read in the app, so this route is the likeliest to blow
    // past Vercel's 60s kill, after which NO refund and NO app_errors row runs.
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
    const form = await req.formData();
    const posted = form.get("photo");
    let file: File;
    let viaRelay = false;
    if (posted instanceof File) {
      file = posted;
    } else {
      // A-4 (work order 51): a PDF too big for Vercel's body cap arrives as a
      // Storage path instead of a file — the constitution is the document
      // this matters most for (a 20-40 page scan is routinely over 4MB).
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
    if (!ALLOWED_MIME.has(file.type)) {
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

    /** THIS file's own pages (a segment on the split path, or the whole
     *  document on the classic one). A photo is one page by definition. */
    const segPages =
      file.type === "application/pdf" ? ((await countPdfPages(bytes)) ?? 1) : 1;

    // I1: the two split-read fields. Both optional; absent = classic request.
    const continuationToken = String(form.get("continuation") ?? "");
    const docPagesRaw = Number(form.get("docPages"));
    const declaredDocPages =
      Number.isInteger(docPagesRaw) && docPagesRaw > 0 ? docPagesRaw : null;

    let ctx: ChargeContext;
    if (continuationToken !== "") {
      // --- segment 2..n of a document whose action is already paid --------
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
      if (!can(org.role, "upload")) {
        return NextResponse.json(
          { error: permissionError("upload"), code: "NO_PERMISSION" },
          { status: 403 },
        );
      }
      const token = verifyContinuation(continuationToken, continuationSecret());
      // Stale, forged, someone else's org, or a segment bigger than the
      // declared budget: all one answer. 409 tells the browser to start a
      // FRESH (charged) read — never to retry the same request.
      if (!token || token.orgId !== org.id || segPages > token.pagesLeft) {
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.serverError), code: "CONTINUATION_INVALID" },
          { status: 409 },
        );
      }
      // The row the token points at must still be the one it was minted for:
      // this org, this action, not refunded. Service-role read; the org was
      // resolved through the RLS-checked path above.
      const { data: row } = await getSupabase()
        .from("ai_usage")
        .select("id, action, refunded_at, input_tokens, output_tokens, cost_micros")
        .eq("id", token.rowId)
        .eq("org_id", org.id)
        .maybeSingle();
      const usageRow = row as
        | {
            action?: string | null;
            refunded_at?: string | null;
            input_tokens?: number | null;
            output_tokens?: number | null;
            cost_micros?: number | null;
          }
        | null;
      if (
        !usageRow ||
        usageRow.action !== "extract_constitution" ||
        usageRow.refunded_at
      ) {
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.serverError), code: "CONTINUATION_INVALID" },
          { status: 409 },
        );
      }
      ctx = {
        org,
        charge: { rowId: token.rowId, spentCredit: false },
        fenceCharge: null,
        seed: {
          inputTokens: usageRow.input_tokens ?? 0,
          outputTokens: usageRow.output_tokens ?? 0,
          costMicros: usageRow.cost_micros ?? null,
        },
        isContinuation: true,
        pagesLeftAfter: token.pagesLeft - segPages,
      };
    } else {
      // --- classic request, or segment 1 of a split read ------------------
      // A declared total smaller than the file in hand is a client bug —
      // believe the file. The declared total obeys the same page cap as a
      // single upload, checked BEFORE anything is charged.
      const docPages = Math.max(declaredDocPages ?? segPages, segPages);
      const docLimit = aiDocMaxPages("constitution");
      if (docPages > docLimit) {
        return NextResponse.json(
          { error: joinUserError(tooManyPagesError(docPages, docLimit)) },
          { status: 400 },
        );
      }

      // Charge the quota BEFORE any AI vendor is called. ONE action for the
      // whole document, however many segments follow (J's ruling, work order
      // 81 §2 — the MAX_TOOL_ROUNDS precedent: extra vendor calls are our
      // cost, not the member's). The rule-7 retry is not charged again either.
      const gate = await requireAiQuota(["extract_constitution"], { cap: "upload" });
      if (!gate.ok) {
        return NextResponse.json(gate.body, { status: gate.status });
      }

      // D44 fence, A6 exception (J, 2026-08-28, re-confirmed 2026-08-30): a
      // constitution upload costs the free fence min(actual pages, 5) — the
      // lifetime 20-page allowance must not make a complete constitution
      // impossible. Charged ONCE here for the whole document; continuations
      // charge nothing.
      const fenceGate = await chargeFence(gate.org, {
        pages: constitutionFencePages(docPages),
      });
      if (!fenceGate.ok) {
        await refundUsage(gate.org.id, gate.charges[0]);
        return NextResponse.json(fenceGate.body, { status: fenceGate.status });
      }
      ctx = {
        org: gate.org,
        charge: gate.charges[0],
        fenceCharge: fenceGate.charge,
        isContinuation: false,
        // Only a request that DECLARED a split may mint a continuation.
        pagesLeftAfter: declaredDocPages ? docPages - segPages : 0,
      };
    }

    const { org, charge, fenceCharge, isContinuation } = ctx;
    /** Undo this request's own charges — a continuation charged nothing, so
     *  it refunds nothing (the earlier segments were delivered and stand). */
    const refundThisRequest = async () => {
      if (isContinuation) return;
      await refundUsage(org.id, charge);
      await refundFence(fenceCharge);
    };

    const imageBase64 = Buffer.from(bytes).toString("base64");
    const prompt = extractConstitutionPrompt({ orgName: org.name });
    // A constitution can run to 30+ pages — the one genuinely expensive job.
    // Kept on its own tier so it can be pointed at a long-context or Batch
    // model without touching the other three tasks.
    const provider = getVisionProvider("long_doc");

    // 2026-08-18: attach what the vendor actually charged to the ai_usage row
    // that paid for it. On a continuation the recorder is SEEDED with the
    // row's running totals, so segment 3's write never erases segment 1's.
    const onUsage = createUsageRecorder(org.id, charge, ctx.seed);

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
        // D0-2: the constitution is the longest read in the app — one 45s
        // attempt, not three aborted 20s ones (J's "AI took too long", 8/29).
        timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
      });
    } catch (e) {
      // A refusal must never eat someone's quota (CLAUDE.md rule 10). A
      // constitution is the single most expensive job in the app, so charging
      // for a failed read hurt most exactly here.
      // P-1: the failure is also recorded now (app_errors) — see id=5.
      await refundThisRequest();
      return vendorFailureResponse("/api/extract-constitution", e, org.id);
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
          timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
        });
        parsed = parseConstitutionExtraction(raw);
      } catch (e) {
        // P-1: a timeout is a timeout — not "retake the photo"; a truncation
        // is "the document is too long", not "retake the photo". Both refund
        // what THIS request charged.
        if (e instanceof VendorTimeoutError || e instanceof VendorOutputTruncatedError) {
          await refundThisRequest();
          return vendorFailureResponse("/api/extract-constitution", e, org.id);
        }
        void captureAppError("/api/extract-constitution", e, { orgId: org.id });
        // fall through to the failure response below
      }
    }

    if (!parsed || !parsed.success) {
      // Two attempts, nothing readable came back: the person keeps the credit.
      await refundThisRequest();
      // A-1: the REAL reason lands in app_errors (typed marker, no contents).
      void captureAppError(
        "/api/extract-constitution",
        new Error("extraction failed validation twice"),
        { orgId: org.id, code: "unreadable_twice" },
      );
      return NextResponse.json(
        {
          // A-1: advice split by INPUT — camera talk only for actual photos.
          error: joinUserError(
            file.type === "application/pdf"
              ? USER_ERRORS.aiCouldNotReadPdf
              : USER_ERRORS.aiCouldNotRead,
          ),
        },
        { status: 422 },
      );
    }

    // Keep the page + a history row for the active org (best-effort), so the
    // original photocopy stays checkable against every quoted clause. Each
    // segment holds real pages, so each is kept.
    await recordUpload(file, "constitution");

    // I1: more of the document to come? Hand back the pass for the next
    // segment. A failed segment got no token, so its retry re-uses the old
    // one — the budget only ever shrinks on delivered pages.
    let continuation: string | null = null;
    if (ctx.pagesLeftAfter > 0) {
      const secret = continuationSecret();
      if (secret !== "") {
        continuation = signContinuation(
          {
            rowId: charge.rowId,
            orgId: org.id,
            pagesLeft: ctx.pagesLeftAfter,
            exp: Date.now() + CONTINUATION_TTL_MS,
          },
          secret,
        );
      }
    }

    return NextResponse.json({
      extraction: parsed.data,
      provider: provider.name,
      continuation,
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
