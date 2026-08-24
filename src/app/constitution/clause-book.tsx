"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import {
  isConfirmedClauseArray,
  mergeClauses,
  searchClauses,
  sortClauses,
  QA_DISCLAIMER_BM,
  QA_DISCLAIMER_EN,
  QA_DISCLAIMER_ZH,
  type ConfirmedClause,
} from "@/lib/constitution";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";

// ---------------------------------------------------------------------------
// THE CONSTITUTION, TO READ.
//
// J's UX list, N7 (2026-08-07): 「章程抽出来的条文躺在 constitutions 表里没有阅读
// 介面」. Minit had read the whole book, stored every clause verbatim, and used
// them to answer questions — but there was nowhere to just READ it. So the
// answer to "what else does clause 12 say" was still "go and find the PDF".
//
// Deliberately NOT the Q&A. That screen (constitution-review.tsx) takes a
// question, expands synonyms across three languages, and returns the six best
// clauses. This one takes a substring and returns every clause that contains
// it, in the order of the book. Somebody who types "12.3" wants clause 12.3,
// and somebody reading their own constitution must not have the seventh match
// silently dropped.
//
// Nothing here is generated, summarised or explained. Clause text is verbatim
// (Hard Rule 1) and stays verbatim: paraphrasing a clause of a legal document
// is inventing one.
// ---------------------------------------------------------------------------

/** The same localStorage blob constitution-review.tsx writes. */
/** Pre-S0-4 global key — adopted into the scoped key once, then removed. */
const CONSTITUTION_LEGACY_KEY = "minit.constitution.v1";

type StoredConstitution = {
  title: string;
  clauses: ConfirmedClause[];
  sourceLabel: string;
};

function isStoredConstitution(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const r = parsed as Record<string, unknown>;
  if (typeof r.title !== "string" || typeof r.sourceLabel !== "string") return false;
  return isConfirmedClauseArray(r.clauses);
}

export function ClauseBook({
  /** Clauses from the organisation's records, read on the server. */
  orgClauses,
  orgName,
}: {
  orgClauses: ConfirmedClause[];
  orgName: string | null;
}) {
  const t = useTriText();
  const [query, setQuery] = useState("");

  // Read-only here: this page never writes the constitution. It reads the
  // device's copy because a page photographed a minute ago is on THIS device
  // before it is anywhere else, and a reader who has just finished
  // photographing should not be told their constitution is empty.
  const [stored] = usePersistentState<StoredConstitution | null>(
    // S0-4: scoped per user+org — a shared laptop must not show one
    // account's constitution to the next.
    useScopedKey("constitution:v1"),
    null,
    (p) => p === null || isStoredConstitution(p),
    CONSTITUTION_LEGACY_KEY,
  );

  // mergeClauses, not concat: the two copies overlap on almost every clause,
  // and the device's is the newer of the two while a book is being read in.
  const book = useMemo(
    () => sortClauses(mergeClauses(orgClauses, stored?.clauses ?? [])),
    [orgClauses, stored],
  );
  const shown = useMemo(() => searchClauses(book, query), [book, query]);
  const title = stored?.title ?? "";

  if (book.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed p-6 text-base">
        <p className="text-lg font-semibold">
          <Tri
            bm="Minit belum membaca perlembagaan anda."
            zh="Minit 还没有读过您的章程。"
            en="Minit has not read your constitution yet."
          />
        </p>
        <p className="mt-2 text-muted-foreground">
          <Tri
            bm="Ambil gambar setiap muka surat di halaman Perlembagaan. Selepas itu, seluruh fasal boleh dibaca di sini tanpa membuka PDF asal."
            zh="请在「章程」页把每一页拍下来。之后整本条文都可以在这里读，不用再开原本的 PDF。"
            en="Photograph each page on the Constitution screen. After that the whole book can be read here without opening the original PDF."
          />
        </p>
        <Button asChild size="lg" className="mt-4">
          <Link href="/constitution">
            <Tri bm="Ke halaman Perlembagaan" zh="去章程页" en="Go to the Constitution page" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/60 p-4 dark:bg-white/5">
        <label className="flex min-w-56 flex-1 items-center gap-2">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={2} />
          <span className="sr-only">
            <Tri bm="Cari dalam perlembagaan" zh="在章程里搜索" en="Search the constitution" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "Cari fasal, tajuk atau perkataan — cth. 12.3, kuorum, notis",
              "找条号、标题或字词 —— 例如 12.3、法定人数、通知",
              "Find a clause, heading or word — e.g. 12.3, quorum, notice",
            )}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <p className="text-base text-muted-foreground">
          {query.trim() === "" ? (
            <Tri
              bm={`${book.length} fasal`}
              zh={`共 ${book.length} 条`}
              en={`${book.length} clauses`}
            />
          ) : (
            <Tri
              bm={`${shown.length} daripada ${book.length} fasal`}
              zh={`${book.length} 条里符合 ${shown.length} 条`}
              en={`${shown.length} of ${book.length} clauses`}
            />
          )}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        {orgName ?? ""}
        {title ? ` · ${title}` : ""}
        {" · "}
        <Tri bm={QA_DISCLAIMER_BM} zh={QA_DISCLAIMER_ZH} en={QA_DISCLAIMER_EN} />
      </p>

      {shown.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
          {/* Says which of the two things happened. "Not in your constitution"
              and "we have not read that page yet" are very different news to
              somebody deciding whether they may hold a meeting. */}
          <Tri
            bm={`Tiada fasal mengandungi “${query.trim()}”. Ia mungkin memang tiada dalam perlembagaan anda — atau muka surat itu belum difoto lagi.`}
            zh={`没有条文包含「${query.trim()}」。可能您的章程里本来就没有这一条 —— 也可能那一页还没有拍进来。`}
            en={`No clause contains “${query.trim()}”. It may genuinely not be in your constitution — or that page may not have been photographed yet.`}
          />
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((c) => (
            <li
              key={c.clause_no}
              // Anchored so an answer elsewhere can link straight to the clause
              // it cited, which is the whole point of citing it.
              id={`clause-${encodeURIComponent(c.clause_no)}`}
              className="scroll-mt-24 rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/60 p-4 target:border-amber-400 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-base font-bold">{c.clause_no}</span>
                {c.heading && <span className="text-lg font-semibold">{c.heading}</span>}
                {c.page_ref && (
                  <span className="text-sm text-muted-foreground">{c.page_ref}</span>
                )}
              </div>
              {/* whitespace-pre-line: the clause is stored exactly as printed,
                  and a constitution's line breaks are part of how it reads. */}
              <p className="mt-2 whitespace-pre-line text-base">{c.text}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
