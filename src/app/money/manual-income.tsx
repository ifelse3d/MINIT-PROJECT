"use client";

import { useState } from "react";
import { Tri, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parseRmToCents, type RegisterDonation } from "@/lib/receipts";
import { dayIsoMalaysia } from "@/lib/history";

// ---------------------------------------------------------------------------
// MANUAL INCOME ENTRY — the deliberate, clearly-labelled exception to the
// eROSES test. Minit is photo-first: income normally flows in from a ledger
// photo that the AI reads and the human confirms. But a one-off cash gift or
// a fee with no paper page still needs a home. This is that home — a short
// confirm-style form, NOT a general data-entry screen. Every row it creates
// is tagged source = "manual" so an auditor can always see it was hand-typed,
// never AI-read. Money parsing is deterministic (parseRmToCents, Hard Rule 2).
// ---------------------------------------------------------------------------

/** Income categories cover more than donations: fees, rental, grants, etc. */
const INCOME_CATEGORIES: { value: string; bm: string; zh: string; en: string }[] = [
  { value: "Derma", bm: "Derma", zh: "捐款", en: "Donation" },
  { value: "Yuran ahli", bm: "Yuran ahli", zh: "会员费", en: "Membership fee" },
  { value: "Sewa dewan", bm: "Sewa dewan", zh: "礼堂租金", en: "Hall rental" },
  { value: "Pendapatan acara", bm: "Pendapatan acara", zh: "活动收入", en: "Event income" },
  { value: "Geran", bm: "Geran", zh: "拨款", en: "Grant" },
  { value: "Faedah bank", bm: "Faedah bank", zh: "银行利息", en: "Bank interest" },
  { value: "Lain-lain", bm: "Lain-lain", zh: "其他", en: "Other" },
];

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

type Props = {
  /** Called with a fully-formed, confirmed register row to append. */
  onAdd: (donation: RegisterDonation) => void;
  /** Default collector name (usually the logged-in collector / treasurer). */
  defaultCollector: string;
};

export function ManualIncomeForm({ onAdd, defaultCollector }: Props) {
  const t = useTriText();
  const today = dayIsoMalaysia(new Date().toISOString())!;

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(INCOME_CATEGORIES[0].value);
  const [note, setNote] = useState("");
  const [payer, setPayer] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [collector, setCollector] = useState(defaultCollector);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCategory(INCOME_CATEGORIES[0].value);
    setNote("");
    setPayer("");
    setPhone("");
    setAmount("");
    setDate(today);
    setCollector(defaultCollector);
    setError(null);
  }

  function submit() {
    setError(null);
    const cents = parseRmToCents(amount);
    if (cents === null) {
      setError(t("Jumlah tidak sah.", "金额无效。", "Amount is not a valid RM value."));
      return;
    }
    if (cents === 0) {
      setError(t("Jumlah mesti lebih daripada sifar.", "金额必须大于零。", "Amount must be more than zero."));
      return;
    }
    if (!payer.trim()) {
      setError(t("Isi nama penderma / pembayar.", "请填写捐款人/付款人。", "Enter a donor / payer name."));
      return;
    }
    if (!date) {
      setError(t("Isi tarikh.", "请填写日期。", "Enter a date."));
      return;
    }
    const purpose = note.trim() ? `${category} — ${note.trim()}` : category;
    onAdd({
      id: `man-${Date.now()}`,
      donorName: payer.trim(),
      donorPhone: phone.trim() || null,
      amountCents: cents,
      purpose,
      donatedAtIso: date,
      collector: collector.trim() || defaultCollector,
      receiptNo: null,
      custodyStatus: "collected",
      source: "manual",
    });
    reset();
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          + <Tri bm="Tambah pendapatan secara manual" zh="手动添加收入" en="Add income manually" />
        </CardTitle>
        <CardDescription>
          {/* 2026-07-28 audit: CLAUDE.md's design law says effort must flow from
              AI to human. A seven-field form is the opposite, so it must be
              clearly the LAST resort, not a peer of the camera. The fields stay
              hidden until the user asks for them; this copy says what to do
              instead. */}
          <Tri
            bm="Cara paling mudah tetap gambar: ambil gambar halaman lejar di langkah 1 di atas dan AI akan mengisi baris-barisnya untuk anda. Guna borang ini hanya kalau derma itu tidak tercatat pada mana-mana kertas — contohnya wang tunai yang diserahkan terus kepada anda. Baris yang ditambah di sini ditanda “manual” supaya juruaudit tahu tiada kertas asalnya."
            zh="最省力的做法还是拍照：在上面第 1 步拍下账页，AI 会替您把每一行填好。只有在这笔捐款没有记在任何纸上时（例如有人直接把现金交给您）才用这个表格。这里加进去的记录会标上「手动」，让审计知道没有原始纸张。"
            en="The easiest way is still a photo: take a photo of the ledger page in step 1 above and Minit fills in the lines for you. Use this form only when the donation was never written on any paper — cash handed straight to you, for example. Rows added here are tagged “manual” so an auditor knows there is no original page."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!open ? (
          <Button onClick={() => setOpen(true)} variant="outline" className="self-start">
            <Tri
              bm="Tiada kertas — taip sendiri"
              zh="没有纸张 —— 自己打字输入"
              en="No paper — type it in myself"
            />
          </Button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Jenis pendapatan" zh="收入类型" en="Income type" />
                </span>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.bm, c.zh, c.en)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Jumlah (RM)" zh="金额 (RM)" en="Amount (RM)" />
                </span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Penderma / Pembayar" zh="捐款人 / 付款人" en="Donor / Payer" />
                </span>
                <input
                  className={inputClass}
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Telefon (pilihan)" zh="电话（可选）" en="Phone (optional)" />
                </span>
                <input
                  className={inputClass}
                  placeholder="012-345 6789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Tarikh" zh="日期" en="Date" />
                </span>
                <input
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Pemungut" zh="收款人" en="Collector" />
                </span>
                <input
                  className={inputClass}
                  value={collector}
                  onChange={(e) => setCollector(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-base font-semibold">
                  <Tri bm="Catatan (pilihan)" zh="备注（可选）" en="Note (optional)" />
                </span>
                <input
                  className={inputClass}
                  placeholder={t("cth: tabung bumbung", "例：屋顶基金", "e.g. roof fund")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-base text-red-900">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={submit} size="lg" className="text-base">
                <Tri bm="Tambah ke daftar" zh="加入登记" en="Add to register" />
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                size="lg"
                variant="ghost"
                className="text-base"
              >
                <Tri bm="Batal" zh="取消" en="Cancel" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
