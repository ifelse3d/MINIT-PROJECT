"use client";

import { useRef, useState } from "react";
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

/**
 * C-12 (work order 51, J's live test): a FLOATING WINDOW, not a modal.
 * The whole point of "see the original photo" is to read it WHILE typing
 * corrections — so it must not black out the page, must stay open until the
 * person closes it, and must move out of the way: drag it by its title bar,
 * resize it by the bottom-right corner (native CSS resize). No backdrop, no
 * click-outside-to-close.
 */
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
  // Where the window has been dragged to; null = the default CSS spot.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragFrom = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  // G3-1 (work order 68, J): resize from the bottom-LEFT corner too — the
  // native CSS handle only lives bottom-right, and a window hugging the
  // right edge can only grow leftward. Explicit size wins over the CSS
  // default once either handle has been used.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const resizeFrom = useRef<{
    px: number;
    py: number;
    w: number;
    h: number;
    x: number;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const step = zoomState.forIndex === index ? zoomState.step : 0;
  const setStep = (next: (s: number) => number) =>
    setZoomState({ forIndex: index, step: next(step) });
  const page = pages[index];
  if (!page) return null;
  const zoom = ZOOM_STEPS[step];

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={page.name}
      className="fixed z-50 flex flex-col overflow-hidden rounded-md border-2 border-[color:var(--v2-border-strong)] bg-[#1c1926] p-2 shadow-[var(--v2-shadow-lg)] sm:p-3"
      style={{
        // Default: hug the right edge, clear of the top bar. Once dragged,
        // the dragged spot wins. Resize is the browser's own corner handle.
        left: pos ? pos.x : undefined,
        top: pos ? pos.y : 72,
        right: pos ? undefined : 12,
        width: size ? size.w : "min(92vw, 460px)",
        height: size ? size.h : "min(64vh, 560px)",
        minWidth: 260,
        minHeight: 220,
        maxWidth: "96vw",
        maxHeight: "88vh",
        resize: "both",
      }}
    >
      {/* G3-1: the bottom-left grip. Growing leftward moves the left edge,
          so an explicit position follows the pointer when the window has
          been dragged off its right-anchored default. */}
      <div
        className="absolute bottom-0 left-0 z-10 h-5 w-5 cursor-sw-resize touch-none"
        aria-hidden
        onPointerDown={(e) => {
          const rect = boxRef.current?.getBoundingClientRect();
          if (!rect) return;
          resizeFrom.current = {
            px: e.clientX,
            py: e.clientY,
            w: rect.width,
            h: rect.height,
            x: rect.left,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          e.preventDefault();
        }}
        onPointerMove={(e) => {
          const r = resizeFrom.current;
          if (!r) return;
          const w = Math.max(260, Math.min(r.w + (r.px - e.clientX), window.innerWidth * 0.96));
          const h = Math.max(220, Math.min(r.h + (e.clientY - r.py), window.innerHeight * 0.88));
          setSize({ w, h });
          if (pos) setPos({ x: r.x - (w - r.w), y: pos.y });
        }}
        onPointerUp={(e) => {
          resizeFrom.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }}
      >
        <span className="absolute bottom-1 left-1 block h-2.5 w-2.5 rounded-[2px] border-b-2 border-l-2 border-white/60" />
      </div>
      <div
        className="flex cursor-move touch-none flex-wrap items-center justify-between gap-2 pb-2 select-none"
        onPointerDown={(e) => {
          // Drag by the title bar (buttons opt out below). Pointer capture
          // keeps the drag alive even when the cursor outruns the bar.
          if ((e.target as HTMLElement).closest("button")) return;
          const rect = boxRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragFrom.current = { px: e.clientX, py: e.clientY, x: rect.left, y: rect.top };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragFrom.current;
          if (!d) return;
          const nx = d.x + (e.clientX - d.px);
          const ny = d.y + (e.clientY - d.py);
          setPos({
            x: Math.max(-40, Math.min(nx, window.innerWidth - 80)),
            y: Math.max(0, Math.min(ny, window.innerHeight - 60)),
          });
        }}
        onPointerUp={(e) => {
          dragFrom.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }}
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
          scrollbars (or swipe) to move around the page. The window itself
          resizes from its bottom-right corner (native CSS resize). */}
      <div className="v2-scroll flex-1 overflow-auto rounded-sm">
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
            {/* G3-1 (work order 68 §5-1): say what the file actually IS —
                a resumed draft's WhatsApp JPEG was being labelled a PDF. */}
            {/\.pdf$/i.test(page.name) ? (
              <Tri
                bm="Fail PDF — pratonton tidak tersedia di sini."
                zh="这是 PDF 文件 —— 这里没有预览。"
                en="A PDF file — no preview here."
              />
            ) : (
              <Tri
                bm="Pratonton tidak tersedia pada peranti ini — gambar asal masih tersimpan."
                zh="这台设备上没有预览 —— 原图还在云端保存着。"
                en="No preview on this device — the original photo is still stored."
              />
            )}
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
