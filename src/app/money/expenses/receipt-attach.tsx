"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { AttachIcon } from "@/components/attach-icon";
import { prepareUploadForSend } from "@/lib/upload-relay-client";
import {
  attachExpenseReceipt,
  declareNoReceipt,
  type ExpenseRow,
  type ReceiptAttachOutcome,
} from "./actions";
import { signPhotoPaths } from "@/app/minutes/draft-actions";

// ---------------------------------------------------------------------------
// "THIS ROW'S RECEIPT" (97 §5, J 8/30 #9 — the spending half). The last step
// of recording an expense: hang the shop receipt's photo on the row, or
// press "no receipt" and that honest fact is recorded instead. Nothing
// blocks saving, nothing is forced. Zero AI, zero charge — the photo goes
// straight to storage (an Inbox row rides along); only the path lands on
// the expense row (migration 40; fail-open with the honest sentence until
// J applies it).
// ---------------------------------------------------------------------------

export function ExpenseReceiptControls({
  row,
  onChanged,
}: {
  row: ExpenseRow;
  onChanged: () => void;
}) {
  const t = useTriText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function sayFailure(result: ReceiptAttachOutcome) {
    if (result.ok) return;
    setError(
      result.reason === "db_behind"
        ? t(
            "Gambar resit selamat dalam “Gambar asal” — tetapi pangkalan data belum dikemas kini (migration 40), jadi ia belum terpaut pada baris ini. Cuba lagi selepas migration itu dijalankan.",
            "照片已经安全存进「原始照片」—— 但数据库还没更新（migration 40），所以还没挂上这一笔。跑完那支 migration 再试一次。",
            "The receipt photo is safe in “Original photos” — but the database has not been updated yet (migration 40), so it is not linked to this row. Try again once that migration has been applied.",
          )
        : result.reason === "permission"
          ? t(
              "Hanya orang yang merekod baris ini (atau bendahari) boleh menjawab soalan resitnya.",
              "只有记这一笔的人（或财政）能处理它的单据。",
              "Only whoever recorded this row (or the treasurer) can answer its receipt question.",
            )
          : result.reason === "upload_failed"
            ? t(
                "Gambar tidak dapat disimpan — tiada apa-apa diubah. Cuba lagi.",
                "照片没有存上 —— 什么都没改。请再试一次。",
                "The photo could not be stored — nothing changed. Try again.",
              )
            : t(
                "Tidak berjaya — tiada apa-apa diubah. Cuba lagi.",
                "没有成功 —— 什么都没改。请再试一次。",
                "It did not go through — nothing changed. Try again.",
              ),
    );
  }

  async function attach(file: File | null) {
    if (!file || busy) return;
    setError(null);
    setBusy(true);
    try {
      // Same preparation as every other door: photos shrink in the browser,
      // a big PDF rides the Storage relay, the rest is refused honestly.
      const prepared = await prepareUploadForSend(file);
      if (prepared.send === "refuse") {
        setError(prepared.error);
        return;
      }
      const form = new FormData();
      form.append("expenseId", String(row.id));
      if (prepared.send === "file") form.append("file", prepared.file);
      else form.append("storagePath", prepared.storagePath);
      const result = await attachExpenseReceipt(form);
      if (result.ok) onChanged();
      else sayFailure(result);
    } catch {
      setError(t("Sambungan terputus.", "网络断了。", "The connection dropped."));
    } finally {
      setBusy(false);
    }
  }

  async function declareNone() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await declareNoReceipt({ expenseId: row.id });
      if (result.ok) onChanged();
      else sayFailure(result);
    } finally {
      setBusy(false);
    }
  }

  async function openReceipt() {
    if (!row.receiptPath || busy) return;
    setBusy(true);
    try {
      const signed = await signPhotoPaths([row.receiptPath]);
      const url = signed[0]?.url;
      if (url) window.open(url, "_blank", "noopener");
      else
        setError(
          t(
            "Resit tidak dapat dibuka sekarang — cuba lagi.",
            "现在打不开单据 —— 请再试一次。",
            "The receipt could not be opened just now — try again.",
          ),
        );
    } finally {
      setBusy(false);
    }
  }

  if (row.receiptPath) {
    return (
      <button
        type="button"
        onClick={() => void openReceipt()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-sm font-medium text-green-800 underline-offset-4 hover:underline disabled:opacity-60 dark:text-green-300"
      >
        🧾 <Tri bm="Resit dilampirkan — buka" zh="单据已挂上 · 看" en="Receipt attached — open" />
      </button>
    );
  }

  if (row.noReceipt === true) {
    return (
      <span className="text-sm text-muted-foreground">
        <Tri
          bm="Tiada resit (direkodkan)"
          zh="没有单据（已如实记录）"
          en="No receipt (recorded honestly)"
        />
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label
        className={`inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-sm border-2 border-[color:var(--v2-outline-border)] px-2.5 text-sm font-medium hover:bg-accent ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <AttachIcon />
        <Tri bm="Lampir resit kedai" zh="挂店家单据照片" en="Attach the shop receipt" />
        <input
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            void attach(file);
          }}
        />
      </label>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void declareNone()}>
        <Tri bm="Tiada resit" zh="没有单据" en="No receipt" />
      </Button>
      {error && (
        <span className="w-full text-sm font-medium text-red-800 dark:text-red-300">
          {error}
        </span>
      )}
    </span>
  );
}
