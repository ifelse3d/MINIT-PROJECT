import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import jsQR from "jsqr";
import { amountInWordsBm, numberToWordsBm } from "@/lib/receipts";
import {
  buildReceiptPdf,
  needsCjkFont,
  receiptBoxContent,
  winAnsiSafe,
  type ReceiptPdfParams,
} from "@/lib/receipt-pdf";
import { qrMatrixFromPdf } from "@/lib/qr-in-pdf";
import { rasterizeQrMatrix } from "@/lib/receipt-qr";

describe("numberToWordsBm", () => {
  it("handles units, teens and tens", () => {
    expect(numberToWordsBm(0)).toBe("kosong");
    expect(numberToWordsBm(5)).toBe("lima");
    expect(numberToWordsBm(10)).toBe("sepuluh");
    expect(numberToWordsBm(11)).toBe("sebelas");
    expect(numberToWordsBm(12)).toBe("dua belas");
    expect(numberToWordsBm(21)).toBe("dua puluh satu");
  });

  it("handles hundreds and thousands with se- forms", () => {
    expect(numberToWordsBm(100)).toBe("seratus");
    expect(numberToWordsBm(101)).toBe("seratus satu");
    expect(numberToWordsBm(250)).toBe("dua ratus lima puluh");
    expect(numberToWordsBm(1000)).toBe("seribu");
    expect(numberToWordsBm(12_000)).toBe("dua belas ribu");
    expect(numberToWordsBm(1_000_000)).toBe("satu juta");
    expect(numberToWordsBm(1_234_567)).toBe(
      "satu juta dua ratus tiga puluh empat ribu lima ratus enam puluh tujuh"
    );
  });

  it("rejects out-of-range input", () => {
    expect(() => numberToWordsBm(-1)).toThrow(RangeError);
    expect(() => numberToWordsBm(1.5)).toThrow(RangeError);
  });
});

describe("amountInWordsBm", () => {
  it("whole ringgit ends with sahaja", () => {
    expect(amountInWordsBm(5000)).toBe("Ringgit Malaysia: lima puluh sahaja");
    expect(amountInWordsBm(1_200_000)).toBe("Ringgit Malaysia: dua belas ribu sahaja");
  });

  it("includes sen when present", () => {
    expect(amountInWordsBm(1_200_050)).toBe(
      "Ringgit Malaysia: dua belas ribu dan lima puluh sen"
    );
  });

  it("rejects negative or fractional cents", () => {
    expect(() => amountInWordsBm(-1)).toThrow(RangeError);
    expect(() => amountInWordsBm(10.5)).toThrow(RangeError);
  });
});

describe("winAnsiSafe", () => {
  it("keeps Latin text and common punctuation", () => {
    expect(winAnsiSafe("Resit Rasmi — RM50.00 'ok'")).toBe("Resit Rasmi — RM50.00 'ok'");
  });

  it("replaces CJK with ? instead of crashing the font", () => {
    expect(winAnsiSafe("Derma 香油钱")).toBe("Derma ???");
  });
});

const baseParams: ReceiptPdfParams = {
  orgName: "Pertubuhan Contoh Bakti",
  orgRegistrationNo: "PPM-000-00-00000000",
  receiptNo: "MIN-2026-0001",
  donorName: "Tan Ah Kow",
  amountCents: 5000,
  dateIso: "2026-06-07",
  purpose: "Derma bulanan / 香油钱",
  collector: "Lim Bee Hoon (Pemungut / Collector)",
  taxStatus: "none",
  confirmedBy: "Bendahari Contoh",
  confirmedOnIso: "2026-07-10",
};

describe("needsCjkFont", () => {
  it("is false for BM/English text", () => {
    expect(needsCjkFont("Resit Rasmi — RM50.00")).toBe(false);
  });
  it("is true when Chinese characters are present", () => {
    expect(needsCjkFont("Derma 香油钱")).toBe(true);
  });
});

describe("buildReceiptPdf", () => {
  it("produces a loadable one-page PDF", async () => {
    const bytes = await buildReceiptPdf(baseParams);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain("MIN-2026-0001");
  });

  it("renders CJK content with an embedded subset font, and stays small", async () => {
    const bytes = await buildReceiptPdf({
      ...baseParams,
      donorName: "陈亚九 (Tan Ah Kow)",
      purpose: "香油钱",
    });
    expect(bytes.length).toBeGreaterThan(1000);
    // Per-receipt HarfBuzz subset: a CJK receipt must stay far below the
    // full ~10MB font. If this blows up, subsetting has silently stopped.
    expect(bytes.length).toBeLessThan(150_000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("large amounts render (individual e-invois path donation)", async () => {
    const bytes = await buildReceiptPdf({
      ...baseParams,
      amountCents: 1_200_000,
      taxStatus: "s44_6",
    });
    expect(bytes.length).toBeGreaterThan(1000);
  });

  // D-1 (拍板③): an in-kind receipt prints the ITEMS and never money — an
  // estimated value on the paper would read as cash received. The box
  // decision is a pure exported function precisely so this test can pin it
  // (the PDF content stream is compressed and cannot be grepped).
  it("in-kind receipts render the items and no ringgit figure", async () => {
    const params: ReceiptPdfParams = {
      ...baseParams,
      kind: "in_kind",
      itemDesc: "20 kampit beras / 白米 20 包",
      // amountCents deliberately non-zero: even a wrong caller value must not
      // reach the page on the in-kind path.
      amountCents: 123456,
    };
    const box = receiptBoxContent(params);
    expect(box.box).toBe("items");
    if (box.box === "items") {
      expect(box.items).toBe("20 kampit beras / 白米 20 包");
      expect(JSON.stringify(box)).not.toContain("RM");
      expect(JSON.stringify(box)).not.toContain("Ringgit");
    }
    // And the full document still renders.
    const bytes = await buildReceiptPdf(params);
    expect(bytes.length).toBeGreaterThan(1000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("cash receipts keep the money box (figure + words)", () => {
    const box = receiptBoxContent(baseParams);
    expect(box.box).toBe("money");
    if (box.box === "money") {
      expect(box.figure).toBe("RM50.00");
      expect(box.words).toContain("Ringgit Malaysia");
    }
  });

  // Work order 87 ①: the QR must be readable FROM THE BYTES by a real
  // decoder — extracted with the content-stream interpreter, then handed to
  // jsQR. A QR that only "was drawn" is not a QR.
  it("with verifyUrl, prints a QR a real decoder reads back", async () => {
    const url =
      "http://localhost:3000/verify/resit?t=eyJvIjoxNSwibiI6Ik1JTi0yMDI2LTAwMDEifQ.c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWduYXR1cmUtc2ln";
    const bytes = await buildReceiptPdf({ ...baseParams, verifyUrl: url });
    const matrix = qrMatrixFromPdf(bytes);
    expect(matrix).not.toBeNull();
    const { data, width, height } = rasterizeQrMatrix(matrix!);
    const decoded = jsQR(data, width, height);
    expect(decoded?.data).toBe(url);
  });

  // …and on a CJK receipt too (the caption adds Chinese text near the QR).
  it("QR survives on a CJK receipt", async () => {
    const url = "http://localhost:3000/verify/resit?t=abc.def";
    const bytes = await buildReceiptPdf({
      ...baseParams,
      donorName: "陈亚九",
      purpose: "香油钱",
      verifyUrl: url,
    });
    const matrix = qrMatrixFromPdf(bytes);
    expect(matrix).not.toBeNull();
    const { data, width, height } = rasterizeQrMatrix(matrix!);
    expect(jsQR(data, width, height)?.data).toBe(url);
  });

  it("without verifyUrl there is no QR (old receipts stay old)", async () => {
    const bytes = await buildReceiptPdf(baseParams);
    expect(qrMatrixFromPdf(bytes)).toBeNull();
  });
});
