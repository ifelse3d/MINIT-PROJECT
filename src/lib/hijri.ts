// ---------------------------------------------------------------------------
// GREGORIAN → HIJRI (Umm al-Qura), via Intl — no tables, no dependency.
// Launch feedback #15 (2026-08-27 evening): the calendar's secondary
// calendars are OPT-IN — Chinese lunar for temple committees, Hijri for
// Muslim societies — added by the person, not assumed by us.
//
// Intl's islamic-umalqura calendar ships with V8's full ICU (Node and every
// evergreen browser). Everything here is wrapped so an environment without
// it simply shows no Hijri text instead of crashing the calendar.
// ---------------------------------------------------------------------------

export type HijriDate = {
  day: number;
  /** Month name in Malay ("Ramadan", "Syawal"…) — ms-MY locale. */
  monthText: string;
};

let formatter: Intl.DateTimeFormat | null | undefined;

function getFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter;
  try {
    formatter = new Intl.DateTimeFormat("ms-MY-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    // Some minimal-ICU builds silently fall back to gregorian — detect that
    // once: 2024-03-15 is Ramadan 5, 1445 in Umm al-Qura.
    const probe = formatter.formatToParts(new Date(Date.UTC(2024, 2, 15)));
    const month = probe.find((p) => p.type === "month")?.value ?? "";
    if (/mac|march/i.test(month)) formatter = null;
  } catch {
    formatter = null;
  }
  return formatter;
}

/** Hijri day + Malay month name for a Gregorian YYYY-MM-DD, or null. */
export function gregorianToHijri(iso: string): HijriDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const f = getFormatter();
  if (!f) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  try {
    const parts = f.formatToParts(new Date(ms));
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    const monthText = parts.find((p) => p.type === "month")?.value ?? "";
    if (!Number.isFinite(day) || day < 1 || monthText === "") return null;
    return { day, monthText };
  } catch {
    return null;
  }
}

/** Short cell label: the day number, or the month name on the 1st —
 *  the same convention the Chinese lunar column uses. */
export function hijriCellText(iso: string): string | null {
  const h = gregorianToHijri(iso);
  if (!h) return null;
  return h.day === 1 ? h.monthText : String(h.day);
}

// --- numeric variant (C-2, work order 51) ----------------------------------
// malaysia-holidays.ts needs the MONTH NUMBER (1 Syawal, 10 Zulhijjah…), and
// month names vary by locale/ICU build — numbers do not. Same guarded
// formatter pattern, same known-date probe.

let numericFormatter: Intl.DateTimeFormat | null | undefined;

function getNumericFormatter(): Intl.DateTimeFormat | null {
  if (numericFormatter !== undefined) return numericFormatter;
  try {
    numericFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
    // 2024-03-15 is 5 Ramadan (month 9) 1445 in Umm al-Qura.
    const probe = numericFormatter.formatToParts(new Date(Date.UTC(2024, 2, 15)));
    const m = Number(probe.find((p) => p.type === "month")?.value ?? "");
    if (m !== 9) numericFormatter = null;
  } catch {
    numericFormatter = null;
  }
  return numericFormatter;
}

/** Hijri {month 1-12, day} for a Gregorian YYYY-MM-DD, or null when the
 *  environment cannot compute it (the caller then shows nothing). */
export function gregorianToHijriNumeric(
  iso: string,
): { month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const f = getNumericFormatter();
  if (!f) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  try {
    const parts = f.formatToParts(new Date(ms));
    const month = Number(parts.find((p) => p.type === "month")?.value ?? "");
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 30) return null;
    return { month, day };
  } catch {
    return null;
  }
}
