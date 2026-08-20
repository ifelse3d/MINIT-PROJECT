import { describe, expect, it } from "vitest";
import { formatDateLong, isIsoDate, toIsoDate } from "@/lib/date-input";

// The exact value J typed on 2026-08-20, and what it has to become.
describe("what a person types becomes the stored date", () => {
  it("reads the value that broke the whole flow", () => {
    expect(toIsoDate("2/2/2026")).toBe("2026-02-02");
  });

  it("reads day-first with any of the three separators", () => {
    expect(toIsoDate("14/6/2026")).toBe("2026-06-14");
    expect(toIsoDate("14-6-2026")).toBe("2026-06-14");
    expect(toIsoDate("14.06.2026")).toBe("2026-06-14");
  });

  it("passes the stored format through unchanged", () => {
    expect(toIsoDate("2026-06-14")).toBe("2026-06-14");
    expect(toIsoDate(" 2026-6-4 ")).toBe("2026-06-04");
  });

  // 🔴 Malaysia writes the day first. 3/12/2026 is 3 December, and if that is
  // wrong the person has to be able to SEE it — which is what formatDateLong
  // is for. The parser must never quietly choose the other reading.
  it("is day-first, not month-first", () => {
    expect(toIsoDate("3/12/2026")).toBe("2026-12-03");
  });

  it("refuses a date that does not exist instead of rolling it forward", () => {
    expect(toIsoDate("31/2/2026")).toBeNull();
    expect(toIsoDate("2026-02-31")).toBeNull();
    expect(toIsoDate("32/1/2026")).toBeNull();
    expect(toIsoDate("1/13/2026")).toBeNull();
  });

  it("refuses anything it cannot read, rather than guessing", () => {
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate("event meeting")).toBeNull();
    expect(toIsoDate("2 Feb 2026")).toBeNull();
    expect(toIsoDate("2/2/26")).toBeNull();
  });
});

describe("the date written back in words", () => {
  it("spells the month out in all three languages", () => {
    expect(formatDateLong("2026-02-02", "bm")).toBe("2 Februari 2026");
    expect(formatDateLong("2026-02-02", "zh")).toBe("2026年2月2日");
    expect(formatDateLong("2026-02-02", "en")).toBe("2 February 2026");
  });

  it("makes a swapped day and month visible", () => {
    expect(formatDateLong("2026-12-03", "en")).toBe("3 December 2026");
    expect(formatDateLong("2026-03-12", "en")).toBe("12 March 2026");
  });

  it("prints, it does not repair", () => {
    expect(formatDateLong("not a date", "bm")).toBe("not a date");
  });

  it("agrees with the schema about what the stored format is", () => {
    expect(isIsoDate("2026-02-02")).toBe(true);
    expect(isIsoDate("2026-2-2")).toBe(false);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2/2/2026")).toBe(false);
  });
});
