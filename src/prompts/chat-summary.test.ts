import { describe, expect, it } from "vitest";
import { chatSummaryPrompt } from "@/prompts/chat-summary";

// 130 §15-2: the fold prompt — the transcript goes in, the answer is one JSON
// field, and the rules forbid adding, advising and answering.
describe("chatSummaryPrompt", () => {
  const prompt = chatSummaryPrompt({
    orgName: "Persatuan Contoh",
    uiLang: "zh",
    turns: [
      { role: "user", text: "年度呈报什么时候要交？" },
      { role: "assistant", text: "……截止日在「截止日」卡。" },
    ],
  });
  it("carries every turn, labelled by speaker", () => {
    expect(prompt).toContain("MEMBER: 年度呈报什么时候要交？");
    expect(prompt).toContain("MINITAI: ……截止日在「截止日」卡。");
  });
  it("names the language, the word budget and the one-field JSON", () => {
    expect(prompt).toContain("Write in Chinese");
    expect(prompt).toContain("At most 120 words");
    expect(prompt).toContain('{"summary": "..."}');
  });
  it("forbids adding, advising and answering", () => {
    expect(prompt).toMatch(/Do NOT add anything/);
    expect(prompt).toMatch(/Do NOT give advice/);
    expect(prompt).toMatch(/Do NOT answer any question/);
  });
});
