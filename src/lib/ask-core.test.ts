import { describe, expect, it } from "vitest";
import {
  formatRinggit,
  parseAskClassification,
  parseAskSummary,
  recordSearchHref,
  sumAmountCents,
} from "./ask-core";
import { ASK_ROUTE_KEYS, ASK_ROUTES, isAskRouteKey } from "./ask-routes";
import { ASK_INTENT_COSTS } from "./ai/usage-core";

describe("ask classification schema", () => {
  it("accepts a full record_search classification", () => {
    const r = parseAskClassification({
      intent: "record_search",
      record_kinds: ["donations", "receipts"],
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      text_filter: "bumbung",
      route: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a minimal navigation_help classification", () => {
    const r = parseAskClassification({ intent: "navigation_help", route: "money" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown intent and an unknown route", () => {
    expect(parseAskClassification({ intent: "chat" }).success).toBe(false);
    expect(
      parseAskClassification({ intent: "navigation_help", route: "admin" }).success,
    ).toBe(false);
  });

  it("rejects malformed dates (model must give ISO or null)", () => {
    expect(
      parseAskClassification({ intent: "record_search", date_from: "June 2026" })
        .success,
    ).toBe(false);
  });
});

describe("ask summary schema", () => {
  const ALL_THREE = {
    summary_bm: "Baiklah.",
    summary_zh: "好的。",
    summary_en: "Okay.",
  };

  it("requires all THREE languages, caps length", () => {
    expect(parseAskSummary(ALL_THREE).success).toBe(true);
    expect(parseAskSummary({ summary_bm: "Baiklah." }).success).toBe(false);
    expect(
      parseAskSummary({ ...ALL_THREE, summary_bm: "x".repeat(601) }).success,
    ).toBe(false);
  });

  // 2026-08-21. This is the test that would have caught the bug: until today
  // the schema asked for BM and EN only, so a committee member who reads only
  // Chinese asked "berapa derma bulan lepas" and got the answer in Malay.
  // Trilingual output is listed as free forever in docs/方案与权益设计.md
  // section 4 — it is the product direction, not a nice-to-have.
  it("REFUSES a summary that dropped the Chinese", () => {
    expect(
      parseAskSummary({
        summary_bm: ALL_THREE.summary_bm,
        summary_en: ALL_THREE.summary_en,
      }).success,
    ).toBe(false);
  });

  it("refuses an empty Chinese summary as well as a missing one", () => {
    expect(parseAskSummary({ ...ALL_THREE, summary_zh: "" }).success).toBe(
      false,
    );
  });
});

describe("route map completeness (every CLAUDE.md route answered)", () => {
  const expected = [
    "/",
    "/inbox",
    "/minutes",
    "/filings",
    "/money",
    "/agm-pack",
    "/constitution",
    "/orgs",
    "/calendar",
    "/history",
    "/settings",
  ];
  it("covers every user-facing route exactly once", () => {
    const hrefs = ASK_ROUTE_KEYS.map((k) => ASK_ROUTES[k].href).sort();
    expect(hrefs).toEqual([...expected].sort());
  });
  it("every entry has all three language descriptions", () => {
    for (const k of ASK_ROUTE_KEYS) {
      expect(ASK_ROUTES[k].bm.length).toBeGreaterThan(0);
      expect(ASK_ROUTES[k].zh.length).toBeGreaterThan(0);
      expect(ASK_ROUTES[k].en.length).toBeGreaterThan(0);
      expect(ASK_ROUTES[k].href.startsWith("/")).toBe(true);
    }
  });
  it("isAskRouteKey guards correctly", () => {
    expect(isAskRouteKey("money")).toBe(true);
    expect(isAskRouteKey("payments")).toBe(false);
  });
});

describe("deterministic money math (Hard Rule 2)", () => {
  it("sums cents including nulls as zero", () => {
    expect(
      sumAmountCents([{ amount_cents: 1050 }, { amount_cents: null }, { amount_cents: 250 }]),
    ).toBe(1300);
  });
  it("formats ringgit with thousands separators", () => {
    expect(formatRinggit(0)).toBe("RM 0.00");
    expect(formatRinggit(123456789)).toBe("RM 1,234,567.89");
    expect(formatRinggit(5)).toBe("RM 0.05");
  });
});

describe("record search → destination page", () => {
  it("money records go to /money, minutes to /minutes, dates to /calendar", () => {
    expect(recordSearchHref(["donations"])).toBe("/money");
    expect(recordSearchHref(["receipts", "events"])).toBe("/money");
    expect(recordSearchHref(["minutes"])).toBe("/minutes");
    expect(recordSearchHref(["deadlines"])).toBe("/calendar");
    expect(recordSearchHref([])).toBe("/history");
  });
});

describe("ask intent costs", () => {
  it("matches the advertised pricing (search 2, everything else 1)", () => {
    expect(ASK_INTENT_COSTS).toEqual({
      record_search: 2,
      constitution_question: 1,
      navigation_help: 1,
      // Not 0 since 2026-08-21 — see usage-core.ts.
      out_of_scope: 1,
    });
  });
});
