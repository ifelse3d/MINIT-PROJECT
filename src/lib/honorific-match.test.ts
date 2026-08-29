import { describe, expect, it } from "vitest";
import { honorificSuggestions } from "@/lib/honorific-match";

// 拍板 7 後半 (work order 68 §4): the notes say 陈讲师; the roster knows which
// 讲师 is surnamed 陈. Code resolves it, a human taps it. All data fictional.

const roster = [
  { name: "陈明福", position: "AJK", honorific: "讲师", nameOfficial: "TAN BENG HOCK" },
  { name: "陈丽花", position: "AJK", honorific: null },
  { name: "王明", position: "Bendahari", honorific: "讲师", nameOfficial: null },
  { name: "Rahman bin Ali", position: "AJK", honorific: "Ustaz", nameOfficial: null },
];

describe("honorificSuggestions", () => {
  it("matches surname + honorific against the roster's own columns", () => {
    expect(honorificSuggestions("陈讲师", roster)).toEqual([
      { label: "陈明福 (TAN BENG HOCK)", value: "陈明福" },
    ]);
  });

  it("offers nothing when no roster entry carries that honorific with that surname", () => {
    expect(honorificSuggestions("李讲师", roster)).toEqual([]);
    // 陈丽花 has no honorific — a bare surname match is NOT enough.
    expect(honorificSuggestions("陈老师", roster)).toEqual([]);
  });

  it("matches the Latin form: honorific word + part of the name", () => {
    expect(honorificSuggestions("Ustaz Rahman", roster)).toEqual([
      { label: "Rahman bin Ali", value: "Rahman bin Ali" },
    ]);
  });

  it("suggests nothing for a plain full name — no noise on ordinary rows", () => {
    expect(honorificSuggestions("陈明福", roster)).toEqual([]);
    expect(honorificSuggestions("Siti Aminah", roster)).toEqual([]);
    expect(honorificSuggestions("", roster)).toEqual([]);
  });

  it("lists several honest candidates when the surname+honorific is ambiguous", () => {
    const two = [
      ...roster,
      { name: "陈天来", position: "AJK", honorific: "讲师", nameOfficial: null },
    ];
    expect(honorificSuggestions("陈讲师", two).map((s) => s.value)).toEqual([
      "陈明福",
      "陈天来",
    ]);
  });
});
