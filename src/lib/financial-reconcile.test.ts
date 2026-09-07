import { describe, expect, it } from "vitest";
import { mismatchNote, reconcileExtraction, reconcileFigures } from "./financial-reconcile";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "./extraction";

// 125 §4 — the treasurer's report adds itself up, in integer sen, and no
// figure is ever changed. The numbers are the SHAPE of J's page; fictional.

describe("🔴 125 §4 — reconcileFigures", () => {
  it("J's page: 7,680 + 13,600 − 10,150 = 11,130 ≠ 11,590 → mismatch of 460", () => {
    expect(
      reconcileFigures({
        openingCents: 768000,
        incomeCents: [1360000],
        expenseCents: [1015000],
        statedClosingCents: 1159000,
      }),
    ).toEqual({ status: "mismatch", computedCents: 1113000, statedCents: 1159000, diffCents: 46000 });
  });

  it("a page that balances is balanced — and says nothing else", () => {
    expect(
      reconcileFigures({
        openingCents: 768000,
        incomeCents: [1000000, 360000],
        expenseCents: [500000, 515000],
        statedClosingCents: 1113000,
      }),
    ).toEqual({ status: "balanced", computedCents: 1113000 });
  });

  it("any of the four parts missing → not applicable", () => {
    expect(reconcileFigures({ openingCents: null, incomeCents: [1], expenseCents: [1], statedClosingCents: 1 }).status).toBe("not_applicable");
    expect(reconcileFigures({ openingCents: 1, incomeCents: [1], expenseCents: [1], statedClosingCents: null }).status).toBe("not_applicable");
    expect(reconcileFigures({ openingCents: 1, incomeCents: [], expenseCents: [], statedClosingCents: 1 }).status).toBe("not_applicable");
  });

  it("a negative result and large numbers stay exact integer sen", () => {
    expect(
      reconcileFigures({ openingCents: 100, incomeCents: [], expenseCents: [500], statedClosingCents: -400 }),
    ).toEqual({ status: "balanced", computedCents: -400 });
    expect(
      reconcileFigures({
        openingCents: 123456789012,
        incomeCents: [1],
        expenseCents: [2],
        statedClosingCents: 123456789011,
      }),
    ).toEqual({ status: "balanced", computedCents: 123456789011 });
    // The sign of the difference says which way the page is off.
    expect(
      reconcileFigures({ openingCents: 1000, incomeCents: [100], expenseCents: [200], statedClosingCents: 800 }),
    ).toMatchObject({ status: "mismatch", computedCents: 900, diffCents: -100 });
  });

  it("a non-integer is refused, never rounded", () => {
    expect(reconcileFigures({ openingCents: 1.5, incomeCents: [1], expenseCents: [], statedClosingCents: 2 }).status).toBe("not_applicable");
  });
});

describe("125 §4 — over an extraction, by the reader's role labels", () => {
  const fig = (description: string, cents: number | null, role?: string) => ({
    description: { value: description, confidence: "confirmed" as const, source_ref: { location: "p1", snippet: description } },
    amount_cents: {
      value: cents,
      confidence: (cents === null ? "missing" : "confirmed") as "missing" | "confirmed",
      source_ref: cents === null ? null : { location: "p1", snippet: String(cents) },
    },
    ...(role ? { role: role as "opening" | "income" | "expense" | "closing" | "other" } : {}),
  });

  it("the shape of J's page → mismatch 460", () => {
    const e: MeetingNotesExtraction = {
      ...emptyMeetingNotesExtraction,
      figures: [
        fig("上年结存", 768000, "opening"),
        fig("收入: 会费", 1360000, "income"),
        fig("支出", 1015000, "expense"),
        fig("银行", 1159000, "closing"),
        fig("晚宴预算", 915000, "other"),
      ],
    };
    expect(reconcileExtraction(e)).toMatchObject({ status: "mismatch", diffCents: 46000 });
  });

  it("no roles (old data) or two closings → not applicable, no card", () => {
    expect(
      reconcileExtraction({ ...emptyMeetingNotesExtraction, figures: [fig("a", 1), fig("b", 2)] }).status,
    ).toBe("not_applicable");
    expect(
      reconcileExtraction({
        ...emptyMeetingNotesExtraction,
        figures: [fig("a", 1, "opening"), fig("b", 2, "closing"), fig("c", 3, "closing"), fig("d", 1, "income")],
      }).status,
    ).toBe("not_applicable");
  });

  it("an amount still missing is left out of the sum (and can make the check not applicable)", () => {
    expect(
      reconcileExtraction({
        ...emptyMeetingNotesExtraction,
        figures: [fig("a", null, "opening"), fig("b", 2, "closing"), fig("c", 3, "income")],
      }).status,
    ).toBe("not_applicable");
  });
});

describe("125 §4-3 — the acknowledged-mismatch note", () => {
  const r = { status: "mismatch" as const, computedCents: 1113000, statedCents: 1159000, diffCents: 46000 };
  it("prints in the document's language, with the three amounts", () => {
    expect(mismatchNote("bm", r)).toBe(
      "Nota: angka di atas disalin seperti tertulis; baki yang dikira RM11,130.00 berbeza daripada baki tertulis RM11,590.00 sebanyak RM460.00, dan perkara ini telah diambil maklum.",
    );
    expect(mismatchNote("zh", r)).toContain("RM460.00");
    expect(mismatchNote("en", r)).toContain("differs from the stated RM11,590.00 by RM460.00");
  });
});
