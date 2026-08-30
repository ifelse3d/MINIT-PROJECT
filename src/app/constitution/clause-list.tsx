"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tri, useTriText } from "@/components/language-provider";
import { searchClauses, type ConfirmedClause } from "@/lib/constitution";
import {
  annotateClauseHierarchy,
  cleanClauseField,
  shortPageRef,
  sinkOrphanClauses,
  splitClauseText,
  type DisplayClause,
} from "@/lib/constitution-display";

// ---------------------------------------------------------------------------
// THE ONE CLAUSE LIST (work order 97 §3(d)). /constitution's "whole book"
// block and /constitution/clauses used to carry two hand-rolled copies of
// the same search-and-render logic — Hard Rule 13's "pure logic into lib
// BEFORE the UI divides" applied to a component: ONE list, two skins.
//
//   * variant "cards":       every clause open, anchored (#clause-N) — the
//                            reading page, and where AI answers link to.
//   * variant "collapsible": <details> rows — the compact block on
//                            /constitution.
//
// Display-only throughout: search, hierarchy indent, orphan sinking and the
// "missing"-word scrub never change a stored byte (Hard Rule 1).
// ---------------------------------------------------------------------------

export function ClauseList({
  book,
  variant,
}: {
  /** The full (sorted) book — searching and combing happen in here. */
  book: ConfirmedClause[];
  variant: "cards" | "collapsible";
}) {
  const t = useTriText();
  const [query, setQuery] = useState("");

  // §3(c): bare "(3)"-style orphans in a Fasal-style book sink to the end;
  // §3(a): the literal word "missing" never prints as a heading/page value.
  const { main, orphans } = useMemo(() => {
    const scrubbed = book.map((c) => ({
      ...c,
      heading: cleanClauseField(c.heading),
      page_ref: cleanClauseField(c.page_ref),
    }));
    return sinkOrphanClauses(scrubbed);
  }, [book]);

  const shownMain = useMemo(
    () => annotateClauseHierarchy(searchClauses(main, query)),
    [main, query],
  );
  const shownOrphans = useMemo(
    () => searchClauses(orphans, query).map((clause) => ({ clause, child: false })),
    [orphans, query],
  );
  const shownCount = shownMain.length + shownOrphans.length;

  const renderClause = ({ clause: c, child }: DisplayClause) => {
    const parts = splitClauseText(c.clause_no, c.text).map((part, i) => (
      <p
        key={i}
        className={`whitespace-pre-line text-base leading-relaxed ${
          i > 0 || variant === "cards" ? "mt-2" : ""
        } ${part.label !== null ? "pl-4" : ""}`}
      >
        {part.text}
      </p>
    ));

    if (variant === "collapsible") {
      return (
        <details
          key={c.clause_no}
          id={`clause-${encodeURIComponent(c.clause_no)}`}
          className={`group scroll-mt-24 rounded-sm border ${
            child ? "ml-5 border-l-4 border-l-purple-300 @xl:ml-8" : ""
          }`}
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm p-4 hover:bg-accent">
            <Badge
              variant="outline"
              className="shrink-0 border-purple-300 bg-purple-50 text-purple-900"
            >
              {c.clause_no}
            </Badge>
            {/* An untitled clause shows no placeholder — the missing heading
                is the book's own fact. */}
            <span className="flex-1 font-medium">{c.heading}</span>
            {c.page_ref && (
              <span className="text-sm text-muted-foreground" title={c.page_ref}>
                {shortPageRef(c.page_ref)}
              </span>
            )}
            <span className="text-muted-foreground transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t p-4">{parts}</div>
        </details>
      );
    }

    return (
      <li
        key={c.clause_no}
        // Anchored so an answer elsewhere can link straight to the clause it
        // cited, which is the whole point of citing it.
        id={`clause-${encodeURIComponent(c.clause_no)}`}
        className={`scroll-mt-24 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-4 target:border-amber-400 dark:bg-white/5 ${
          child ? "ml-5 border-l-4 border-l-[#a855f7]/35 @xl:ml-8" : ""
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-base font-bold">{c.clause_no}</span>
          {c.heading && <span className="text-lg font-semibold">{c.heading}</span>}
          {c.page_ref && (
            <span className="text-sm text-muted-foreground" title={c.page_ref}>
              {shortPageRef(c.page_ref)}
            </span>
          )}
        </div>
        {parts}
      </li>
    );
  };

  const orphanNote = (
    <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
      <Tri
        bm="Perkara di bawah ialah sub-perkara sesuatu Fasal — muka surat dengan tajuk Fasal itu tidak difoto atau tidak dapat dibaca. Ambil semula gambar muka surat yang ada tajuknya dan ia akan duduk di tempatnya."
        zh="下面这几条是某个 Fasal 的子条 —— 那一页的 Fasal 标题没拍到或没认出。重拍含标题的那一页，它们就会归位。"
        en="The clauses below are sub-clauses of some Fasal — the page carrying that Fasal's heading was not photographed or could not be read. Re-photograph the page with the heading and they will slot into place."
      />
    </p>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-4 dark:bg-white/5">
        <label className="flex min-w-56 flex-1 items-center gap-2">
          <Search
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
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
              bm={`${shownCount} daripada ${book.length} fasal`}
              zh={`${book.length} 条里符合 ${shownCount} 条`}
              en={`${shownCount} of ${book.length} clauses`}
            />
          )}
        </p>
      </div>

      {shownCount === 0 ? (
        <p className="rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
          {/* Says which of the two things happened. "Not in your constitution"
              and "we have not read that page yet" are very different news to
              somebody deciding whether they may hold a meeting. */}
          <Tri
            bm={`Tiada fasal mengandungi “${query.trim()}”. Ia mungkin memang tiada dalam perlembagaan anda — atau muka surat itu belum difoto lagi.`}
            zh={`没有条文包含「${query.trim()}」。可能您的章程里本来就没有这一条 —— 也可能那一页还没有拍进来。`}
            en={`No clause contains “${query.trim()}”. It may genuinely not be in your constitution — or that page may not have been photographed yet.`}
          />
        </p>
      ) : variant === "collapsible" ? (
        <div className="flex flex-col gap-2">
          {shownMain.map(renderClause)}
          {shownOrphans.length > 0 && orphanNote}
          {shownOrphans.map(renderClause)}
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-3">{shownMain.map(renderClause)}</ol>
          {shownOrphans.length > 0 && orphanNote}
          {shownOrphans.length > 0 && (
            <ol className="flex flex-col gap-3">{shownOrphans.map(renderClause)}</ol>
          )}
        </>
      )}
    </div>
  );
}
