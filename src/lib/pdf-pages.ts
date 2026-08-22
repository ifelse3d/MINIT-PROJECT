// ---------------------------------------------------------------------------
// HOW MANY PAGES IS THIS PDF? (2026-08-21)
//
// WHY THIS EXISTS (docs/安全与仓库体检.md A8)
// Nothing in the app counted pages. The only ceiling on an upload was 8MB, and
// a 200-page text PDF fits inside 8MB with room to spare. src/prompts/
// extract-constitution.ts even says in its own comment that "a constitution can
// run to 30+ pages — the one genuinely expensive job", and that job was
// uncapped: one tap, one vendor call, a large part of a month's quota gone, and
// no confirmation screen in between.
//
// Pages are counted from the bytes we already hold in memory, before the quota
// is charged and before any vendor is called. pdf-lib is already a dependency
// (receipts and the AGM pack are generated with it), so this adds no package.
// ---------------------------------------------------------------------------
import { PDFDocument } from "pdf-lib";

/**
 * Page count, or `null` when the file cannot be parsed as a PDF.
 *
 * WHY NULL AND NOT AN ERROR. A PDF that pdf-lib cannot open is not necessarily
 * a bad upload: it can be encrypted, produced by an unusual scanner, or subtly
 * malformed in a way the vendor's own parser handles fine. Refusing those would
 * block legitimate paperwork to enforce a limit we invented ourselves, so the
 * caller lets an uncountable file through — the 8MB cap still applies to it.
 * This is a known, deliberate hole: the cap is a cost guard, not a security
 * boundary.
 */
export async function countPdfPages(bytes: ArrayBuffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, {
      // We only want the page tree. Not updating metadata avoids rewriting
      // anything, and tolerating encryption lets a password-free-but-flagged
      // scan (common from office copiers) still be counted.
      updateMetadata: false,
      ignoreEncryption: true,
    });
    const count = doc.getPageCount();
    return Number.isInteger(count) && count > 0 ? count : null;
  } catch {
    return null;
  }
}

/**
 * What kind of paperwork this is. The cap depends on it — see below.
 *
 * `unknown` is the front door (`/api/intake`), where the document type is not
 * known until after the classify call.
 */
export type DocKind = "minutes" | "ledger" | "roster" | "constitution" | "unknown";

/**
 * The cap on pages in ONE document, per kind.
 *
 * 🔴 ONE NUMBER FOR EVERYTHING WAS WRONG (fixed 2026-08-22, J's answer).
 * It used to be a single 50 for every upload, chosen for the longest document
 * that exists — a constitution. That made the cap useless for everything else:
 * a set of minutes arriving as a 40-page scan is not a long meeting, it is a
 * scanner left on "whole tray", and it would have been read, charged, and paid
 * for in full before anybody noticed.
 *
 * J, 2026-08-22: 「一般會議不會有太多，就 5 頁這樣。然後 PERLEMBAGAAN 一般多，
 * 我們就給多一些」— so:
 *
 *   minutes       5   a handwritten meeting record is 1-3 pages. 5 is generous.
 *   ledger        5   a donation ledger page is 1; a batch is a few.
 *   roster       20   a 100-member committee list does run to several pages,
 *                     and it is a once-a-year job, so it gets more room.
 *   constitution 50   20-40 pages is normal, and it is THE expensive job.
 *   unknown      50   the front door, before the classifier has said what this
 *                     is. It has to admit the longest legitimate document, or a
 *                     constitution could never be uploaded there at all — so
 *                     /api/intake checks AGAIN, with the real kind, once the
 *                     classifier has answered and BEFORE the expensive extract.
 *
 * Still provisional in the sense that matters: docs/方案与权益设计.md wants
 * `doc.max_pages` to become a per-plan value after two weeks of live usage
 * (section 6). Until then these are env-overridable without a rebuild —
 * AI_DOC_MAX_PAGES_MINUTES, _LEDGER, _ROSTER, _CONSTITUTION — and the old
 * AI_DOC_MAX_PAGES still works as a single override for all of them, so any
 * deployment already setting it keeps behaving the way it was configured to.
 */
export const DEFAULT_PAGE_LIMITS: Record<DocKind, number> = {
  minutes: 5,
  ledger: 5,
  roster: 20,
  constitution: 50,
  unknown: 50,
};

/** Kept for the env var and the tests that name it: the ceiling of the table. */
export const DEFAULT_AI_DOC_MAX_PAGES = DEFAULT_PAGE_LIMITS.constitution;

const ENV_BY_KIND: Record<DocKind, string> = {
  minutes: "AI_DOC_MAX_PAGES_MINUTES",
  ledger: "AI_DOC_MAX_PAGES_LEDGER",
  roster: "AI_DOC_MAX_PAGES_ROSTER",
  constitution: "AI_DOC_MAX_PAGES_CONSTITUTION",
  unknown: "AI_DOC_MAX_PAGES_CONSTITUTION",
};

/**
 * How many pages this kind of document may have.
 *
 * A malformed value is ignored rather than obeyed — a typo in an env var must
 * never read as "no limit". Order: the kind's own var, then the global
 * AI_DOC_MAX_PAGES, then the table above.
 */
export function aiDocMaxPages(
  kind: DocKind = "unknown",
  env: Record<string, string | undefined> = process.env,
): number {
  const positiveInt = (raw: string | undefined): number | null => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  return (
    positiveInt(env[ENV_BY_KIND[kind]]) ??
    positiveInt(env.AI_DOC_MAX_PAGES) ??
    DEFAULT_PAGE_LIMITS[kind]
  );
}

/**
 * Decide about one uploaded file. Pure enough to test: hand it the bytes and
 * the mime type, get back either "fine" or the numbers the message needs.
 *
 * Anything that is not a PDF is one page by definition — a photograph.
 */
export async function checkPageLimit(
  bytes: ArrayBuffer,
  mimeType: string,
  /** A DocKind ("minutes"), or a number when the caller has its own ceiling. */
  kindOrLimit: DocKind | number = "unknown",
): Promise<{ ok: true } | { ok: false; pages: number; limit: number }> {
  const limit =
    typeof kindOrLimit === "number" ? kindOrLimit : aiDocMaxPages(kindOrLimit);
  if (mimeType !== "application/pdf") return { ok: true };
  const pages = await countPdfPages(bytes);
  if (pages === null || pages <= limit) return { ok: true };
  return { ok: false, pages, limit };
}
