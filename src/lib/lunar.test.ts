import { describe, expect, it } from "vitest";
import { gregorianToLunar, isSpecialLunarDay, lunarCellText } from "./lunar";

// Golden dates from published Chinese calendars — if the packed table or the
// walk-through logic is off by even one day, these fail.
describe("gregorianToLunar golden dates", () => {
  it("Chinese New Year 2026 (2026-02-17 = 正月初一)", () => {
    expect(gregorianToLunar("2026-02-17")).toMatchObject({
      lunarYear: 2026,
      lunarMonth: 1,
      lunarDay: 1,
      isLeapMonth: false,
      dayText: "初一",
      monthText: "正月",
    });
  });

  it("Chinese New Year 2024 (2024-02-10) and 2025 (2025-01-29)", () => {
    expect(gregorianToLunar("2024-02-10")).toMatchObject({ lunarMonth: 1, lunarDay: 1 });
    expect(gregorianToLunar("2025-01-29")).toMatchObject({ lunarMonth: 1, lunarDay: 1 });
  });

  it("Mid-Autumn 2026 (2026-09-25 = 八月十五)", () => {
    expect(gregorianToLunar("2026-09-25")).toMatchObject({
      lunarMonth: 8,
      lunarDay: 15,
      isLeapMonth: false,
      dayText: "十五",
      monthText: "八月",
    });
  });

  it("Mid-Autumn 2025 (2025-10-06 = 八月十五)", () => {
    expect(gregorianToLunar("2025-10-06")).toMatchObject({ lunarMonth: 8, lunarDay: 15 });
  });

  it("2025 leap sixth month (2025-07-25 = 闰六月初一)", () => {
    expect(gregorianToLunar("2025-07-25")).toMatchObject({
      lunarYear: 2025,
      lunarMonth: 6,
      lunarDay: 1,
      isLeapMonth: true,
      monthText: "闰六月",
    });
  });

  it("anchor date 1900-01-31 = 1900 正月初一", () => {
    expect(gregorianToLunar("1900-01-31")).toMatchObject({
      lunarYear: 1900,
      lunarMonth: 1,
      lunarDay: 1,
      isLeapMonth: false,
    });
  });
});

describe("range and input guards", () => {
  it("returns null before the anchor and past the table end", () => {
    expect(gregorianToLunar("1900-01-30")).toBeNull();
    expect(gregorianToLunar("2150-01-01")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(gregorianToLunar("17/02/2026")).toBeNull();
    expect(gregorianToLunar("")).toBeNull();
  });
});

describe("cell helpers", () => {
  it("初一 shows the month name instead of the day", () => {
    expect(lunarCellText("2026-02-17")).toBe("正月");
    expect(lunarCellText("2026-09-25")).toBe("十五");
  });

  it("初一 and 十五 are special (temple days), others are not", () => {
    expect(isSpecialLunarDay("2026-02-17")).toBe(true); // 初一
    expect(isSpecialLunarDay("2026-09-25")).toBe(true); // 十五
    expect(isSpecialLunarDay("2026-09-26")).toBe(false); // 十六
    expect(isSpecialLunarDay("2150-01-01")).toBe(false); // out of range
  });
});
