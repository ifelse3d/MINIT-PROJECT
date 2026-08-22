import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  pageHref,
  pageRange,
  pageSummary,
  parsePage,
} from "@/lib/list-page";

describe("parsePage", () => {
  it("reads a normal page number", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("1")).toBe(1);
  });

  // A query string is user input arriving from a link somebody sent. None of
  // these may throw or produce a negative offset.
  it("falls back to page 1 for anything that is not a whole number ≥ 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("1e9")).toBe(1000000000); // a real integer, just a big one
    expect(parsePage("9007199254740993")).toBe(1); // past Number.MAX_SAFE_INTEGER
  });

  it("takes the first value when the key is repeated", () => {
    expect(parsePage(["4", "9"])).toBe(4);
    expect(parsePage([])).toBe(1);
  });
});

describe("pageRange", () => {
  it("is inclusive, the way Supabase .range() is", () => {
    expect(pageRange(1, 50)).toEqual({ from: 0, to: 49 });
    expect(pageRange(2, 50)).toEqual({ from: 50, to: 99 });
    expect(pageRange(3, 20)).toEqual({ from: 40, to: 59 });
  });

  it("never produces a negative offset", () => {
    expect(pageRange(0).from).toBe(0);
    expect(pageRange(-5).from).toBe(0);
  });

  it("defaults to PAGE_SIZE", () => {
    expect(pageRange(2)).toEqual({ from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 });
  });
});

describe("pageSummary", () => {
  // THE ORIGINAL BUG: the total came from the rows in hand, not the database,
  // so 1043 receipts read as 200. `total` is the database's number and the
  // range is computed from the page, never from the array length.
  it("counts from the database total, not from the rows in hand", () => {
    const s = pageSummary(1043, 1, 50);
    expect(s.total).toBe(1043);
    expect(s.first).toBe(1);
    expect(s.last).toBe(50);
    expect(s.pageCount).toBe(21);
    expect(s.hasNext).toBe(true);
    expect(s.hasPrev).toBe(false);
  });

  it("describes a middle page", () => {
    const s = pageSummary(1043, 3, 50);
    expect([s.first, s.last]).toEqual([101, 150]);
    expect(s.hasPrev).toBe(true);
    expect(s.hasNext).toBe(true);
  });

  it("knows the last page is the last", () => {
    const s = pageSummary(1043, 21, 43);
    expect([s.first, s.last]).toEqual([1001, 1043]);
    expect(s.hasNext).toBe(false);
    expect(s.hasPrev).toBe(true);
  });

  it("handles an empty list without pretending there is a page 0", () => {
    const s = pageSummary(0, 1, 0);
    expect(s).toMatchObject({ first: 0, last: 0, total: 0, pageCount: 1, hasPrev: false, hasNext: false });
  });

  // A bookmark from before some rows were deleted. Stranding the reader on an
  // empty page with no way back is worse than the empty page itself.
  it("leaves a way back from a page past the end", () => {
    const s = pageSummary(10, 9, 0);
    expect(s.hasPrev).toBe(true);
    expect(s.hasNext).toBe(false);
    expect(s.first).toBe(0);
  });

  it("survives a total the database could not give us", () => {
    expect(pageSummary(Number.NaN, 1, 3).total).toBe(0);
    expect(pageSummary(-1, 1, 3).total).toBe(0);
  });

  // A filtered query can report a large total while returning a short page.
  // Believing the arithmetic over the rows would offer a next page that is empty.
  it("does not offer a next page when the rows run out early", () => {
    expect(pageSummary(1000, 1, 7, 50).hasNext).toBe(false);
  });
});

describe("pageHref", () => {
  it("keeps the filters when the page changes", () => {
    const href = pageHref("/minutes/history", { type: "agm", from: "2026-01-01" }, 3);
    expect(href).toContain("type=agm");
    expect(href).toContain("from=2026-01-01");
    expect(href).toContain("page=3");
  });

  it("leaves page out of the URL for page 1, so the plain address stays plain", () => {
    expect(pageHref("/money/history", {}, 1)).toBe("/money/history");
    expect(pageHref("/money/history", { q: "" }, 1)).toBe("/money/history");
  });

  it("drops empty filters rather than writing key= into the URL", () => {
    expect(pageHref("/x", { a: "", b: undefined, c: "1" }, 1)).toBe("/x?c=1");
  });

  it("escapes what it puts in the query string", () => {
    expect(pageHref("/x", { q: "Tan Ah Kow & Sons" }, 1)).toBe(
      "/x?q=Tan+Ah+Kow+%26+Sons",
    );
  });
});
