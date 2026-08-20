import { describe, expect, it } from "vitest";
import { DEADLINE_LABELS } from "./deadlines";
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  icsDataUrl,
  type CalendarExportItem,
} from "./ics";

const deadlineItem: CalendarExportItem = {
  // PDPA: title is the FIXED label, never donor names or document contents
  title: DEADLINE_LABELS.annual_return_60d.bm,
  dateIso: "2026-08-13",
  description: "Minit AGM 2026-06-14 disahkan",
  uidKey: "deadline-annual_return_60d-2026-08-13",
};

describe("googleCalendarUrl", () => {
  it("builds an all-day TEMPLATE link with exclusive end date", () => {
    const url = googleCalendarUrl(deadlineItem);
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("action")).toBe("TEMPLATE");
    expect(params.get("text")).toBe(DEADLINE_LABELS.annual_return_60d.bm);
    expect(params.get("dates")).toBe("20260813/20260814");
    expect(params.get("details")).toBe("Minit AGM 2026-06-14 disahkan");
  });

  it("end date rolls over month and year boundaries", () => {
    const dec = { ...deadlineItem, dateIso: "2026-12-31" };
    expect(new URL(googleCalendarUrl(dec)).searchParams.get("dates")).toBe("20261231/20270101");
  });

  it("rejects malformed dates", () => {
    expect(() => googleCalendarUrl({ ...deadlineItem, dateIso: "13/08/2026" })).toThrow();
  });
});

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma, and newlines", () => {
    expect(escapeIcsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    expect(escapeIcsText("line1\r\nline2")).toBe("line1\\nline2");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:hello")).toEqual(["SUMMARY:hello"]);
  });

  it("folds at 75 OCTETS without splitting a UTF-8 character", () => {
    // Chinese characters are 3 octets each in UTF-8
    const line = "SUMMARY:" + "社团注册局年度呈报".repeat(6);
    const folded = foldIcsLine(line);
    expect(folded.length).toBeGreaterThan(1);
    const octets = (s: string) => new TextEncoder().encode(s).length;
    for (const l of folded) expect(octets(l)).toBeLessThanOrEqual(75);
    // continuation lines start with a space; unfolding restores the original
    expect(folded.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded[0] + folded.slice(1).map((l) => l.slice(1)).join("")).toBe(line);
  });
});

describe("buildIcs", () => {
  it("emits a valid all-day VEVENT with deterministic UID", () => {
    const ics = buildIcs([deadlineItem]);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:minit-deadline-annual_return_60d-2026-08-13@minit.app\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260813\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260814\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // CRLF everywhere — no bare \n
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("is deterministic: same input, byte-identical output", () => {
    expect(buildIcs([deadlineItem])).toBe(buildIcs([deadlineItem]));
  });

  it("escapes user event titles", () => {
    const ics = buildIcs([
      { title: "Dinner; hall A, 7:30", dateIso: "2026-09-12", uidKey: "event-x-2026-09-12" },
    ]);
    expect(ics).toContain("SUMMARY:Dinner\\; hall A\\, 7:30");
  });

  it("output contains nothing beyond the given fields (PDPA guard)", () => {
    const ics = buildIcs([deadlineItem]);
    // The whole document is only structure + the item's own title/description/date
    const stripped = ics
      .replace(/\r\n /g, "") // unfold
      .split("\r\n")
      .filter(Boolean)
      .filter(
        (l) =>
          !/^(BEGIN|END|VERSION|PRODID|CALSCALE|METHOD|UID|DTSTAMP|DTSTART|DTEND):?/.test(l) &&
          !l.startsWith("SUMMARY:") &&
          !l.startsWith("DESCRIPTION:"),
      );
    expect(stripped).toEqual([]);
  });
});

describe("icsDataUrl", () => {
  it("is a text/calendar data URL that decodes back to the ics", () => {
    const ics = buildIcs([deadlineItem]);
    const url = icsDataUrl(ics);
    expect(url.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",").slice(1).join(","))).toBe(ics);
  });
});
