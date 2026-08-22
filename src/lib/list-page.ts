// ---------------------------------------------------------------------------
// PAGING FOR THE HISTORY LISTS.
//
// WHY (2026-08-22, and the reason it could not be left as it was): the receipt
// history selected `.limit(200)` and then printed a total under it computed
// from those 200 rows. A temple with 1043 receipts was shown a total that was
// wrong by eight hundred donations and had no way to reach them — the page
// looked complete, so nobody would have gone looking. That was made HONEST the
// same night ("1043 receipts, showing the most recent 200"), which stopped the
// lie but not the unreachability. This is the other half: real pages.
//
// Deliberately offset paging, not cursor paging. These lists are ordered by a
// stable descending id inside one org, they are read far more often than they
// are written, and an offset is a number a person can put in a URL and send to
// somebody. Cursor paging would buy correctness under concurrent inserts that
// this workload does not have, at the cost of a page you cannot link to.
// ---------------------------------------------------------------------------

/** Rows per page. Big enough that most societies never see a second page. */
export const PAGE_SIZE = 50;

/**
 * A `?page=` value from the URL, made safe.
 *
 * Anything that is not a whole number ≥ 1 becomes page 1 — a hand-edited URL,
 * a stale link, `?page=-3`, `?page=1e9`, `?page[]=2`. Never throws: a bad query
 * string must show the first page, not an error screen.
 */
export function parsePage(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return 1;
  const n = Number(first);
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return n;
}

/** Inclusive row indices for Supabase's `.range(from, to)`. */
export function pageRange(page: number, size: number = PAGE_SIZE): { from: number; to: number } {
  const p = Math.max(1, Math.floor(page));
  const from = (p - 1) * size;
  return { from, to: from + size - 1 };
}

export type PageSummary = {
  /** 1-based index of the first row on this page; 0 when there are none. */
  first: number;
  /** 1-based index of the last row on this page; 0 when there are none. */
  last: number;
  total: number;
  page: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/**
 * What to tell the reader, and which arrows to light up.
 *
 * `total` is the count the DATABASE reported, never the length of the rows we
 * happen to be holding — that confusion is the original bug.
 *
 * A page past the end (a bookmark from before some rows were deleted) reports
 * an empty range with `hasPrev` true, so the reader is not stranded.
 */
export function pageSummary(
  total: number,
  page: number,
  rowsOnPage: number,
  size: number = PAGE_SIZE,
): PageSummary {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const p = Math.max(1, Math.floor(page));
  const pageCount = Math.max(1, Math.ceil(safeTotal / size));
  const first = rowsOnPage > 0 ? (p - 1) * size + 1 : 0;
  const last = rowsOnPage > 0 ? first + rowsOnPage - 1 : 0;
  return {
    first,
    last,
    total: safeTotal,
    page: p,
    pageCount,
    hasPrev: p > 1,
    // A FULL page is the evidence there may be more. Trusting the arithmetic
    // alone would offer a next page after a short one — which happens whenever
    // the total and the rows disagree, e.g. a count taken over a wider filter
    // than the rows. A short page is the end of the list, whatever the total says.
    hasNext: rowsOnPage >= size && last < safeTotal,
  };
}

/**
 * The same query string with `page` swapped — so paging never drops the
 * filters somebody just set, which is the classic way a "next page" button
 * silently shows the wrong list.
 */
export function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  if (page > 1) q.set("page", String(page));
  else q.delete("page");
  const s = q.toString();
  return s === "" ? basePath : `${basePath}?${s}`;
}
