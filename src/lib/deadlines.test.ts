import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  annualReturnDeadline,
  daysBetween,
  daysLeftTextBm,
  deadlineUrgency,
  monthEndIso,
  reminderWhatsappText,
  sortDeadlines,
  upcomingEinvoisDeadlines,
  type Deadline,
} from "./deadlines";

describe("date helpers", () => {
  it("addDaysIso crosses months and leap years correctly", () => {
    expect(addDaysIso("2026-06-14", 60)).toBe("2026-08-13");
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29"); // leap
    expect(addDaysIso("2025-02-28", 1)).toBe("2025-03-01"); // non-leap
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-07-12", "2026-07-15")).toBe(3);
    expect(daysBetween("2026-07-12", "2026-07-10")).toBe(-2);
    expect(daysBetween("2026-07-12", "2026-07-12")).toBe(0);
  });

  it("monthEndIso handles 28/29/30/31-day months", () => {
    expect(monthEndIso("2026-07-12")).toBe("2026-07-31");
    expect(monthEndIso("2026-06-01")).toBe("2026-06-30");
    expect(monthEndIso("2026-02-10")).toBe("2026-02-28");
    expect(monthEndIso("2028-02-10")).toBe("2028-02-29");
  });

  it("rejects invalid dates", () => {
    expect(() => addDaysIso("12/07/2026", 1)).toThrow();
    expect(() => addDaysIso("2026-13-40", 1)).toThrow();
  });
});

describe("annualReturnDeadline", () => {
  it("is exactly AGM date + 60 days with an audit-trail source", () => {
    const d = annualReturnDeadline("2026-06-14", "Lim Bee Hoon (Setiausaha)", "2026-06-20");
    expect(d.dueDateIso).toBe("2026-08-13");
    expect(d.kind).toBe("annual_return_60d");
    expect(d.source).toContain("2026-06-14");
    expect(d.source).toContain("Lim Bee Hoon");
    expect(d.status).toBe("open");
  });
});

describe("upcomingEinvoisDeadlines", () => {
  it("includes this month-end when still ahead, then the following months", () => {
    const ds = upcomingEinvoisDeadlines("2026-07-12", 3);
    expect(ds.map((d) => d.dueDateIso)).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"]);
  });

  it("still counts month-end when today IS month-end", () => {
    const ds = upcomingEinvoisDeadlines("2026-07-31", 2);
    expect(ds.map((d) => d.dueDateIso)).toEqual(["2026-07-31", "2026-08-31"]);
  });
});

describe("urgency + sorting", () => {
  const today = "2026-07-12";
  const mk = (dueDateIso: string, status: Deadline["status"] = "open"): Deadline => ({
    kind: "custom",
    dueDateIso,
    source: "test",
    status,
  });

  it("classifies overdue / due_soon / ok / done", () => {
    expect(deadlineUrgency(mk("2026-07-10"), today)).toBe("overdue");
    expect(deadlineUrgency(mk("2026-07-12"), today)).toBe("due_soon"); // today counts
    expect(deadlineUrgency(mk("2026-07-26"), today)).toBe("due_soon"); // boundary = 14 days
    expect(deadlineUrgency(mk("2026-07-27"), today)).toBe("ok");
    expect(deadlineUrgency(mk("2026-07-10", "done"), today)).toBe("done");
  });

  it("sorts overdue first, done last", () => {
    const sorted = sortDeadlines(
      [mk("2026-09-01"), mk("2026-07-01", "done"), mk("2026-07-05"), mk("2026-07-20")],
      today
    );
    expect(sorted.map((d) => d.dueDateIso)).toEqual([
      "2026-07-05",
      "2026-07-20",
      "2026-09-01",
      "2026-07-01",
    ]);
  });
});

describe("human wording", () => {
  it("daysLeftTextBm covers today / future / overdue", () => {
    const d: Deadline = { kind: "custom", dueDateIso: "2026-07-12", source: "", status: "open" };
    expect(daysLeftTextBm(d, "2026-07-12")).toContain("HARI INI");
    expect(daysLeftTextBm({ ...d, dueDateIso: "2026-07-20" }, "2026-07-12")).toContain("8 hari lagi");
    expect(daysLeftTextBm({ ...d, dueDateIso: "2026-07-08" }, "2026-07-12")).toContain("LEWAT 4 hari");
  });

  it("reminder text carries org, labels, due date — and no invented facts", () => {
    const d = annualReturnDeadline("2026-06-14", "Lim Bee Hoon", "2026-06-20");
    const txt = reminderWhatsappText(d, "2026-07-12", "Persatuan Contoh");
    expect(txt).toContain("Persatuan Contoh");
    expect(txt).toContain("2026-08-13");
    expect(txt).toContain("Penyata Tahunan ROS");
    expect(txt).toContain("dijana oleh Minit");
  });
});
