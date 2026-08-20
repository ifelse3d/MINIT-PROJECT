"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { CATEGORY_STYLE, LINE_TEXT } from "@/lib/activity-labels";
import {
  feedDays,
  filterByCategory,
  nextMonth,
  prevMonth,
  HISTORY_CATEGORIES,
  type ActivityRecord,
  type HistoryFilter,
} from "@/lib/history";
import { formatRm } from "@/lib/minutes-draft";
import { MonthPicker } from "@/app/calendar/month-picker";

// ---------------------------------------------------------------------------
// Sejarah feed — read-only (there is nothing to enter here). Newest day first;
// each row links into the existing detail page (minutes →
// /minutes/history#minutes-N, receipts → /money/history#receipt-N, …). WHO did it
// comes from the actor columns that exist (minutes.confirmed_by, donation
// collector, remittance confirmed_by_hq); tables without an actor column show "—".
//
// 2026-07-28 REDESIGN (user: "这个 history page 设计也不是很好")
//   * The month was a bare "2026-07" with only ‹ ›. Now it is the same MonthPicker
//     the calendar uses: tap the month, get a year stepper and twelve months.
//   * NINE filter chips wrapped onto two lines and were the loudest thing on the
//     page, above the content they filter. They are now one dropdown that says
//     what it is for, and it only appears when there is something to filter.
//   * Rows were a 14px single line with four things competing on it. Each row is
//     now two lines — WHAT happened, then who and when — at a readable size, and
//     the whole row is a large tap target.
//   * A day with several records showed no total. Money days now carry the day's
//     total, which is the number a treasurer is actually scanning for.
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { value: HistoryFilter; bm: string; zh: string; en: string }[] = [
  { value: "all", bm: "Semua jenis", zh: "全部类型", en: "Everything" },
  ...HISTORY_CATEGORIES.map((c) => ({
    value: c as HistoryFilter,
    bm: CATEGORY_STYLE[c].bm,
    zh: CATEGORY_STYLE[c].zh,
    en: CATEGORY_STYLE[c].en,
  })),
];

const WEEKDAY_TRI: { bm: string; zh: string; en: string }[] = [
  { bm: "Ahad", zh: "星期日", en: "Sunday" },
  { bm: "Isnin", zh: "星期一", en: "Monday" },
  { bm: "Selasa", zh: "星期二", en: "Tuesday" },
  { bm: "Rabu", zh: "星期三", en: "Wednesday" },
  { bm: "Khamis", zh: "星期四", en: "Thursday" },
  { bm: "Jumaat", zh: "星期五", en: "Friday" },
  { bm: "Sabtu", zh: "星期六", en: "Saturday" },
];

/** Day-of-week from an ISO date, without timezone surprises (parsed as UTC). */
function weekdayOf(dayIso: string): { bm: string; zh: string; en: string } {
  return WEEKDAY_TRI[new Date(`${dayIso}T00:00:00Z`).getUTCDay()];
}

export function HistoryFeed({
  records,
  month,
  todayIso,
  orgName,
}: {
  records: ActivityRecord[];
  month: string;
  todayIso: string;
  orgName: string | null;
}) {
  const t = useTriText();
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const days = useMemo(
    () => feedDays(filterByCategory(records, filter)),
    [records, filter],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-8">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100/80 text-2xl ring-1 ring-white/60 backdrop-blur dark:bg-violet-400/15 dark:ring-white/10">
            📖
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Sejarah" zh="历史" en="History" />
            </span>
          </h1>
          {orgName && <Badge variant="secondary">{orgName}</Badge>}
        </div>
      </div>

      {!orgName && (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan untuk melihat sejarah"
              zh="选择或创建组织后即可看到历史"
              en="Choose or create an organisation to see its history"
            />
          </Link>
        </p>
      )}

      {/* Month navigation — the same picker the calendar uses. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} hrefFor={(m) => `/history?month=${m}`} />
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/history?month=${prevMonth(month)}`}
              aria-label={t("Bulan sebelum", "上个月", "previous month")}
            >
              ‹ <Tri bm="Sebelum" zh="上个月" en="Back" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/history">
              <Tri bm="Bulan ini" zh="本月" en="This month" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/history?month=${nextMonth(month)}`}
              aria-label={t("Bulan berikut", "下个月", "next month")}
            >
              <Tri bm="Berikut" zh="下个月" en="Next" /> ›
            </Link>
          </Button>
        </div>
      </div>

      {/* One dropdown instead of nine chips — and only when there is something
          to filter, so an empty month is not fronted by a control that does
          nothing. */}
      {records.length > 0 && (
        <label className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold">
            <Tri bm="Tunjukkan" zh="只看" en="Show" />
          </span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as HistoryFilter)}
            className="h-12 min-w-52 rounded-xl border-2 border-input bg-white px-3 text-base dark:bg-white/5"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.bm, o.zh, o.en)}
              </option>
            ))}
          </select>
          {filter !== "all" && (
            <Button variant="outline" onClick={() => setFilter("all")}>
              <Tri bm="Tunjuk semua" zh="显示全部" en="Show everything" />
            </Button>
          )}
        </label>
      )}

      {/* Feed */}
      {days.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed p-6 text-base">
          <p className="font-semibold">
            {filter === "all" ? (
              <Tri
                bm="Tiada apa-apa direkodkan pada bulan ini."
                zh="这个月还没有任何记录。"
                en="Nothing was recorded this month."
              />
            ) : (
              <Tri
                bm="Tiada rekod jenis ini pada bulan ini."
                zh="这个月没有这一类的记录。"
                en="No records of this kind this month."
              />
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {filter === "all" ? (
              <Tri
                bm="Setiap kali anda mengesahkan minit atau mengeluarkan resit, ia muncul di sini — supaya anda boleh tunjukkan kepada juruaudit apa yang berlaku dan bila."
                zh="每次您确认会议记录或开出收据，都会出现在这里 —— 让您可以给审计看清楚什么时候做了什么。"
                en="Every time you confirm minutes or issue a receipt it appears here — so you can show an auditor what happened and when."
              />
            ) : (
              <Tri
                bm="Cuba bulan lain, atau tunjuk semua jenis."
                zh="可以换个月份看，或者显示全部类型。"
                en="Try another month, or show everything."
              />
            )}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {days.map((day) => {
          const wd = weekdayOf(day.dayIso);
          // The number a treasurer is scanning a month of history FOR.
          const dayTotalCents = day.records.reduce(
            (sum, r) => sum + (typeof r.amountCents === "number" ? r.amountCents : 0),
            0,
          );
          return (
            <section key={day.dayIso} className="flex flex-col gap-2.5">
              <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-[color:var(--v2-border)] pb-2">
                <span className="text-xl font-bold tabular-nums">{day.dayIso}</span>
                <span className="text-base text-muted-foreground">
                  <Tri bm={wd.bm} zh={wd.zh} en={wd.en} sep=" " />
                </span>
                {day.dayIso === todayIso && (
                  <Badge
                    // #7c6cf5 gave white text 3.95:1 — fails AA at this size.
                    // #5b4bd6 is the same hue at 6.14:1 (= --v2-grad-from).
                    className="bg-[#5b4bd6] text-white hover:bg-[#5b4bd6]"
                  >
                    <Tri bm="Hari ini" zh="今天" en="Today" />
                  </Badge>
                )}
                {dayTotalCents > 0 && (
                  <span className="ml-auto text-base font-semibold tabular-nums">
                    <Tri bm="Jumlah" zh="合计" en="Total" />{" "}
                    {formatRm(dayTotalCents)}
                  </span>
                )}
              </h3>
              <ul className="flex flex-col gap-2">
                {day.records.map((r, i) => (
                  <FeedRow key={i} record={r} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FeedRow({ record }: { record: ActivityRecord }) {
  const s = CATEGORY_STYLE[record.category];
  const text = LINE_TEXT[`${record.category}/${record.kind}`]?.(1);
  return (
    <li>
      <Link
        href={record.href}
        className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/70 p-3.5 transition-colors hover:border-[#7c6cf5]/50 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
      >
        <span
          aria-hidden
          className={`size-3.5 shrink-0 rounded-full ring-2 ring-white ${s.dot}`}
        />
        <span className="min-w-0 flex-1">
          {/* Line 1 — WHAT happened, and how much. */}
          <span className="block text-lg font-medium leading-snug">
            {text ? <Tri bm={text.bm} zh={text.zh} en={text.en} /> : record.kind}
            {typeof record.amountCents === "number" && (
              <span className="font-bold tabular-nums">
                {" · "}
                {formatRm(record.amountCents)}
              </span>
            )}
          </span>
          {/* Line 2 — the supporting detail, out of the way of line 1. */}
          <span className="mt-0.5 block text-base text-muted-foreground">
            <Tri bm={s.bm} zh={s.zh} en={s.en} />
            {/* PDPA: detail is only ever donor_masked / upload kind / category */}
            {record.detail ? ` · ${record.detail}` : ""}
            {record.actor ? ` · ${record.actor}` : ""}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl text-muted-foreground">
          →
        </span>
      </Link>
    </li>
  );
}
