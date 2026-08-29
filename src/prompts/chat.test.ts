import { describe, expect, it } from "vitest";
import { chatPrompt } from "./chat";

const base = {
  orgName: "Persatuan Ujian",
  todayIso: "2026-08-30",
  history: [],
  question: "soalan ujian",
};

describe("chat prompt — answer-language contract (work order 82 K4)", () => {
  it("tells the model the reply follows the QUESTION's language", () => {
    const p = chatPrompt(base);
    expect(p).toContain("ANSWER LANGUAGE");
    expect(p).toContain("follow THE QUESTION");
    expect(p).toMatch(/reply in the language THIS question was written in/);
    // The English-question-Malay-answer complaint, named explicitly:
    expect(p).toContain("A question in English gets an English answer");
  });

  it("falls back to the INTERFACE language only when it cannot tell", () => {
    expect(chatPrompt({ ...base, uiLang: "en" })).toContain("reply in English");
    expect(chatPrompt({ ...base, uiLang: "bm" })).toContain("reply in Bahasa Malaysia");
    expect(chatPrompt({ ...base, uiLang: "zh" })).toContain("reply in Chinese");
    // Default (nothing passed) keeps the product default interface: Chinese.
    expect(chatPrompt(base)).toContain("reply in Chinese");
  });
});

describe("chat prompt — file intent points at the home door (work order 82 K6)", () => {
  it("teaches the model to name the door, never a bare refusal", () => {
    const p = chatPrompt(base);
    expect(p).toContain("this conversation cannot receive files");
    expect(p).toContain("the upload box on the Home page");
    expect(p).toMatch(/suggested_page to "home"/);
    expect(p).toContain('do not stop at "you cannot upload here"');
    // ...and the capability list itself names the door (82 §7).
    expect(p).toContain("files are uploaded through the HOME page's box");
  });
});

describe("chat prompt — the tools flag still swaps rule 1's second half", () => {
  it("with tools: the five lookups are described", () => {
    const p = chatPrompt({ ...base, tools: true });
    expect(p).toContain("cari_derma");
    expect(p).toContain("tarikh_akhir");
    expect(p).not.toContain("send money questions to the Money page");
  });
  it("without tools: the older, narrower truth", () => {
    const p = chatPrompt({ ...base, tools: false });
    expect(p).not.toContain("cari_derma");
    expect(p).toContain("send money questions to the Money page");
  });
});
