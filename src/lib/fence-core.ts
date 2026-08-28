// ---------------------------------------------------------------------------
// FREE FENCE — pure logic (D44, 2026-08-28).
//
// J's decision, verbatim numbers: the free plan is LIFETIME-capped at
// 5 documents · 20 receipts · 20 uploaded pages · 3 clean downloads, and what
// a free organisation SEES is watermarked and not copyable — the clean file
// only ever leaves through a counted download. Receipts are the deliberate
// exception: all 20 download clean (a receipt the donor cannot receive would
// make the 20-receipt grant a lie).
//
// Everything here is pure and unit-tested. The numbers live in
// src/lib/plans.ts (PLANS.trial.fence — ONE source of truth); the I/O lives
// in src/lib/fence.ts; the atomic counter is the fence_charge() SQL function
// (migration 20260909000000).
// ---------------------------------------------------------------------------
import type { FenceLimits } from "@/lib/plans";

/** Lifetime "has done" totals for one org. Receipts counted from their table. */
export type FenceCounters = {
  docsMade: number;
  pagesUploaded: number;
  cleanDownloads: number;
  receipts: number;
};

/** What a charge wants to add. Absent/0 = not touching that counter. */
export type FenceDelta = {
  docs?: number;
  pages?: number;
  downloads?: number;
};

export type FenceKind = "docs" | "pages" | "downloads" | "receipts";

export type FenceState = {
  limits: FenceLimits;
  counters: FenceCounters;
  remaining: Record<FenceKind, number>;
};

const nonNegative = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

export function computeFenceState(
  limits: FenceLimits,
  counters: FenceCounters,
): FenceState {
  const used: FenceCounters = {
    docsMade: nonNegative(counters.docsMade),
    pagesUploaded: nonNegative(counters.pagesUploaded),
    cleanDownloads: nonNegative(counters.cleanDownloads),
    receipts: nonNegative(counters.receipts),
  };
  return {
    limits,
    counters: used,
    remaining: {
      docs: Math.max(limits.docsMade - used.docsMade, 0),
      pages: Math.max(limits.uploadPages - used.pagesUploaded, 0),
      downloads: Math.max(limits.cleanDownloads - used.cleanDownloads, 0),
      receipts: Math.max(limits.receipts - used.receipts, 0),
    },
  };
}

/**
 * Which counter refuses this charge, or null when everything fits.
 * Checked in the order the SQL checks, so message and refusal always agree.
 */
export function whichFenceBlocks(
  limits: FenceLimits,
  counters: FenceCounters,
  delta: FenceDelta,
): Exclude<FenceKind, "receipts"> | null {
  const docs = nonNegative(delta.docs);
  const pages = nonNegative(delta.pages);
  const downloads = nonNegative(delta.downloads);
  if (docs > 0 && nonNegative(counters.docsMade) + docs > limits.docsMade)
    return "docs";
  if (pages > 0 && nonNegative(counters.pagesUploaded) + pages > limits.uploadPages)
    return "pages";
  if (
    downloads > 0 &&
    nonNegative(counters.cleanDownloads) + downloads > limits.cleanDownloads
  )
    return "downloads";
  return null;
}

/**
 * The fence_charge() SQL function answers jsonb:
 *   { ok, docs_made, pages_uploaded, clean_downloads }
 * Anything that does not parse is null — the caller decides what that means
 * (fail open when the migration is not applied yet, fail closed otherwise).
 */
export function parseFenceChargeResult(
  raw: unknown,
): { ok: boolean; counters: Omit<FenceCounters, "receipts"> } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ok !== "boolean") return null;
  return {
    ok: r.ok,
    counters: {
      docsMade: nonNegative(r.docs_made),
      pagesUploaded: nonNegative(r.pages_uploaded),
      cleanDownloads: nonNegative(r.clean_downloads),
    },
  };
}

// --- user-facing words (trilingual, Hard Rule 9) -----------------------------

type TriMessage = { bm: string; zh: string; en: string };

/**
 * Why this was refused, with the numbers in the sentence. The upgrade path is
 * named in words ("Tetapan → Pelan"), never as a bare URL — these strings also
 * surface inside toasts where links do not render.
 */
export function fenceBlockedMessage(
  kind: FenceKind,
  limits: FenceLimits,
): TriMessage {
  const upgrade = {
    bm: "Untuk terus guna, naik taraf di Tetapan → Pelan.",
    zh: "要继续使用，请到 设置 → 订阅方案 升级。",
    en: "To keep going, upgrade under Settings → Plan.",
  };
  switch (kind) {
    case "docs":
      return {
        bm: `Pelan percuma meliputi ${limits.docsMade} dokumen (seumur hidup) dan kesemuanya telah digunakan. ${upgrade.bm}`,
        zh: `免费版一共可做 ${limits.docsMade} 份文件（终身计算），已经用完。${upgrade.zh}`,
        en: `The free plan covers ${limits.docsMade} documents (lifetime) and they have all been used. ${upgrade.en}`,
      };
    case "pages":
      return {
        bm: `Pelan percuma meliputi ${limits.uploadPages} muka surat bacaan AI (seumur hidup) dan kesemuanya telah digunakan. ${upgrade.bm}`,
        zh: `免费版一共可让 AI 读 ${limits.uploadPages} 页（照片一张算一页，终身计算），已经用完。${upgrade.zh}`,
        en: `The free plan covers ${limits.uploadPages} AI-read pages (lifetime) and they have all been used. ${upgrade.en}`,
      };
    case "downloads":
      return {
        bm: `Pelan percuma meliputi ${limits.cleanDownloads} muat turun bersih (tanpa tera air, seumur hidup) dan kesemuanya telah digunakan. Paparan bertera air masih percuma. ${upgrade.bm}`,
        zh: `免费版一共可下载 ${limits.cleanDownloads} 次干净（无水印）文件，终身计算，已经用完。带水印的预览仍然免费。${upgrade.zh}`,
        en: `The free plan covers ${limits.cleanDownloads} clean (no-watermark) downloads (lifetime) and they have all been used. Watermarked viewing stays free. ${upgrade.en}`,
      };
    case "receipts":
      return {
        bm: `Pelan percuma meliputi ${limits.receipts} resit bernombor (seumur hidup) dan kesemuanya telah dikeluarkan. Resit sedia ada kekal sah dan masih boleh dimuat turun. ${upgrade.bm}`,
        zh: `免费版一共可开 ${limits.receipts} 张编号收据（终身计算），已经开完。已开的收据仍然有效、仍可下载。${upgrade.zh}`,
        en: `The free plan covers ${limits.receipts} numbered receipts (lifetime) and they have all been issued. Existing receipts stay valid and downloadable. ${upgrade.en}`,
      };
  }
}

/** One short line for buttons: how much of a fence is left. */
export function fenceRemainingLabel(
  kind: FenceKind,
  remaining: number,
): TriMessage {
  switch (kind) {
    case "docs":
      return {
        bm: `Pelan percuma: baki ${remaining} dokumen`,
        zh: `免费版：还可做 ${remaining} 份文件`,
        en: `Free plan: ${remaining} documents left`,
      };
    case "pages":
      return {
        bm: `Pelan percuma: baki ${remaining} muka surat AI`,
        zh: `免费版：AI 还可读 ${remaining} 页`,
        en: `Free plan: ${remaining} AI pages left`,
      };
    case "downloads":
      return {
        bm: `Muat turun bersih (baki ${remaining})`,
        zh: `干净下载（剩 ${remaining} 次）`,
        en: `Clean download (${remaining} left)`,
      };
    case "receipts":
      return {
        bm: `Pelan percuma: baki ${remaining} resit`,
        zh: `免费版：还可开 ${remaining} 张收据`,
        en: `Free plan: ${remaining} receipts left`,
      };
  }
}
