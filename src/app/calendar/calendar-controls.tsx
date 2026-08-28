"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { Tri, useTriText } from "@/components/language-provider";
import type { LunarRepeatDays } from "@/lib/lunar";
import type { CalendarOverlays, LunarRepeat } from "./calendar-prefs";

// ---------------------------------------------------------------------------
// The calendar's controls row (launch feedback #13/#15, 2026-08-27 evening):
//
// #15 「一開始不要有放農曆…上面有一個 BUTTON 寫類似 + alternative calendar」—
// the grid starts plain; "+ 副历" opens a popup where the person adds the
// Chinese lunar and/or Hijri calendar. Their choice, remembered per device.
//
// #13: the recurring lunar rule (每月初一/十五) with the society's OWN word
// — J's 拜拜 — shown as a chip when on, edited in the same popup.
// ---------------------------------------------------------------------------

export function CalendarControls({
  overlays,
  setOverlays,
  lunarRepeat,
  setLunarRepeat,
}: {
  overlays: CalendarOverlays;
  setOverlays: (next: CalendarOverlays) => void;
  lunarRepeat: LunarRepeat;
  setLunarRepeat: (next: LunarRepeat) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" strokeWidth={2.2} />
        <Tri bm="Kalendar kedua" zh="副历" en="Secondary calendar" />
      </Button>
      {overlays.lunar && (
        <span className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] px-2.5 py-1 text-sm">
          <Tri bm="Lunar Cina" zh="农历" en="Chinese lunar" />
        </span>
      )}
      {overlays.hijri && (
        <span className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] px-2.5 py-1 text-sm">
          <Tri bm="Hijrah" zh="伊斯兰历" en="Hijri" />
        </span>
      )}
      {lunarRepeat.on && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)] px-2.5 py-1 text-sm text-[color:var(--v2-primary)]"
        >
          🔁{" "}
          {lunarRepeat.days === "both"
            ? "初一/十五"
            : lunarRepeat.days === "1"
              ? "初一"
              : "十五"}
          {lunarRepeat.title ? ` · ${lunarRepeat.title}` : ""}
        </button>
      )}
      <SecondaryCalendarDialog
        open={open}
        onClose={() => setOpen(false)}
        overlays={overlays}
        setOverlays={setOverlays}
        lunarRepeat={lunarRepeat}
        setLunarRepeat={setLunarRepeat}
      />
    </div>
  );
}

export function SecondaryCalendarDialog({
  open,
  onClose,
  overlays,
  setOverlays,
  lunarRepeat,
  setLunarRepeat,
}: {
  open: boolean;
  onClose: () => void;
  overlays: CalendarOverlays;
  setOverlays: (next: CalendarOverlays) => void;
  lunarRepeat: LunarRepeat;
  setLunarRepeat: (next: LunarRepeat) => void;
}) {
  const t = useTriText();
  return (
    <Modal open={open} onClose={onClose} labelledBy="alt-cal-title">
      <div className="flex flex-col gap-4">
        <h2 id="alt-cal-title" className="text-xl font-semibold">
          <Tri bm="Kalendar kedua" zh="副历" en="Secondary calendars" />
        </h2>
        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Tunjukkan tarikh kalendar lain di dalam petak — pilihan anda, diingati pada peranti ini."
            zh="在日历格子里同时显示别的历法 —— 由你们自己选，这台设备会记住。"
            en="Show another calendar's dates inside the grid — your choice, remembered on this device."
          />
        </p>

        <label className="flex cursor-pointer items-center gap-2.5 text-base">
          <input
            type="checkbox"
            checked={overlays.lunar}
            onChange={(e) => setOverlays({ ...overlays, lunar: e.target.checked })}
            className="size-5 accent-[color:var(--v2-primary)]"
          />
          <Tri bm="Lunar Cina (农历)" zh="农历" en="Chinese lunar (农历)" />
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-base">
          <input
            type="checkbox"
            checked={overlays.hijri}
            onChange={(e) => setOverlays({ ...overlays, hijri: e.target.checked })}
            className="size-5 accent-[color:var(--v2-primary)]"
          />
          <Tri bm="Kalendar Hijrah" zh="伊斯兰历（希吉来历）" en="Hijri calendar" />
        </label>
        {/* C-2 (work order 51): national holidays, derived by code — free. */}
        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-center gap-2.5 text-base">
            <input
              type="checkbox"
              checked={overlays.holidays === true}
              onChange={(e) =>
                setOverlays({ ...overlays, holidays: e.target.checked })
              }
              className="size-5 accent-[color:var(--v2-primary)]"
            />
            🇲🇾{" "}
            <Tri
              bm="Cuti umum Malaysia (kebangsaan)"
              zh="马来西亚公共假期（全国）"
              en="Malaysia public holidays (national)"
            />
          </label>
          <p className="pl-7 text-sm text-muted-foreground">
            <Tri
              bm="Cuti kebangsaan sahaja — cuti negeri tidak termasuk. Tarikh Islam tertakluk kepada pengumuman rasmi."
              zh="只含全国假期，州属假期不在内。伊斯兰历的日期以官方宣布为准（可能差一天）。"
              en="National holidays only — state holidays are not included. Islamic dates follow the official announcement and can shift a day."
            />
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-[color:var(--v2-border)] p-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-base font-medium">
            <input
              type="checkbox"
              checked={lunarRepeat.on}
              onChange={(e) => setLunarRepeat({ ...lunarRepeat, on: e.target.checked })}
              className="size-5 accent-[color:var(--v2-primary)]"
            />
            🔁{" "}
            <Tri
              bm="Acara berulang: hari lunar setiap bulan"
              zh="重复活动：每月农历初一/十五"
              en="Recurring: lunar days each month"
            />
          </label>
          {lunarRepeat.on && (
            <div className="flex flex-wrap items-end gap-3 pl-7">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  <Tri bm="Hari" zh="哪几天" en="Which days" />
                </span>
                <select
                  value={lunarRepeat.days}
                  onChange={(e) =>
                    setLunarRepeat({
                      ...lunarRepeat,
                      days: e.target.value as LunarRepeatDays,
                    })
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-base"
                >
                  <option value="both">{t("1 & 15 lunar", "初一和十五", "Lunar 1st & 15th")}</option>
                  <option value="1">{t("1 lunar sahaja", "只有初一", "Lunar 1st only")}</option>
                  <option value="15">{t("15 lunar sahaja", "只有十五", "Lunar 15th only")}</option>
                </select>
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  <Tri bm="Apa yang ditulis" zh="写什么（你们的叫法）" en="What it says (your word)" />
                </span>
                <input
                  value={lunarRepeat.title}
                  onChange={(e) => setLunarRepeat({ ...lunarRepeat, title: e.target.value })}
                  maxLength={30}
                  placeholder={t("cth: sembahyang", "例：拜拜", "e.g. offerings")}
                  className="rounded-md border border-input bg-background px-3 py-2 text-base"
                />
              </label>
            </div>
          )}
          <p className="pl-7 text-sm text-muted-foreground">
            <Tri
              bm="Hari-hari ini muncul dalam grid dan senarai “Akan datang” — dikira oleh kod, percuma."
              zh="这些日子会出现在日历格和「即将到来」列表 —— 程序算的，免费。"
              en="These days appear in the grid and the Upcoming list — computed by code, free."
            />
          </p>
        </div>

        <Button variant="ghost" className="self-end" onClick={onClose}>
          <Tri bm="Selesai" zh="完成" en="Done" />
        </Button>
      </div>
    </Modal>
  );
}
