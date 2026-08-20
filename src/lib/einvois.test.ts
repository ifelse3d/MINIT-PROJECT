import { describe, expect, it } from "vitest";
import {
  buildMonthEndPack,
  CLASS_CODE_CONSOLIDATED,
  CLASS_CODE_DONATION,
  consolidatedDeadlineIso,
  EINVOIS_MAX_DOCS_PER_FILE,
  EInvoisError,
  INDIVIDUAL_EINVOICE_THRESHOLD_CENTS,
  monthEndSummary,
} from "@/lib/einvois";
import type { RegisterDonation } from "@/lib/receipts";

function donation(over: Partial<RegisterDonation>): RegisterDonation {
  return {
    id: Math.random().toString(36).slice(2),
    donorName: "Tan Ah Kow",
    donorPhone: null,
    amountCents: 5000,
    purpose: "Derma",
    donatedAtIso: "2026-06-07",
    collector: "Lim",
    receiptNo: "MIN-2026-0001",
    custodyStatus: "settled",
    ...over,
  };
}

describe("month-end e-Invois consolidation (Hard Rule 2: code sums, never AI)", () => {
  it("consolidates small donations into one document with the correct total", () => {
    const pack = buildMonthEndPack(
      [
        donation({ receiptNo: "MIN-2026-0001", amountCents: 5000 }),
        donation({ receiptNo: "MIN-2026-0002", amountCents: 10000 }),
        donation({ receiptNo: "MIN-2026-0003", amountCents: 30000, donatedAtIso: "2026-06-21" }),
      ],
      { month: "2026-06", orgName: "Persatuan Contoh" }
    );
    expect(pack.consolidated).toHaveLength(3);
    expect(pack.individual).toHaveLength(0);
    expect(pack.consolidatedTotalCents).toBe(45000);
    expect(pack.grandTotalCents).toBe(45000);
    expect(pack.files).toHaveLength(1);
    const row = pack.files[0][0];
    expect(row.invoiceType).toBe("consolidated");
    expect(row.buyerName).toBe("General Public");
    expect(row.amountCents).toBe(45000);
    expect(row.description).toContain("MIN-2026-0001 – MIN-2026-0003");
    expect(row.invoiceDateIso).toBe("2026-06-30"); // last day of the month
    // LHDN SDK: consolidated summary line uses code 004, not the donation code 007.
    expect(row.classificationCode).toBe(CLASS_CODE_CONSOLIDATED);
    expect(CLASS_CODE_CONSOLIDATED).toBe("004");
    expect(CLASS_CODE_DONATION).toBe("007");
  });

  it("computes the consolidated submission deadline as 7 days after month-end", () => {
    expect(consolidatedDeadlineIso("2026-06")).toBe("2026-07-07");
    expect(consolidatedDeadlineIso("2026-12")).toBe("2027-01-07");
    expect(consolidatedDeadlineIso("2026-02")).toBe("2026-03-07");
  });

  it("routes RM10,000+ donations to the individual path with donor identity", () => {
    const pack = buildMonthEndPack(
      [
        donation({ receiptNo: "MIN-2026-0001", amountCents: 5000 }),
        donation({
          receiptNo: "MIN-2026-0002",
          amountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS + 200000, // RM12,000
          donorName: "Syarikat Maju Hardware Sdn Bhd",
        }),
      ],
      { month: "2026-06", orgName: "Persatuan Contoh" }
    );
    expect(pack.individual).toHaveLength(1);
    expect(pack.consolidatedTotalCents).toBe(5000);
    expect(pack.grandTotalCents).toBe(5000 + 1200000);
    const individualRow = pack.files[0].find((r) => r.invoiceType === "individual");
    expect(individualRow?.buyerName).toBe("Syarikat Maju Hardware Sdn Bhd");
    expect(individualRow?.buyerTin).toBe(""); // treasurer fills — never invented
  });

  it("excludes other months and boundary-checks exactly RM10,000", () => {
    const pack = buildMonthEndPack(
      [
        donation({ receiptNo: "MIN-2026-0001", donatedAtIso: "2026-05-31" }),
        donation({
          receiptNo: "MIN-2026-0002",
          amountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS, // exactly RM10,000 ⇒ individual
        }),
      ],
      { month: "2026-06", orgName: "P" }
    );
    expect(pack.consolidated).toHaveLength(0);
    expect(pack.individual).toHaveLength(1);
  });

  it("splits into multiple files past the 100-document limit", () => {
    const many = Array.from({ length: EINVOIS_MAX_DOCS_PER_FILE + 5 }, (_, i) =>
      donation({
        receiptNo: `MIN-2026-${String(i + 1).padStart(4, "0")}`,
        amountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS, // all individual ⇒ 105 docs
      })
    );
    const pack = buildMonthEndPack(many, { month: "2026-06", orgName: "P" });
    expect(pack.files).toHaveLength(2);
    expect(pack.files[0]).toHaveLength(EINVOIS_MAX_DOCS_PER_FILE);
    expect(pack.files[1]).toHaveLength(5);
  });

  it("refuses a month with unreceipted donations", () => {
    expect(() =>
      buildMonthEndPack([donation({ receiptNo: null })], { month: "2026-06", orgName: "P" })
    ).toThrow(EInvoisError);
  });

  it("rejects a malformed month", () => {
    expect(() => buildMonthEndPack([], { month: "June 2026", orgName: "P" })).toThrow(
      EInvoisError
    );
  });

  it("summary states counts, totals and the manual-upload steps", () => {
    const pack = buildMonthEndPack(
      [donation({ receiptNo: "MIN-2026-0001", amountCents: 45000 })],
      { month: "2026-06", orgName: "Persatuan Contoh" }
    );
    const text = monthEndSummary(pack, "Persatuan Contoh");
    expect(text).toContain("RM450.00");
    expect(text).toContain("MyInvois Portal");
    expect(text).toContain("Batch Upload");
  });
});

// ---------------------------------------------------------------------------
// 2026-07-28 audit: the consolidated document's description used to print a
// RANGE (first – last) of the consolidated subset. Donations at/above RM10,000
// are filed SEPARATELY but their receipt numbers can sit numerically between the
// consolidated ones, so the range claimed to cover a receipt that was also filed
// on its own — LHDN would see it twice, and the range contradicted the count.
// It now prints contiguous sub-ranges, sorted numerically (not lexicographically).
// ---------------------------------------------------------------------------
describe("consolidated receipt coverage (audit regression)", () => {
  function donation(
    receiptNo: string,
    amountCents: number,
  ): RegisterDonation {
    return {
      id: receiptNo,
      donorName: "X",
      donorPhone: null,
      amountCents,
      purpose: "derma",
      donatedAtIso: "2026-07-10",
      collector: "C",
      receiptNo,
      custodyStatus: "collected",
      source: "ledger",
    };
  }

  it("never claims a receipt that is filed as an individual document", () => {
    const pack = buildMonthEndPack(
      [
        donation("MIN-2026-0001", 5_000),
        donation("MIN-2026-0002", 5_000),
        donation("MIN-2026-0003", 2_000_000), // RM20,000 → its own document
        donation("MIN-2026-0004", 5_000),
        donation("MIN-2026-0005", 5_000),
      ],
      { month: "2026-07", orgName: "Persatuan Ujian" },
    );
    const consolidatedRow = pack.files[0].find(
      (r) => r.invoiceType === "consolidated",
    );
    expect(consolidatedRow).toBeDefined();
    // 0003 is filed separately, so it must NOT appear inside the coverage text.
    expect(consolidatedRow!.description).not.toContain("MIN-2026-0003");
    expect(consolidatedRow!.description).toContain("MIN-2026-0001 – MIN-2026-0002");
    expect(consolidatedRow!.description).toContain("MIN-2026-0004 – MIN-2026-0005");
    // And the stated count still matches the rows actually consolidated.
    expect(consolidatedRow!.description).toContain("(4 resit)");
  });

  it("sorts by sequence number, not as text (breaks at 5 digits)", () => {
    const pack = buildMonthEndPack(
      [donation("MIN-2026-10000", 5_000), donation("MIN-2026-9999", 5_000)],
      { month: "2026-07", orgName: "Persatuan Ujian" },
    );
    const row = pack.files[0].find((r) => r.invoiceType === "consolidated")!;
    // Lexicographic sorting would have produced "10000 – 9999".
    expect(row.description).toContain("MIN-2026-9999 – MIN-2026-10000");
  });
});

describe("assertMonth rejects impossible months (audit regression)", () => {
  it.each(["2026-13", "2026-00"])("rejects %s", (month) => {
    // Date's rollover silently resolved these to the wrong month, producing a
    // tax deadline for a month that does not exist.
    expect(() => consolidatedDeadlineIso(month)).toThrow();
  });
});
