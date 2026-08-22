import { describe, expect, it } from "vitest";
import {
  chunkHash,
  chunkMinutes,
  MAX_CHARS,
  MIN_CHARS,
} from "./minutes-chunks";

describe("chunkMinutes", () => {
  it("returns nothing for an empty document", () => {
    expect(chunkMinutes("")).toEqual([]);
    expect(chunkMinutes("   \n\n  ")).toEqual([]);
  });

  it("keeps each heading with the text underneath it", () => {
    const doc = [
      "## Kehadiran",
      "x".repeat(200),
      "",
      "## Keputusan",
      "y".repeat(200),
    ].join("\n");
    const chunks = chunkMinutes(doc);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain("## Kehadiran");
    expect(chunks[0].text).not.toContain("## Keputusan");
    expect(chunks[1].text).toContain("## Keputusan");
  });

  it("numbers chunks from zero, without gaps", () => {
    const doc = ["# A", "a".repeat(200), "# B", "b".repeat(200), "# C", "c".repeat(200)].join(
      "\n",
    );
    expect(chunkMinutes(doc).map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("never emits a chunk longer than the ceiling", () => {
    const doc = "z".repeat(MAX_CHARS * 3 + 137);
    for (const chunk of chunkMinutes(doc)) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHARS);
    }
  });

  it("does not lose text when it has to cut a huge paragraph", () => {
    const doc = "q".repeat(MAX_CHARS * 2 + 50);
    const joined = chunkMinutes(doc)
      .map((c) => c.text)
      .join("");
    expect(joined).toHaveLength(doc.length);
  });

  // A heading with two words under it is not a searchable idea on its own.
  it("folds a tiny section into its neighbour", () => {
    const doc = ["## Hadir", "Ali", "", "## Keputusan", "k".repeat(400)].join("\n");
    const chunks = chunkMinutes(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Hadir");
    expect(chunks[0].text).toContain("Keputusan");
  });

  it("does not merge a small tail when merging would break the ceiling", () => {
    // The first section lands within a couple of characters of the ceiling, so
    // folding the tiny tail into it would overflow. Where it fits, merging IS
    // the right answer (the test above) — this is the branch where it is not.
    const doc = ["# Besar", "b".repeat(MAX_CHARS - 10), "", "# Kecil", "ok"].join("\n");
    const chunks = chunkMinutes(doc);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toContain("Kecil");
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHARS);
    }
  });

  it("handles a document with no headings at all", () => {
    const doc = ["Perenggan satu.", "", "Perenggan dua.", "", "Perenggan tiga."].join(
      "\n",
    );
    const chunks = chunkMinutes(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Perenggan tiga.");
  });

  it("keeps Chinese minutes intact", () => {
    const doc = ["## 出席", "余老师、林女士", "", "## 决议", "小小班策划由余老师带。"].join(
      "\n",
    );
    const chunks = chunkMinutes(doc);
    expect(chunks.map((c) => c.text).join("\n")).toContain("小小班策划由余老师带");
  });

  it("keeps every chunk non-empty and trimmed", () => {
    const doc = ["# A", "", "", "a".repeat(300), "", "", "# B", "b".repeat(300)].join("\n");
    for (const chunk of chunkMinutes(doc)) {
      expect(chunk.text).toBe(chunk.text.trim());
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it("MIN_CHARS is below TARGET so merging can never loop", () => {
    expect(MIN_CHARS).toBeLessThan(MAX_CHARS);
  });
});

describe("chunkHash", () => {
  it("is stable for the same text", () => {
    expect(chunkHash("Keputusan: beli kerusi")).toBe(chunkHash("Keputusan: beli kerusi"));
  });

  it("changes when the text changes", () => {
    expect(chunkHash("Keputusan: beli kerusi")).not.toBe(
      chunkHash("Keputusan: beli meja"),
    );
  });

  it("is 8 hex characters", () => {
    expect(chunkHash("apa-apa")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles an empty string without throwing", () => {
    expect(chunkHash("")).toMatch(/^[0-9a-f]{8}$/);
  });
});
