import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { inputProblemError, joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { draftMinutesPrompt } from "@/prompts/draft-minutes";
import {
  checkCoverage,
  checkNames,
  composeMinutesMd,
  minutesPlanSchema,
  type MinutesPlan,
} from "@/lib/minutes-compose";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { dayIsoMalaysia } from "@/lib/history";
import { glossaryAllowedRuns, glossaryPromptBlockForWriting } from "@/lib/glossary";
import { loadGlossary } from "@/lib/glossary-server";
import { isMinutesLang, writesInChinese, type MinutesLang } from "@/lib/minutes-lang";

// ---------------------------------------------------------------------------
// STEP 3 OF THE PIPELINE — the confirmed extraction becomes a real minit
// mesyuarat, written by the model.
//
// 2026-08-19. This route did not exist. src/prompts/draft-minutes.ts had been
// written since Phase 5 and had ZERO importers, and the comment at the top of
// src/lib/minutes-draft.ts said "the live pipeline drafts minutes with the
// LLM" — describing a pipeline that was never built. What users actually saw
// on step 3 was the deterministic template: the confirmed strings reprinted in
// their original language under hardcoded BM headings. Same class of defect as
// the AI panel whose send button was pushed off-screen (STATE §6): the code
// existed, the person could not reach it.
//
// The template renderer is NOT deleted. It stays as (a) the instant, zero-cost
// preview while fields are still being confirmed, and (b) the fallback when
// the vendor is down — a document the person can still use, just plainer.
//
// COST: charged as one `draft_minutes` action, and refunded if we cannot
// deliver a document (CLAUDE.md rule 10 — a refusal never eats the quota).
// PDPA (Hard Rule 5): the extraction and the document are never logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = parseMeetingNotesExtraction(
      (body as { extraction?: unknown } | null)?.extraction,
    );
    if (!parsed.success) {
      // 2026-08-20. This returned serverError — "something went wrong on
      // Minit's side, wait a minute and try again" — for a value the person
      // had typed. It is a 400: their input, their fix, so say which box.
      const firstPath = parsed.error.issues[0]?.path?.[0];
      return NextResponse.json(
        { error: joinUserError(inputProblemError(String(firstPath ?? ""))) },
        { status: 400 },
      );
    }
    const extraction = parsed.data;

    // Which language the society wants THIS document in. Anything unexpected
    // falls back to Bahasa Malaysia — the one eROSES needs, and what every
    // document produced before this option existed was written in.
    const rawLang = String((body as { language?: unknown } | null)?.language ?? "bm");
    const lang: MinutesLang = isMinutesLang(rawLang) ? rawLang : "bm";

    // Hard Rule 8: org name and signer come from the session, never the
    // browser. Same reasoning as saveConfirmedMinutes (2026-07-28 audit fix).
    const identity = await getDocumentIdentity();
    if (!identity) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 401 },
      );
    }

    // Every field must actually have been reviewed before we spend a credit
    // writing the final document — the client also blocks this, but the client
    // is not the authority on it.
    if (countUnreviewed(extraction) > 0) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 409 },
      );
    }

    const gate = await requireAiQuota(["draft_minutes"]);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const resolutionTexts = extraction.resolutions
      .filter((r) => r.text.confidence !== "missing" && r.text.value !== "")
      .map((r) => r.text.value);

    // The society's own words, so the same term comes out the same way every
    // month. Never blocks: an empty glossary leaves the prompt as it was.
    const glossary = await loadGlossary(gate.org.id);
    const glossaryBlock = glossaryPromptBlockForWriting(glossary);
    const allowedRuns = glossaryAllowedRuns(glossary);

    // long_doc: this is a generation, not a page read. Routed by
    // AI_MODEL_LONG_DOC so the model can be changed without touching code.
    const provider = getVisionProvider("long_doc");
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // Ask, check the arrangement covers every item, and on a miss send the
    // exact indices back once (CLAUDE.md rule 7). The retry is not charged.
    let plan: MinutesPlan | null = null;
    let repair: Parameters<typeof draftMinutesPrompt>[0]["repair"];
    for (let attempt = 0; attempt < 2 && plan === null; attempt++) {
      let raw: unknown;
      try {
        raw = await provider.extractJson({
          prompt: draftMinutesPrompt({ resolutionTexts, lang, glossaryBlock, repair }),
          onUsage,
        });
      } catch {
        await refundUsage(gate.org.id, gate.charges[0]);
        return NextResponse.json(
          { error: joinUserError(USER_ERRORS.aiUnavailable) },
          { status: 502 },
        );
      }

      const parsedPlan = minutesPlanSchema.safeParse(raw);
      if (!parsedPlan.success) continue;

      const coverage = checkCoverage(parsedPlan.data, resolutionTexts.length);
      // The name check only means something when the document is NOT in
      // Chinese — see checkNames for why. Coverage is checked in every
      // language; this one is honestly skipped rather than faked.
      const names = writesInChinese(lang)
        ? { ok: true, altered: [] as number[] }
        : checkNames(parsedPlan.data, resolutionTexts, allowedRuns);
      if (coverage.ok && names.ok) {
        plan = parsedPlan.data;
      } else {
        repair = {
          missing: coverage.missing,
          duplicated: coverage.duplicated,
          unknown: coverage.unknown,
          altered: names.altered,
        };
      }
    }

    if (!plan) {
      // Better a plain document the person can still use than a tidy one with
      // items silently gone.
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiCouldNotRead) },
        { status: 422 },
      );
    }

    const markdown = composeMinutesMd(plan, extraction, {
      orgName: identity.orgName,
      confirmedBy: identity.confirmedBy,
      dateIso: todayIso,
      lang,
    });

    return NextResponse.json({ markdown, provider: provider.name });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/draft-minutes", e);
    // No contents in logs (PDPA).
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}

/** Mirrors countUnreviewed in src/app/minutes/actions.ts. */
function countUnreviewed(e: {
  meeting_type: { confidence: string };
  meeting_date: { confidence: string };
  meeting_venue: { confidence: string };
  attendees: { name: { confidence: string } }[];
  resolutions: { text: { confidence: string } }[];
  figures: {
    description: { confidence: string };
    amount_cents: { confidence: string };
  }[];
  office_bearers: {
    position: { confidence: string };
    person_name: { confidence: string };
  }[];
}): number {
  const levels: string[] = [
    e.meeting_type.confidence,
    e.meeting_date.confidence,
    e.meeting_venue.confidence,
    ...e.attendees.map((a) => a.name.confidence),
    ...e.resolutions.map((r) => r.text.confidence),
    ...e.figures.flatMap((f) => [f.description.confidence, f.amount_cents.confidence]),
    ...e.office_bearers.flatMap((b) => [b.position.confidence, b.person_name.confidence]),
  ];
  return levels.filter((c) => c !== "confirmed").length;
}
