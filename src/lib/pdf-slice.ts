import "server-only";

// ---------------------------------------------------------------------------
// CUT ONE BATCH OF PAGES OUT OF A PDF, on the server (work order 105 §1).
//
// The constitution reader cuts its pieces in the BROWSER (pdf-lib is already
// a dependency there, and the pieces never have to leave the tab that made
// them). The queue cannot do that: its whole point is that the tab may be
// closed, reloaded or on somebody else's phone when the next batch runs. So
// the original lives in Storage and the batch is cut HERE, from the bytes the
// step just downloaded.
//
// Same library, same call shape — this is the browser helper's twin, not a
// second implementation of splitting.
//
// PDPA (Hard Rule 5): nothing here logs a page, a name or a byte.
// ---------------------------------------------------------------------------

/**
 * Pages `from`..`to` (1-based, inclusive) as a standalone PDF.
 *
 * Returns null when the document cannot be opened or the range does not
 * exist — the caller then sends the file WHOLE, which is exactly what every
 * read did before the queue, so a scanner's odd output can never make an
 * upload impossible that used to work.
 */
export async function slicePdfPages(
  bytes: ArrayBuffer,
  from: number,
  to: number,
): Promise<Uint8Array | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, {
      updateMetadata: false,
      ignoreEncryption: true,
    });
    const total = doc.getPageCount();
    const first = Math.max(1, Math.floor(from));
    const last = Math.min(total, Math.floor(to));
    if (!Number.isInteger(total) || total <= 0 || last < first) return null;
    // The whole document IS the batch — no copying, no re-encoding.
    if (first === 1 && last === total) return null;

    const piece = await PDFDocument.create();
    const indices = Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i);
    const copied = await piece.copyPages(doc, indices);
    for (const p of copied) piece.addPage(p);
    return await piece.save();
  } catch {
    return null;
  }
}

/** The batch's own file name, so the vendor and the history row both say
 *  which pages this was. Mirrors the browser splitter's "(ms 5-8)". */
export function batchFileName(name: string, from: number, to: number): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${base} (ms ${from}-${to}).pdf`;
}
