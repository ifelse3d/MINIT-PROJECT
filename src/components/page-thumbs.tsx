"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// PAGE THUMBNAILS — "what have I already uploaded into this review?"
//
// Born in the money area (B-5③, J #14): a multi-page upload could only be
// trusted to memory. D-3 (work order 31, J #8) wanted the same look-back on
// the minutes flow, so the inline block became this shared component — one
// implementation, both flows, and the two can never drift apart.
//
// A tap opens the page full-screen. `dataUrl: null` means a PDF page whose
// pixels were never kept — the tile still exists (the upload happened; hiding
// it would misreport the review) but the viewer says there is no preview.
// ---------------------------------------------------------------------------

export type ThumbPage = { name: string; dataUrl: string | null };

export function PageThumbs({ pages }: { pages: ThumbPage[] }) {
  const t = useTriText();
  const [viewPage, setViewPage] = useState<number | null>(null);
  if (pages.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {pages.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setViewPage(i)}
            className="flex w-24 flex-col items-center gap-1 rounded-sm border border-[color:var(--v2-outline-border)] bg-white/60 p-1.5 hover:bg-accent dark:bg-white/5"
            title={p.name}
          >
            {p.dataUrl ? (
              // A data: URL from the user's own device — next/image cannot
              // optimise it and would only add wrapper cost.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.dataUrl}
                alt={p.name}
                className="h-16 w-full rounded object-cover"
              />
            ) : (
              <span className="flex h-16 w-full items-center justify-center rounded bg-muted text-2xl">
                📄
              </span>
            )}
            <span className="w-full truncate text-xs text-muted-foreground">
              {t("muka", "第", "p.")} {i + 1} · {p.name}
            </span>
          </button>
        ))}
        <span className="text-sm text-muted-foreground">
          <Tri
            bm="Tekan untuk lihat semula"
            zh="点一下可以回看"
            en="Tap to look back at a page"
          />
        </span>
      </div>
      {viewPage !== null && pages[viewPage] && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewPage(null)}
        >
          <p className="max-w-full truncate text-sm font-medium text-white">
            {pages[viewPage].name}
          </p>
          {pages[viewPage].dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pages[viewPage].dataUrl as string}
              alt={pages[viewPage].name}
              className="max-h-[80vh] max-w-full rounded-sm object-contain"
            />
          ) : (
            <p className="rounded-sm bg-white/90 p-6 text-base">
              <Tri
                bm="Fail PDF — pratonton tidak tersedia di sini."
                zh="这是 PDF 文件 —— 这里没有预览。"
                en="A PDF file — no preview here."
              />
            </p>
          )}
          <Button size="lg" variant="secondary" onClick={() => setViewPage(null)}>
            <Tri bm="Tutup" zh="关闭" en="Close" />
          </Button>
        </div>
      )}
    </>
  );
}
