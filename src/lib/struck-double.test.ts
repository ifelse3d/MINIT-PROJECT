import { describe, expect, it } from "vitest";
import { struckDoubleSuggestion } from "./bm-glossary";

// 129 D (J 9/8): 「晚晚宴」 — a struck-out first attempt the reader copied.
describe("struckDoubleSuggestion", () => {
  it("collapses a doubled character when a glossary term then reads across it", () => {
    expect(struckDoubleSuggestion("晚晚宴")).toBe("晚宴");
    expect(struckDoubleSuggestion("慈善晚晚宴筹款")).toBe("慈善晚宴筹款");
    expect(struckDoubleSuggestion("会议议室")).toBe("会议室");
  });

  it("offers nothing for a real doubled word the table does not know", () => {
    expect(struckDoubleSuggestion("谢谢大家")).toBeNull();
    expect(struckDoubleSuggestion("大大方方")).toBeNull();
  });

  it("offers nothing when there is no doubled character", () => {
    expect(struckDoubleSuggestion("晚宴")).toBeNull();
    expect(struckDoubleSuggestion("Jamuan amal")).toBeNull();
    expect(struckDoubleSuggestion("")).toBeNull();
  });

  it("never touches Latin or digits", () => {
    expect(struckDoubleSuggestion("RM 1,100 会议")).toBeNull();
  });
});
