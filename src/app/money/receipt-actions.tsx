"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import {
  buildWaMeLink,
  receiptWhatsAppMessageBm,
  type RegisterDonation,
} from "@/lib/receipts";
import { downloadFromApi } from "@/lib/download-file";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// Download + WhatsApp for ONE issued receipt — shared by the round's issue
// page (#3) and anywhere else a receipt row needs its two actions. The PDF is
// rebuilt server-side from the DATABASE row (S0-1): only the receipt number
// travels, so this device's copy can never change what the official PDF says.
// ---------------------------------------------------------------------------

export function ReceiptActions({ d }: { d: RegisterDonation }) {
  const t = useTriText();
  const { documentOrgName, taxStatus, setError } = useRegister();
  const [busy, setBusy] = useState(false);

  if (!d.receiptNo) return null;

  const waLink = buildWaMeLink(
    d.donorPhone,
    receiptWhatsAppMessageBm({
      orgName: documentOrgName,
      receiptNo: d.receiptNo,
      donorName: d.donorName,
      amountCents: d.amountCents,
      dateIso: d.donatedAtIso,
      purpose: d.purpose,
      taxStatus,
    }),
  );

  async function download() {
    if (!d.receiptNo || busy) return;
    setError(null);
    setBusy(true);
    try {
      await downloadFromApi(
        "/api/receipt-pdf",
        { receiptNo: d.receiptNo },
        `resit-${d.receiptNo}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void download()} disabled={busy}>
        {busy ? (
          <Tri bm="Menyiapkan…" zh="正在准备…" en="Preparing…" />
        ) : (
          <>
            <Download className="h-4 w-4" strokeWidth={2} />
            <Tri bm="Muat turun resit" zh="下载收据" en="Download receipt" />
          </>
        )}
      </Button>
      {waLink ? (
        <Button variant="outline" size="sm" asChild>
          <a href={waLink} target="_blank" rel="noopener noreferrer">
            📱 <Tri bm="Hantar WhatsApp" zh="用 WhatsApp 发送" en="Send on WhatsApp" />
          </a>
        </Button>
      ) : (
        <span className="text-sm text-muted-foreground">
          {t(
            "Tiada nombor telefon untuk WhatsApp",
            "没有电话号码，发不了 WhatsApp",
            "No phone number for WhatsApp",
          )}
        </span>
      )}
    </span>
  );
}
