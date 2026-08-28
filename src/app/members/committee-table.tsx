"use client";

// The filed committee as a searchable table (B-3, work order 51).
//
// Client component because SEARCH is client state; the rows themselves are
// server-fetched by page.tsx and passed down. With 100+ members (the pilot
// temple network), "find 陈" must not mean scrolling.

import { useState } from "react";
import { Tri, useTriText } from "@/components/language-provider";
import { RemoveCommitteeButton } from "./members-form";

export type CommitteeRow = {
  id: number;
  position: string;
  person_name: string;
  name_official: string | null;
  term_start: string | null;
  /** Migration 32 (B-6/B-7) — absent while the DB is behind. */
  note?: string | null;
  honorific?: string | null;
};

export function CommitteeTable({
  rows,
  canEdit,
}: {
  rows: CommitteeRow[];
  canEdit: boolean;
}) {
  const t = useTriText();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown =
    needle === ""
      ? rows
      : rows.filter((m) =>
          [m.position, m.person_name, m.name_official, m.note, m.honorific]
            .filter((v): v is string => typeof v === "string")
            .some((v) => v.toLowerCase().includes(needle)),
        );

  if (rows.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        <Tri
          bm="Masih kosong — tambah seorang di atas, atau tampal senarai sedia ada."
          zh="还是空的 —— 在上面加一位，或者把已经有的名单贴进来。"
          en="Still empty — add someone above, or paste a list you already have."
        />
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 5 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(
            "Cari nama atau jawatan…",
            "搜姓名或职位…",
            "Search a name or position…",
          )}
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
                  <Tri bm="Jawatan" zh="职位" en="Position" />
                </th>
                <th className="px-2 py-2 font-medium">
                  <Tri bm="Nama" zh="姓名" en="Name" />
                </th>
                <th className="px-2 py-2 font-medium">
                  <Tri
                    bm="Nama dalam IC (eROSES)"
                    zh="身份证上的名字（eROSES）"
                    en="Name on IC (eROSES)"
                  />
                </th>
                <th className="px-2 py-2 font-medium">
                  <Tri bm="Dilantik" zh="任命日期" en="Appointed" />
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-3 align-top">{m.position}</td>
                  <td className="px-2 py-3 align-top">
                    <span className="font-semibold">{m.person_name}</span>
                    {/* B-7: the title the society uses (陈讲师 = 陈 + 讲师). */}
                    {(m.honorific ?? "").trim() !== "" && (
                      <span className="ml-1.5 rounded-xs bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {m.honorific}
                      </span>
                    )}
                    {/* B-6: the society's own tell-apart note, right beside
                        the name wherever the name is shown. */}
                    {(m.note ?? "").trim() !== "" && (
                      <span className="ml-1.5 text-sm text-muted-foreground">
                        {m.note}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3 align-top">
                    {/* Amber, not grey: the same gap the banner counts. Empty
                        string counts as missing too — the roster import
                        writes "" where a photo showed no IC name. */}
                    {(m.name_official ?? "").trim() !== "" ? (
                      m.name_official
                    ) : (
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        <Tri bm="belum diisi" zh="还没填" en="not filled in" />
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3 align-top text-sm text-muted-foreground">
                    {m.term_start ?? "—"}
                  </td>
                  <td className="px-2 py-3 text-right align-top">
                    {canEdit && <RemoveCommitteeButton id={m.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
