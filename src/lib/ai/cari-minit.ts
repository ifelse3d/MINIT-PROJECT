import "server-only";
import { getSupabaseServer } from "@/db/supabase-server";
import { embedQuery, resolveEmbedModel } from "./embed";

// ---------------------------------------------------------------------------
// cari_minit — "I remember one meeting where we said something. Find it."
//
// J asked for this on 2026-08-20 and it is the first of the assistant's tools
// (docs/助手重做-设计.md §2, §5 step 1). It is also the change that retires the
// worst line in the product: the assistant used to answer "I cannot see your
// records, go to that page" — CLAUDE.md rule 10 was overturned that day for
// exactly this reason. The defence against a model making things up is to let
// it read the real record and cite it, not to blindfold it.
//
// 🔴 USER-SCOPED CLIENT. Not a preference — the boundary. cari_minit() is
// SECURITY INVOKER, so the caller's RLS decides which organisations' minutes
// are visible. Swapping in the service-role client here would let the assistant
// read every society in the database, and nothing else in the system would
// notice.
//
// 🔴 IT RETURNS NOTHING RATHER THAN SOMETHING VAGUE. Below MIN_SCORE the
// results are dropped, because a vector search always returns its nearest
// neighbours — even when the nearest thing to "did we approve the roof repair"
// is a paragraph about the annual dinner. Handing those to the model is how an
// assistant produces a confident answer about a meeting that never happened.
// Empty means the assistant says it could not find it.
// ---------------------------------------------------------------------------

/** One matching section of one meeting's minutes. */
export type MinutesHit = {
  docId: number;
  chunkIndex: number;
  text: string;
  /** ISO date of the meeting, when the record has one. */
  meetingDate: string | null;
  meetingType: string | null;
  /** 1.0 = identical, 0 = unrelated. */
  score: number;
};

/**
 * Cosine-similarity floor for a result to be shown to the model at all.
 *
 * MEASURED, 2026-08-22 (`npm run tune:minscore`). It used to be 0.55, a guess.
 * On gemini-embedding-001 at 768 dimensions, over 10 fixture minute-sections
 * and 15 questions written the way a secretary actually asks (Malay + Chinese
 * mixed, 5 of them about things never discussed):
 *
 *     sections that SHOULD match:  0.663 … 0.791   (median 0.713)
 *     sections that should NOT:    0.483 … 0.675   (median 0.571)
 *
 * The two populations very nearly touch, which is the whole reason 0.55 was
 * wrong: at 0.55 every question dragged in about four unrelated sections, and
 * a question about something never discussed still came back with six.
 *
 * 0.65 is the STRICTEST threshold that still finds everything it should
 * (recall 1.00, 5 unrelated sections surviving across all 15 questions, versus
 * 59 at 0.55). 0.675 scores better on F1 but starts missing real answers, and
 * that is the worse mistake here: a stray paragraph is one the model is told to
 * ignore and the reader can see as a clickable source, while a miss is the
 * assistant saying "I could not find it" about a meeting that IS in the
 * database — the exact behaviour this feature exists to end.
 *
 * 🔴 STILL FIXTURES. Re-run `npm run tune:minscore` against J's real confirmed
 * minutes when there are some, and change this number if the data says so.
 */
export const MIN_SCORE = 0.65;

/** How many sections the assistant may see for one question. More context is
 *  not better: it costs prompt tokens and buries the relevant paragraph. */
export const DEFAULT_LIMIT = 6;

export type CariMinitArgs = {
  orgId: number;
  query: string;
  /** ISO dates, inclusive, when the person said "last June" and it was parsed. */
  from?: string | null;
  to?: string | null;
  limit?: number;
};

/**
 * Search this organisation's confirmed minutes.
 *
 * Returns [] on every failure — no key, migration not applied yet, vendor down,
 * nothing similar enough. The assistant treats "found nothing" the same in all
 * of those cases, which is correct: it must say it could not find anything, and
 * it must never fill the gap with a guess.
 */
export async function cariMinit({
  orgId,
  query,
  from = null,
  to = null,
  limit = DEFAULT_LIMIT,
}: CariMinitArgs): Promise<MinutesHit[]> {
  const q = query.trim();
  if (!q || !Number.isFinite(orgId)) return [];

  try {
    const vector = await embedQuery(q);
    const { id: model } = resolveEmbedModel();
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase.rpc("cari_minit", {
      p_org_id: orgId,
      p_model: model,
      // supabase-js sends this as JSON; pgvector accepts the array form.
      p_query: vector,
      p_limit: limit,
      p_from: from,
      p_to: to,
    });
    if (error || !Array.isArray(data)) return [];

    return (data as RawHit[])
      .map(toHit)
      .filter((hit): hit is MinutesHit => hit !== null && hit.score >= MIN_SCORE);
  } catch {
    // PDPA: the question is user content and is never logged.
    return [];
  }
}

type RawHit = {
  doc_id?: unknown;
  chunk_index?: unknown;
  chunk_text?: unknown;
  meeting_date?: unknown;
  meeting_type?: unknown;
  score?: unknown;
};

/** The RPC result crosses a trust boundary like any other external data. */
function toHit(row: RawHit): MinutesHit | null {
  const docId = Number(row.doc_id);
  const score = Number(row.score);
  const text = typeof row.chunk_text === "string" ? row.chunk_text : "";
  if (!Number.isFinite(docId) || !Number.isFinite(score) || !text) return null;
  return {
    docId,
    chunkIndex: Number(row.chunk_index) || 0,
    text,
    meetingDate: typeof row.meeting_date === "string" ? row.meeting_date : null,
    meetingType: typeof row.meeting_type === "string" ? row.meeting_type : null,
    score,
  };
}

/**
 * The hits, formatted for the prompt.
 *
 * Numbered, because the model is told to cite by number and a number is the one
 * thing it cannot get subtly wrong. The date travels WITH the text so the model
 * never has to remember which excerpt came from which meeting — that is the
 * mistake that produces a real quote attributed to the wrong meeting, which is
 * worse than no answer.
 */
export function formatHitsForPrompt(hits: MinutesHit[]): string {
  return hits
    .map((hit, i) => {
      const when = hit.meetingDate ?? "tarikh tidak direkodkan";
      return `[${i + 1}] Mesyuarat ${when}\n${hit.text}`;
    })
    .join("\n\n---\n\n");
}
