import { describe, expect, it } from "vitest";
import { extractMeetingNotesPrompt } from "./extract-meeting-notes";
import { DATA_NOT_INSTRUCTIONS, untrustedBlock } from "./untrusted";

// F-2 (2026-08-25): the supplement box feeds the extraction prompt. Two things
// must stay true forever:
//   1. With NO supplement, the prompt is byte-identical to what the eval
//      measured — the accuracy number must not silently stop describing the
//      running system (the exact failure mode of 95.2% → see eval SUMMARY).
//   2. WITH a supplement, the person's text arrives labelled as DATA, because
//      user text in a prompt is an injection surface (untrusted.ts).

const base = { orgName: "Persatuan Test", todayIso: "2026-08-25" };

describe("extractMeetingNotesPrompt contextBlock", () => {
  it("is byte-identical without a supplement (the eval's prompt)", () => {
    expect(extractMeetingNotesPrompt(base)).toBe(
      extractMeetingNotesPrompt({ ...base, contextBlock: "" }),
    );
  });

  it("carries the supplement as labelled data", () => {
    const block = `\n\n${untrustedBlock("NOTES THE PERSON TYPED", "LKY = Lim Kok Yuan")}`;
    const prompt = extractMeetingNotesPrompt({ ...base, contextBlock: block });
    expect(prompt).toContain("LKY = Lim Kok Yuan");
    expect(prompt).toContain(DATA_NOT_INSTRUCTIONS);
  });

  it("keeps the glossary contract too — empty glossary changes nothing", () => {
    expect(extractMeetingNotesPrompt(base)).toBe(
      extractMeetingNotesPrompt({ ...base, glossaryBlock: "" }),
    );
  });
});
