"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tri, useTriText } from "@/components/language-provider";
import { CATEGORY_STYLE, LINE_TEXT, URGENCY_BADGE } from "@/lib/activity-labels";
import {
  deadlineUrgency,
  DEADLINE_LABELS,
  type DeadlineKind,
} from "@/lib/deadlines";
import {
  bucketByDay,
  dayCategories,
  daySummary,
  futureRecordFromDeadline,
  futureRecordFromEvent,
  mergeRecords,
  monthGrid,
  nextMonth,
  prevMonth,
  type ActivityCategory,
  type ActivityRecord,
  type SummaryLine,
} from "@/lib/history";
import type { CalendarExportItem } from "@/lib/ics";
import { isSpecialLunarDay, gregorianToLunar, lunarCellText } from "@/lib/lunar";
import type { SimpleEvent } from "@/lib/local-events";
import { formatRm } from "@/lib/minutes-draft";
import {
  computeStandardDeadlines,
  type ConfirmedAgm,
} from "@/lib/standard-deadlines";
import { AddToCalendar } from "./add-to-calendar";
import { DayAddForm } from "./day-add-form";
import { MonthPicker } from "./month-picker";

// ---------------------------------------------------------------------------
// Month grid (Sunday-start, like Google Calendar).
//
// Everything Minit RECORDED is read-only here — those rows come from documents
// the person already confirmed elsewhere, and there is deliberately no way to
// edit them from a calendar (the eROSES test).
//
// But 2026-07-28 the day panel gained ONE way in: adding your own event or note
// to the day you just tapped. That is not compliance data Minit extracted; it is
// the person's own diary entry, and refusing to accept it was the single biggest
// complaint about this page ("点了进去也没办法 add event 或者写 note").
//
// History dots are FILLED, future items (deadlines, events) are OUTLINED rings.
// HOVERING a day (desktop pointer devices only — Radix HoverCard ignores touch)
// previews it; CLICKING/TAPPING opens the full Sheet, which has the links AND the
// add form. Month/year navigation is MonthPicker. Money totals come from
// daySummary() — deterministic TypeScript, no LLM anywhere in this feature.
// PDPA: only masked donor values ever reach this component.
// ---------------------------------------------------------------------------

const WEEKDAYS: { bm: string; zh: string; en: string }[] = [
  { bm: "Ahd", zh: "日", en: "Sun" },
  { bm: "Isn", zh: "一", en: "Mon" },
  { bm: "Sel", zh: "二", en: "Tue" },
  { bm: "Rab", zh: "三", en: "Wed" },
  { bm: "Kha", zh: "四", en: "Thu" },
  { bm: "Jum", zh: "五", en: "Fri" },
  { bm: "Sab", zh: "六", en: "Sat" },
];

function deadlineLabel(kind: string) {
  return DEADLINE_LABELS[(kind in DEADLINE_LABELS ? kind : "custom") as DeadlineKind];
}

export function ActivityCalendar({
  serverRecords,
  month,
  todayIso,
  orgName,
  agm,
  localEvents,
  onAddEvent,
  onRemoveEvent,
}: {
  serverRecords: ActivityRecord[];
  month: string;
  todayIso: string;
  orgName: string | null;
  /** This org's latest confirmed AGM (null = none). */
  agm: ConfirmedAgm | null;
  localEvents: SimpleEvent[];
  /**
   * Add an event to a specific day, from inside the day panel.
   * 2026-07-28, user: tapping a date and then not being able to write anything on
   * it was the whole complaint about this page.
   */
  onAddEvent: (event: SimpleEvent) => void;
  /** Remove one event (the day panel lists them with a delete). */
  onRemoveEvent: (id: string) => void;
}) {
  const t = useTriText();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Future items from the SAME sources the Upcoming sidebar shows, so the two
  // never disagree. DB-stored deadlines/events already arrive inside
  // serverRecords; mergeRecords drops any duplicates.
  const allRecords = useMemo(() => {
    const clientFuture = [
      ...computeStandardDeadlines(todayIso, { agm, einvoisCount: 6 }).map(
        futureRecordFromDeadline,
      ),
      ...localEvents.map((e) =>
        futureRecordFromEvent({ title: e.title, dateIso: e.dateIso }, todayIso),
      ),
    ];
    return mergeRecords(serverRecords, clientFuture);
  }, [serverRecords, localEvents, todayIso, agm]);

  const buckets = useMemo(() => bucketByDay(allRecords), [allRecords]);
  const weeks = useMemo(() => monthGrid(month), [month]);

  const selectedRecords = selectedDay ? (buckets.get(selectedDay) ?? []) : [];
  const historyLines = daySummary(selectedRecords.filter((r) => !CATEGORY_STYLE[r.category].future));
  const futureItems = selectedRecords.filter((r) => CATEGORY_STYLE[r.category].future);
  const selectedLunar = selectedDay ? gregorianToLunar(selectedDay) : null;
  const dayEvents = selectedDay
    ? localEvents.filter((e) => e.dateIso === selectedDay)
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {!orgName && (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan untuk melihat aktiviti tersimpan"
              zh="选择或创建组织后即可看到已保存的活动"
              en="Choose or create an organisation to see saved activity"
            />
          </Link>
        </p>
      )}

      {/* Month navigation */}
      {/* 2026-07-28, user: "calendar 这里没办法选年月日，要找很麻烦". The month
          title is now the control: tap it for a year stepper + twelve months, so
          last year's AGM is two taps away instead of twelve. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} hrefFor={(m) => `/calendar?month=${m}`} />
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/calendar?month=${prevMonth(month)}`}
              aria-label={t("Bulan sebelum", "上个月", "previous month")}
            >
              ‹ <Tri bm="Sebelum" zh="上个月" en="Back" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/calendar">
              <Tri bm="Hari ini" zh="今天" en="Today" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/calendar?month=${nextMonth(month)}`}
              aria-label={t("Bulan berikut", "下个月", "next month")}
            >
              <Tri bm="Berikut" zh="下个月" en="Next" /> ›
            </Link>
          </Button>
        </div>
      </div>

      {/* Weekday header (Sunday-start, like Google Calendar) */}
      <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d.en} className="py-1">
            <Tri bm={d.bm} zh={d.zh} en={d.en} sep=" " />
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((cell) => {
              const records = buckets.get(cell.dayIso) ?? [];
              const cats = dayCategories(records);
              const isToday = cell.dayIso === todayIso;
              // Google Calendar convention: days that have already been lived
              // through are dimmed, so the eye lands on today and what is
              // still to come. Today itself is never dimmed.
              const isPast = cell.dayIso < todayIso;
              const lunar = lunarCellText(cell.dayIso);
              const lunarSpecial = isSpecialLunarDay(cell.dayIso);
              const dayButton = (
                <button
                  type="button"
                  onClick={() => setSelectedDay(cell.dayIso)}
                  className={[
                    // F-1 (2026-08-25, J #8): taller cells on desktop — the
                    // shell no longer caps the page at 896px, so the grid has
                    // real width and the cells can hold a readable day number.
                    "flex min-h-20 flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition-colors hover:bg-accent md:min-h-28 md:p-2",
                    cell.inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground",
                    cell.inMonth && isPast ? "text-muted-foreground" : "",
                    isToday ? "border-2 border-primary" : "",
                  ].join(" ")}
                >
                  {/* Day number and lunar date stack vertically instead of
                      sharing one line: at 360px a calendar column is ~46px wide
                      and side-by-side text collided once we enlarged type for
                      elderly readers. (2026-07-28 audit.) */}
                  <span className="flex flex-col items-start leading-tight sm:flex-row sm:items-baseline sm:justify-between sm:gap-1">
                    {/* J #8: the day number is what an elderly reader scans
                        for — text-base was receipt-footnote size on a 1920
                        screen. Phone sizes are unchanged (a 360px column is
                        still ~46px wide). */}
                    <span className={`text-base md:text-xl ${isToday ? "font-bold" : "font-medium"}`}>
                      {cell.dayNum}
                    </span>
                    {lunar && (
                      <span
                        className={`text-[0.7rem] leading-tight sm:text-sm md:text-base ${
                          lunarSpecial ? "font-semibold text-amber-700" : "text-muted-foreground"
                        }`}
                      >
                        {lunar}
                      </span>
                    )}
                  </span>
                  {cats.length > 0 && (
                    <span
                      // Past days used opacity-60 on the whole cluster, which
                      // dropped the count digits to ~2.4:1. Past days are now
                      // shown at full strength; "past" is already conveyed by
                      // the muted text colour on the cell itself.
                      className="flex flex-wrap items-center gap-1"
                    >
                      {cats.map((c) => {
                        const s = CATEGORY_STYLE[c];
                        const n = records.filter((r) => r.category === c).length;
                        return (
                          <span key={c} className="flex items-center gap-0.5">
                            <span
                              className={
                                s.future
                                  ? `h-2 w-2 rounded-full border-2 ${s.ring} bg-transparent`
                                  : `h-2 w-2 rounded-full ${s.dot}`
                              }
                            />
                            {n > 1 && <span className="text-sm tabular-nums">{n}</span>}
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>
              );
              // Hover preview only for days that HAVE something — an empty
              // hover card on every blank day would just be noise. Radix
              // HoverCard never opens from touch, so phones tap → Sheet.
              return records.length > 0 ? (
                <HoverCard key={cell.dayIso} openDelay={100} closeDelay={60}>
                  <HoverCardTrigger asChild>{dayButton}</HoverCardTrigger>
                  <HoverCardContent side="top" className="w-80 p-3">
                    <DayPreview dayIso={cell.dayIso} records={records} todayIso={todayIso} />
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <span key={cell.dayIso} className="contents">{dayButton}</span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {(Object.keys(CATEGORY_STYLE) as ActivityCategory[]).map((c) => {
          const s = CATEGORY_STYLE[c];
          return (
            <span key={c} className="flex items-center gap-1.5">
              <span
                className={
                  s.future
                    ? `h-2.5 w-2.5 rounded-full border-2 ${s.ring} bg-transparent`
                    : `h-2.5 w-2.5 rounded-full ${s.dot}`
                }
              />
              <Tri bm={s.bm} zh={s.zh} en={s.en} />
            </span>
          );
        })}
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-amber-600">初一/十五</span>
          <Tri bm="hari istimewa lunar" zh="农历初一十五" en="lunar special days" />
        </span>
      </div>

      {/* Day detail panel */}
      <Sheet open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-2xl tabular-nums">
              {selectedDay}
              {selectedLunar && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  {selectedLunar.monthText}
                  {selectedLunar.dayText}
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-base">
              <Tri
                bm="Apa yang berlaku pada hari ini — dan tambah sesuatu kalau perlu"
                zh="这一天有什么 —— 也可以在这里加东西"
                en="What is on this day — and add something if you need to"
              />
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 pb-6">
            {/* The one thing a person wants after tapping a date. */}
            {selectedDay && (
              <DayAddForm dayIso={selectedDay} onAdd={onAddEvent} />
            )}

            {/* This day's own events, with a way to remove one. */}
            {selectedDay && dayEvents.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">
                  <Tri
                    bm="Acara anda pada hari ini"
                    zh="您在这一天的活动"
                    en="Your events on this day"
                  />
                </h3>
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-xl border-2 border-sky-300 bg-sky-50 p-3 dark:bg-sky-400/10"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="flex-1 text-base font-semibold">
                        🎉 {ev.title}
                        {ev.timeText ? ` · ${ev.timeText}` : ""}
                      </span>
                      {/* F-9: derived (lunar offering) events are computed,
                          not stored — nothing to delete, so no button. */}
                      {!ev.derived && (
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            t(
                              `Padam "${ev.title}"? Tidak boleh dibatalkan.`,
                              `要删除「${ev.title}」吗？删了无法复原。`,
                              `Delete "${ev.title}"? This cannot be undone.`,
                            ),
                          );
                          if (ok) onRemoveEvent(ev.id);
                        }}
                        aria-label={t(
                          `Padam ${ev.title}`,
                          `删除 ${ev.title}`,
                          `Delete ${ev.title}`,
                        )}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-red-100 hover:text-red-700"
                      >
                        ✕
                      </button>
                      )}
                    </div>
                    {ev.note && (
                      <p className="mt-1 text-base whitespace-pre-line text-muted-foreground">
                        📝 {ev.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {historyLines.length === 0 && futureItems.length === 0 && dayEvents.length === 0 && (
              <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
                <Tri
                  bm="Tiada apa-apa direkodkan pada hari ini. Kalau ada sesuatu akan berlaku, tambahkan di atas supaya anda tidak lupa."
                  zh="这一天还没有任何记录。如果这天有事，就在上面加上去，免得忘记。"
                  en="Nothing is recorded on this day. If something is happening, add it above so you do not forget."
                />
              </p>
            )}

            {historyLines.length > 0 && (
              <ul className="flex flex-col gap-3">
                {historyLines.map((line) => (
                  <SummaryBullet key={`${line.category}/${line.kind}`} line={line} />
                ))}
              </ul>
            )}

            {futureItems.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">
                  <Tri
                    bm="Tarikh akhir & acara"
                    zh="截止日期与活动"
                    en="Deadlines & events"
                  />
                </h3>
                {futureItems.map((r, i) => {
                  const isDeadline = r.category === "deadline";
                  const label = isDeadline ? deadlineLabel(r.kind) : null;
                  const urgency = isDeadline
                    ? deadlineUrgency(
                        { kind: r.kind as DeadlineKind, dueDateIso: r.dayIso, source: "", status: "open" },
                        todayIso,
                      )
                    : null;
                  const localEvent = !isDeadline
                    ? localEvents.find((e) => e.dateIso === r.dayIso && e.title === r.detail)
                    : undefined;
                  const exportItem: CalendarExportItem = isDeadline
                    ? {
                        title: label!.bm,
                        dateIso: r.dayIso,
                        description: `${label!.zh} / ${label!.en} — Minit`,
                        uidKey: `deadline-${r.kind}-${r.dayIso}`,
                      }
                    : {
                        title: r.detail ?? t("Acara", "活动", "Event"),
                        dateIso: r.dayIso,
                        description: localEvent?.timeText || undefined,
                        uidKey: `event-${r.dayIso}-${(r.detail ?? "")
                          .toLowerCase()
                          .replace(/[^a-z0-9一-鿿]+/g, "-")
                          .slice(0, 40)}`,
                      };
                  return (
                    <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{isDeadline ? "⏰" : "🎉"}</span>
                        <span className="flex-1 text-sm font-medium">
                          {isDeadline ? (
                            <Tri bm={label!.bm} zh={label!.zh} en={label!.en} sep=" " />
                          ) : (
                            r.detail
                          )}
                          {localEvent?.timeText ? ` · ${localEvent.timeText}` : ""}
                        </span>
                        {urgency && (
                          <Badge variant="outline" className={`text-sm ${URGENCY_BADGE[urgency].cls}`}>
                            <Tri
                              bm={URGENCY_BADGE[urgency].bm}
                              zh={URGENCY_BADGE[urgency].zh}
                              en={URGENCY_BADGE[urgency].en}
                            />
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AddToCalendar item={exportItem} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Instant hover preview: the same summary lines the Sheet shows, condensed.
// No links here (a hover card is not a click target on the way somewhere) —
// clicking the day opens the Sheet, which has the links.
function DayPreview({
  dayIso,
  records,
  todayIso,
}: {
  dayIso: string;
  records: ActivityRecord[];
  todayIso: string;
}) {
  const lines = daySummary(records.filter((r) => !CATEGORY_STYLE[r.category].future));
  const future = records.filter((r) => CATEGORY_STYLE[r.category].future);
  const lunar = gregorianToLunar(dayIso);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="font-semibold tabular-nums">
        {dayIso}
        {lunar && (
          <span className="ml-2 font-normal text-muted-foreground">
            {lunar.monthText}
            {lunar.dayText}
          </span>
        )}
      </div>
      {lines.map((line) => {
        const s = CATEGORY_STYLE[line.category];
        const text = LINE_TEXT[`${line.category}/${line.kind}`]?.(line.count);
        return (
          <div key={`${line.category}/${line.kind}`} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
            <span>
              {text ? <Tri bm={text.bm} zh={text.zh} en={text.en} /> : `${line.count} × ${line.kind}`}
              {typeof line.totalCents === "number" && (
                <span className="font-semibold tabular-nums"> · {formatRm(line.totalCents)}</span>
              )}
            </span>
          </div>
        );
      })}
      {future.map((r, i) => {
        const isDeadline = r.category === "deadline";
        const label = isDeadline ? deadlineLabel(r.kind) : null;
        const urgency = isDeadline
          ? deadlineUrgency(
              { kind: r.kind as DeadlineKind, dueDateIso: r.dayIso, source: "", status: "open" },
              todayIso,
            )
          : null;
        return (
          <div key={`f${i}`} className="flex items-start gap-2">
            <span className="mt-0.5">{isDeadline ? "⏰" : "🎉"}</span>
            <span className="flex-1">
              {isDeadline ? <Tri bm={label!.bm} zh={label!.zh} en={label!.en} sep=" " /> : r.detail}
            </span>
            {urgency && (
              <Badge variant="outline" className={`text-sm ${URGENCY_BADGE[urgency].cls}`}>
                <Tri bm={URGENCY_BADGE[urgency].bm} zh={URGENCY_BADGE[urgency].zh} en={URGENCY_BADGE[urgency].en} />
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryBullet({ line }: { line: SummaryLine }) {
  const s = CATEGORY_STYLE[line.category];
  const text = LINE_TEXT[`${line.category}/${line.kind}`]?.(line.count);
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
        <span className="flex-1 text-sm">
          {text ? (
            <Tri bm={text.bm} zh={text.zh} en={text.en} />
          ) : (
            `${line.count} × ${line.kind}`
          )}
          {typeof line.totalCents === "number" && (
            <span className="font-semibold tabular-nums">
              {" · "}
              <Tri bm="jumlah" zh="总额" en="total" /> {formatRm(line.totalCents)}
            </span>
          )}
        </span>
      </div>
      {line.details.length > 0 && (
        <p className="pl-4 text-sm text-muted-foreground">{line.details.join(" · ")}</p>
      )}
      <Link
        href={line.href}
        className="pl-4 text-sm underline underline-offset-4 hover:text-foreground"
      >
        <Tri bm="Lihat rekod" zh="查看记录" en="View records" /> →
      </Link>
    </li>
  );
}
