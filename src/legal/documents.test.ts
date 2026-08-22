import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIVACY_MARKDOWN,
  PRIVACY_VERSION,
  TERMS_MARKDOWN,
  TERMS_VERSION,
} from "@/legal/documents";
import { parseMarkdown } from "@/lib/markdown-lite";

// documents.ts is generated from legal/*.md by `npm run legal:sync`. These
// tests are the reason that is safe: if somebody edits a clause and forgets to
// run the script, the app would keep showing the OLD notice while the repo
// claims the new one — and what the app showed is what the person agreed to.
// This turns that into a failing test instead of a legal problem.

function readLegal(file: string): string {
  return readFileSync(path.join(process.cwd(), "legal", file), "utf8").replace(/\r\n/g, "\n");
}

describe("the compiled legal documents", () => {
  it("matches legal/terms-of-use-BM-EN.md exactly", () => {
    expect(TERMS_MARKDOWN).toBe(readLegal("terms-of-use-BM-EN.md"));
  });

  it("matches legal/privacy-notice-BM-EN.md exactly", () => {
    expect(PRIVACY_MARKDOWN).toBe(readLegal("privacy-notice-BM-EN.md"));
  });

  it("gives each document a version that changes with its text", () => {
    expect(TERMS_VERSION).toMatch(/^[0-9a-f]{12}$/);
    expect(PRIVACY_VERSION).toMatch(/^[0-9a-f]{12}$/);
    expect(TERMS_VERSION).not.toBe(PRIVACY_VERSION);
  });

  it("still contains both languages — PDPA s.7 requires both", () => {
    for (const doc of [TERMS_MARKDOWN, PRIVACY_MARKDOWN]) {
      expect(doc).toContain("BAHAGIAN 1 — BAHASA MALAYSIA");
      expect(doc).toContain("ENGLISH");
    }
  });

  it("renders to blocks without losing the headings", () => {
    for (const doc of [TERMS_MARKDOWN, PRIVACY_MARKDOWN]) {
      const blocks = parseMarkdown(doc);
      expect(blocks.length).toBeGreaterThan(20);
      expect(blocks.filter((b) => b.kind === "heading").length).toBeGreaterThan(5);
    }
  });
});
