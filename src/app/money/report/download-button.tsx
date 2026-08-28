"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { downloadFromApi } from "@/lib/download-file";

/** Downloads the statement PDF for the period on screen (server-computed —
 *  the browser sends the PERIOD, never a number). D44: on a fenced (free)
 *  org the plain download is watermarked; the clean file is a second button
 *  that spends 1 lifetime document + 1 clean download. */
export function DownloadStatementButton({
  fromIso,
  toIso,
  fence = null,
}: {
  fromIso: string;
  toIso: string;
  fence?: { docsRemaining: number; downloadsRemaining: number } | null;
}) {
  const t = useTriText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async (clean: boolean) => {
    setError(null);
    setBusy(true);
    try {
      await downloadFromApi(
        "/api/financial-report-pdf",
        { fromIso, toIso, ...(clean ? { clean: true } : {}) },
        `penyata-${fromIso}-${toIso}.pdf`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Muat turun gagal.", "下载失败。", "Download failed."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="lg" disabled={busy} onClick={() => download(false)}>
        {busy ? (
          <Tri bm="Menjana PDF…" zh="正在生成 PDF…" en="Building the PDF…" />
        ) : fence ? (
          <>
            ⬇️{" "}
            <Tri
              bm="PDF (bertera air)"
              zh="PDF（带水印）"
              en="PDF (watermarked)"
            />
          </>
        ) : (
          <>
            ⬇️ <Tri bm="Muat turun PDF" zh="下载 PDF" en="Download PDF" />
          </>
        )}
      </Button>
      {fence && (
        <Button size="lg" variant="outline" disabled={busy} onClick={() => download(true)}>
          <Tri bm="Versi bersih" zh="干净版" en="Clean version" />
        </Button>
      )}
      {fence && (
        <span className="text-sm text-[color:var(--v2-text-soft)]">
          <Tri
            bm={`Pelan percuma: versi bersih guna 1 dokumen (baki ${fence.docsRemaining}) + 1 muat turun (baki ${fence.downloadsRemaining}).`}
            zh={`免费版：干净版用掉 1 份文件（剩 ${fence.docsRemaining}）＋ 1 次下载（剩 ${fence.downloadsRemaining}）。`}
            en={`Free plan: the clean version spends 1 document (${fence.docsRemaining} left) + 1 download (${fence.downloadsRemaining} left).`}
          />
        </span>
      )}
      {error && (
        <span className="whitespace-pre-wrap text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </span>
      )}
    </span>
  );
}
