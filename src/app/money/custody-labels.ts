import type { RegisterDonation } from "@/lib/receipts";

// The three custody states, in words and in colour. Shared by the register
// cards on /money/receipts and the hand-over screen on /money/custody, which
// were the same page until the 2026-08-23 split.

export const CUSTODY_LABEL: Record<
  RegisterDonation["custodyStatus"],
  { bm: string; zh: string; en: string }
> = {
  collected: { bm: "Dalam tangan pemungut", zh: "在收款人手上", en: "With collector" },
  pending_remittance: { bm: "Menunggu pengesahan HQ", zh: "等待总会确认", en: "Awaiting HQ" },
  settled: { bm: "Selesai", zh: "已完成", en: "Settled" },
};

export const CUSTODY_STYLE: Record<RegisterDonation["custodyStatus"], string> = {
  collected: "border-amber-300 bg-amber-100 text-amber-900",
  pending_remittance: "border-blue-300 bg-blue-100 text-blue-900",
  settled: "border-green-300 bg-green-100 text-green-800",
};

/** D19: a bank-transfer row wears THIS instead of a custody badge — the money
 *  is in the account, not in a hand, so "with collector" would be a lie. */
export const TRANSFER_LABEL = {
  bm: "Pindahan bank — dalam akaun",
  zh: "转账入户",
  en: "Bank transfer — in the account",
} as const;

export const TRANSFER_STYLE =
  "border-sky-300 bg-sky-100 text-sky-900" as const;
