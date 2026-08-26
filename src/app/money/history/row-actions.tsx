"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { downloadFromApi } from "@/lib/download-file";

// B-6 (J #21): every history row can hand over its receipt PDF right here.
// Only the receipt number crosses the wire — the server reads every printed
// fact back from the database under RLS (S0-1), so this button cannot be fed
// a forged document.

export function DownloadReceiptButton({ receiptNo }: { receiptNo: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    if (busy) return;
    setFailed(false);
    setBusy(true);
    try {
      await downloadFromApi(
        "/api/receipt-pdf",
        { receiptNo },
        `resit-${receiptNo}.pdf`,
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => void download()} disabled={busy}>
        {busy ? (
          <Tri bm="Menyiapkan…" zh="准备中…" en="Preparing…" />
        ) : (
          <>
            <Download className="h-4 w-4" strokeWidth={2} />
            <Tri bm="Resit PDF" zh="看收据 PDF" en="Receipt PDF" />
          </>
        )}
      </Button>
      {failed && (
        <span className="text-sm font-medium text-red-700">
          <Tri bm="Tidak berjaya — cuba lagi" zh="没成功，请再试" en="Failed — try again" />
        </span>
      )}
    </span>
  );
}
