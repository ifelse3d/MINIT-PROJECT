import { z } from "zod";
import { draftMinutesPrompt, phraseMinutesItemsPrompt } from "@/prompts/draft-minutes";
import {
  checkCoverage,
  checkLatinNames,
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
  /** Two attempts, still failing the arithmetic — the caller falls back to
   *  the plain template rather than shipping a document with items missing.
   *  `repair` says WHICH check failed last (indices only — safe to log). */
  | { ok: false; repair?: Parameters<typeof draftMinutesPrompt>[0]["repair"] };

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
    // Latin names must survive in EVERY language — a zh document that melts
    // "Loo Sio San" into invented characters is checkNames' blind spot.
    const flatItems: { source: number; text: string }[] = [];
    for (const s of parsedPlan.data.sections) {
      for (const it of s.items) {
        for (const idx of Array.isArray(it.source) ? it.source : [it.source]) {
          flatItems.push({ source: idx, text: it.text });
        }
      }
    }
    for (const it of parsedPlan.data.unresolved) {
      for (const idx of Array.isArray(it.source) ? it.source : [it.source]) {
        flatItems.push({ source: idx, text: it.text });
      }
    }
    const latin = checkLatinNames(flatItems, resolutionTexts);
    const altered = [...new Set([...names.altered, ...latin.altered])].sort(
      (a, b) => a - b,
    );
    if (coverage.ok && altered.length === 0 && merged.ok) {
      return { ok: true, plan: parsedPlan.data };
    }
    repair = {
      missing: coverage.missing,
      duplicated: coverage.duplicated,
      unknown: coverage.unknown,
      altered,
      dropped: merged.dropped,
    };
  }
  return { ok: false, repair };
}

// ---------------------------------------------------------------------------
// G2: PHRASE-IN-PLACE for structured documents. The arrangement is fixed by
// code (minutesStructure); the model only rewrites the listed paragraphs in
// the target language. Checked by counting exactly like the arranging loop:
// each listed index exactly once, no Chinese run from nowhere.
// ---------------------------------------------------------------------------

const phrasedItemsSchema = z.object({
  items: z.array(
    z.object({
      source: z.number().int(),
      text: z.string().min(1),
    }),
  ),
});

export type PhraseItemsResult =
  | { ok: true; phrased: Map<number, string> }
  | { ok: false };

export async function runPhraseMinutesItems(opts: {
  provider: VisionJsonProvider;
  /** index (into the shared resolution numbering) → paragraph to phrase. */
  items: { index: number; text: string }[];
  /** The FULL resolution text list, so checkNames can see every source. */
  allTexts: string[];
  lang: MinutesLang;
  glossaryBlock?: string;
  allowedRuns?: string[];
  onUsage?: (usage: TokenUsage) => void;
  deadlineAt?: number;
}): Promise<PhraseItemsResult> {
  const {
    provider,
    items,
    allTexts,
    lang,
    glossaryBlock = "",
    allowedRuns = [],
    onUsage,
    deadlineAt,
  } = opts;
  const wanted = new Set(items.map((it) => it.index));

  let repair: Parameters<typeof phraseMinutesItemsPrompt>[0]["repair"];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.extractJson({
      prompt: phraseMinutesItemsPrompt({ items, lang, glossaryBlock, repair }),
      onUsage,
      deadlineAt,
    });

    const parsed = phrasedItemsSchema.safeParse(raw);
    if (!parsed.success) continue;

    // Coverage over EXACTLY the listed indices — missing, duplicated,
    // invented all counted, same arithmetic as the arranging loop.
    const seen = new Map<number, number>();
    for (const it of parsed.data.items) {
      seen.set(it.source, (seen.get(it.source) ?? 0) + 1);
    }
    const missing = [...wanted].filter((i) => !seen.has(i)).sort((a, b) => a - b);
    const duplicated = [...seen.entries()]
      .filter(([i, n]) => wanted.has(i) && n > 1)
      .map(([i]) => i)
      .sort((a, b) => a - b);
    const unknown = [...seen.keys()].filter((i) => !wanted.has(i)).sort((a, b) => a - b);

    // No Chinese run from nowhere — same guard, same skip rule for zh.
    const pseudoPlan: MinutesPlan = {
      sections: [
        {
          heading: "phrased",
          items: parsed.data.items.map((it) => ({ source: it.source, text: it.text })),
        },
      ],
      unresolved: [],
    };
    const names = writesInChinese(lang)
      ? { ok: true, altered: [] as number[] }
      : checkNames(pseudoPlan, allTexts, allowedRuns);
    // …and no Latin name melted into invented Chinese characters — the zh
    // guard checkNames cannot be (first real run: "Loo Sio San" → 吕兆生).
    const latin = checkLatinNames(parsed.data.items, allTexts);
    const altered = [...new Set([...names.altered, ...latin.altered])].sort(
      (a, b) => a - b,
    );

    if (
      missing.length === 0 &&
      duplicated.length === 0 &&
      unknown.length === 0 &&
      altered.length === 0
    ) {
      return {
        ok: true,
        phrased: new Map(parsed.data.items.map((it) => [it.source, it.text])),
      };
    }
    repair = { missing, duplicated, unknown, altered };
  }
  return { ok: false };
}
