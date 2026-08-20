import { describe, expect, it } from "vitest";
import {
  glossaryAllowedRuns,
  glossaryPromptBlockForReading,
  glossaryPromptBlockForWriting,
  usableEntries,
  type GlossaryEntry,
} from "@/lib/glossary";

const e = (p: Partial<GlossaryEntry> & { term: string }): GlossaryEntry => ({
  action: "keep",
  translation: null,
  note: null,
  ...p,
});

describe("usableEntries", () => {
  it("drops a translate rule with nothing to translate to", () => {
    expect(
      usableEntries([
        e({ term: "崇德" }),
        e({ term: "家长班", action: "translate", translation: "  " }),
      ]).map((x) => x.term),
    ).toEqual(["崇德"]);
  });
});

describe("prompt blocks", () => {
  const entries = [
    e({ term: "崇德", note: "ajaran" }),
    e({ term: "家长班", action: "translate", translation: "Kelas Ibu Bapa" }),
  ];

  // An org that has taught Minit nothing must get byte-identical prompts to
  // the ones that were measured before the glossary existed.
  it("is empty when the organisation has taught Minit nothing", () => {
    expect(glossaryPromptBlockForReading([])).toBe("");
    expect(glossaryPromptBlockForWriting([])).toBe("");
  });

  it("gives the reader the words without making it a closed list", () => {
    // The prompt is hard-wrapped, so assert against normalised whitespace —
    // otherwise the test breaks every time a sentence is rewrapped.
    const block = glossaryPromptBlockForReading(entries).replace(/\s+/g, " ");
    expect(block).toContain("崇德 (ajaran)");
    expect(block).toContain("家长班");
    expect(block).toContain("NOT a closed list");
    expect(block).toContain("do not snap it to the nearest entry");
    expect(block).toContain('still marked "check"');
  });

  it("separates keep-as-written from always-render-as", () => {
    const block = glossaryPromptBlockForWriting(entries);
    expect(block).toContain("COPY EXACTLY");
    expect(block).toContain("崇德");
    expect(block).toContain("家长班 → Kelas Ibu Bapa");
  });

  it("does not offer a translation the organisation never gave", () => {
    const block = glossaryPromptBlockForWriting([
      e({ term: "家长班", action: "translate", translation: "" }),
    ]);
    expect(block).toBe("");
  });
});

describe("glossaryAllowedRuns", () => {
  it("allows both what was written and what the org wants it written as", () => {
    expect(
      glossaryAllowedRuns([e({ term: "青班", action: "translate", translation: "青年班" })]),
    ).toEqual(["青班", "青年班"]);
  });
});
