import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { stampFenceWatermark } from "./fence-watermark";

// D44: the stamper re-opens finished PDF bytes and marks every page. It must
// never eat pages, and its output must still be a loadable PDF — the browser
// viewer and eROSES both open what it returns.

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]); // A4
    page.drawText(`page ${i + 1}`, { x: 50, y: 800, size: 12 });
  }
  return await doc.save();
}

describe("stampFenceWatermark", () => {
  it("returns a loadable PDF with the same page count, different bytes", async () => {
    const original = await makePdf(3);
    const stamped = await stampFenceWatermark(original);
    expect(stamped).not.toEqual(original);
    const reopened = await PDFDocument.load(stamped);
    expect(reopened.getPageCount()).toBe(3);
    // The stamp adds content — a stamped file is strictly bigger.
    expect(stamped.byteLength).toBeGreaterThan(original.byteLength);
  });

  it("handles a one-page receipt-sized document", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([420, 298]); // small landscape slip
    const stamped = await stampFenceWatermark(await doc.save());
    const reopened = await PDFDocument.load(stamped);
    expect(reopened.getPageCount()).toBe(1);
  });
});
