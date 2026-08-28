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
// 28/8 evening (J item 5): the full-screen viewer became PhotoLightbox — its
// own exported component with ZOOM (＋/−, up to 4×, scroll to move around)
// and prev/next, because the document-editing page and History need to open
// the same viewer over a photo WITHOUT leaving what they are doing. `src:
// null` means a PDF page whose pixels were never kept — the tile still exists
// (the upload happened; hiding it would misreport the review) but the viewer
// says there is no preview.
// ---------------------------------------------------------------------------

export type ThumbPage = { name: string; dataUrl: string | null };

/** One page the lightbox can show — a data: URL or a signed https URL. */
export type LightboxPage = { name: string; src: string | null };

const ZOOM_STEPS = [1, 1.5, 2.2, 3, 4];

export function PhotoLightbox({
  pages,
  index,
  onClose,
  onIndex,
}: {
  pages: LightboxPage[];
  /** Which page is open. */
  index: number;
  onClose: () => void;
  /** Move to another page (prev/next). Optional for single-photo callers. */
  onIndex?: (i: number) => void;
}) {
  // Zoom is remembered WITH the page it applies to, so moving to another
  // page derives back to fit-to-screen — no effect, no extra render.
  const [zoomState, setZoomState] = useState({ forIndex: index, step: 0 });
  const step = zoomState.forIndex === index ? zoomState.step : 0;
  const setStep = (next: (s: number) => number) =>
    setZoomState({ forIndex: index, step: next(step) });
  const page = pages[index];
  if (!page) return null;
  const zoom = ZOOM_STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {page.name}
          {pages.length > 1 ? ` · ${index + 1}/${pages.length}` : ""}
        </p>
        <div className="flex items-center gap-2">
          {pages.length > 1 && onIndex && (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={index === 0}
                onClick={() => onIndex(index - 1)}
                aria-label={`Previous page`}
              >
                ← <Tri bm="Sebelum" zh="上一张" en="Prev" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={index === pages.length - 1}
                onClick={() => onIndex(index + 1)}
                aria-label={`Next page`}
              >
                <Tri bm="Seterus" zh="下一张" en="Next" /> →
              </Button>
            </>
          )}
          {page.src && (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                aria-label="Zoom out"
              >
                −
              </Button>
              <span className="w-12 text-center text-sm tabular-nums text-white">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={step === ZOOM_STEPS.length - 1}
                onClick={() => setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1))}
                aria-label="Zoom in"
              >
                ＋
              </Button>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={onClose}>
            ✕ <Tri bm="Tutup" zh="关闭" en="Close" />
          </Button>
        </div>
      </div>
      {/* The picture scrolls inside this box when zoomed in — drag the
          scrollbars (or swipe) to move around the page. */}
      <div
        className="v2-scroll flex-1 overflow-auto rounded-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {page.src ? (
          // A data: URL from the user's own device or a short-lived signed
          // link — next/image cannot optimise either.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.src}
            alt={page.name}
            className={zoom === 1 ? "mx-auto max-h-full max-w-full object-contain" : "max-w-none"}
            style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
          />
        ) : (
          <p className="mx-auto mt-10 max-w-md rounded-sm bg-white/90 p-6 text-base">
            <Tri
              bm="Fail PDF — pratonton tidak tersedia di sini."
              zh="这是 PDF 文件 —— 这里没有预览。"
              en="A PDF file — no preview here."
            />
          </p>
        )}
      </div>
    </div>
  );
}

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
      {viewPage !== null && (
        <PhotoLightbox
          pages={pages.map((p) => ({ name: p.name, src: p.dataUrl }))}
          index={viewPage}
          onIndex={setViewPage}
          onClose={() => setViewPage(null)}
        />
      )}
    </>
  );
}
