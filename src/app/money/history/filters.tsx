"use client";

import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// Finding one receipt among a thousand.
//
// J, 2026-08-22: 「我手上不算重複的就有超過 1000 了」. A list of a thousand rows,
// newest first, is not a way to answer "which receipt did Tan Ah Kow get in
// June" — and the receipt number is exactly the thing somebody is holding when
// they ring up to ask.
//
// A plain GET form for the same reasons as /minutes/history: the server filters
// inside RLS, the result has an address you can send to somebody, and it works
// with JavaScript off.
// ---------------------------------------------------------------------------

const field =
  "min-h-11 rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ReceiptFilters({
  q,
  from,
  to,
  active,
}: {
  q: string;
  from: string;
  to: string;
  active: boolean;
}) {
  const t = useTriText();
  return (
    <form
      method="get"
      action="/money/history"
      className="mb-6 flex flex-wrap items-end gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-4 dark:bg-white/5"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Nombor resit" zh="收据号码" en="Receipt number" />
        </span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t("cth. 2026-0042", "例如：2026-0042", "e.g. 2026-0042")}
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Dijana dari" zh="开出日期从" en="Issued from" />
        </span>
        <input type="date" name="from" defaultValue={from} className={field} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Hingga" zh="到" en="To" />
        </span>
        <input type="date" name="to" defaultValue={to} className={field} />
      </label>

      <Button type="submit" size="lg" className="text-base">
        <Tri bm="Cari" zh="查找" en="Search" />
      </Button>
      {active && (
        <Button type="button" variant="outline" size="lg" asChild>
          <a href="/money/history">
            <Tri bm="Kosongkan" zh="清掉条件" en="Clear" />
          </a>
        </Button>
      )}
      <p className="w-full text-sm text-muted-foreground">
        {/* Said out loud because the box invites the obvious other search, and
            silently returning nothing would read as "we have no such receipt". */}
        <Tri
          bm="Nama penderma tidak boleh dicari di sini — ia disorok untuk melindungi privasi mereka. Cari dengan nombor resit atau tarikh."
          zh="这里不能用捐款人姓名搜索 —— 姓名为保护隐私已经隐藏。请用收据号码或日期找。"
          en="Donor names cannot be searched here — they are hidden to protect privacy. Search by receipt number or date."
        />
      </p>
    </form>
  );
}
