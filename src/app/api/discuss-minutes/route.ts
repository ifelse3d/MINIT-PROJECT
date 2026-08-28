import { NextResponse } from "next/server";
import { z } from "zod";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { ROUTE_AI_DEADLINE_MS } from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { isMinutesLang, type MinutesLang } from "@/lib/minutes-lang";
import {
  discussMinutesPrompt,
  type DiscussSectionKind,
} from "@/prompts/discuss-minutes";

// ---------------------------------------------------------------------------
// J review 27-evening #31 (approved 2026-08-28): 「每個 PART 跟 AI 討論」 —
// one exchange about ONE section of the minutes review. The model answers and
// may propose row REWRITES; the person applies each proposal by hand on the
// review page, so nothing the model says reaches the database directly (the
// review/confirm/save gates all still stand).
//
// COST (J's own billing ruling: 改一次算一次): every exchange charges one
// `discuss_minutes` action, refunded only when the vendor was never reached /
// never delivered — the same contract as every other AI route.
// PDPA (Hard Rule 5): rows and instructions are never logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  section: z.enum(["meeting", "resolutions", "figures", "bearers"]),
  instruction: z.string().min(1).max(600),
  rows: z
    .array(
      z.object({
        index: z.number().int().min(0).max(500),
        label: z.string().max(60),
        text: z.string().max(2_000),
      }),
    )
    .max(80),
  uiLang: z.string().optional(),
});

const replySchema = z.object({
  reply: z.string().min(1).max(4_000),
  proposals: z
    .array(z.object({ index: z.number().int(), text: z.string().min(1).max(2_000) }))
    .max(80)
    .default([]),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 400 },
      );
    }
    const { section, instruction, rows } = parsed.data;
    const lang: MinutesLang = isMinutesLang(parsed.data.uiLang ?? "")
      ? (parsed.data.uiLang as MinutesLang)
      : "zh";

    const identity = await getDocumentIdentity();
    if (!identity) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 401 },
      );
    }

    // B-4: spending the org's quota to shape its minutes is upload-level
    // work — an auditor_readonly account cannot do it.
    const gate = await requireAiQuota(["discuss_minutes"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const provider = getVisionProvider("long_doc");
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;

    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt: discussMinutesPrompt({
          section: section as DiscussSectionKind,
          rows,
          instruction,
          lang,
        }),
        onUsage,
        deadlineAt,
      });
    } catch (e) {
      await refundUsage(gate.org.id, gate.charges[0]);
      return vendorFailureResponse("/api/discuss-minutes", e, gate.org.id);
    }

    const answer = replySchema.safeParse(raw);
    if (!answer.success) {
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiCouldNotRead) },
        { status: 422 },
      );
    }

    // A proposal may only touch a row that was actually sent — an invented
    // index is dropped, never surfaced. The client re-checks anyway (its
    // apply is by-index into its own list), but the server is the authority.
    const validIndices = new Set(rows.map((r) => r.index));
    const proposals = answer.data.proposals.filter((p) => validIndices.has(p.index));

    return NextResponse.json({
      reply: answer.data.reply,
      proposals,
      provider: provider.name,
    });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/discuss-minutes", e);
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
