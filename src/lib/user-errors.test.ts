import { describe, expect, it } from "vitest";
import { docKindOfUpload, documentTooLongError } from "./user-errors";

// ---------------------------------------------------------------------------
// §7 (work order 104): a .docx must never be told to split a PDF.
// ---------------------------------------------------------------------------

describe("documentTooLongError", () => {
  it("tells a Word file what to do with a WORD file", () => {
    const e = documentTooLongError("office");
    expect(e.en).toMatch(/Word\/Excel\/PowerPoint/);
    expect(e.en).not.toMatch(/Split the PDF/);
    expect(e.zh).toMatch(/Word/);
  });

  it("still says 'split the PDF' for a PDF", () => {
    expect(documentTooLongError("pdf").en).toMatch(/Split the PDF/);
  });

  it("tells a photo to shoot one page at a time", () => {
    const e = documentTooLongError("photo");
    expect(e.en).toMatch(/one page at a time/);
    expect(e.en).not.toMatch(/Split the PDF/);
  });

  it("never says 'try again' in any language or kind — a retry fails identically", () => {
    for (const kind of ["pdf", "office", "photo", "unknown"] as const) {
      const e = documentTooLongError(kind);
      expect(e.en.toLowerCase()).not.toMatch(/try again/);
      expect(e.zh).not.toMatch(/再试一次/);
      expect(e.bm.toLowerCase()).not.toMatch(/cuba (sekali )?lagi/);
    }
  });

  it("says the quota came back, in all three languages, for every kind", () => {
    for (const kind of ["pdf", "office", "photo", "unknown"] as const) {
      const e = documentTooLongError(kind);
      expect(e.bm).toMatch(/dipulangkan/);
      expect(e.zh).toMatch(/退回/);
      expect(e.en).toMatch(/returned/);
    }
  });

  it("points at the queue that is being built (delete this when 105 lands)", () => {
    expect(documentTooLongError("pdf").zh).toMatch(/排队/);
  });
});

describe("docKindOfUpload", () => {
  it("reads the MIME type when there is one", () => {
    expect(docKindOfUpload("application/pdf")).toBe("pdf");
    expect(docKindOfUpload("image/jpeg")).toBe("photo");
    expect(
      docKindOfUpload(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("office");
  });

  it("falls back to the file name — a phone browser can send an empty type", () => {
    expect(docKindOfUpload("", "minit.docx")).toBe("office");
    expect(docKindOfUpload("", "scan.pdf")).toBe("pdf");
    expect(docKindOfUpload("", "IMG_0001.HEIC")).toBe("photo");
  });

  it("says 'unknown' rather than guessing", () => {
    expect(docKindOfUpload("application/zip", "stuff.zip")).toBe("unknown");
  });
});
