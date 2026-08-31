import { describe, expect, it } from "vitest";
import type { MinutesHit } from "@/lib/ai/cari-minit";
import { citedSources, MAX_SOURCES_SHOWN } from "./chat-sources";

// ---------------------------------------------------------------------------
// §0-2b (work order 102) — J's live catch: a question about the interface
// language came back wearing SIX copies of the same AGM minutes. The gate's
// three rules, each pinned here: 引用了才顯示 (cited-only, no show-all
// fallback), 顯示必去重 (one line per document), 最多 2–3 條 (hard cap).
// ---------------------------------------------------------------------------

function hit(docId: number, i: number): MinutesHit {
  return {
    docId,
    chunkIndex: i,
    text: `chunk ${i} of doc ${docId}`,
    meetingDate: "2026-07-18",
    meetingType: "agm",
    score: 0.7,
  };
}

/** J's screenshot: six chunks, all of the SAME document. */
const sixOfOne = [1, 2, 3, 4, 5, 6].map((i) => hit(41, i));

describe("citedSources — the citation gate (§0-2b)", () => {
  it("ZERO sources when the answer cites nothing — the language-question case", () => {
    // The model answered a settings question without touching the excerpts:
    // no [n] in the reply, used_sources empty. The old fallback showed all
    // six; the rule now is none.
    expect(citedSources(sixOfOne, "已经帮您把界面换成中文了。", [])).toEqual([]);
    expect(citedSources(sixOfOne, "已经帮您把界面换成中文了。", undefined)).toEqual([]);
  });

  it("one document is ONE source, however many chunks matched", () => {
    const out = citedSources(sixOfOne, "决议在 [1] 和 [4] 都有记录。", [1, 4]);
    expect(out).toHaveLength(1);
    expect(out[0].docId).toBe(41);
  });

  it("caps at MAX_SOURCES_SHOWN distinct documents", () => {
    const hits = [hit(1, 0), hit(2, 0), hit(3, 0), hit(4, 0), hit(5, 0)];
    const out = citedSources(hits, "见 [1] [2] [3] [4] [5]。", [1, 2, 3, 4, 5]);
    expect(out).toHaveLength(MAX_SOURCES_SHOWN);
  });

  it("the [n] markers in the reply text are the primary evidence", () => {
    const hits = [hit(1, 0), hit(2, 0), hit(3, 0)];
    // Model cited [2] in prose but reported [1, 3] in the field — the reader
    // sees [2], so [2] is what gets a source line.
    const out = citedSources(hits, "如 [2] 所记。", [1, 3]);
    expect(out.map((s) => s.n)).toEqual([2]);
  });

  it("falls back to used_sources when the prose carries no [n]", () => {
    const hits = [hit(1, 0), hit(2, 0)];
    const out = citedSources(hits, "上次会议决定了三件事。", [2]);
    expect(out.map((s) => s.docId)).toEqual([2]);
  });

  it("drops out-of-range numbers instead of clamping", () => {
    const hits = [hit(1, 0)];
    expect(citedSources(hits, "见 [7]。", [7])).toEqual([]);
  });

  it("no hits = no sources, whatever the model claims", () => {
    expect(citedSources([], "见 [1]。", [1])).toEqual([]);
  });
});
