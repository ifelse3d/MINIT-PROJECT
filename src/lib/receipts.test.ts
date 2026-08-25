import { describe, expect, it } from "vitest";
import {
  allocateReceiptNos,
  buildWaMeLink,
  eligibleForReceipt,
  findDuplicateDonations,
  findSequenceGaps,
  isRegisterDonationArray,
  ledgerPageFullyRecorded,
  formatReceiptNo,
  normalizeMyPhone,
  parseReceiptNo,
  parseRmToCents,
  ReceiptNumberingError,
  receiptWhatsAppMessageBm,
  taxDeductibilityLineBm,
} from "@/lib/receipts";
import { ledgerExtractionSchema } from "@/lib/extraction";
import { sampleLedgerExtraction } from "@/lib/sample-ledger";

describe("receipt numbering (Hard Rule 2: sequential, gap-free, code-only)", () => {
  it("formats and parses round-trip", () => {
    const no = formatReceiptNo({ prefix: "MIN", year: 2026, seq: 7 });
    expect(no).toBe("MIN-2026-0007");
    expect(parseReceiptNo(no)).toEqual({ prefix: "MIN", year: 2026, seq: 7 });
  });

  it("grows past 4 digits without breaking", () => {
    const no = formatReceiptNo({ prefix: "MIN", year: 2026, seq: 12345 });
    expect(no).toBe("MIN-2026-12345");
    expect(parseReceiptNo(no)?.seq).toBe(12345);
  });

  it("allocates the first numbers from an empty series", () => {
    expect(allocateReceiptNos([], 3, { prefix: "MIN", year: 2026 })).toEqual([
      "MIN-2026-0001",
      "MIN-2026-0002",
      "MIN-2026-0003",
    ]);
  });

  it("continues an existing series", () => {
    const existing = ["MIN-2026-0001", "MIN-2026-0002"];
    expect(allocateReceiptNos(existing, 2, { prefix: "MIN", year: 2026 })).toEqual([
      "MIN-2026-0003",
      "MIN-2026-0004",
    ]);
  });

  it("ignores other years/prefixes when continuing", () => {
    const existing = ["MIN-2025-0009", "XYZ-2026-0004", "MIN-2026-0001"];
    expect(allocateReceiptNos(existing, 1, { prefix: "MIN", year: 2026 })).toEqual([
      "MIN-2026-0002",
    ]);
  });

  it("REFUSES to allocate over a gap (never silently renumbers)", () => {
    const existing = ["MIN-2026-0001", "MIN-2026-0003"];
    expect(findSequenceGaps(existing, "MIN", 2026)).toEqual([2]);
    expect(() => allocateReceiptNos(existing, 1, { prefix: "MIN", year: 2026 })).toThrow(
      ReceiptNumberingError
    );
  });

  it("rejects duplicate sequence numbers", () => {
    expect(() =>
      findSequenceGaps(["MIN-2026-0002", "MIN-2026-0002"], "MIN", 2026)
    ).toThrow(ReceiptNumberingError);
  });

  it("rejects non-positive sequences", () => {
    expect(() => formatReceiptNo({ prefix: "MIN", year: 2026, seq: 0 })).toThrow();
  });
});

describe("parseRmToCents (Hard Rule 2: typed money → cents deterministically)", () => {
  it("parses plain and decimal amounts", () => {
    expect(parseRmToCents("50")).toBe(5000);
    expect(parseRmToCents("50.5")).toBe(5050);
    expect(parseRmToCents("50.50")).toBe(5050);
    expect(parseRmToCents("0")).toBe(0);
  });
  it("tolerates RM prefix, spaces and thousands separators", () => {
    expect(parseRmToCents("RM 1,234.56")).toBe(123456);
    expect(parseRmToCents("  rm1000 ")).toBe(100000);
  });
  it("rejects junk, negatives and >2 decimal places", () => {
    expect(parseRmToCents("")).toBeNull();
    expect(parseRmToCents("abc")).toBeNull();
    expect(parseRmToCents("-5")).toBeNull();
    expect(parseRmToCents("5.123")).toBeNull();
    expect(parseRmToCents("5.")).toBeNull();
  });
});

describe("duplicate donation warning", () => {
  it("flags same donor + same day + same amount", () => {
    const rows = [
      { donorName: "Tan Ah Kow", donatedAtIso: "2026-06-07", amountCents: 5000 },
      { donorName: "Siti Aminah", donatedAtIso: "2026-06-07", amountCents: 5000 },
      { donorName: "tan  ah kow", donatedAtIso: "2026-06-07", amountCents: 5000 },
    ];
    expect(findDuplicateDonations(rows)).toEqual([[0, 2]]);
  });

  it("does not flag different days or amounts", () => {
    const rows = [
      { donorName: "Tan Ah Kow", donatedAtIso: "2026-06-07", amountCents: 5000 },
      { donorName: "Tan Ah Kow", donatedAtIso: "2026-06-08", amountCents: 5000 },
      { donorName: "Tan Ah Kow", donatedAtIso: "2026-06-07", amountCents: 5001 },
    ];
    expect(findDuplicateDonations(rows)).toEqual([]);
  });

  it("finds the deliberate duplicate in the sample ledger", () => {
    const rows = sampleLedgerExtraction.rows.map((r) => ({
      donorName: r.donor_name.value,
      donatedAtIso: r.donated_at.value,
      amountCents: r.amount_cents.value ?? -1,
    }));
    expect(findDuplicateDonations(rows)).toEqual([[0, 4]]);
  });
});

describe("wa.me links (v1 WhatsApp rule: deep links only)", () => {
  it("normalises Malaysian numbers", () => {
    expect(normalizeMyPhone("012-345 6789")).toBe("60123456789");
    expect(normalizeMyPhone("+60 16-888 2222")).toBe("60168882222");
    expect(normalizeMyPhone("60123456789")).toBe("60123456789");
  });

  it("returns null for non-mobile or malformed input", () => {
    expect(normalizeMyPhone("")).toBeNull();
    expect(normalizeMyPhone(null)).toBeNull();
    expect(normalizeMyPhone("03-1234 5678")).toBeNull(); // landline
    expect(normalizeMyPhone("abc")).toBeNull();
  });

  it("builds an encoded wa.me link, or null without a valid phone", () => {
    const link = buildWaMeLink("012-345 6789", "Resit RM50 & terima kasih");
    expect(link).toBe(
      `https://wa.me/60123456789?text=${encodeURIComponent("Resit RM50 & terima kasih")}`
    );
    expect(buildWaMeLink(null, "hi")).toBeNull();
  });
});

describe("tax-deductibility wording (Hard Rule 3)", () => {
  it("only s44_6 may imply deductibility", () => {
    expect(taxDeductibilityLineBm("s44_6")).toContain("44(6)");
    expect(taxDeductibilityLineBm("none")).toContain("BUKAN");
    expect(taxDeductibilityLineBm("pure_religious")).toContain("BUKAN");
  });

  it("the WhatsApp receipt message carries the non-deductible line by default", () => {
    const msg = receiptWhatsAppMessageBm({
      orgName: "Persatuan Contoh",
      receiptNo: "MIN-2026-0001",
      donorName: "Tan Ah Kow",
      amountCents: 5000,
      dateIso: "2026-06-07",
      purpose: "Derma bulanan",
      taxStatus: "none",
    });
    expect(msg).toContain("MIN-2026-0001");
    expect(msg).toContain("RM50.00");
    expect(msg).toContain("BUKAN");
  });
});

describe("ledger extraction contract + receipt eligibility", () => {
  it("the sample ledger passes the data contract", () => {
    expect(ledgerExtractionSchema.safeParse(sampleLedgerExtraction).success).toBe(true);
  });

  it("rows with check/missing name, amount or date are NOT receipt-eligible", () => {
    const eligible = sampleLedgerExtraction.rows.map(eligibleForReceipt);
    // Row 3 (index 2) is the smudged one — everything else qualifies.
    expect(eligible).toEqual([true, true, false, true, true, true]);
  });
});

// 0-1 (26 号报告 2-1): the money-side "already saved" state. When it is true,
// the next ledger photo must ASK "same page or a new one?" — appending a new
// page under rows already turned into receipts is how one donation gets two
// serial numbers.
describe("ledgerPageFullyRecorded", () => {
  const rows = sampleLedgerExtraction.rows; // index 2 is not receipt-eligible
  const everyEligible = new Set([0, 1, 3, 4, 5]);

  it("true once every eligible row is in the register (smudged rows do not block)", () => {
    expect(ledgerPageFullyRecorded(rows, everyEligible)).toBe(true);
  });

  it("false while any eligible row is still un-added", () => {
    expect(ledgerPageFullyRecorded(rows, new Set([0, 1, 3, 4]))).toBe(false);
  });

  it("false for an empty review and for a review where nothing was recorded", () => {
    // Empty: there is nothing on screen to protect, no question to ask.
    expect(ledgerPageFullyRecorded([], new Set())).toBe(false);
    // Rows present but none recorded: the review is simply unfinished work —
    // photographing another page is the ordinary page-by-page flow.
    expect(ledgerPageFullyRecorded(rows, new Set())).toBe(false);
  });
});

// 2026-08-23: moved here from money-review.tsx when /money was split into four
// pages. It is the ONLY thing standing between a stale localStorage blob and
// NaN money totals, so it gets real coverage now that it has a home.
describe("isRegisterDonationArray (localStorage shape guard)", () => {
  const good = {
    id: "d1",
    donorName: "Tan Ah Kow",
    donorPhone: null,
    amountCents: 5000,
    purpose: "Derma am",
    donatedAtIso: "2026-08-23",
    collector: "Bendahari",
    receiptNo: null,
    custodyStatus: "collected",
  };

  it("accepts an empty register and a well-formed one", () => {
    expect(isRegisterDonationArray([])).toBe(true);
    expect(isRegisterDonationArray([good])).toBe(true);
  });

  it("rejects anything that is not an array", () => {
    expect(isRegisterDonationArray(null)).toBe(false);
    expect(isRegisterDonationArray({ rows: [good] })).toBe(false);
    expect(isRegisterDonationArray("[]")).toBe(false);
  });

  it("rejects a row whose amount is not a finite number", () => {
    // The exact shape that produced NaN totals: JSON.stringify writes NaN as
    // null, so a corrupted amount comes back as null, not as NaN.
    expect(isRegisterDonationArray([{ ...good, amountCents: null }])).toBe(false);
    expect(isRegisterDonationArray([{ ...good, amountCents: "50.00" }])).toBe(false);
  });

  it("rejects an unknown custody status", () => {
    expect(isRegisterDonationArray([{ ...good, custodyStatus: "banked" }])).toBe(false);
  });

  it("rejects when ONE row in a long register is bad", () => {
    expect(isRegisterDonationArray([good, good, { ...good, donorName: 42 }])).toBe(false);
  });
});
