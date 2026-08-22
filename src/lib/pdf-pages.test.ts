import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  aiDocMaxPages,
  checkPageLimit,
  countPdfPages,
  DEFAULT_AI_DOC_MAX_PAGES,
  DEFAULT_PAGE_LIMITS,
} from "@/lib/pdf-pages";

// Real PDFs, built here rather than checked in as fixtures: a page cap that is
// tested against a hand-written byte string proves nothing about the parser
// that will meet a scanner's output.
async function pdfWithPages(n: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i += 1) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("countPdfPages", () => {
  it("counts a real multi-page PDF", async () => {
    expect(await countPdfPages(await pdfWithPages(7))).toBe(7);
  });

  it("returns null for something that is not a PDF at all", async () => {
    const junk = new TextEncoder().encode("this is a photo, not a pdf");
    expect(await countPdfPages(junk.buffer as ArrayBuffer)).toBeNull();
  });
});

describe("aiDocMaxPages", () => {
  it("uses the per-kind default when nothing is configured", () => {
    expect(aiDocMaxPages("minutes", {})).toBe(5);
    // 20, not 5: a collection book after a festival is dozens of small gifts.
    expect(aiDocMaxPages("ledger", {})).toBe(20);
    expect(aiDocMaxPages("roster", {})).toBe(20);
    expect(aiDocMaxPages("constitution", {})).toBe(DEFAULT_AI_DOC_MAX_PAGES);
  });

  it("gives the front door the most generous limit", () => {
    // /api/intake does not know what the page is until the classifier answers,
    // so it must admit the longest legitimate document.
    expect(aiDocMaxPages("unknown", {})).toBe(
      Math.max(...Object.values(DEFAULT_PAGE_LIMITS)),
    );
  });

  it("takes the number from the kind's own env var", () => {
    expect(aiDocMaxPages("minutes", { AI_DOC_MAX_PAGES_MINUTES: "12" })).toBe(12);
  });

  it("still honours the old single AI_DOC_MAX_PAGES for every kind", () => {
    // A deployment that set the global var before the per-kind ones existed
    // must keep the cap it configured, not silently get a stricter one.
    const env = { AI_DOC_MAX_PAGES: "9" };
    expect(aiDocMaxPages("minutes", env)).toBe(9);
    expect(aiDocMaxPages("constitution", env)).toBe(9);
  });

  it("prefers the kind's var over the global one", () => {
    expect(
      aiDocMaxPages("minutes", { AI_DOC_MAX_PAGES: "9", AI_DOC_MAX_PAGES_MINUTES: "3" }),
    ).toBe(3);
  });

  it("falls back rather than switching the cap off on a bad value", () => {
    // A typo in an env var must never read as "no limit".
    for (const bad of ["", "abc", "0", "-5"]) {
      expect(aiDocMaxPages("minutes", { AI_DOC_MAX_PAGES_MINUTES: bad })).toBe(5);
      expect(aiDocMaxPages("constitution", { AI_DOC_MAX_PAGES: bad })).toBe(
        DEFAULT_AI_DOC_MAX_PAGES,
      );
    }
  });
});

describe("checkPageLimit", () => {
  it("lets a photograph through without parsing anything", async () => {
    const notAPdf = new TextEncoder().encode("jpeg bytes");
    const result = await checkPageLimit(
      notAPdf.buffer as ArrayBuffer,
      "image/jpeg",
      1,
    );
    expect(result.ok).toBe(true);
  });

  it("lets a PDF at the limit through", async () => {
    expect((await checkPageLimit(await pdfWithPages(5), "application/pdf", 5)).ok).toBe(
      true,
    );
  });

  it("refuses a PDF over the limit and reports both numbers", async () => {
    const result = await checkPageLimit(
      await pdfWithPages(60),
      "application/pdf",
      50,
    );
    expect(result).toEqual({ ok: false, pages: 60, limit: 50 });
  });

  it("takes a document kind instead of a number", async () => {
    // A 12-page set of "minutes" is a scanner left on the wrong setting. The
    // same file is unremarkable as a constitution.
    const twelve = await pdfWithPages(12);
    expect(await checkPageLimit(twelve, "application/pdf", "minutes")).toEqual({
      ok: false,
      pages: 12,
      limit: 5,
    });
    expect((await checkPageLimit(twelve, "application/pdf", "constitution")).ok).toBe(true);
  });

  it("lets an unparseable PDF through — a known, deliberate hole", async () => {
    // We cannot count what we cannot open, and refusing every scanner that
    // produces something pdf-lib dislikes would block real paperwork to
    // enforce a limit we invented. The 8MB cap still applies to these.
    const broken = new TextEncoder().encode("%PDF-1.4 then nonsense");
    const result = await checkPageLimit(
      broken.buffer as ArrayBuffer,
      "application/pdf",
      1,
    );
    expect(result.ok).toBe(true);
  });
});
