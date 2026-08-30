"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  isConfirmedClauseArray,
  mergeClauses,
  sortClauses,
  QA_DISCLAIMER_BM,
  QA_DISCLAIMER_EN,
  QA_DISCLAIMER_ZH,
  type ConfirmedClause,
} from "@/lib/constitution";
import { ClauseList } from "./clause-list";
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
  const title = stored?.title ?? "";

  if (book.length === 0) {
    return (
      <div className="rounded-md border-2 border-dashed p-6 text-base">
        <p className="text-lg font-semibold">
          <Tri
            bm="MinitAI belum membaca perlembagaan anda."
            zh="MinitAI 还没有读过您的章程。"
            en="MinitAI has not read your constitution yet."
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
      <p className="text-sm text-muted-foreground">
        {orgName ?? ""}
        {title ? ` · ${title}` : ""}
        {" · "}
        <Tri bm={QA_DISCLAIMER_BM} zh={QA_DISCLAIMER_ZH} en={QA_DISCLAIMER_EN} />
      </p>

      {/* 97 §3(d): search + list + hierarchy + orphan sinking live in ONE
          shared component now — /constitution's "whole book" block renders
          the same code with the collapsible skin. */}
      <ClauseList book={book} variant="cards" />
    </div>
  );
}
