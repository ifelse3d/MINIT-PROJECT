import type { LedgerExtraction } from "@/lib/extraction";
import type { RegisterDonation } from "@/lib/receipts";

// ---------------------------------------------------------------------------
// SAMPLE DATA for the Phase 2/3 foundation (no API key connected yet).
// A realistic — entirely FICTIONAL — paper donation ledger page, as the
// vision model would return it. Drives the /money screen so it is fully
// clickable and screenshot-ready. Replaced by live extractions once the
// Anthropic key is connected.
//
// Deliberately shows: all three confidence levels, a possible DUPLICATE
// (rows 1 & 5: same donor, same day, same amount), and one RM12,000
// donation that triggers the individual e-Invois path.
// ---------------------------------------------------------------------------

export const SAMPLE_LEDGER_LABEL = "buku-derma-jun-ms3.jpg (contoh / sample)";
export const SAMPLE_COLLECTOR = "Lim Bee Hoon (Pemungut / Collector)";

export const sampleLedgerExtraction: LedgerExtraction = {
  page_title: {
    value: "Buku Derma Jun 2026 — muka surat 3",
    confidence: "confirmed",
    source_ref: { location: "photo 1, header", snippet: "乐捐簿 六月 2026 · ms 3" },
  },
  rows: [
    {
      donor_name: {
        value: "Tan Ah Kow",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 1", snippet: "陈亚九 (Tan Ah Kow)" },
      },
      donor_phone: {
        value: "012-345 6789",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 1", snippet: "012-3456789" },
      },
      amount_cents: {
        value: 5000,
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 1", snippet: "RM50" },
      },
      purpose: {
        value: "Derma bulanan / 香油钱",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 1", snippet: "香油" },
      },
      donated_at: {
        value: "2026-06-07",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 1", snippet: "7/6" },
      },
    },
    {
      donor_name: {
        value: "Siti Aminah binti Hassan",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 2", snippet: "Siti Aminah bt Hassan" },
      },
      donor_phone: { value: "", confidence: "missing", source_ref: null },
      amount_cents: {
        value: 10000,
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 2", snippet: "RM100" },
      },
      purpose: {
        value: "Tabung bumbung / roof fund",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 2", snippet: "tabung bumbung" },
      },
      donated_at: {
        value: "2026-06-07",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 2", snippet: "\" (ditto)" },
      },
    },
    {
      donor_name: {
        value: "Wong K. M.",
        confidence: "check",
        source_ref: {
          location: "photo 1, row 3",
          snippet: "黄K.M.? (tulisan kabur / smudged)",
        },
      },
      donor_phone: { value: "", confidence: "missing", source_ref: null },
      amount_cents: {
        value: 2000,
        confidence: "check",
        source_ref: { location: "photo 1, row 3", snippet: "RM20 atau RM70? kabur" },
      },
      purpose: { value: "", confidence: "missing", source_ref: null },
      donated_at: {
        value: "2026-06-14",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 3", snippet: "14/6" },
      },
    },
    {
      donor_name: {
        value: "Syarikat Maju Hardware Sdn Bhd",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 4", snippet: "Maju Hardware S/B 五金店" },
      },
      donor_phone: {
        value: "+60 16-888 2222",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 4", snippet: "016-8882222" },
      },
      amount_cents: {
        value: 1200000,
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 4", snippet: "RM12,000 (cek 004512)" },
      },
      purpose: {
        value: "Derma pembaikan bumbung dewan",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 4", snippet: "修屋顶 bumbung" },
      },
      donated_at: {
        value: "2026-06-14",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 4", snippet: "14/6" },
      },
    },
    {
      donor_name: {
        value: "Tan Ah Kow",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 5", snippet: "陈亚九" },
      },
      donor_phone: {
        value: "012-345 6789",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 5", snippet: "012-3456789" },
      },
      amount_cents: {
        value: 5000,
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 5", snippet: "RM50" },
      },
      purpose: {
        value: "Derma bulanan / 香油钱",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 5", snippet: "香油" },
      },
      donated_at: {
        value: "2026-06-07",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 5", snippet: "7/6" },
      },
    },
    {
      donor_name: {
        value: "Tanpa nama / Anonymous",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 6", snippet: "无名氏" },
      },
      donor_phone: { value: "", confidence: "missing", source_ref: null },
      amount_cents: {
        value: 30000,
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 6", snippet: "RM300" },
      },
      purpose: {
        value: "Derma am / general donation",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 6", snippet: "derma am" },
      },
      donated_at: {
        value: "2026-06-21",
        confidence: "confirmed",
        source_ref: { location: "photo 1, row 6", snippet: "21/6" },
      },
    },
  ],
};

/**
 * The register AFTER human review of the extraction above — what Phase 2
 * writes to the `donations` table once every row is confirmed. Used by the
 * /money screen and the custody/e-Invois demos. (The smudged row 3 appears
 * here as if the treasurer confirmed RM20.)
 */
export const sampleRegisterDonations: RegisterDonation[] = [
  {
    id: "don-001",
    donorName: "Tan Ah Kow",
    donorPhone: "012-345 6789",
    amountCents: 5000,
    purpose: "Derma bulanan / 香油钱",
    donatedAtIso: "2026-06-07",
    collector: SAMPLE_COLLECTOR,
    receiptNo: null,
    custodyStatus: "collected",
  },
  {
    id: "don-002",
    donorName: "Siti Aminah binti Hassan",
    donorPhone: null,
    amountCents: 10000,
    purpose: "Tabung bumbung / roof fund",
    donatedAtIso: "2026-06-07",
    collector: SAMPLE_COLLECTOR,
    receiptNo: null,
    custodyStatus: "collected",
  },
  {
    id: "don-003",
    donorName: "Wong K. M.",
    donorPhone: null,
    amountCents: 2000,
    purpose: "Derma am",
    donatedAtIso: "2026-06-14",
    collector: SAMPLE_COLLECTOR,
    receiptNo: null,
    custodyStatus: "collected",
  },
  {
    id: "don-004",
    donorName: "Syarikat Maju Hardware Sdn Bhd",
    donorPhone: "+60 16-888 2222",
    amountCents: 1200000,
    purpose: "Derma pembaikan bumbung dewan",
    donatedAtIso: "2026-06-14",
    collector: SAMPLE_COLLECTOR,
    receiptNo: null,
    custodyStatus: "collected",
  },
  {
    id: "don-005",
    donorName: "Tanpa nama / Anonymous",
    donorPhone: null,
    amountCents: 30000,
    purpose: "Derma am / general donation",
    donatedAtIso: "2026-06-21",
    collector: SAMPLE_COLLECTOR,
    receiptNo: null,
    custodyStatus: "collected",
  },
];
