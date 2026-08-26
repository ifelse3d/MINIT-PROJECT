import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildMonthEndPack } from "@/lib/einvois";
import { buildEInvoisXlsxFiles } from "@/lib/einvois-xlsx";
import type { RegisterDonation } from "@/lib/receipts";

function donation(overrides: Partial<RegisterDonation>): RegisterDonation {
  return {
    id: "d",
    donorName: "Tan Ah Kow",
    donorPhone: null,
    amountCents: 5000,
    purpose: "Derma am",
    donatedAtIso: "2026-06-07",
    collector: "Lim Bee Hoon",
    receiptNo: "MIN-2026-0001",
    custodyStatus: "settled",
    ...overrides,
  };
}

const donations: RegisterDonation[] = [
  donation({ id: "d1", receiptNo: "MIN-2026-0001", amountCents: 5000 }),
  donation({ id: "d2", receiptNo: "MIN-2026-0002", amountCents: 30000 }),
  donation({
    id: "d3",
    receiptNo: "MIN-2026-0003",
    donorName: "Syarikat Maju Hardware Sdn Bhd",
    amountCents: 1_200_000, // RM12,000 → individual path
  }),
];

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

describe("buildEInvoisXlsxFiles", () => {
  it("writes one workbook: the Dokumen data sheet FIRST AND ONLY (D21)", async () => {
    const pack = buildMonthEndPack(donations, { month: "2026-06", orgName: "Pertubuhan Contoh" });
    const files = await buildEInvoisXlsxFiles(pack, { orgName: "Pertubuhan Contoh" });

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("einvois-2026-06-fail-1-dari-1.xlsx");

    const wb = await readBack(files[0].bytes);
    // D21 (拍板 37): instructions moved OUT of the upload file — a worksheet
    // of prose is exactly what makes a portal upload fail. Data only.
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Dokumen"]);
    // The one-line verify warning STAYS until J's official template is
    // aligned column-by-column (D21).
    const title = String(wb.getWorksheet("Dokumen")!.getRow(1).getCell(1).value ?? "");
    expect(title).toContain("DRAF");

    const ws = wb.getWorksheet("Dokumen")!;
    // Row 3 = header, rows 4-5 = documents (consolidated first, then individual).
    const consolidated = ws.getRow(4);
    expect(consolidated.getCell(2).value).toBe("CON-202606");
    expect(consolidated.getCell(5).value).toBe("General Public");
    expect(consolidated.getCell(6).value).toBe("EI00000000010");
    // LHDN SDK: consolidated line = 004 (Consolidated e-Invoice); 007 (Donation) is for individual docs.
    expect(consolidated.getCell(9).value).toBe("004");
    expect(consolidated.getCell(10).value).toBe(350); // RM50 + RM300, summed in code

    const individual = ws.getRow(5);
    expect(individual.getCell(2).value).toBe("MIN-2026-0003");
    expect(individual.getCell(5).value).toBe("Syarikat Maju Hardware Sdn Bhd");
    // Buyer TIN intentionally blank — treasurer completes it, never invented.
    expect([null, undefined, ""].includes(individual.getCell(6).value as never)).toBe(true);
    expect(individual.getCell(10).value).toBe(12000);

    // File total row = RM350 + RM12,000.
    const total = ws.getRow(7);
    expect(total.getCell(10).value).toBe(12350);
  });

  it("splits into multiple files past the 100-doc portal limit", async () => {
    const many: RegisterDonation[] = Array.from({ length: 150 }, (_, i) =>
      donation({
        id: `big-${i}`,
        receiptNo: `MIN-2026-${String(i + 1).padStart(4, "0")}`,
        donorName: `Penderma Besar ${i + 1}`,
        amountCents: 1_000_000, // all individual-path
      })
    );
    const pack = buildMonthEndPack(many, { month: "2026-06", orgName: "Org" });
    const files = await buildEInvoisXlsxFiles(pack, { orgName: "Org" });

    expect(pack.files.length).toBe(2);
    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe("einvois-2026-06-fail-1-dari-2.xlsx");
    expect(files[1].filename).toBe("einvois-2026-06-fail-2-dari-2.xlsx");

    const wb2 = await readBack(files[1].bytes);
    const ws2 = wb2.getWorksheet("Dokumen")!;
    // 50 remaining docs: header row 3, docs rows 4–53, blank 54, total 55.
    expect(ws2.getRow(53).getCell(1).value).toBe(50);
    expect(ws2.getRow(55).getCell(10).value).toBe(500000); // 50 × RM10,000 summed in code
  });
});
