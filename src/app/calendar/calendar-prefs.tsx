"use client";

import { useEffect } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { LunarRepeatDays } from "@/lib/lunar";

// ---------------------------------------------------------------------------
// CALENDAR DEVICE PREFERENCES (launch feedback #13/#15, 2026-08-27 evening).
//
// #15: secondary calendars are OPT-IN. The grid starts plain Gregorian; a
// "+ secondary calendar" control adds 农历 (Chinese lunar) and/or the Hijri
// calendar. Dot-prefix keys: device preferences, not records.
//
// #13: the lunar-recurring rule (每月初一/十五 · your own word, e.g. 拜拜)
// replaced the fixed 献供 toggle. The old boolean key is adopted once.
//
// These hooks are used on /calendar AND /calendar/add — different routes,
// never mounted at the same time, so the two-copies-of-one-key trap
// (STATE §6) does not bite here.
// ---------------------------------------------------------------------------

export type CalendarOverlays = {
  lunar: boolean;
  hijri: boolean;
  /** C-2 (work order 51): national public holidays, derived by code.
   *  Optional so a value stored before this existed still validates. */
  holidays?: boolean;
};

function isOverlays(parsed: unknown): boolean {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as CalendarOverlays).lunar === "boolean" &&
    typeof (parsed as CalendarOverlays).hijri === "boolean"
  );
}

export function useCalendarOverlays() {
  return usePersistentState<CalendarOverlays>(
    "minit.calendar.overlays.v1",
    { lunar: false, hijri: false, holidays: false },
    isOverlays,
  );
}

export type LunarRepeat = {
  on: boolean;
  /** The society's own word for the day (拜拜, 诵经…). */
  title: string;
  days: LunarRepeatDays;
};

function isLunarRepeat(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const p = parsed as LunarRepeat;
  return (
    typeof p.on === "boolean" &&
    typeof p.title === "string" &&
    (p.days === "both" || p.days === "1" || p.days === "15")
  );
}

/** Pre-#13 key: the fixed 献供 toggle (a bare boolean). Adopted once. */
const LEGACY_OFFERING_KEY = "minit.calendar.lunar-offering.v1";
const REPEAT_KEY = "minit.calendar.lunar-repeat.v1";

export function useLunarRepeat() {
  const [repeat, setRepeat, meta] = usePersistentState<LunarRepeat>(
    REPEAT_KEY,
    { on: false, title: "", days: "both" },
    isLunarRepeat,
  );
  // Adopt the old boolean toggle once, AFTER the stored value has loaded —
  // reading it during render would make the server and the client disagree.
  useEffect(() => {
    if (!meta.loaded) return;
    const id = setTimeout(() => {
      try {
        const legacy = window.localStorage.getItem(LEGACY_OFFERING_KEY);
        if (legacy === null) return;
        window.localStorage.removeItem(LEGACY_OFFERING_KEY);
        if (legacy === "true" && window.localStorage.getItem(REPEAT_KEY) === null) {
          setRepeat({ on: true, title: "献供 / persembahan", days: "both" });
        }
      } catch {
        /* storage unavailable — nothing to adopt */
      }
    }, 0);
    return () => clearTimeout(id);
    // setRepeat is stable; run once when loaded flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.loaded]);
  return [repeat, setRepeat, meta] as const;
}
