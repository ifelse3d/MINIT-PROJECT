"use client";

import { Tri } from "@/components/language-provider";
import { estimateConstitutionRead } from "@/lib/constitution-pages";

// ---------------------------------------------------------------------------
// ④ (work order 85, J 2026-08-30: 「寫預估（看文件大小）」) — the price-and-
// time line every constitution door shows BEFORE the read starts. One
// sentence, purely informative: it never blocks anybody, it just tells them
// what pressing the button will cost and roughly how long it takes. The
// numbers come from the same tested arithmetic the billing uses
// (constitution-pages.ts), so the line can never disagree with the charge.
//
// Speed comes from the measured benchmark (CONTOH 8 pages, 24.8s) — the
// wording says "about", because an estimate is an estimate.
// ---------------------------------------------------------------------------

export function ConstitutionReadEstimate({
  pages,
  /** Photo sets read one request per photo — the caller says so; a PDF's
   *  segmentation is computed from its page count. */
  segments,
}: {
  pages: number;
  segments?: number;
}) {
  const e = estimateConstitutionRead(pages);
  const parts = segments ?? e.segments;

  // Under ~1.5 minutes, seconds are the honest unit; above it, minutes read
  // better than "124 seconds".
  const minutes = Math.ceil(e.seconds / 60);
  const timeBm = e.seconds < 90 ? `±${e.seconds} saat` : `±${minutes} minit`;
  const timeZh = e.seconds < 90 ? `约 ${e.seconds} 秒` : `约 ${minutes} 分钟`;
  const timeEn = e.seconds < 90 ? `~${e.seconds}s` : `~${minutes} min`;

  // D47 (work order 89 ⑧): the price is the new page formula — first 20
  // pages in blocks of five, every page after that — said BEFORE the read,
  // from the same tested arithmetic the route charges with. The fence line
  // (lifetime free pages, min(N,5)) is the OTHER meter and reads unchanged.
  return (
    <p className="rounded-sm border border-[color:var(--v2-border)] bg-white/60 px-3 py-2 text-sm text-muted-foreground dark:bg-white/5">
      🧮{" "}
      <Tri
        bm={`${e.pages} muka surat → menolak ${e.actions} tindakan AI (pelan percuma: ${e.fencePages} muka surat daripada baki seumur hidup)${parts > 1 ? ` · dibaca dalam ${parts} bahagian` : ""} · anggaran ${timeBm}.`}
        zh={`这份共 ${e.pages} 页 → 会扣 ${e.actions} 次 AI 用量（免费版终身页数扣 ${e.fencePages} 页）${parts > 1 ? `、分 ${parts} 段读` : ""}，预计${timeZh}。`}
        en={`${e.pages} page${e.pages === 1 ? "" : "s"} → deducts ${e.actions} AI action${e.actions === 1 ? "" : "s"} (free plan: ${e.fencePages} of the lifetime page allowance)${parts > 1 ? ` · read in ${parts} parts` : ""} · about ${timeEn}.`}
      />
    </p>
  );
}
