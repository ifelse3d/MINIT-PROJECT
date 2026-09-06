"use client";

import { Tri, useTriText } from "@/components/language-provider";
import type { MeetingNotesExtraction } from "@/lib/extraction";
import { usableResolutions } from "@/lib/minutes-compose";

// ---------------------------------------------------------------------------
// THE WAY HOME FROM THE DOCUMENT (work order 118 §2-3).
//
// The "formal version / original" card is gone (J, 8/31 第 22 條): the strict
// rules moved onto the document itself. What had to SURVIVE that removal is
// the one thing the card was actually for — from any line of the finished
// document, one look back at the words the paper carried and where on the
// page they were read. FieldRow already shows that on the review step; this
// is the same fact on the document step, one row per line the document is
// built from, in the document's own numbering.
//
// Zero AI. The circled numbers are the ones the ask-back cards use too
// (「④ 這一條有兩種讀法」), so a question and its line match by eye.
// ---------------------------------------------------------------------------

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** ① … ⑳, then (21) — the same marker the ask-back cards print. */
export function circled(n: number): string {
  return n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : `(${n})`;
}

/** The 1-based photo page a source_ref names ("photo 2, line 3" / "halaman
 *  2" / "第 2 页"), or null. Same regex FieldRow's compare panel uses. */
export function pageOfLocation(location: string | undefined | null): number | null {
  if (!location) return null;
  const m = location.match(/(?:halaman|page|photo)\s*(\d+)|第\s*(\d+)\s*[页頁]/i);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function ItemSources({
  extraction,
  photoCount,
  onOpenPage,
}: {
  extraction: MeetingNotesExtraction;
  /** How many original pages there are to open; 0 hides the buttons. */
  photoCount: number;
  /** Opens the original page (0-based) in the lightbox. */
  onOpenPage?: (page: number) => void;
}) {
  const t = useTriText();
  const rows = usableResolutions(extraction);
  if (rows.length === 0) return null;
  return (
    <details open className="rounded-md border-2 border-[color:var(--v2-border)] p-3">
      <summary className="cursor-pointer text-base font-medium">
        📎{" "}
        <Tri
          bm={`Setiap baris, dari mana ia dibaca (${rows.length})`}
          zh={`每一条读自哪里（${rows.length}）`}
          en={`Where each line was read (${rows.length})`}
        />
      </summary>
      <p className="mt-1 text-sm text-muted-foreground">
        <Tri
          bm="Dokumen di atas dibina daripada baris-baris ini, perkataan demi perkataan seperti yang dibaca. Setiap satu menunjukkan tempat AI membacanya."
          zh="上面的文件就是从这些字建出来的 —— 一字不改，照读到的样子。每一条都写着 AI 是在哪里读到的。"
          en="The document above is built from these lines, word for word as they were read. Each one says where the AI read it."
        />
      </p>
      <ol className="mt-2 flex flex-col gap-2">
        {rows.map((r, i) => {
          const page = pageOfLocation(r.text.source_ref?.location);
          const canOpen =
            onOpenPage !== undefined && page !== null && page <= photoCount;
          return (
            <li
              key={i}
              data-probe="item-source"
              className="flex flex-col gap-0.5 border-b pb-2 last:border-b-0"
            >
              <p className="whitespace-pre-wrap text-base">
                <span className="mr-1 font-semibold tabular-nums">{circled(i + 1)}</span>
                {r.text.value}
              </p>
              {r.text.source_ref && (
                <p className="text-sm text-muted-foreground">
                  <Tri bm="AI baca di" zh="AI 读到的位置" en="The AI read this at" />{" "}
                  {r.text.source_ref.location}
                  {r.text.source_ref.snippet &&
                    r.text.source_ref.snippet !== r.text.value && (
                      <>
                        {" "}
                        · <span className="font-mono">&ldquo;{r.text.source_ref.snippet}&rdquo;</span>
                      </>
                    )}
                  {canOpen && (
                    <>
                      {" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={() => onOpenPage(page - 1)}
                        className="underline underline-offset-4"
                      >
                        {t("lihat gambar asal", "看原稿", "see the original")} →
                      </button>
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
