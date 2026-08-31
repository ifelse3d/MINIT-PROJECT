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

  it("tells a PDF what to do with a PDF, not with a photo or a Word file", () => {
    const e = documentTooLongError("pdf");
    expect(e.en).toMatch(/PDF/);
    expect(e.en).not.toMatch(/Word\/Excel\/PowerPoint/);
    expect(e.en).not.toMatch(/Photograph one page/);
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

  it("🔴 §1-4 (105): the 'queued reading is coming' promise is gone, in all three languages", () => {
    // The queue exists now (/api/job/*). A promise that outlives the thing it
    // promised is worse than silence — and a person who reads "coming soon"
    // on the very feature they just used stops believing the other sentences.
    for (const kind of ["pdf", "office", "photo", "unknown"] as const) {
      const e = documentTooLongError(kind);
      expect(e.zh).not.toMatch(/排队|施工中/);
      expect(e.bm.toLowerCase()).not.toMatch(/beratur|akan datang/);
      expect(e.en.toLowerCase()).not.toMatch(/queued reading|on the way|being built/);
    }
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
