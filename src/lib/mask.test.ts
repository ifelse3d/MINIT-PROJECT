import { describe, expect, it } from "vitest";
import { maskIc, maskName } from "./mask";

describe("maskName", () => {
  it("keeps first letter of each word", () => {
    expect(maskName("Tan Ah Kow")).toBe("T•• A• K••");
  });

  it("handles single-word names", () => {
    expect(maskName("Siti")).toBe("S•••");
  });

  it("handles Chinese names (multi-byte safe)", () => {
    expect(maskName("陈亚九")).toBe("陈••");
  });

  it("collapses extra whitespace", () => {
    expect(maskName("  Lim   Wei  ")).toBe("L•• W••");
  });

  it("never returns an empty string", () => {
    expect(maskName("")).toBe("—");
    expect(maskName("   ")).toBe("—");
  });
});

describe("maskIc", () => {
  it("masks a dashed IC keeping the birth-date part", () => {
    expect(maskIc("880101-07-5231")).toBe("880101-••-••••");
  });

  it("masks an undashed IC the same way", () => {
    expect(maskIc("880101075231")).toBe("880101-••-••••");
  });

  it("masks non-IC strings to first 4 chars", () => {
    expect(maskIc("A1234567")).toBe("A123••••");
  });

  it("never returns an empty string", () => {
    expect(maskIc("")).toBe("—");
  });
});
