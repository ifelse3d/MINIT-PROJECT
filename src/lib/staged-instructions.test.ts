import { describe, expect, it } from "vitest";
import { asksToRedo, readStagedInstruction } from "./staged-instructions";

describe("readStagedInstruction — §1-3 (105), J's own sentence", () => {
  it("🔴 the sentence from the complaint is understood", () => {
    // J, 2026-08-31, with two photos attached in the chat box. Before this the
    // app answered by explaining where the upload box is.
    expect(
      readStagedInstruction("這兩張是一樣的，只是有另外放出來講解。更詳細的"),
    ).toEqual({ kind: "versions" });
  });

  it("hears 'same thing' on its own", () => {
    expect(readStagedInstruction("这两张一样的").kind).toBe("versions");
    expect(readStagedInstruction("Dua-dua ini dokumen sama").kind).toBe("versions");
    expect(readStagedInstruction("these are the same document").kind).toBe("versions");
  });

  it("hears 'use the fuller one' on its own", () => {
    expect(readStagedInstruction("用比較詳細的那份").kind).toBe("versions");
    expect(readStagedInstruction("guna yang lebih lengkap").kind).toBe("versions");
    expect(readStagedInstruction("use the more detailed one").kind).toBe("versions");
  });

  it("🔴 'page 2' wins outright — pages are never re-read as versions", () => {
    expect(readStagedInstruction("第二页，跟第一页一样的格式").kind).toBe("pages");
    expect(readStagedInstruction("this is page 2 of the same meeting").kind).toBe("pages");
    expect(readStagedInstruction("muka surat 2, sama seperti tadi").kind).toBe("pages");
  });

  it("says nothing about a sentence that is about something else", () => {
    expect(readStagedInstruction("").kind).toBe("none");
    expect(readStagedInstruction("陈明发的名字要写对").kind).toBe("none");
    expect(readStagedInstruction("this is the AGM from March").kind).toBe("none");
    expect(readStagedInstruction("berapa kutipan bulan lepas?").kind).toBe("none");
  });

  it("is case-insensitive on the Latin vocabulary", () => {
    expect(readStagedInstruction("THE SAME DOCUMENT").kind).toBe("versions");
    expect(readStagedInstruction("Use The More Detailed One").kind).toBe("versions");
  });

  it("asksToRedo only fires on a versions instruction", () => {
    expect(asksToRedo("這兩張是一樣的，更詳細的")).toBe(true);
    expect(asksToRedo("第二页")).toBe(false);
    expect(asksToRedo("谢谢")).toBe(false);
  });
});
