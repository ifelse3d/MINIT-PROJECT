import { describe, expect, it } from "vitest";
import {
  einvoisXlsxBodySchema,
  receiptPdfBodySchema,
} from "./document-request";

// S0-1 (2026-08-25): the official-document routes must not accept CONTENT from
// the browser. These tests pin the contract: a malicious body that tries to
// smuggle donor facts either fails validation or has those fields provably
// stripped before the route can see them.

describe("receiptPdfBodySchema", () => {
  it("accepts a receipt number and nothing else", () => {
    const parsed = receiptPdfBodySchema.safeParse({ receiptNo: "MIN-2026-0001" });
    expect(parsed.success).toBe(true);
  });

  it("strips forged content fields from a malicious body", () => {
    // The pre-S0-1 attack: a signed-in user sends their own numbers and names
    // and gets an official PDF printing them.
    const parsed = receiptPdfBodySchema.safeParse({
      receiptNo: "MIN-2026-0001",
      donorName: "Invented Person",
      amountCents: 99_999_900,
      dateIso: "2026-01-01",
      purpose: "forged",
      collector: "nobody",
      orgName: "Someone Else's Temple",
      taxStatus: "s44_6",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // ONLY the receipt number survives — nothing else can reach the PDF.
      expect(Object.keys(parsed.data)).toEqual(["receiptNo"]);
    }
  });

  it("refuses a body with no receipt number", () => {
    expect(receiptPdfBodySchema.safeParse({}).success).toBe(false);
    expect(receiptPdfBodySchema.safeParse({ receiptNo: "" }).success).toBe(false);
    expect(receiptPdfBodySchema.safeParse(null).success).toBe(false);
  });
});

describe("einvoisXlsxBodySchema", () => {
  it("accepts month + fileIndex", () => {
    const parsed = einvoisXlsxBodySchema.safeParse({ month: "2026-07", fileIndex: 1 });
    expect(parsed.success).toBe(true);
  });

  it("strips a forged donations array from a malicious body", () => {
    // The pre-S0-1 attack: file a month of invented donations with the org's
    // real name on the submission file.
    const parsed = einvoisXlsxBodySchema.safeParse({
      month: "2026-07",
      donations: [
        {
          id: "x",
          donorName: "Invented Person",
          amountCents: 100,
          donatedAtIso: "2026-07-01",
          receiptNo: "MIN-2026-0001",
          custodyStatus: "collected",
        },
      ],
      orgName: "Someone Else's Temple",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort()).toEqual(["fileIndex", "month"]);
    }
  });

  it("refuses a malformed month", () => {
    expect(einvoisXlsxBodySchema.safeParse({ month: "2026-7" }).success).toBe(false);
    expect(einvoisXlsxBodySchema.safeParse({ month: "July 2026" }).success).toBe(false);
    expect(einvoisXlsxBodySchema.safeParse({}).success).toBe(false);
  });
});
