import { describe, expect, it } from "vitest";
import { aiLine, minutesLine, moneyLine, statementLine } from "./home-card-lines";

// The three-case rule the home cards turn on. The interesting one is the
// middle: a society with nothing must not be told its records could not be
// read, and a failed read must not be reported as "you have nothing".

describe("home card status lines", () => {
  describe("unreadable figures produce NO line", () => {
    it("minutes", () => expect(minutesLine(null)).toBeNull());
    it("money", () => expect(moneyLine(null)).toBeNull());
    it("statement", () => expect(statementLine(null)).toBeNull());
    it("ai, either half missing", () => {
      expect(aiLine(null, 15)).toBeNull();
      expect(aiLine(3, null)).toBeNull();
    });
  });

  describe("a brand-new society gets an invitation, never a zero", () => {
    it("minutes", () => {
      const line = minutesLine(0)!;
      expect(line.en).toBe("No minutes yet — start with a photo");
      // The zero must not appear as a figure in any of the three languages.
      expect(`${line.bm}${line.zh}${line.en}`).not.toContain("0");
    });

    it("money", () => {
      const line = moneyLine(0)!;
      expect(line.en).toBe("Nothing recorded this month");
      expect(`${line.bm}${line.zh}${line.en}`).not.toContain("0");
    });

    it("statement, when the tables were readable and hold nothing", () => {
      const line = statementLine({ latestMonth: null })!;
      expect(line.en).toBe("Nothing to report yet");
    });
  });

  describe("real figures", () => {
    it("counts drafts, and says draft/drafts correctly", () => {
      expect(minutesLine(1)!.en).toBe("1 draft unsigned");
      expect(minutesLine(3)!.en).toBe("3 drafts unsigned");
      expect(minutesLine(3)!.zh).toBe("3 份草稿还没签");
    });

    it("formats money with the app's one formatter", () => {
      expect(moneyLine(845000)!.en).toBe("RM8,450.00 in this month");
      expect(moneyLine(845000)!.zh).toContain("RM8,450.00");
    });

    it("prints the month as YYYY-MM, the form the filing uses", () => {
      expect(statementLine({ latestMonth: "2026-08" })!.en).toBe("Latest record 2026-08");
    });

    it("shows what is left against the whole allowance", () => {
      expect(aiLine(11, 15)!.en).toBe("11 of 15 asks left");
    });

    // A used-up quota is a real state, and zero left is a number worth
    // printing — unlike zero minutes, it is not an empty society.
    it("prints a spent quota rather than hiding it", () => {
      expect(aiLine(0, 15)!.en).toBe("0 of 15 asks left");
    });
  });

  it("every line carries all three languages (Hard Rule 9)", () => {
    const lines = [
      minutesLine(0),
      minutesLine(2),
      moneyLine(0),
      moneyLine(12345),
      statementLine({ latestMonth: null }),
      statementLine({ latestMonth: "2026-08" }),
      aiLine(1, 15),
    ];
    for (const line of lines) {
      expect(line).not.toBeNull();
      expect(line!.bm.trim()).not.toBe("");
      expect(line!.zh.trim()).not.toBe("");
      expect(line!.en.trim()).not.toBe("");
    }
  });
});
