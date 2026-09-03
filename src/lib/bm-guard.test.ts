import { describe, expect, it } from "vitest";
import { cjkSegments, cjkSnippets, hasCjk, normalizeFullwidth } from "@/lib/bm-guard";

// The BM guard (J 8/27 下午): a BM document bound for eROSES must not carry
// Chinese. Detection is deterministic and free; the fix is the user's
// choice (self-edit or the metered AI draft).
//
// Narrowed 2026-08-30 (work order 97 §2): HAN CHARACTERS ONLY. Fullwidth
// ASCII and CJK punctuation are keyboard residue, not language — they are
// normalized by normalizeFullwidth(), never flagged. The old guard called
// "2 ＃mes. agung" a line of Chinese and nobody could see why.
describe("hasCjk", () => {
  it("flags Chinese (Han) characters", () => {
    expect(hasCjk("大礼堂")).toBe(true);
    expect(hasCjk("Dewan 大礼堂")).toBe(true);
    expect(hasCjk("讨论：屋顶维修")).toBe(true);
  });

  it("no longer flags fullwidth symbols or CJK punctuation alone", () => {
    expect(hasCjk("，")).toBe(false);
    expect(hasCjk("2 ＃mes. agung p.p. Sin Hup － 18/7/26")).toBe(false);
    expect(hasCjk("。、「」『』　！？；：")).toBe(false);
  });

  it("passes clean Bahasa Malaysia, names, numbers and RM amounts", () => {
    expect(hasCjk("Mesyuarat Agung Tahunan 2026")).toBe(false);
    expect(hasCjk("Dewan Orang Ramai, Jalan Besar")).toBe(false);
    expect(hasCjk("Tan Ah Kow menyumbang RM150.00")).toBe(false);
    expect(hasCjk("")).toBe(false);
  });
});

describe("normalizeFullwidth", () => {
  it("turns fullwidth ASCII variants into their halfwidth twins", () => {
    expect(normalizeFullwidth("＃１２３ａｂｃ！？")).toBe("#123abc!?");
    expect(normalizeFullwidth("（ＲＭ３００）")).toBe("(RM300)");
  });

  it("normalizes the J example so the guard stops flagging it", () => {
    const line = "2 ＃mes. agung p.p. Sin Hup － 18/7/26";
    const normalized = normalizeFullwidth(line);
    expect(normalized).toBe("2 #mes. agung p.p. Sin Hup - 18/7/26");
    expect(cjkSnippets(normalized)).toEqual([]);
  });

  it("maps CJK punctuation and the ideographic space", () => {
    expect(normalizeFullwidth("Selesai。Baik、bagus")).toBe("Selesai.Baik,bagus");
    expect(normalizeFullwidth("「Dewan Besar」『ok』")).toBe('"Dewan Besar""ok"');
    expect(normalizeFullwidth("a　b")).toBe("a b");
  });

  it("leaves Han characters untouched (they are the guard's job, not this one's)", () => {
    expect(normalizeFullwidth("Tempat: 大礼堂")).toBe("Tempat: 大礼堂");
  });

  it("preserves the registered name verbatim, fullwidth marks included", () => {
    const org = "华人大会堂（雪隆）";
    const doc = `# MINIT MESYUARAT — ${org}\nＴａｒｉｋｈ： 15 Ogos`;
    const out = normalizeFullwidth(doc, [org]);
    expect(out).toContain(org); // the （） in the name survive
    expect(out).toContain("Tarikh: 15 Ogos");
  });

  it("does not let the RM-0 shape collide with a sentinel", () => {
    // The preserve sentinel must never match ordinary text.
    const out = normalizeFullwidth("RM 0 dibayar；siap", ["华人大会堂"]);
    expect(out).toBe("RM 0 dibayar;siap");
  });
});

describe("cjkSegments", () => {
  it("splits a line into runs, marking exactly the Han characters", () => {
    expect(cjkSegments("Tempat: 大礼堂 ok")).toEqual([
      { text: "Tempat: ", cjk: false },
      { text: "大礼堂", cjk: true },
      { text: " ok", cjk: false },
    ]);
  });

  it("returns one run for a clean line", () => {
    expect(cjkSegments("Dewan Besar")).toEqual([{ text: "Dewan Besar", cjk: false }]);
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

  it("does not flag a line whose only 'Chinese' is a fullwidth symbol", () => {
    expect(cjkSnippets("2 ＃mes. agung p.p. Sin Hup － 18/7/26")).toEqual([]);
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
