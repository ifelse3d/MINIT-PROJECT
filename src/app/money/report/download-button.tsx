"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { downloadFromApi } from "@/lib/download-file";

/** Downloads the statement PDF for the period on screen (server-computed —
 *  the browser sends the PERIOD, never a number). */
export function DownloadStatementButton({
  fromIso,
  toIso,
}: {
  fromIso: string;
  toIso: string;
}) {
  const t = useTriText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        size="lg"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await downloadFromApi(
              "/api/financial-report-pdf",
              { fromIso, toIso },
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
        }}
      >
        {busy ? (
          <Tri bm="Menjana PDF…" zh="正在生成 PDF…" en="Building the PDF…" />
        ) : (
          <>
            ⬇️ <Tri bm="Muat turun PDF" zh="下载 PDF" en="Download PDF" />
          </>
        )}
      </Button>
      {error && (
        <span className="text-sm font-medium text-red-700 dark:text-red-300">{error}</span>
      )}
    </span>
  );
}
