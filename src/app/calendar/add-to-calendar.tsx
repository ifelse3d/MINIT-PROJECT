"use client";

import {
  buildIcs,
  googleCalendarUrl,
  icsDataUrl,
  type CalendarExportItem,
} from "@/lib/ics";
import { Tri } from "@/components/language-provider";

// "Add to calendar" for one deadline/event — pure links, like the wa.me
// pattern: a Google Calendar TEMPLATE link and a data-URL .ics download.
// No Google API, no OAuth. PDPA: callers only ever pass fixed deadline
// labels or the user's own event title.
//
// ⑤ (work order 89, J 8/30: 「ICS 是什麼我也不懂」): the download button
// says what it DOES ("add to your phone's calendar"), not what the file
// format is called. The href/download behaviour is byte-identical — only
// the words changed; the title still names .ics for the person who knows
// what that is (iPhone/Outlook open it natively).
export function AddToCalendar({ item }: { item: CalendarExportItem }) {
  const linkCls =
    "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href={googleCalendarUrl(item)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkCls}
      >
        📅 Google Calendar
      </a>
      <a
        href={icsDataUrl(buildIcs([item]))}
        download={`minit-${item.uidKey}.ics`}
        className={linkCls}
        title="iPhone / Outlook (.ics)"
      >
        📱{" "}
        <Tri
          bm="Masuk kalendar telefon"
          zh="加入手机日历"
          en="Add to phone calendar"
        />
      </a>
    </span>
  );
}
