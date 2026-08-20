"use client";

import {
  buildIcs,
  googleCalendarUrl,
  icsDataUrl,
  type CalendarExportItem,
} from "@/lib/ics";

// "Add to calendar" for one deadline/event — pure links, like the wa.me
// pattern: a Google Calendar TEMPLATE link and a data-URL .ics download.
// No Google API, no OAuth. PDPA: callers only ever pass fixed deadline
// labels or the user's own event title.
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
      >
        ⬇️ .ics
      </a>
    </span>
  );
}
