"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { searchClauses, type ConfirmedClause } from "@/lib/constitution";
import {
  annotateClauseHierarchy,
  cleanClauseField,
  markOrphanClauses,
  proposeOrphanHomes,
  shortPageRef,
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
// Display-only throughout: search, hierarchy indent, orphan TAGGING (§4 of
// work order 104 — they used to be moved; now they are only marked) and the
// "missing"-word scrub never change a stored byte (Hard Rule 1).
// ---------------------------------------------------------------------------

export function ClauseList({
  book,
  variant,
  storedOrder,
  onReattach,
}: {
  /** The full (sorted) book — searching and combing happen in here. */
  book: ConfirmedClause[];
  variant: "cards" | "collapsible";
  /**
   * §0-6 (work order 100): the STORED (reading-order) array, for proposing a
   * home per orphan run — sorting interleaves the orphans by number, so the
   * sorted book cannot say which Fasal each was read UNDER. Optional: without
   * it (or without onReattach) the list behaves exactly as before.
   */
  storedOrder?: ConfirmedClause[];
  /** Confirm one proposal — rename the orphans under the parent, traced. */
  onReattach?: (
    orphanNos: string[],
    parentNo: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const [query, setQuery] = useState("");
  const [reattachBusy, setReattachBusy] = useState<string | null>(null);
  const [reattachError, setReattachError] = useState<string | null>(null);

  // §0-6: "these look like they belong under Fasal X" — pure derivation.
  const proposals = useMemo(
    () => (storedOrder && onReattach ? proposeOrphanHomes(storedOrder) : []),
    [storedOrder, onReattach],
  );

  // §4 (104): orphans stay in NUMBER ORDER and are TAGGED — they no longer
  // move to the end (97 §3) and no longer jump to the top (the sortClauses
  // root cause, fixed in src/lib/constitution.ts).
  // §3(a): the literal word "missing" never prints as a heading/page value.
  const { clauses: combed, orphanNos } = useMemo(() => {
    const scrubbed = book.map((c) => ({
      ...c,
      heading: cleanClauseField(c.heading),
      page_ref: cleanClauseField(c.page_ref),
    }));
    return markOrphanClauses(scrubbed);
  }, [book]);

  const shown = useMemo(
    () => annotateClauseHierarchy(searchClauses(combed, query)),
    [combed, query],
  );
  const shownCount = shown.length;
  /** Tagged clauses the current search is actually showing. */
  const shownOrphanCount = shown.filter((d) =>
    orphanNos.has(d.clause.clause_no.trim()),
  ).length;

  /** §4: the quiet tag. It says the ONE thing that is true — MinitAI could
   *  not find the Fasal this sub-clause hangs under — and nothing more. */
  const orphanTag = (
    <span
      className="rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200"
      title={t(
        "Fasal induk tidak dijumpai dalam apa yang MinitAI pegang",
        "在 MinitAI 手上这份里找不到它的父条",
        "The parent Fasal is not in what MinitAI holds",
      )}
    >
      <Tri bm="induk tiada" zh="找不到父条" en="no parent found" />
    </span>
  );

  const renderClause = ({ clause: c, child }: DisplayClause) => {
    const orphan = orphanNos.has(c.clause_no.trim());
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
            {orphan && orphanTag}
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
          {orphan && orphanTag}
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

  async function confirmReattach(nos: string[], parentNo: string) {
    if (!onReattach || reattachBusy) return;
    setReattachBusy(parentNo);
    setReattachError(null);
    try {
      const r = await onReattach(nos, parentNo);
      if (!r.ok) setReattachError(r.error ?? "…");
    } catch {
      setReattachError(
        t(
          "Sambungan terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The connection dropped. Please try again.",
        ),
      );
    } finally {
      setReattachBusy(null);
    }
  }

  const orphanNote = (
    <div className="flex flex-col gap-2">
      {/* §4 (104): ONE line at the top of the list saying how many clauses
          carry the tag, so the warning is not only a small label somebody has
          to notice. The clauses themselves stay in number order below. */}
      <p className="text-sm text-muted-foreground">
        <Tri
          bm={`${shownOrphanCount} perkara ditanda «induk tiada» — ia kekal pada nombornya dalam senarai di bawah.`}
          zh={`有 ${shownOrphanCount} 条标了「找不到父条」—— 它们照号码留在下面的清单里。`}
          en={`${shownOrphanCount} clause(s) tagged “no parent found” — they stay at their own number in the list below.`}
        />
      </p>
      {/* §0-6: the agent's proposal comes FIRST; re-photographing is the
          fallback line inside it, not the only road any more. */}
      {proposals.map((p) => (
        <div
          key={p.parentNo}
          className="flex flex-col gap-2 rounded-md border-2 border-[color:var(--v2-primary)]/40 bg-white/70 p-3 dark:bg-white/10"
        >
          <p className="text-base">
            💡{" "}
            <Tri
              bm={`Perkara ${p.orphanNos.join(" ")} di bawah nampaknya tergolong di bawah ${p.parentNo}${p.parentHeading ? ` 《${p.parentHeading}》` : ""} — halaman itu dibaca sejurus selepasnya. Mahu letak di situ?`}
              zh={`下面的 ${p.orphanNos.join(" ")} 看起来是 ${p.parentNo}${p.parentHeading ? `《${p.parentHeading}》` : ""} 底下的 —— 拍照时它们就跟在那一条后面。要挂进去吗？`}
              en={`The clauses ${p.orphanNos.join(" ")} below look like they belong under ${p.parentNo}${p.parentHeading ? ` (“${p.parentHeading}”)` : ""} — they were read right after it. Slot them in?`}
            />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={reattachBusy !== null}
              onClick={() => void confirmReattach(p.orphanNos, p.parentNo)}
            >
              {reattachBusy === p.parentNo ? (
                <Tri bm="Memindahkan…" zh="归位中…" en="Slotting in…" />
              ) : (
                <Tri
                  bm={`✓ Letak di bawah ${p.parentNo} (percuma, direkodkan)`}
                  zh={`✓ 挂进 ${p.parentNo}（免费，会留痕）`}
                  en={`✓ Slot under ${p.parentNo} (free, recorded)`}
                />
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              <Tri
                bm="Tak pasti? Ambil semula gambar muka surat yang ada tajuk Fasal itu pun boleh."
                zh="不确定？重拍含 Fasal 标题的那一页也可以。"
                en="Not sure? Re-photographing the page with the Fasal heading also works."
              />
            </span>
          </div>
        </div>
      ))}
      {reattachError && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {localizeError(reattachError)}
        </p>
      )}
      {proposals.length === 0 && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Perkara di bawah ialah sub-perkara sesuatu Fasal — muka surat dengan tajuk Fasal itu tidak difoto atau tidak dapat dibaca. Ambil semula gambar muka surat yang ada tajuknya dan ia akan duduk di tempatnya."
            zh="下面这几条是某个 Fasal 的子条 —— 那一页的 Fasal 标题没拍到或没认出。重拍含标题的那一页，它们就会归位。"
            en="The clauses below are sub-clauses of some Fasal — the page carrying that Fasal's heading was not photographed or could not be read. Re-photograph the page with the heading and they will slot into place."
          />
        </p>
      )}
    </div>
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
      ) : (
        <>
          {/* §4 (104): the note sits ABOVE the book now. The orphans are IN
              the book, at their own numbers — there is no second list. */}
          {shownOrphanCount > 0 && orphanNote}
          {variant === "collapsible" ? (
            <div className="flex flex-col gap-2">{shown.map(renderClause)}</div>
          ) : (
            <ol className="flex flex-col gap-3">{shown.map(renderClause)}</ol>
          )}
        </>
      )}
    </div>
  );
}
