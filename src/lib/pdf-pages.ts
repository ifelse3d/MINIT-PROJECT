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
 * The cap on pages in ONE document.
 *
 * PROVISIONAL VALUE. 50 is chosen to sit above the real documents we have seen
 * (a society constitution is 20-40 pages; a ledger page is 1) and below the
 * size where a single tap costs more than a month of ordinary use. The real
 * number is a per-plan value — docs/方案与权益设计.md calls it `doc.max_pages`
 * and leaves the column blank on purpose, because it wants two weeks of live
 * usage first (section 6). Until then it is one global number, and it is an env
 * var so it can be moved without a rebuild: set AI_DOC_MAX_PAGES.
 */
export const DEFAULT_AI_DOC_MAX_PAGES = 50;

export function aiDocMaxPages(
  raw: string | undefined = process.env.AI_DOC_MAX_PAGES,
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DEFAULT_AI_DOC_MAX_PAGES;
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
  limit: number = aiDocMaxPages(),
): Promise<{ ok: true } | { ok: false; pages: number; limit: number }> {
  if (mimeType !== "application/pdf") return { ok: true };
  const pages = await countPdfPages(bytes);
  if (pages === null || pages <= limit) return { ok: true };
  return { ok: false, pages, limit };
}
