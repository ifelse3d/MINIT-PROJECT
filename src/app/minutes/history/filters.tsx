"use client";

import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { MEETING_TYPES, meetingTypeUiLabelTri } from "@/lib/meeting-types";

// ---------------------------------------------------------------------------
// Finding the June meeting.
//
// J's UX list, N5 (2026-08-07): "找旧会议记录难" — /minutes/history existed, but
// its only entrance was a link buried inside step 3 of the review page, and once
// you got there it was an unfiltered list of everything, newest first. A society
// that has been running Minit for a year has a hundred sets of minutes in there.
//
// A plain GET form, not a client-side filter: the server does the filtering
// (inside RLS), the result has a URL you can bookmark or send to the auditor,
// the browser's back button behaves, and it works with JavaScript off. The only
// reason this file is a client component at all is the reset button.
// ---------------------------------------------------------------------------

const field =
  "min-h-11 rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function MinutesFilters({
  type,
  from,
  to,
  q,
  active,
}: {
  type: string;
  from: string;
  to: string;
  q: string;
  /** True when any filter is set, so "clear" only appears when it does something. */
  active: boolean;
}) {
  const t = useTriText();
  return (
    <form
      method="get"
      action="/minutes/history"
      className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/60 p-4 dark:bg-white/5"
    >
      {/* C-6: w-full + min-w-0, or the select's longest option (the full BM
          meeting names ride along in every language — G-4) sets its intrinsic
          width and drags the whole page sideways on a 375px phone. */}
      <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Jenis mesyuarat" zh="会议类型" en="Meeting type" />
        </span>
        <select name="type" defaultValue={type} className={`${field} w-full min-w-0 sm:w-auto sm:max-w-72`}>
          <option value="">{t("Semua jenis", "全部类型", "All types")}</option>
          {MEETING_TYPES.map((mt) => {
            const l = meetingTypeUiLabelTri(mt);
            return (
              <option key={mt} value={mt}>
                {t(l.bm, l.zh, l.en)}
              </option>
            );
          })}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Dari tarikh" zh="从哪一天" en="From" />
        </span>
        <input type="date" name="from" defaultValue={from} className={field} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Hingga" zh="到哪一天" en="To" />
        </span>
        <input type="date" name="to" defaultValue={to} className={field} />
      </label>

      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Cari perkataan" zh="搜内容" en="Find words" />
        </span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t(
            "cth. tapak baharu",
            "例如：新场地",
            "e.g. new premises",
          )}
          className={field}
        />
      </label>

      <Button type="submit" size="lg" className="text-base">
        <Tri bm="Cari" zh="查找" en="Search" />
      </Button>
      {active && (
        <Button type="button" variant="outline" size="lg" asChild>
          {/* A link, not a reset(): reset() would restore the values the SERVER
              rendered, i.e. the filters that are already applied — which looks
              like a button that does nothing. */}
          <a href="/minutes/history">
            <Tri bm="Kosongkan" zh="清掉条件" en="Clear" />
          </a>
        </Button>
      )}
    </form>
  );
}
