"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { parseRmToCents, type RegisterDonation } from "@/lib/receipts";

/** Inline editor for a register row, shown only BEFORE a receipt is issued.
 *  Amount is parsed by deterministic TS (parseRmToCents) — never the AI. */
export function DonationEditor({
  donation,
  onSave,
  onCancel,
}: {
  donation: RegisterDonation;
  onSave: (updated: RegisterDonation) => void;
  onCancel: () => void;
}) {
  const t = useTriText();
  const [name, setName] = useState(donation.donorName);
  const [rm, setRm] = useState((donation.amountCents / 100).toFixed(2));
  const [dateIso, setDateIso] = useState(donation.donatedAtIso);
  const [purpose, setPurpose] = useState(donation.purpose);
  const [phone, setPhone] = useState(donation.donorPhone ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const cents = parseRmToCents(rm);
    if (cents === null) {
      setError(t("Jumlah tak sah — contoh: 50 atau 12.50", "金额无效 — 例如 50 或 12.50", "Invalid amount — e.g. 50 or 12.50"));
      return;
    }
    if (name.trim() === "") {
      setError(t("Nama penderma diperlukan", "需要捐款人姓名", "Donor name is required"));
      return;
    }
    onSave({
      ...donation,
      donorName: name.trim(),
      amountCents: cents,
      donatedAtIso: dateIso,
      purpose: purpose.trim(),
      donorPhone: phone.trim() === "" ? null : phone.trim(),
    });
  }

  const inputClass = "w-full rounded-md border px-2 py-1 text-sm";
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Nama penderma" zh="捐款人姓名" en="Donor name" />
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Jumlah (RM)" zh="金额 (RM)" en="Amount (RM)" />
        <input className={inputClass} inputMode="decimal" placeholder="RM 0.00" value={rm} onChange={(e) => setRm(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Tarikh" zh="日期" en="Date" />
        <input className={inputClass} type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Tujuan" zh="用途" en="Purpose" />
        <input className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Telefon (untuk WhatsApp)" zh="电话（用于 WhatsApp）" en="Phone (for WhatsApp)" />
        <input className={inputClass} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>
          <Tri bm="Simpan" zh="保存" en="Save" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <Tri bm="Batal" zh="取消" en="Cancel" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Shape guard for the register blob in localStorage (see usePersistentState).
 * Deliberately checks the fields the money code actually dereferences: an older
 * or foreign blob used to be accepted as-is and then produced NaN totals.
 */
