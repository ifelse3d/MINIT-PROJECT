import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { inputProblemError, joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { EXTRACT_OUTPUT_CEILING, getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { runTidyMinutes } from "@/lib/ai/tidy-minutes-run";
import { tidySourceItems } from "@/lib/tidy-minutes";
import { ROUTE_AI_DEADLINE_MS } from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";

// ---------------------------------------------------------------------------
// THE TIDIED READING COPY (work order 105 §2).
//
// 🔴🔴 THIS ROUTE READS NO PHOTOGRAPH. Its input is the VERBATIM JSON the
// extraction already produced; it re-arranges that text and hands back a
// reading copy in which every paragraph points at the verbatim line it came
// from. extract-meeting-notes.ts is not touched by any of this — which is
// exactly why the meeting-notes eval baseline (93.6%, 117/125, invented = 0)
// is unaffected by the whole of §2.
//
// 🔴 THE VERBATIM LAYER STAYS THE ARCHIVE. eROSES, the download and the
// confirm flow read the verbatim layer and only the verbatim layer. What this
// produces is a derivative for reading, and the page says so.
//
// COST: one `tidy_minutes` action — text in, text out, no image, so it is the
// cheap kind of call. Refunded whenever the person ends up with nothing
// (CLAUDE.md rule 10). A refusal is never fatal: the page simply shows the
// verbatim layer it was already showing.
//
// PDPA (Hard Rule 5): the extraction and the reading copy are never logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;
    const body = await req.json().catch(() => null);
    const parsed = parseMeetingNotesExtraction(
      (body as { extraction?: unknown } | null)?.extraction,
    );
    if (!parsed.success) {
      // Their input, their fix — say which box, exactly as step 3 does.
      const firstPath = parsed.error.issues[0]?.path?.[0];
      return NextResponse.json(
        { error: joinUserError(inputProblemError(String(firstPath ?? ""))) },
        { status: 400 },
      );
    }
    const extraction = parsed.data;
    const items = tidySourceItems(extraction);
    if (items.length === 0) {
      // Nothing to arrange. Not an error, and certainly not a charge.
      return NextResponse.json({ tidy: null, reason: "empty" });
    }

    const gate = await requireAiQuota(["tidy_minutes"]);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }
    const charge = gate.charges[0];
    const onUsage = createUsageRecorder(gate.org.id, charge);

    let result;
    try {
      result = await runTidyMinutes({
        provider: getVisionProvider("extract"),
        extraction,
        orgName: gate.org.name,
        items,
        onUsage,
        deadlineAt,
        // The reading copy is at most as long as the lines it re-words, and
        // those already fit the minutes ceiling.
        maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
      });
    } catch (e) {
      // The vendor was never reached (or threw): rule 10's one refund case.
      await refundUsage(gate.org.id, charge);
      return vendorFailureResponse("/api/tidy-minutes", e, gate.org.id);
    }

    if (!result.ok) {
      // Two attempts and the arrangement still did not add up. The person
      // gets nothing, so they pay nothing — and they lose nothing either:
      // the verbatim layer is what the page was already showing.
      await refundUsage(gate.org.id, charge);
      void captureAppError(
        "/api/tidy-minutes",
        new Error(`tidy plan rejected: ${result.reason}`),
        { orgId: gate.org.id, code: result.reason },
      );
      return NextResponse.json(
        {
          tidy: null,
          reason: result.reason,
          error: joinUserError({
            bm: "MinitAI tidak dapat menyusun versi rasmi kali ini. Tiada kuota digunakan — teks asal (verbatim) di sebelah tidak berubah dan boleh digunakan seperti biasa.",
            zh: "MinitAI 这次没能整理出正式版。没有用掉用量 —— 旁边的「原文（逐字）」一个字都没变，照样可以用。",
            en: "MinitAI could not put the formal version together this time. No quota was used — the verbatim original next to it is unchanged and still usable.",
          }),
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ tidy: result.doc });
  } catch (e) {
    void captureAppError("/api/tidy-minutes", e);
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
