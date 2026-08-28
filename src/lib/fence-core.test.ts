import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
import {
  computeFenceState,
  fenceBlockedMessage,
  fenceRemainingLabel,
  parseFenceChargeResult,
  whichFenceBlocks,
} from "./fence-core";

// D44 (2026-08-28): the free fence. J's numbers, lifetime, never reset.

const LIMITS = PLANS.trial.fence!;

describe("the fence numbers are J's decision (D44) — do not drift", () => {
  it("5 documents · 20 receipts · 20 pages · 3 clean downloads, trial only", () => {
    expect(LIMITS).toEqual({
      docsMade: 5,
      receipts: 20,
      uploadPages: 20,
      cleanDownloads: 3,
    });
    expect(PLANS.standard.fence).toBeNull();
    expect(PLANS.hq.fence).toBeNull();
  });
});

describe("computeFenceState", () => {
  it("remaining = limit - used, floored at zero", () => {
    const s = computeFenceState(LIMITS, {
      docsMade: 4,
      pagesUploaded: 25, // over — a raised historical count must not go negative
      cleanDownloads: 0,
      receipts: 20,
    });
    expect(s.remaining).toEqual({ docs: 1, pages: 0, downloads: 3, receipts: 0 });
  });

  it("garbage counters read as zero, never NaN", () => {
    const s = computeFenceState(LIMITS, {
      docsMade: Number.NaN,
      pagesUploaded: -3,
      cleanDownloads: 1.9, // floored
      receipts: 0,
    });
    expect(s.counters.docsMade).toBe(0);
    expect(s.counters.pagesUploaded).toBe(0);
    expect(s.counters.cleanDownloads).toBe(1);
    expect(s.remaining.docs).toBe(5);
  });
});

describe("whichFenceBlocks — agrees with the SQL's check order", () => {
  const counters = {
    docsMade: 5,
    pagesUploaded: 19,
    cleanDownloads: 3,
    receipts: 0,
  };

  it("names the first counter that refuses", () => {
    expect(whichFenceBlocks(LIMITS, counters, { docs: 1, downloads: 1 })).toBe(
      "docs",
    );
    expect(whichFenceBlocks(LIMITS, counters, { pages: 2 })).toBe("pages");
    expect(whichFenceBlocks(LIMITS, counters, { downloads: 1 })).toBe(
      "downloads",
    );
  });

  it("a charge that fits blocks nothing", () => {
    expect(whichFenceBlocks(LIMITS, counters, { pages: 1 })).toBeNull();
    expect(whichFenceBlocks(LIMITS, counters, {})).toBeNull();
  });

  it("a multi-page PDF is refused when it would CROSS the cap, not only at it", () => {
    // 19 of 20 pages used; an 8-page constitution must be refused whole.
    expect(whichFenceBlocks(LIMITS, counters, { pages: 8 })).toBe("pages");
  });
});

describe("parseFenceChargeResult — the SQL function's jsonb answer", () => {
  it("parses the shape fence_charge() returns", () => {
    expect(
      parseFenceChargeResult({
        ok: true,
        docs_made: 2,
        pages_uploaded: 7,
        clean_downloads: 1,
      }),
    ).toEqual({
      ok: true,
      counters: { docsMade: 2, pagesUploaded: 7, cleanDownloads: 1 },
    });
  });

  it("anything else is null — the caller decides open vs closed", () => {
    expect(parseFenceChargeResult(null)).toBeNull();
    expect(parseFenceChargeResult("ok")).toBeNull();
    expect(parseFenceChargeResult({ docs_made: 2 })).toBeNull();
  });
});

describe("the words (Hard Rule 9: all three languages, with the numbers)", () => {
  it("every refusal names the limit and the upgrade path in bm/zh/en", () => {
    for (const kind of ["docs", "pages", "downloads", "receipts"] as const) {
      const m = fenceBlockedMessage(kind, LIMITS);
      for (const lang of ["bm", "zh", "en"] as const) {
        expect(m[lang]).toMatch(/5|20|3/);
      }
      expect(m.zh).toContain("升级");
      expect(m.bm).toContain("naik taraf");
    }
  });

  it("receipts refusal reassures: existing receipts stay valid and downloadable", () => {
    const m = fenceBlockedMessage("receipts", LIMITS);
    expect(m.zh).toContain("已开的收据仍然有效");
  });

  it("remaining labels carry the number", () => {
    expect(fenceRemainingLabel("downloads", 2).zh).toContain("2");
    expect(fenceRemainingLabel("receipts", 11).bm).toContain("11");
  });
});
