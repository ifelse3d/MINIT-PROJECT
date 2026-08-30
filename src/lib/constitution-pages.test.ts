import { describe, expect, it } from "vitest";

import {
  CONSTITUTION_FENCE_PAGE_CAP,
  CONSTITUTION_SEGMENT_PAGES,
  constitutionActionsDelta,
  constitutionFencePages,
  constitutionReadActions,
  estimateConstitutionRead,
  needsSegmenting,
  planConstitutionSegments,
} from "./constitution-pages";

describe("constitutionFencePages (A6, J's ruling 2026-08-28 / 2026-08-30)", () => {
  // §3 of work order 81 pins these three numbers by name.
  it("charges 4 for a 4-page constitution", () => {
    expect(constitutionFencePages(4)).toBe(4);
  });
  it("charges 5 for a 5-page constitution", () => {
    expect(constitutionFencePages(5)).toBe(5);
  });
  it("charges 5 for a 30-page constitution", () => {
    expect(constitutionFencePages(30)).toBe(5);
  });
  it("a photo is one page", () => {
    expect(constitutionFencePages(1)).toBe(1);
  });
  it("never goes negative and never invents pages", () => {
    expect(constitutionFencePages(0)).toBe(0);
    expect(constitutionFencePages(-3)).toBe(0);
    expect(constitutionFencePages(4.9)).toBe(4);
  });
  it("the cap constant is what the ruling says", () => {
    expect(CONSTITUTION_FENCE_PAGE_CAP).toBe(5);
  });
});

describe("planConstitutionSegments", () => {
  it("a document at the segment size is one segment", () => {
    expect(planConstitutionSegments(CONSTITUTION_SEGMENT_PAGES)).toEqual([
      { from: 1, to: 4 },
    ]);
    expect(needsSegmenting(CONSTITUTION_SEGMENT_PAGES)).toBe(false);
  });
  it("8 pages → 1–4, 5–8", () => {
    expect(planConstitutionSegments(8)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
    ]);
    expect(needsSegmenting(8)).toBe(true);
  });
  it("9 pages → the tail segment is short, never dropped", () => {
    expect(planConstitutionSegments(9)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
      { from: 9, to: 9 },
    ]);
  });
  it("30 pages → 8 segments covering every page exactly once", () => {
    const plan = planConstitutionSegments(30);
    expect(plan).toHaveLength(8);
    expect(plan[0]).toEqual({ from: 1, to: 4 });
    expect(plan[7]).toEqual({ from: 29, to: 30 });
    const covered = plan.flatMap((r) =>
      Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i),
    );
    expect(covered).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
  it("uncountable / nonsense page counts plan nothing", () => {
    expect(planConstitutionSegments(0)).toEqual([]);
    expect(planConstitutionSegments(-1)).toEqual([]);
    expect(planConstitutionSegments(Number.NaN)).toEqual([]);
  });
});

describe("constitutionReadActions (D47, J's ruling 2026-08-30 night — work order 89 ⑧)", () => {
  // ⑧ pins these six by name: ceil(min(N,20)/5) + max(0, N−20).
  it.each([
    [4, 1],
    [5, 1],
    [8, 2],
    [20, 4],
    [21, 5],
    [50, 34],
  ])("%i pages → %i action(s)", (pages, actions) => {
    expect(constitutionReadActions(pages)).toBe(actions);
  });
  it("a photo is one page, one action", () => {
    expect(constitutionReadActions(1)).toBe(1);
  });
  it("zero or nonsense pages cost nothing", () => {
    expect(constitutionReadActions(0)).toBe(0);
    expect(constitutionReadActions(-3)).toBe(0);
  });
});

describe("constitutionActionsDelta (D47 — the charge follows the read)", () => {
  it("summing deltas over ANY split reproduces the whole-book price", () => {
    for (const total of [1, 4, 5, 8, 12, 20, 21, 24, 37, 50]) {
      // The real 4-page segmentation…
      const plan = planConstitutionSegments(total);
      const viaSegments = plan.reduce(
        (sum, r) => sum + constitutionActionsDelta(r.from - 1, r.to),
        0,
      );
      expect(viaSegments).toBe(constitutionReadActions(total));
      // …and one-page-at-a-time (a stack of photos).
      let onePage = 0;
      for (let p = 1; p <= total; p++) onePage += constitutionActionsDelta(p - 1, p);
      expect(onePage).toBe(constitutionReadActions(total));
    }
  });
  it("a segment inside an already-paid block of five costs 0", () => {
    // Pages 17–20 of a 21-page book: actions(20) = actions(16) = 4.
    expect(constitutionActionsDelta(16, 20)).toBe(0);
  });
  it("page 21 alone costs 1 (per-page territory)", () => {
    expect(constitutionActionsDelta(20, 21)).toBe(1);
  });
  it("the first segment of a split 21-page book costs 1", () => {
    expect(constitutionActionsDelta(0, 4)).toBe(1);
  });
});

describe("estimateConstitutionRead (④, work order 85; actions per D47)", () => {
  it("prices CONTOH's 8 pages: 2 actions, 5 fence pages, 2 segments, ~25s", () => {
    expect(estimateConstitutionRead(8)).toEqual({
      pages: 8,
      actions: 2,
      fencePages: 5,
      segments: 2,
      seconds: 25,
    });
  });
  it("a 21-page book prices 5 actions (the ⑧ pin, on the estimate line)", () => {
    expect(estimateConstitutionRead(21).actions).toBe(5);
  });
  it("a single photo is one page, one segment, a few seconds", () => {
    const e = estimateConstitutionRead(1);
    expect(e.pages).toBe(1);
    expect(e.fencePages).toBe(1);
    expect(e.segments).toBe(1);
    expect(e.seconds).toBeGreaterThan(0);
  });
  it("a 40-page book estimates 5 fence pages and 10 segments", () => {
    const e = estimateConstitutionRead(40);
    expect(e.fencePages).toBe(5);
    expect(e.segments).toBe(10);
    expect(e.seconds).toBe(124);
  });
  it("never estimates below one page", () => {
    expect(estimateConstitutionRead(0).pages).toBe(1);
  });
});
