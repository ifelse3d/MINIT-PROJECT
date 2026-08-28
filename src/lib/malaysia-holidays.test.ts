import { describe, expect, it } from "vitest";
import { malaysiaHolidayFor, malaysiaHolidays } from "./malaysia-holidays";
import { gregorianToLunar } from "./lunar";
import { gregorianToHijriNumeric } from "./hijri";

describe("malaysiaHolidays", () => {
  const y2026 = malaysiaHolidays(2026);
  const byEn = (en: string) => y2026.filter((h) => h.en.startsWith(en));

  it("carries the fixed national days", () => {
    expect(malaysiaHolidayFor("2026-05-01")?.en).toBe("Labour Day");
    expect(malaysiaHolidayFor("2026-08-31")?.en).toBe("National Day");
    expect(malaysiaHolidayFor("2026-09-16")?.en).toBe("Malaysia Day");
    expect(malaysiaHolidayFor("2026-12-25")?.en).toBe("Christmas Day");
    expect(malaysiaHolidayFor("2026-01-01")?.en).toBe("New Year's Day");
  });

  it("puts the YDPA's birthday on the first Monday of June", () => {
    // 2026-06-01 IS a Monday.
    expect(malaysiaHolidayFor("2026-06-01")?.en).toBe("YDP Agong's Birthday");
    expect(new Date("2026-06-01T00:00:00Z").getUTCDay()).toBe(1);
  });

  it("derives Chinese New Year from the same lunar table as the overlay", () => {
    const cny = byEn("Chinese New Year");
    expect(cny).toHaveLength(2);
    const l = gregorianToLunar(cny[0].dateIso);
    expect(l).toMatchObject({ lunarMonth: 1, lunarDay: 1 });
    // 2026's CNY is 17 Feb — a well-known anchor for the table.
    expect(cny[0].dateIso).toBe("2026-02-17");
    expect(cny[1].dateIso).toBe("2026-02-18");
  });

  it("derives Wesak as the 15th of the 4th lunar month", () => {
    const wesak = byEn("Wesak");
    expect(wesak).toHaveLength(1);
    const l = gregorianToLunar(wesak[0].dateIso);
    expect(l).toMatchObject({ lunarMonth: 4, lunarDay: 15, isLeapMonth: false });
  });

  it("derives the Islamic days from Umm al-Qura and marks them approx", () => {
    // Node ships full ICU, so these must be present in tests.
    const fitri = byEn("Hari Raya Aidilfitri");
    expect(fitri).toHaveLength(2);
    expect(fitri.every((h) => h.approx)).toBe(true);
    expect(gregorianToHijriNumeric(fitri[0].dateIso)).toEqual({ month: 10, day: 1 });
    const adha = byEn("Hari Raya Aidiladha");
    expect(adha).toHaveLength(1);
    expect(gregorianToHijriNumeric(adha[0].dateIso)).toEqual({ month: 12, day: 10 });
    expect(byEn("Awal Muharram")).toHaveLength(1);
    expect(byEn("Prophet Muhammad's Birthday")).toHaveLength(1);
  });

  it("has Deepavali from the table, absent outside it", () => {
    expect(malaysiaHolidayFor("2026-11-08")?.en).toBe("Deepavali");
    expect(malaysiaHolidays(2031).some((h) => h.en === "Deepavali")).toBe(false);
  });

  it("answers null for ordinary days and junk", () => {
    expect(malaysiaHolidayFor("2026-03-03")).toBe(null);
    expect(malaysiaHolidayFor("not-a-date")).toBe(null);
  });

  it("every holiday is trilingual", () => {
    for (const h of y2026) {
      expect(h.bm.length).toBeGreaterThan(0);
      expect(h.zh.length).toBeGreaterThan(0);
      expect(h.en.length).toBeGreaterThan(0);
    }
  });
});
