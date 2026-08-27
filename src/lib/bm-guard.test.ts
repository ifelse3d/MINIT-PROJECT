import { describe, expect, it } from "vitest";
import { cjkSnippets, hasCjk } from "@/lib/bm-guard";

// The BM guard (J 8/27 下午): a BM document bound for eROSES must not carry
// Chinese. Detection is deterministic and free; the fix is the user's
// choice (self-edit or the metered AI draft).
describe("hasCjk", () => {
  it("flags Chinese characters and CJK punctuation", () => {
    expect(hasCjk("大礼堂")).toBe(true);
    expect(hasCjk("Dewan 大礼堂")).toBe(true);
    expect(hasCjk("讨论：屋顶维修")).toBe(true);
    expect(hasCjk("，")).toBe(true);
  });

  it("passes clean Bahasa Malaysia, names, numbers and RM amounts", () => {
    expect(hasCjk("Mesyuarat Agung Tahunan 2026")).toBe(false);
    expect(hasCjk("Dewan Orang Ramai, Jalan Besar")).toBe(false);
    expect(hasCjk("Tan Ah Kow menyumbang RM150.00")).toBe(false);
    expect(hasCjk("")).toBe(false);
  });
});

describe("cjkSnippets", () => {
  it("returns the offending lines, trimmed, deduplicated and capped", () => {
    const doc = [
      "MINIT MESYUARAT",
      "Tempat: 大礼堂",
      "Keputusan: baiki bumbung",
      "  决议：维修屋顶  ",
      "Tempat: 大礼堂", // duplicate
    ].join("\n");
    expect(cjkSnippets(doc)).toEqual(["Tempat: 大礼堂", "决议：维修屋顶"]);
  });

  it("caps a fully-Chinese document instead of rendering a wall", () => {
    const doc = Array.from({ length: 40 }, (_, i) => `第${i}行`).join("\n");
    expect(cjkSnippets(doc)).toHaveLength(12);
  });

  it("returns [] for a clean document", () => {
    expect(cjkSnippets("MINIT MESYUARAT\nKeputusan: lulus")).toEqual([]);
  });

  // The organisation's REGISTERED name prints verbatim everywhere — a
  // Chinese org name must not block its own documents. Only the allowed
  // string is exempt; other Chinese on the same line still flags.
  it("exempts allowed strings (org name, signer) but nothing else", () => {
    const doc = [
      "MINIT MESYUARAT — 华人大会堂",
      "Tempat: 大礼堂",
      "Pengesah: 华人大会堂 陈大明",
    ].join("\n");
    expect(cjkSnippets(doc, ["华人大会堂"])).toEqual([
      "Tempat: 大礼堂",
      "Pengesah: 华人大会堂 陈大明", // 陈大明 is not in the allow list
    ]);
    expect(cjkSnippets(doc, ["华人大会堂", "陈大明", "大礼堂"])).toEqual([]);
  });
});
