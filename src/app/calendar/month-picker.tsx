"use client";

// ---------------------------------------------------------------------------
// PICK A MONTH — year + month, in two taps.
//
// WHY (user request, 2026-07-28: "calendar 这里没办法选年月日，要找很麻烦，也不友善")
//
// The only way to move around the calendar was ‹ and › one month at a time. To
// look at last year's AGM that is twelve taps, and there was nothing on screen
// telling you that was even possible. Now the month title itself is the control:
// tap it, get a year stepper and a grid of twelve months.
//
// Deliberately a grid of month names, not two <select>s: a dropdown on Android
// opens a full-screen scrolling wheel that our users routinely spin past the
// value they wanted. Twelve big buttons cannot be overshot.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";

const MONTHS = [
  { bm: "Januari", zh: "一月", en: "January" },
  { bm: "Februari", zh: "二月", en: "February" },
  { bm: "Mac", zh: "三月", en: "March" },
  { bm: "April", zh: "四月", en: "April" },
  { bm: "Mei", zh: "五月", en: "May" },
  { bm: "Jun", zh: "六月", en: "June" },
  { bm: "Julai", zh: "七月", en: "July" },
  { bm: "Ogos", zh: "八月", en: "August" },
  { bm: "September", zh: "九月", en: "September" },
  { bm: "Oktober", zh: "十月", en: "October" },
  { bm: "November", zh: "十一月", en: "November" },
  { bm: "Disember", zh: "十二月", en: "December" },
];

export function MonthPicker({
  /** "YYYY-MM" currently shown. */
  month,
  /** Where to navigate. Receives "YYYY-MM". */
  hrefFor,
}: {
  month: string;
  hrefFor: (month: string) => string;
}) {
  const t = useTriText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentYear = Number(month.slice(0, 4));
  const currentMonth = Number(month.slice(5, 7));

  // Reopening should always start from the month on screen, not from wherever
  // the year stepper was left last time.
  useEffect(() => {
    if (open) setYear(currentYear);
  }, [open, currentYear]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = `${t(
    MONTHS[currentMonth - 1].bm,
    MONTHS[currentMonth - 1].zh,
    MONTHS[currentMonth - 1].en,
  )} ${currentYear}`;

  function go(y: number, m: number) {
    setOpen(false);
    router.push(hrefFor(`${y}-${String(m).padStart(2, "0")}`));
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-h-12 items-center gap-2.5 rounded-2xl border-2 border-[color:var(--v2-outline-border)] bg-white/80 px-4 text-xl font-semibold tabular-nums hover:bg-white dark:bg-white/10"
      >
        <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={2} />
        {label}
        <span className="text-base font-normal text-muted-foreground">
          <Tri bm="(tukar)" zh="（换月份）" en="(change)" />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Pilih bulan", "选择月份", "Choose a month")}
          className="v2-glass-strong absolute left-0 top-14 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border-2 border-[color:var(--v2-border)] p-4 shadow-[0_24px_60px_-20px_rgba(33,31,51,0.45)]"
        >
          {/* Year stepper */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={t("Tahun sebelum", "上一年", "Previous year")}
              onClick={() => setYear((y) => y - 1)}
              className="flex size-11 items-center justify-center rounded-full border-2 border-[color:var(--v2-outline-border)] bg-white/80 dark:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>
            <span className="text-2xl font-bold tabular-nums">{year}</span>
            <button
              type="button"
              aria-label={t("Tahun berikut", "下一年", "Next year")}
              onClick={() => setYear((y) => y + 1)}
              className="flex size-11 items-center justify-center rounded-full border-2 border-[color:var(--v2-outline-border)] bg-white/80 dark:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>

          {/* Twelve months */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {MONTHS.map((m, i) => {
              const isCurrent = year === currentYear && i + 1 === currentMonth;
              return (
                <button
                  key={m.en}
                  type="button"
                  onClick={() => go(year, i + 1)}
                  className={`min-h-12 rounded-xl border-2 px-2 text-base font-medium ${
                    isCurrent
                      ? "border-[#7c6cf5] bg-[#7c6cf5]/15"
                      : "border-input bg-white/70 hover:border-[#7c6cf5]/50 dark:bg-white/5"
                  }`}
                >
                  {t(m.bm, m.zh, m.en)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
