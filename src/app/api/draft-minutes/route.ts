import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { inputProblemError, joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { runDraftMinutesPlan, runPhraseMinutesItems } from "@/lib/ai/draft-minutes-run";
import {
  buildPhraseWork,
  composeMinutesMd,
  composeStructuredMinutesMd,
  minutesStructure,
  usableResolutions,
  type MinutesPlan,
} from "@/lib/minutes-compose";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { countUnreviewed } from "@/lib/extraction-rows";
import { dayIsoMalaysia } from "@/lib/history";
import { glossaryAllowedRuns, glossaryPromptBlockForWriting } from "@/lib/glossary";
import { loadGlossary } from "@/lib/glossary-server";
import { isMinutesLang, type MinutesLang } from "@/lib/minutes-lang";
import { normalizeFullwidth } from "@/lib/bm-guard";
import { ROUTE_AI_DEADLINE_MS } from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";

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

    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    // 97 §2: a BM document is normalized on the way out — fullwidth keyboard
    // residue (＃ － 。) becomes its plain meaning, deterministically, zero
    // AI. The registered org name and the signer stay verbatim. The Chinese
    // version is untouched (Chinese text is SUPPOSED to be fullwidth).
    const finishMd = (md: string) =>
      lang === "bm"
        ? normalizeFullwidth(md, [identity.orgName, identity.confirmedBy])
        : md;
    const composeOpts = {
      orgName: identity.orgName,
      confirmedBy: identity.confirmedBy,
      dateIso: todayIso,
      lang,
      // C-1 / D-1: the registration number on the letterhead. The save action
      // re-stamps it from the org record either way; passing it here means the
      // person READS the same document they will sign.
      ppmNo: identity.ppmNo,
    };

    // ------------------------------------------------------------------
    // G2 (work order 68): the STRUCTURED path. A printed formal minit read
    // by G1 carries its own sections — arranging it is not a judgement
    // call, so the model is not asked to arrange. Two sub-cases:
    //
    //   * nothing needs a language conversion → the document is assembled
    //     deterministically, paragraph for paragraph, ZERO vendor calls —
    //     and therefore ZERO charge (reaching the vendor is what costs an
    //     action; nothing was reached).
    //   * some paragraphs need the target language → ONE charged action;
    //     the model phrases those paragraphs in place, checked by counting.
    // ------------------------------------------------------------------
    const structure = minutesStructure(extraction);
    if (structure) {
      const work = buildPhraseWork(extraction, lang);
      if (work.items.length === 0) {
        const markdown = finishMd(composeStructuredMinutesMd(extraction, composeOpts));
        return NextResponse.json({ markdown, provider: "structure" });
      }

      const sGate = await requireAiQuota(["draft_minutes"], { cap: "upload" });
      if (!sGate.ok) {
        return NextResponse.json(sGate.body, { status: sGate.status });
      }
      const sGlossary = await loadGlossary(sGate.org.id);
      try {
        const run = await runPhraseMinutesItems({
          // 97 §8: document WRITING rides its own dial (AI_MODEL_WRITE);
          // unset it resolves to long_doc — today's behaviour unchanged.
          provider: getVisionProvider("write"),
          items: work.items,
          allTexts: work.allTexts,
          lang,
          glossaryBlock: glossaryPromptBlockForWriting(sGlossary),
          allowedRuns: glossaryAllowedRuns(sGlossary),
          onUsage: createUsageRecorder(sGate.org.id, sGate.charges[0]),
          deadlineAt: Date.now() + ROUTE_AI_DEADLINE_MS,
        });
        if (!run.ok) {
          await refundUsage(sGate.org.id, sGate.charges[0]);
          return NextResponse.json(
            { error: joinUserError(USER_ERRORS.aiCouldNotRead) },
            { status: 422 },
          );
        }
        const { texts, titles } = work.split(run.phrased);
        const markdown = finishMd(
          composeStructuredMinutesMd(extraction, composeOpts, texts, titles),
        );
        return NextResponse.json({
          markdown,
          provider: getVisionProvider("write").name,
        });
      } catch (e) {
        await refundUsage(sGate.org.id, sGate.charges[0]);
        return vendorFailureResponse("/api/draft-minutes", e, sGate.org.id);
      }
    }

    const gate = await requireAiQuota(["draft_minutes"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const resolutionTexts = usableResolutions(extraction).map((r) => r.text.value);

    // The society's own words, so the same term comes out the same way every
    // month. Never blocks: an empty glossary leaves the prompt as it was.
    const glossary = await loadGlossary(gate.org.id);
    const glossaryBlock = glossaryPromptBlockForWriting(glossary);
    const allowedRuns = glossaryAllowedRuns(glossary);

    // 97 §8: this is a generation, not a page read — routed by AI_MODEL_WRITE
    // (falling back to AI_MODEL_LONG_DOC while unset) so the writing model
    // can be benched and changed without touching code.
    const provider = getVisionProvider("write");
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // P-1: one deadline shared by both attempts of the loop below, so the
    // refund + app_errors + honest message run before Vercel's 60s kill.
    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;

    // Ask, check the arrangement covers every item, and on a miss send the
    // exact indices back once (CLAUDE.md rule 7). The retry is not charged.
    // ONE copy of the loop, shared with the quality eval — see
    // src/lib/ai/draft-minutes-run.ts (work order 68, G0).
    let plan: MinutesPlan | null = null;
    try {
      const run = await runDraftMinutesPlan({
        provider,
        resolutionTexts,
        lang,
        glossaryBlock,
        allowedRuns,
        onUsage,
        deadlineAt,
      });
      if (run.ok) plan = run.plan;
    } catch (e) {
      // P-1: the failure is also recorded now (app_errors) — see id=5.
      await refundUsage(gate.org.id, gate.charges[0]);
      return vendorFailureResponse("/api/draft-minutes", e, gate.org.id);
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

    const markdown = finishMd(composeMinutesMd(plan, extraction, composeOpts));

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

// countUnreviewed moved to src/lib/extraction-rows.ts (K-4) — one copy shared
// with the save action, instead of two "keep in sync" twins.
