import { describe, expect, it } from "vitest";
import { parseLunarRecurring } from "./lunar-parse";

// #13/#14 (launch feedback 2026-08-27): the exact texts J typed must come
// back as a rule with the right title — and zero AI involvement.
describe("parseLunarRecurring", () => {
  it("reads J's assistant phrasing, quoted title", () => {
    expect(parseLunarRecurring("「農曆每月初一及十五」，標題寫「拜拜」")).toEqual({
      days: "both",
      title: "拜拜",
    });
  });

  it("reads J's original ask, unquoted title", () => {
    expect(parseLunarRecurring("帮我把每一个初一十五都写有拜拜")).toEqual({
      days: "both",
      title: "拜拜",
    });
  });

  it("reads a single-day rule with the word after it", () => {
    const rule = parseLunarRecurring("农历每月初一诵经");
    expect(rule?.days).toBe("1");
  });

  it("reads fifteenth-only rules", () => {
    expect(parseLunarRecurring("每月十五拜神")?.days).toBe("15");
  });

  it("leaves an empty title for the UI to ask, rather than inventing one", () => {
    expect(parseLunarRecurring("農曆每月初一及十五")).toEqual({
      days: "both",
      title: "",
    });
  });

  it("does not claim ordinary text or one-off dates", () => {
    expect(parseLunarRecurring("AGM 30 Ogos 10 pagi dewan utama")).toBeNull();
    expect(parseLunarRecurring("")).toBeNull();
    // A bare 初一 with no recurring frame could be one specific day.
    expect(parseLunarRecurring("初一去阿嬤家")).toBeNull();
  });
});
