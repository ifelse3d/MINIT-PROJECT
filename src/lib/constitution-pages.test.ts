import { describe, expect, it } from "vitest";

import {
  CONSTITUTION_FENCE_PAGE_CAP,
  CONSTITUTION_SEGMENT_PAGES,
  constitutionFencePages,
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
