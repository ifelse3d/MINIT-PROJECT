"use client";

// The glossary as a searchable, paged table (B-3 + B-10, work order 51).
//
// Client component because search/paging are client state; rows come from the
// server page. A temple's glossary is names — hundreds of them — and "find
// 昶源" must not mean scrolling page after page.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { DeleteTermButton } from "./glossary-form";

export type GlossaryRow = {
  id: number;
  term: string;
  action: "keep" | "translate";
  translation: string | null;
  note: string | null;
  lang?: "bm" | "zh" | "en" | null;
  render_bm?: string | null;
  render_zh?: string | null;
  render_en?: string | null;
};

const PAGE_SIZE = 20;

/** What one language column shows for a row that HAS renderings. */
function renderFor(row: GlossaryRow, lang: "bm" | "zh" | "en"): string | null {
  if (lang === "bm")
    return row.render_bm ?? (row.action === "translate" ? row.translation : null);
  return lang === "zh" ? (row.render_zh ?? null) : (row.render_en ?? null);
}

export function GlossaryTable({
  rows,
  canEdit,
}: {
  rows: GlossaryRow[];
  canEdit: boolean;
}) {
  const t = useTriText();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const needle = q.trim().toLowerCase();
  const filtered =
    needle === ""
      ? rows
      : rows.filter((r) =>
          [r.term, r.translation, r.note, r.render_bm, r.render_zh, r.render_en]
            .filter((v): v is string => typeof v === "string")
            .some((v) => v.toLowerCase().includes(needle)),
        );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (rows.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        <Tri
          bm="Masih kosong. Mulakan dengan nama ahli yang sering disalah baca, dan nama kelas atau ajaran anda."
          zh="还是空的。可以先加最常被读错的人名，还有你们的班别、法号这类。"
          en="Still empty. Start with the members' names that get misread most, and your class or teaching names."
        />
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 5 && (
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder={t("Cari perkataan…", "搜词…", "Search a word…")}
          className="w-full max-w-sm rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base outline-none focus:border-[color:var(--v2-primary)]"
        />
      )}
      {shown.length === 0 ? (
        <p className="text-base text-muted-foreground">
          <Tri
            bm={`Tiada padanan untuk "${q}".`}
            zh={`找不到「${q}」。`}
            en={`No match for "${q}".`}
          />
        </p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-base">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="px-2 py-2 font-medium">
                  <Tri bm="Perkataan asal" zh="原本的词" en="Original word" />
                </th>
                <th className="px-2 py-2 font-medium">Bahasa Malaysia</th>
                <th className="px-2 py-2 font-medium">
                  <Tri bm="Cina" zh="中文" en="Chinese" />
                </th>
                <th className="px-2 py-2 font-medium">English</th>
                <th className="px-2 py-2 font-medium">
                  <Tri bm="Ia apa" zh="这是什么" en="What it is" />
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                // B-10: a word with NO renderings anywhere is a "keep exactly"
                // word — one clear sentence across the three columns, instead
                // of three grey repeats plus a "(original)" that read as a bug.
                const keepEverywhere =
                  (["bm", "zh", "en"] as const).every(
                    (l) => r.lang === l || !renderFor(r, l),
                  );
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-3 align-top">
                      <span className="font-semibold">{r.term}</span>
                      {r.lang && (
                        <span className="ml-1.5 rounded-xs bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {r.lang === "bm" ? "BM" : r.lang === "zh" ? "中文" : "EN"}
                        </span>
                      )}
                    </td>
                    {keepEverywhere ? (
                      <td colSpan={3} className="px-2 py-3 align-top text-sm text-muted-foreground">
                        <Tri
                          bm="Dikekalkan seperti asal dalam semua bahasa — tidak diterjemah."
                          zh="三种语言都保持原字，不翻译。"
                          en="Kept exactly as written in every language — never translated."
                        />
                      </td>
                    ) : (
                      (["bm", "zh", "en"] as const).map((l) => (
                        <td key={l} className="px-2 py-3 align-top">
                          {r.lang === l ? (
                            // B-10: the original language's cell shows the word
                            // itself — the "(original)" suffix looked like a bug.
                            <span className="font-medium">{r.term}</span>
                          ) : renderFor(r, l) ? (
                            renderFor(r, l)
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              <Tri bm="ikut asal" zh="照原字" en="as original" />
                            </span>
                          )}
                        </td>
                      ))
                    )}
                    <td className="px-2 py-3 align-top text-sm text-muted-foreground">
                      {r.note ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-right align-top">
                      {canEdit && <DeleteTermButton id={r.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* B-3: pages, so five hundred names do not render as one endless wall. */}
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ← <Tri bm="Sebelum" zh="上一页" en="Previous" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {safePage + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <Tri bm="Seterusnya" zh="下一页" en="Next" /> →
          </Button>
        </div>
      )}
    </div>
  );
}
