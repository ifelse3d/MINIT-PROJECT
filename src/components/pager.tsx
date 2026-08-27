import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tri } from "@/components/language-provider";
import { pageHref, type PageSummary } from "@/lib/list-page";

// ---------------------------------------------------------------------------
// The bar under a history list: what you are looking at, and how to reach the
// rest of it.
//
// A server component on purpose — both history pages are server-rendered and
// the filters are a plain GET form, so the whole thing works with JavaScript
// off and every page has an address you can send to somebody.
// ---------------------------------------------------------------------------

export function Pager({
  summary,
  basePath,
  /** The current filters, carried through so paging never drops them. */
  params,
  /** What is being counted, in the reader's language: receipts, minutes… */
  nounBm,
  nounZh,
  nounEn,
}: {
  summary: PageSummary;
  basePath: string;
  params: Record<string, string | undefined>;
  nounBm: string;
  nounZh: string;
  nounEn: string;
}) {
  const { first, last, total, page, pageCount, hasPrev, hasNext } = summary;

  const arrow =
    "inline-flex min-h-11 items-center gap-1 rounded-sm border-2 px-4 text-base font-medium";
  const enabled = "border-[color:var(--v2-border)] hover:bg-accent active:scale-95";
  const disabled = "border-transparent text-muted-foreground/50 pointer-events-none";

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-base text-muted-foreground">
        {total === 0 ? (
          // K-4: nounZh carries its measure word ("张收据"), so `没有张收据`
          // was broken Chinese. "一张收据也没有" reuses the same string and
          // reads right.
          <Tri
            bm={`Tiada ${nounBm}`}
            zh={`一${nounZh}也没有`}
            en={`No ${nounEn}`}
          />
        ) : (
          // Says exactly which slice of exactly how many. The old version
          // printed a total computed from the rows it was holding, so a temple
          // with 1043 receipts was told it had 200.
          <Tri
            bm={`Menunjukkan ${first}–${last} daripada ${total} ${nounBm}`}
            zh={`显示第 ${first}–${last} 项，共 ${total} ${nounZh}`}
            en={`Showing ${first}–${last} of ${total} ${nounEn}`}
          />
        )}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Link
            href={pageHref(basePath, params, page - 1)}
            aria-disabled={!hasPrev}
            tabIndex={hasPrev ? undefined : -1}
            className={`${arrow} ${hasPrev ? enabled : disabled}`}
          >
            <ChevronLeft aria-hidden className="size-5" strokeWidth={2.4} />
            <Tri bm="Sebelum" zh="上一页" en="Previous" />
          </Link>
          <span className="text-base tabular-nums text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Link
            href={pageHref(basePath, params, page + 1)}
            aria-disabled={!hasNext}
            tabIndex={hasNext ? undefined : -1}
            className={`${arrow} ${hasNext ? enabled : disabled}`}
          >
            <Tri bm="Seterusnya" zh="下一页" en="Next" />
            <ChevronRight aria-hidden className="size-5" strokeWidth={2.4} />
          </Link>
        </div>
      )}
    </div>
  );
}
