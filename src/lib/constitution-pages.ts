// ---------------------------------------------------------------------------
// CONSTITUTION PAGE ARITHMETIC — pure, shared by the browser splitter, the
// two routes and the tests (work order 81, 2026-08-30).
//
// I1 — WHY THE APP SPLITS THE PAGES ITSELF. A constitution is the longest
// read in the product, and one request cannot outrun the platform: Vercel
// kills the function at 60s, the route budgets 50s for vendors, one attempt
// gets 45s. Measured on the current prompt (probe-constitution-speed,
// 2026-08-30): CONTOH's 8 pages generate at ~490 tok/s and take ~25s — a
// denser real document is slower, and the rule-7 validation retry then has
// to fit in whatever is LEFT of the 50s (the org-197 fingerprints decoded to
// "Gemini timed out after ~20s": a first read that returned, failed the
// contract, and a retry that died on the remaining budget). Telling people
// to split their own PDF was the old answer; the app doing it is the fix.
// Each segment is its own request with its own full budget, so a segment
// read never meets the wall and its retry always has room.
//
// I2 — THE A6 FENCE EXCEPTION (J, ruled 2026-08-28 in work order 50 line 31,
// re-confirmed 2026-08-30). The free fence's lifetime 20 AI-read pages made
// a complete constitution (routinely 20–40 pages) impossible to upload on
// the free plan. J's answer: a constitution upload costs at most
// CONSTITUTION_FENCE_PAGE_CAP pages, whatever its real length — and a
// SEGMENTED read charges that once for the whole document, never once per
// segment (same reasoning as MAX_TOOL_ROUNDS: extra vendor calls are our
// cost, not the member's).
// ---------------------------------------------------------------------------

/**
 * Pages per segment. 4 comes from the measured arithmetic above: ~25s for 8
 * CONTOH pages ⇒ ~12s per 4-page segment on an ordinary document, which
 * leaves a dense real one still comfortably inside one 45s attempt WITH room
 * for a full rule-7 retry in the same request's 50s budget.
 */
export const CONSTITUTION_SEGMENT_PAGES = 4;

/** A6: the most fence pages one constitution may ever cost a free org. */
export const CONSTITUTION_FENCE_PAGE_CAP = 5;

// ---------------------------------------------------------------------------
// D47 — WHAT A CONSTITUTION READ COSTS IN AI ACTIONS (J, ruled 2026-08-30
// night, work order 89 ⑧; REPLACES work order 81's "one action for the whole
// document, however many segments"). J's words: 「不然他丟50張我們就半死，
// 我們也不是做慈善」— a flat 1 action made a 50-page book cost the same as a
// 4-page one while we paid the vendor per page.
//
//   actions(N) = ceil(min(N, 20) / 5) + max(0, N − 20)
//
// First 20 pages: every 5 pages (or part thereof) is 1 action. From page 21:
// every page is 1 action. Pinned: 4→1 · 5→1 · 8→2 · 20→4 · 21→5 · 50→34.
//
// The charge FOLLOWS the read: each segment pays only the delta its own
// pages add (constitutionActionsDelta), so a failed run has paid only for
// what was delivered, and a resume on the continuation token never pays for
// pages already read. This is the MEMBER's price only — the A6 fence
// (lifetime free pages, min(N,5) above) is a different meter and is NOT
// touched by D47.
// ---------------------------------------------------------------------------

/** D47: total AI actions a document of `pageCount` pages costs to read. */
export function constitutionReadActions(pageCount: number): number {
  const pages = Math.max(Math.floor(pageCount), 0);
  if (pages === 0) return 0;
  return Math.ceil(Math.min(pages, 20) / 5) + Math.max(0, pages - 20);
}

/**
 * D47: what a segment covering pages `doneBefore+1 … doneAfter` adds to the
 * bill. Summing the deltas over any split of N pages reproduces
 * constitutionReadActions(N) exactly — a segment can cost 0 (pages 17–20 of
 * a 21-page book fall inside an already-paid block of five).
 */
export function constitutionActionsDelta(
  doneBefore: number,
  doneAfter: number,
): number {
  return Math.max(
    0,
    constitutionReadActions(doneAfter) - constitutionReadActions(doneBefore),
  );
}

/** A6: what a constitution of `pageCount` pages costs the free fence. */
export function constitutionFencePages(pageCount: number): number {
  const pages = Math.max(Math.floor(pageCount), 0);
  return Math.min(pages, CONSTITUTION_FENCE_PAGE_CAP);
}

/**
 * ④ (work order 85, J 2026-08-30: 「寫預估（看文件大小）」): measured reading
 * speed, for the price-and-time line the doors show BEFORE a read starts.
 * Benchmark: CONTOH 8 pages read in 24.8s (probe-constitution-speed,
 * 2026-08-30) ⇒ ~3.1 s/page. An estimate, not a promise — the UI says "about".
 */
export const CONSTITUTION_SECONDS_PER_PAGE = 3.1;

export type ConstitutionReadEstimate = {
  pages: number;
  /** D47: the AI actions the whole read will deduct. */
  actions: number;
  /** What the free fence will deduct: min(pages, cap). */
  fencePages: number;
  /** How many requests the read is cut into (a photo set overrides this). */
  segments: number;
  /** Rough wall-clock seconds for the whole read. */
  seconds: number;
};

/** What reading a document of `pageCount` pages will cost and take. */
export function estimateConstitutionRead(
  pageCount: number,
): ConstitutionReadEstimate {
  const pages = Math.max(1, Math.floor(pageCount));
  return {
    pages,
    actions: constitutionReadActions(pages),
    fencePages: constitutionFencePages(pages),
    segments: Math.max(1, planConstitutionSegments(pages).length),
    seconds: Math.ceil(pages * CONSTITUTION_SECONDS_PER_PAGE),
  };
}

/** 1-based inclusive page range of one segment. */
export type ConstitutionSegmentRange = { from: number; to: number };

/** True when a document of `totalPages` should be read in segments. */
export function needsSegmenting(totalPages: number): boolean {
  return totalPages > CONSTITUTION_SEGMENT_PAGES;
}

/**
 * Cut `totalPages` into segment ranges. 8 pages → 1–4, 5–8; 9 pages →
 * 1–4, 5–8, 9–9. Zero or negative pages → no segments (the caller treats
 * that as "could not count — send the file whole", never as an error).
 */
export function planConstitutionSegments(
  totalPages: number,
): ConstitutionSegmentRange[] {
  const n = Math.floor(totalPages);
  if (!Number.isFinite(n) || n <= 0) return [];
  const out: ConstitutionSegmentRange[] = [];
  for (let from = 1; from <= n; from += CONSTITUTION_SEGMENT_PAGES) {
    out.push({ from, to: Math.min(from + CONSTITUTION_SEGMENT_PAGES - 1, n) });
  }
  return out;
}
