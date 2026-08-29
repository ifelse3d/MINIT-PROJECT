import { draftMinutesPrompt } from "@/prompts/draft-minutes";
import {
  checkCoverage,
  checkMergedFacts,
  checkNames,
  minutesPlanSchema,
  type MinutesPlan,
} from "@/lib/minutes-compose";
import { writesInChinese, type MinutesLang } from "@/lib/minutes-lang";
import type { TokenUsage, VisionJsonProvider } from "./provider";

// ---------------------------------------------------------------------------
// THE DRAFT-MINUTES LOOP, ONE COPY (work order 68, G0).
//
// Ask the model for an arrangement, check it by counting (coverage — nothing
// lost; names — nothing rewritten; merged facts — nothing merged away), and on
// a miss send the exact indices back once (CLAUDE.md rule 7).
//
// Extracted from /api/draft-minutes so the quality eval (eval/run-quality.ts)
// measures EXACTLY the pipeline the route runs — two hand-synced copies of
// this loop is how a measurement quietly stops describing the product.
//
// Vendor errors PROPAGATE: the route owns money (refund + vendorFailureResponse),
// this function owns none.
// ---------------------------------------------------------------------------

export type DraftPlanResult =
  | { ok: true; plan: MinutesPlan }
  /** Two attempts, still failing the arithmetic — the caller falls back to the
   *  plain template rather than shipping a document with items missing. */
  | { ok: false };

export async function runDraftMinutesPlan(opts: {
  provider: VisionJsonProvider;
  resolutionTexts: string[];
  lang: MinutesLang;
  glossaryBlock?: string;
  allowedRuns?: string[];
  onUsage?: (usage: TokenUsage) => void;
  deadlineAt?: number;
}): Promise<DraftPlanResult> {
  const {
    provider,
    resolutionTexts,
    lang,
    glossaryBlock = "",
    allowedRuns = [],
    onUsage,
    deadlineAt,
  } = opts;

  let repair: Parameters<typeof draftMinutesPrompt>[0]["repair"];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.extractJson({
      prompt: draftMinutesPrompt({ resolutionTexts, lang, glossaryBlock, repair }),
      onUsage,
      deadlineAt,
    });

    const parsedPlan = minutesPlanSchema.safeParse(raw);
    if (!parsedPlan.success) continue;

    const coverage = checkCoverage(parsedPlan.data, resolutionTexts.length);
    // The name check only means something when the document is NOT in Chinese
    // — see checkNames for why. Coverage runs in every language.
    const names = writesInChinese(lang)
      ? { ok: true, altered: [] as number[] }
      : checkNames(parsedPlan.data, resolutionTexts, allowedRuns);
    const merged = checkMergedFacts(parsedPlan.data, resolutionTexts);
    if (coverage.ok && names.ok && merged.ok) {
      return { ok: true, plan: parsedPlan.data };
    }
    repair = {
      missing: coverage.missing,
      duplicated: coverage.duplicated,
      unknown: coverage.unknown,
      altered: names.altered,
      dropped: merged.dropped,
    };
  }
  return { ok: false };
}
