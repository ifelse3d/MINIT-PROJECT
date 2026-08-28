"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { fenceRemainingLabel } from "@/lib/fence-core";

// ---------------------------------------------------------------------------
// FREE-FENCE UI (D44, 2026-08-28) — the client half of "看得到、拿不走".
//
// FenceLock wraps on-screen document text for a fenced org: selection and
// copy are blocked, and a visible watermark says WHY the text looks locked.
// Blocking copy in a browser only stops the casual path — that is the point;
// the clean artifact leaves through a counted download, and screenshots
// carry the watermark.
//
// FenceCleanDownload is the counted door for GET document routes: it fetches
// with ?clean=1, saves the file, and shows the server's refusal sentence in
// place when the lifetime downloads are used up (402).
// ---------------------------------------------------------------------------

const WATERMARK_ROW = "PERCUBAAN · 免費版 · FREE PLAN";

export function FenceLock({
  active,
  children,
}: {
  /** false = paid org: render children untouched. */
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;
  return (
    <div
      className="relative select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col justify-around overflow-hidden"
      >
        {[0, 1, 2].map((i) => (
          <p
            key={i}
            className="-rotate-[24deg] whitespace-nowrap text-center text-3xl font-bold tracking-widest text-[color:var(--v2-primary)] opacity-15"
          >
            {WATERMARK_ROW} · {WATERMARK_ROW}
          </p>
        ))}
      </div>
      <p className="mt-2 text-sm text-[color:var(--v2-text-soft)]">
        <Tri
          bm="Pelan percuma: paparan bertera air dan tidak boleh disalin. Fail bersih keluar melalui butang muat turun bersih."
          zh="免费版：预览带水印、不能复制。干净文件请用「干净下载」按钮拿。"
          en="Free plan: this view is watermarked and cannot be copied. The clean file leaves through the clean-download button."
        />
      </p>
    </div>
  );
}

/**
 * The counted clean-download button for GET routes (e.g. /api/minutes-pdf).
 * `remaining` comes from the server render; it is decremented locally after
 * a success so the label stays honest until the next full load.
 */
export function FenceCleanDownload({
  href,
  fallbackName,
  remaining,
}: {
  /** The route WITHOUT the clean flag — it is appended here. */
  href: string;
  fallbackName: string;
  remaining: number;
}) {
  const [left, setLeft] = useState(remaining);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanHref = href.includes("?") ? `${href}&clean=1` : `${href}?clean=1`;
  const label = fenceRemainingLabel("downloads", left);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(cleanHref);
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          typeof detail?.error === "string" && detail.error !== ""
            ? detail.error
            : "Muat turun gagal / 下载失败 / Download failed",
        );
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? fallbackName;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      // Revoking immediately races the download in Firefox/Safari
      // (same guard as lib/download-file.ts).
      const url = a.href;
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setLeft((n) => Math.max(n - 1, 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="lg"
        onClick={onClick}
        disabled={busy || left <= 0}
      >
        {busy ? (
          <Tri bm="Memuat turun…" zh="下载中…" en="Downloading…" />
        ) : (
          <Tri {...label} />
        )}
      </Button>
      {left <= 0 && error === null && (
        <p className="text-sm text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Muat turun bersih pelan percuma sudah habis — naik taraf di Tetapan → Pelan."
            zh="免费版的干净下载已用完 —— 请到 设置 → 订阅方案 升级。"
            en="The free plan's clean downloads are used up — upgrade under Settings → Plan."
          />
        </p>
      )}
      {error !== null && (
        <p className="whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-400/10 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
