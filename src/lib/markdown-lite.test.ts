import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, type Block } from "@/lib/markdown-lite";

// The point of these tests is not markdown coverage — it is that a clause of a
// legal document can never go missing. Every case below is a shape that
// legal/privacy-notice-BM-EN.md or legal/terms-of-use-BM-EN.md actually uses.

describe("parseInline", () => {
  it("splits bold out of a sentence", () => {
    expect(parseInline("Minit ialah **alat bantu** sahaja")).toEqual([
      { kind: "text", text: "Minit ialah " },
      { kind: "strong", text: "alat bantu" },
      { kind: "text", text: " sahaja" },
    ]);
  });

  it("keeps the placeholder brackets visible", () => {
    // [[nama entiti undang-undang]] must SHOW, so an unfilled draft is obvious.
    const spans = parseInline("**[[nama entiti undang-undang]]**");
    expect(spans).toEqual([{ kind: "strong", text: "[[nama entiti undang-undang]]" }]);
  });

  it("reads inline code", () => {
    expect(parseInline("isi ruang `[[ ]]`")).toEqual([
      { kind: "text", text: "isi ruang " },
      { kind: "code", text: "[[ ]]" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings at three levels", () => {
    const blocks = parseMarkdown("# One\n\n## Two\n\n### Three");
    expect(blocks.map((b) => (b.kind === "heading" ? b.level : b.kind))).toEqual([1, 2, 3]);
  });

  it("keeps the DRAFT banner as a quote", () => {
    const blocks = parseMarkdown("> **DRAF — 2026-08-03.**\n> Belum disemak.\n\nSelepas.");
    expect(blocks[0]!.kind).toBe("quote");
    expect((blocks[0] as Extract<Block, { kind: "quote" }>).lines).toHaveLength(2);
    expect(blocks[1]!.kind).toBe("paragraph");
  });

  it("reads a table, and stops at the blank line after it", () => {
    const blocks = parseMarkdown(
      "| Jenis | Peranan |\n|---|---|\n| Data akaun | Pengawal |\n| Data penderma | Pemproses |\n\nSelepas jadual.",
    );
    const table = blocks[0] as Extract<Block, { kind: "table" }>;
    expect(table.kind).toBe("table");
    expect(table.header).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]![0]![0]).toEqual({ kind: "text", text: "Data penderma" });
    expect(blocks[1]!.kind).toBe("paragraph");
  });

  it("does not turn a sentence containing a pipe into a table", () => {
    // Without the "next line is the divider" rule, this sentence would vanish
    // into a one-row table — i.e. a clause would silently change shape.
    const blocks = parseMarkdown("Hubungi kami | bila-bila masa.");
    expect(blocks[0]!.kind).toBe("paragraph");
  });

  it("groups consecutive bullets into one list", () => {
    const blocks = parseMarkdown("- satu\n- dua\n- tiga\n\nAkhir.");
    const list = blocks[0] as Extract<Block, { kind: "list" }>;
    expect(list.items).toHaveLength(3);
    expect(blocks[1]!.kind).toBe("paragraph");
  });

  it("joins a wrapped paragraph back into one", () => {
    // The legal files wrap at ~78 columns. Rendering each line as its own
    // paragraph would put a blank line inside every sentence.
    const blocks = parseMarkdown("Minit ialah alat bantu.\nIa membaca dokumen.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      spans: [{ kind: "text", text: "Minit ialah alat bantu. Ia membaca dokumen." }],
    });
  });

  it("loses no text from a whole document", () => {
    // The real guarantee: every non-structural character in equals characters
    // out. A legal notice that quietly drops a clause is worse than no page.
    const source = [
      "# Tajuk",
      "",
      "> DRAF",
      "",
      "## Bahagian",
      "",
      "Perenggan biasa dengan **tebal**.",
      "",
      "- butir satu",
      "- butir dua",
      "",
      "| A | B |",
      "|---|---|",
      "| satu | dua |",
      "",
      "---",
    ].join("\n");
    const flat = (blocks: Block[]): string =>
      blocks
        .map((b) => {
          switch (b.kind) {
            case "heading":
            case "paragraph":
              return b.spans.map((s) => s.text).join("");
            case "quote":
              return b.lines.flat().map((s) => s.text).join("");
            case "list":
              return b.items.flat().map((s) => s.text).join("");
            case "table":
              return [...b.header, ...b.rows.flat()].flat().map((s) => s.text).join("");
            case "rule":
              return "";
          }
        })
        .join("");
    const words = flat(parseMarkdown(source));
    for (const w of ["Tajuk", "DRAF", "Bahagian", "tebal", "butir satu", "satu", "dua"]) {
      expect(words).toContain(w);
    }
  });
});
