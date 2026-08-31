import type { MinutesHit } from "@/lib/ai/cari-minit";

// ---------------------------------------------------------------------------
// CITATION GATE — which minutes excerpts an answer may show as sources.
//
// §0-2b (work order 102, J's live catch): a question about the interface
// language came back wearing SIX copies of the same AGM minutes. Two causes,
// both fixed here:
//
//   1. The old fallback showed EVERY excerpt whenever the model forgot
//      `used_sources` — over-showing was thought harmless, and J's screenshot
//      is the proof it is not. J's rule now: 引用了才顯示 — a source line
//      appears only when the answer cites that excerpt. The evidence order
//      is: the [n] markers written in the reply text first (what the reader
//      actually sees cited), then `used_sources` for a model that cited in
//      the field but not the prose. No citations = no source list, which is
//      correct for language/settings/how-do-I questions.
//   2. Six chunks of ONE document are one source, not six — dedupe by docId.
//
// Lives outside the route file because a route module may only export its
// handlers and config — and this gate needs its own tests.
// ---------------------------------------------------------------------------

/** What the assistant is allowed to show as a source. */
export type ChatSource = {
  /** The number that appears in the reply as [1], [2]. */
  n: number;
  docId: number;
  meetingDate: string | null;
  meetingType: string | null;
};

/** How many source lines one answer may carry (§0-2b: 上限 2–3 條). */
export const MAX_SOURCES_SHOWN = 3;

/**
 * The excerpts the answer ACTUALLY cited, mapped back to real meetings.
 *
 * An out-of-range number is dropped rather than clamped — a model that cites
 * [7] when six excerpts exist is not to be second-guessed about which one it
 * meant.
 */
export function citedSources(
  hits: MinutesHit[],
  reply: string,
  used?: number[],
): ChatSource[] {
  if (hits.length === 0) return [];
  const inText = [...reply.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
  const wanted = (inText.length > 0 ? inText : (used ?? [])).filter(
    (n) => n >= 1 && n <= hits.length,
  );
  const seenN = new Set<number>();
  const seenDoc = new Set<number>();
  const out: ChatSource[] = [];
  for (const n of wanted) {
    if (seenN.has(n)) continue;
    seenN.add(n);
    const hit = hits[n - 1];
    if (seenDoc.has(hit.docId)) continue;
    seenDoc.add(hit.docId);
    out.push({
      n,
      docId: hit.docId,
      meetingDate: hit.meetingDate,
      meetingType: hit.meetingType,
    });
    if (out.length >= MAX_SOURCES_SHOWN) break;
  }
  return out;
}
