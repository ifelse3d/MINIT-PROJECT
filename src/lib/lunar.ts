// ---------------------------------------------------------------------------
// GREGORIAN → CHINESE LUNAR — pure TS, no dependency, no API calls
// (approved 19 Jul 2026). Uses the classic packed table covering lunar years
// 1900–2100: one hex value per year.
//
// Encoding per year (the widely used calendar.js format):
//   bits 0–3   (0xf)      leap month number this year, 0 = no leap month
//   bits 4–15  (0xfff0)   month lengths for months 1..12, MSB-first:
//                         bit 0x8000 = month 1, … bit 0x10 = month 12;
//                         set = 30 days ("big"), clear = 29 days ("small")
//   bit  16    (0x10000)  the leap month (if any) has 30 days
//
// Anchor: 1900-01-31 (Gregorian) = 1900 正月初一.
// Outside 1900-01-31 … 2100 lunar year end the function returns null —
// callers just omit the lunar text rather than crash.
// ---------------------------------------------------------------------------

// prettier-ignore
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900–1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910–1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920–1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930–1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940–1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950–1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960–1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6, // 1970–1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980–1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990–1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000–2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010–2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020–2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030–2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040–2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050–2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060–2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070–2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080–2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090–2099
  0x0d520,                                                                                    // 2100
];

const BASE_YEAR = 1900;
const LAST_YEAR = BASE_YEAR + LUNAR_INFO.length - 1;
/** Gregorian date of 1900 正月初一. */
const ANCHOR_ISO = "1900-01-31";

const DAY_TEXT = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

const MONTH_TEXT = [
  "正月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "冬月", "腊月",
];

/** Leap month number of lunar year y (1–12), or 0 when none. */
function leapMonth(y: number): number {
  return LUNAR_INFO[y - BASE_YEAR] & 0xf;
}

/** Days in the leap month of lunar year y (0 when no leap month). */
function leapDays(y: number): number {
  if (leapMonth(y) === 0) return 0;
  return LUNAR_INFO[y - BASE_YEAR] & 0x10000 ? 30 : 29;
}

/** Days in regular month m (1–12) of lunar year y. */
function monthDays(y: number, m: number): number {
  return LUNAR_INFO[y - BASE_YEAR] & (0x10000 >> m) ? 30 : 29;
}

/** Total days in lunar year y, leap month included. */
function yearDays(y: number): number {
  let days = 348; // 12 × 29
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    if (LUNAR_INFO[y - BASE_YEAR] & bit) days++;
  }
  return days + leapDays(y);
}

export type LunarDate = {
  lunarYear: number;
  /** 1–12 (the leap month repeats its number with isLeapMonth=true). */
  lunarMonth: number;
  /** 1–30. */
  lunarDay: number;
  isLeapMonth: boolean;
  /** "初一" … "三十". */
  dayText: string;
  /** "正月" … "腊月", prefixed "闰" for a leap month. */
  monthText: string;
};

/**
 * Convert a Gregorian YYYY-MM-DD to the Chinese lunar date.
 * Returns null outside the table range or for invalid input.
 */
export function gregorianToLunar(iso: string): LunarDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;

  let offset = Math.round((ms - Date.parse(`${ANCHOR_ISO}T00:00:00Z`)) / 86_400_000);
  if (offset < 0) return null;

  // Which lunar year?
  let year = BASE_YEAR;
  while (year <= LAST_YEAR && offset >= yearDays(year)) {
    offset -= yearDays(year);
    year++;
  }
  if (year > LAST_YEAR) return null;

  // Which month within the year? The leap month slots in AFTER the regular
  // month with the same number.
  const leap = leapMonth(year);
  let month = 1;
  let isLeapMonth = false;
  for (;;) {
    const len = isLeapMonth ? leapDays(year) : monthDays(year, month);
    if (offset < len) break;
    offset -= len;
    if (!isLeapMonth && month === leap) {
      isLeapMonth = true; // next slot is the leap copy of this month
    } else {
      isLeapMonth = false;
      month++;
    }
  }

  const day = offset + 1;
  return {
    lunarYear: year,
    lunarMonth: month,
    lunarDay: day,
    isLeapMonth,
    dayText: DAY_TEXT[day - 1],
    monthText: `${isLeapMonth ? "闰" : ""}${MONTH_TEXT[month - 1]}`,
  };
}

/**
 * The short label for a calendar day cell: normally the day (十五); on 初一
 * the month name is shown instead, per convention. Null out of range.
 */
export function lunarCellText(iso: string): string | null {
  const l = gregorianToLunar(iso);
  if (!l) return null;
  return l.lunarDay === 1 ? l.monthText : l.dayText;
}

/** 初一 and 十五 get a highlight in the grid (temple-relevant days). */
export function isSpecialLunarDay(iso: string): boolean {
  const l = gregorianToLunar(iso);
  return l !== null && (l.lunarDay === 1 || l.lunarDay === 15);
}
