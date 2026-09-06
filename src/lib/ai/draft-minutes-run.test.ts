import { describe, expect, it } from "vitest";
import { runDraftMinutesPlan, runPhraseMinutesItems } from "./draft-minutes-run";
import type { VisionJsonProvider, VisionJsonRequest } from "./provider";
import { composeMinutesMd } from "@/lib/minutes-compose";
import { emptyMeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// 🔴 THE "不准編" REGRESSION (work order 118 §8) — the most important test of
// the session. A committee note of the SAME SHAPE as J's real paper (fictional
// names, the prompt's own fictional IC — A3, the repo is public) goes through
// the REAL draft loop with a scripted "model" that answers the way the live
// model answered on 2026-08-31: the appointee written as the appointer, the
// replacement resolved in one direction. Neither sentence may reach the
// document.
// ---------------------------------------------------------------------------

const ITEMS = [
  "(1) 召开会议 8/7/26 发信",
  "(2) 订 mes. agung P.T. Sin Hup - 18/7/26",
  "(3) Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)",
  "(4) lanti AJK seorg. Tan Kim Loo 800101-07-1234. 8, Lrg 3 Tmn Aman,",
  "(5) usul pindaan alamat.",
];

/** The plan the live model produced from J's paper on 2026-08-31 (names
 *  swapped for the fictional ones). Fluent, complete — and wrong. */
const BAD_PLAN = {
  sections: [
    {
      heading: "Keputusan Mesyuarat",
      items: [
        { source: 0, kind: "tindakan", text: "Surat panggilan mesyuarat bertarikh 8/7/26 dihantar." },
        { source: 1, kind: "keputusan", text: "Mesyuarat Agung P.T. Sin Hup ditetapkan pada 18/7/26." },
        { source: 2, kind: "keputusan", text: "Mesyuarat memutuskan agar Agenda 2.1 digantikan kepada Chan Mei (Ooi Bee Huar)." },
        { source: 3, kind: "tindakan", text: "Tan Kim Loo ditugaskan untuk melantik seorang Ahli Jawatankuasa (No. K/P: 800101-07-1234, beralamat di 8, Lorong 3, Taman Aman)." },
        { source: 4, kind: "perbincangan", text: "Usul pindaan alamat." },
      ],
    },
  ],
  unresolved: [],
};

/** What an honest second attempt looks like: no doer, no verdict, the
 *  ambiguous replacement left as it stands. */
const GOOD_PLAN = {
  sections: [
    {
      heading: "Perkara Mesyuarat",
      items: [
        { source: 0, text: "Surat panggilan mesyuarat bertarikh 8/7/26 dihantar." },
        { source: 1, text: "Mesyuarat Agung P.T. Sin Hup pada 18/7/26." },
        { source: 2, text: "Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)." },
        { source: 3, text: "Melantik Ajk seorang iaitu Tan Kim Loo (No. K/P: 800101-07-1234), beralamat di 8, Lorong 3, Taman Aman." },
        { source: 4, text: "Usul pindaan alamat." },
      ],
    },
  ],
  unresolved: [],
};

function scripted(answers: unknown[]): VisionJsonProvider & { prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    name: "scripted",
    prompts,
    async extractJson(req: VisionJsonRequest) {
      prompts.push(req.prompt);
      const a = answers[Math.min(i, answers.length - 1)];
      i++;
      return a;
    },
  } as unknown as VisionJsonProvider & { prompts: string[] };
}

const extraction = {
  ...emptyMeetingNotesExtraction,
  resolutions: ITEMS.map((t) => ({
    text: { value: t, confidence: "confirmed" as const, source_ref: { location: "photo 1", snippet: t } },
  })),
};
const opts = { orgName: "PERSATUAN CONTOH", confirmedBy: "Chan Mei", dateIso: "2026-09-07" };

describe("🔴 不准編 — the arranging loop", () => {
  it("🔴 rejects the appointee-as-appointer plan and sends the indices back", async () => {
    const provider = scripted([BAD_PLAN, GOOD_PLAN]);
    const run = await runDraftMinutesPlan({ provider, resolutionTexts: ITEMS, lang: "bm" });
    expect(run.ok).toBe(true);
    // The second prompt carried the repair naming ③ and ④ — and nothing else.
    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toContain("INVENTED A DOER OR A DECISION");
    expect(provider.prompts[1]).toMatch(/INVENTED A DOER OR A DECISION[^\n]*: 2, 3/);
    if (!run.ok) return;
    const md = composeMinutesMd(run.plan, extraction, opts);
    expect(md).not.toContain("ditugaskan untuk melantik");
    expect(md).not.toContain("digantikan kepada Chan Mei");
    expect(md).toContain("Melantik Ajk seorang iaitu Tan Kim Loo");
    // ② "Mes. agung … 18/7/26" is a decision of THIS meeting, present as ever.
    expect(md).toContain("18/7/26");
  });

  it("🔴 two invented answers in a row → no plan, so the plain template wins (never the wrong sentence)", async () => {
    const provider = scripted([BAD_PLAN, BAD_PLAN]);
    const run = await runDraftMinutesPlan({ provider, resolutionTexts: ITEMS, lang: "bm" });
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.repair?.invented).toEqual([2, 3]);
  });

  it("§1-1 labels come out EARNED: the honest plan prints no Tindakan over an appointment and no Perbincangan at all", async () => {
    const withLabels = {
      sections: [
        {
          heading: "Perkara Mesyuarat",
          items: GOOD_PLAN.sections[0].items.map((it, i) => ({
            ...it,
            kind: i === 3 ? "tindakan" : i === 4 ? "perbincangan" : i === 1 ? "keputusan" : undefined,
          })),
        },
      ],
      unresolved: [],
    };
    const run = await runDraftMinutesPlan({ provider: scripted([withLabels]), resolutionTexts: ITEMS, lang: "bm" });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const md = composeMinutesMd(run.plan, extraction, opts);
    expect(md).not.toContain("Tindakan:");
    expect(md).not.toContain("Perbincangan:");
    // ② "订 … 18/7/26" carries no decision word either — no Keputusan label.
    expect(md).not.toContain("Keputusan:");
  });

  it("the prompt itself no longer demands a label on every line, and states the doer rule", () => {
    const provider = scripted([GOOD_PLAN]);
    return runDraftMinutesPlan({ provider, resolutionTexts: ITEMS, lang: "bm" }).then(() => {
      const p = provider.prompts[0];
      expect(p).not.toContain('When unsure, use "perbincangan"');
      expect(p).not.toContain("Mesyuarat bersetuju melantik");
      expect(p).toContain("NO DOER THE PAGE DID NOT NAME");
      expect(p).toContain("Melantik Ajk seorang iaitu Tan Kim Loo.");
    });
  });
});

describe("🔴 §3 — until a person chooses, the document carries the line as written", () => {
  it("a reading the model picked for ③ is replaced by the original words, and the prompt said so", async () => {
    const resolved = {
      sections: [
        {
          heading: "Perkara Mesyuarat",
          items: GOOD_PLAN.sections[0].items.map((it) =>
            it.source === 2
              ? { source: 2, kind: "keputusan", text: "Chan Mei menggantikan Ooi Bee Huar bagi Agenda 2.1." }
              : it,
          ),
        },
      ],
      unresolved: [],
    };
    const provider = scripted([resolved]);
    const run = await runDraftMinutesPlan({
      provider,
      resolutionTexts: ITEMS,
      lang: "bm",
      verbatimIndices: [2, 3],
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(provider.prompts[0]).toContain("COPIED AS WRITTEN");
    expect(provider.prompts[0]).toMatch(/Items 2, 3 can each be read two ways/);
    const md = composeMinutesMd(run.plan, extraction, opts);
    expect(md).toContain("Agenda 2.1 diganti Chan Mei (Ooi Bee Huar)");
    expect(md).not.toContain("Chan Mei menggantikan Ooi Bee Huar");
    expect(md).not.toContain("Keputusan:");
    // ④ too — the model's honest sentence still yields to the original line.
    expect(md).toContain("lanti AJK seorg. Tan Kim Loo");
  });
});

describe("🔴 不准編 — the phrase-in-place loop", () => {
  it("rejects a paragraph rewritten with an invented doer, accepts the honest rewrite", async () => {
    const items = [{ index: 3, text: ITEMS[3] }];
    const provider = scripted([
      { items: [{ source: 3, text: "Tan Kim Loo ditugaskan untuk melantik seorang Ahli Jawatankuasa." }] },
      { items: [{ source: 3, text: "Melantik Ajk seorang iaitu Tan Kim Loo (No. K/P: 800101-07-1234), beralamat di 8, Lorong 3, Taman Aman." }] },
    ]);
    const run = await runPhraseMinutesItems({ provider, items, allTexts: ITEMS, lang: "bm" });
    expect(run.ok).toBe(true);
    expect(provider.prompts[1]).toContain("INVENTED A DOER OR A DECISION");
    if (!run.ok) return;
    expect(run.phrased.get(3)).not.toContain("ditugaskan");
  });
});
