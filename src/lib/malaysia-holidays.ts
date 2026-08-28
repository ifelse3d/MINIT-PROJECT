// ---------------------------------------------------------------------------
// MALAYSIA'S NATIONAL PUBLIC HOLIDAYS, derived — C-2, work order 51.
//
// DERIVED, NEVER STORED (the same rule as the lunar offering days): a list
// you can compute is a list that cannot go stale in a table somebody forgot.
// Zero AI involved.
//
//   * Fixed Gregorian dates            — arithmetic (New Year, Labour Day,
//                                        National Day, Malaysia Day, Christmas,
//                                        and the YDPA's first-Monday-of-June).
//   * Chinese New Year (2 days), Wesak — the SAME lunar table the 农历 overlay
//                                        uses (CNY = lunar 1/1; Wesak = 15th
//                                        of the 4th lunar month, Malaysia's
//                                        convention).
//   * Islamic holidays                 — the SAME Umm al-Qura calendar the
//                                        Hijri overlay uses (Aidilfitri =
//                                        1–2 Syawal, Aidiladha = 10 Zulhijjah,
//                                        Awal Muharram = 1 Muharram, Maulidur
//                                        Rasul = 12 Rabiulawal). Marked
//                                        `approx`: actual dates follow the
//                                        official announcement (moon sighting)
//                                        and can shift by a day — exactly the
//                                        caveat printed calendars carry.
//   * Deepavali                        — the one date none of our calendars
//                                        can compute (Tamil calendar); a
//                                        small per-year table.
//
// SCOPE, said honestly in the UI too: NATIONAL holidays only. State holidays
// (Thaipusam, Nuzul Al-Quran, sultans' birthdays…) vary by state and are not
// included — showing Kelantan's holiday to a Penang society as "a holiday"
// would be wrong more often than right.
// ---------------------------------------------------------------------------

import { gregorianToLunar } from "@/lib/lunar";
import { gregorianToHijriNumeric } from "@/lib/hijri";

export type MalaysiaHoliday = {
  dateIso: string;
  bm: string;
  zh: string;
  en: string;
  /** Follows the official (moon-sighting) announcement; may shift a day. */
  approx?: boolean;
};

/** Deepavali cannot be derived from the lunar or Hijri tables we carry. */
const DEEPAVALI: Record<number, string> = {
  2026: "2026-11-08",
  2027: "2027-10-29",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** First Monday of June — the YDPA's official birthday since 2017. */
function firstMondayOfJune(year: number): string {
  const d = new Date(Date.UTC(year, 5, 1));
  const shift = (8 - d.getUTCDay()) % 7;
  return `${year}-06-${pad(1 + shift)}`;
}

function* daysOfYear(year: number): Generator<string> {
  for (let m = 1; m <= 12; m++) {
    const len = new Date(Date.UTC(year, m, 0)).getUTCDate();
    for (let d = 1; d <= len; d++) yield `${year}-${pad(m)}-${pad(d)}`;
  }
}

function addDays(iso: string, n: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function computeYear(year: number): MalaysiaHoliday[] {
  const out: MalaysiaHoliday[] = [
    { dateIso: `${year}-01-01`, bm: "Tahun Baharu", zh: "元旦", en: "New Year's Day" },
    { dateIso: `${year}-05-01`, bm: "Hari Pekerja", zh: "劳动节", en: "Labour Day" },
    {
      dateIso: firstMondayOfJune(year),
      bm: "Hari Keputeraan YDP Agong",
      zh: "最高元首诞辰",
      en: "YDP Agong's Birthday",
    },
    { dateIso: `${year}-08-31`, bm: "Hari Kebangsaan", zh: "国庆日", en: "National Day" },
    { dateIso: `${year}-09-16`, bm: "Hari Malaysia", zh: "马来西亚日", en: "Malaysia Day" },
    { dateIso: `${year}-12-25`, bm: "Hari Krismas", zh: "圣诞节", en: "Christmas Day" },
  ];

  // One pass over the year finds every calendar-derived day. The lunar and
  // Hijri converters both return null out of range / without ICU — those
  // holidays are then simply absent rather than wrong.
  for (const iso of daysOfYear(year)) {
    const lunar = gregorianToLunar(iso);
    if (lunar && !lunar.isLeapMonth && lunar.lunarMonth === 1 && lunar.lunarDay === 1) {
      out.push(
        { dateIso: iso, bm: "Tahun Baru Cina", zh: "农历新年", en: "Chinese New Year" },
        {
          dateIso: addDays(iso, 1),
          bm: "Tahun Baru Cina (hari ke-2)",
          zh: "农历新年（第二天）",
          en: "Chinese New Year (2nd day)",
        },
      );
    }
    if (lunar && !lunar.isLeapMonth && lunar.lunarMonth === 4 && lunar.lunarDay === 15) {
      out.push({ dateIso: iso, bm: "Hari Wesak", zh: "卫塞节", en: "Wesak Day" });
    }
    const hijri = gregorianToHijriNumeric(iso);
    if (hijri) {
      if (hijri.month === 10 && hijri.day === 1) {
        out.push(
          {
            dateIso: iso,
            bm: "Hari Raya Aidilfitri",
            zh: "开斋节",
            en: "Hari Raya Aidilfitri",
            approx: true,
          },
          {
            dateIso: addDays(iso, 1),
            bm: "Hari Raya Aidilfitri (hari ke-2)",
            zh: "开斋节（第二天）",
            en: "Hari Raya Aidilfitri (2nd day)",
            approx: true,
          },
        );
      }
      if (hijri.month === 12 && hijri.day === 10) {
        out.push({
          dateIso: iso,
          bm: "Hari Raya Aidiladha",
          zh: "哈芝节",
          en: "Hari Raya Aidiladha",
          approx: true,
        });
      }
      if (hijri.month === 1 && hijri.day === 1) {
        out.push({
          dateIso: iso,
          bm: "Awal Muharram",
          zh: "回历新年",
          en: "Awal Muharram",
          approx: true,
        });
      }
      if (hijri.month === 3 && hijri.day === 12) {
        out.push({
          dateIso: iso,
          bm: "Maulidur Rasul",
          zh: "先知诞辰",
          en: "Prophet Muhammad's Birthday",
          approx: true,
        });
      }
    }
  }

  const deepavali = DEEPAVALI[year];
  if (deepavali) {
    out.push({ dateIso: deepavali, bm: "Deepavali", zh: "屠妖节", en: "Deepavali" });
  }

  return out.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

const cache = new Map<number, Map<string, MalaysiaHoliday>>();

function yearMap(year: number): Map<string, MalaysiaHoliday> {
  let m = cache.get(year);
  if (!m) {
    m = new Map(computeYear(year).map((h) => [h.dateIso, h]));
    cache.set(year, m);
  }
  return m;
}

/** The national holiday on this Gregorian day, or null. */
export function malaysiaHolidayFor(iso: string): MalaysiaHoliday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return yearMap(Number(iso.slice(0, 4))).get(iso) ?? null;
}

/** All national holidays of a year, date order (for tests and lists). */
export function malaysiaHolidays(year: number): MalaysiaHoliday[] {
  return [...yearMap(year).values()].sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso),
  );
}
