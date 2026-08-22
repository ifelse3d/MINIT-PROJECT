import { CUSTODY_STATUS_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { formatRm } from "@/lib/minutes-draft";
import { isIsoDate } from "@/lib/date-input";
import { PAGE_SIZE, pageRange, pageSummary, parsePage } from "@/lib/list-page";
import { Pager } from "@/components/pager";
import { ReceiptFilters } from "./filters";

// /money/history — every receipt saved for the active org (Phase 7).
// PDPA (Hard Rule 5): this list shows ONLY the stored donor_masked value —
// full names stay on the receipt PDF itself, never in this list.
export const dynamic = "force-dynamic";

const CUSTODY_STYLE: Record<string, string> = {
  collected: "border-amber-300 bg-amber-100 text-amber-900",
  pending_remittance: "border-blue-300 bg-blue-100 text-blue-900",
  settled: "border-green-300 bg-green-100 text-green-800",
};

type ReceiptRow = {
  id: number;
  receipt_no: string;
  issued_at: string;
  donation: {
    donor_masked: string | null;
    amount_cents: number;
    purpose: string | null;
    donated_at: string | null;
    custody_status: string;
  } | null;
};

/** What the URL is allowed to say about which receipts to show. */
type Query = { q?: string; from?: string; to?: string; page?: string };

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MoneyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const sp = await searchParams;
  const active = await getActiveOrg();

  // Dates are validated before they reach the query: an unparseable one makes
  // PostgREST 400 and the page go blank, and a blank receipt history is
  // indistinguishable from "this society has never issued a receipt".
  const q = one(sp.q).trim().slice(0, 60);
  const fromRaw = one(sp.from);
  const from = isIsoDate(fromRaw) ? fromRaw : "";
  const toRaw = one(sp.to);
  const to = isIsoDate(toRaw) ? toRaw : "";
  const page = parsePage(sp.page);
  const filters = { q, from, to };
  const anyFilter = Boolean(q || from || to);

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">
          <Tri bm="Sejarah Resit" zh="收据历史" en="Receipt History" />
        </h2>
        <p className="text-muted-foreground">
          <Link href="/orgs" className="underline">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建组织"
              en="Choose or create an organisation first"
            />
          </Link>
        </p>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  // count: "exact" costs one extra aggregate and buys the only thing that makes
  // the number below honest. J, 2026-08-22: 「我手上不算重複的就有超過 1000 了」
  // — with 1000 receipts this page used to show the newest 200 and print their
  // sum under the word "Total", which reads as the society's total and is not.
  // 2026-08-22 made that sentence honest; 2026-08-23 makes the older receipts
  // REACHABLE, which is the half that was missing.
  const { from: rangeFrom, to: rangeTo } = pageRange(page);
  let query = supabase
    .from("receipts")
    .select(
      "id, receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_masked, amount_cents, purpose, donated_at, custody_status)",
      { count: "exact" },
    )
    .eq("org_id", active.id);
  // Receipt number only. The donor name is stored MASKED (Hard Rule 5), so
  // searching it would match against "T** A* K**" and mostly find nothing — the
  // form says so out loud rather than letting somebody conclude their receipt
  // has gone missing.
  if (q) query = query.ilike("receipt_no", "%" + q + "%");
  // issued_at is a timestamptz, so `lte` against a bare date would exclude
  // everything issued later that same day. The upper bound is the end of it.
  if (from) query = query.gte("issued_at", from);
  if (to) query = query.lte("issued_at", to + "T23:59:59.999Z");
  const { data, count } = await query
    .order("id", { ascending: false })
    .range(rangeFrom, rangeTo);

  const rows = (data as unknown as ReceiptRow[]) ?? [];
  const summary = pageSummary(count ?? 0, page, rows.length, PAGE_SIZE);
  // Money math in TypeScript (Hard Rule 2). This is the sum of what is ON THIS
  // PAGE — and it is now always labelled as such, because with paging it is the
  // whole story only when the whole story fits on one page.
  const totalCents = rows.reduce(
    (sum, r) => sum + (r.donation?.amount_cents ?? 0),
    0,
  );
  const wholeStory = summary.pageCount === 1;

  return (
    <div className="mx-auto w-full max-w-4xl pb-10">
      {/* An h2, not an h1, and no "back to Money" link: since the 2026-08-23
          split this page sits inside the /money layout, which already carries
          the section's heading, the organisation's name and the tab rail. Two
          h1s and two ways back is what you get when a page that used to stand
          alone is put inside a frame and nobody looks at it afterwards. */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          <Tri bm="Sejarah Resit" zh="收据历史" en="Receipt History" />
        </h2>
        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Nama penderma disorok untuk melindungi privasi mereka"
            zh="为保护捐款人隐私，姓名已隐藏"
            en="Donor names are hidden to protect their privacy"
          />
        </p>
      </div>

      <ReceiptFilters q={q} from={from} to={to} active={anyFilter} />

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            {anyFilter ? (
              <>
                {/* "Nothing matches" and "you have never issued a receipt" look
                    identical on screen and mean very different things. */}
                <CardTitle className="text-base">
                  <Tri
                    bm="Tiada resit yang sepadan"
                    zh="没有符合条件的收据"
                    en="No receipts match that"
                  />
                </CardTitle>
                <CardDescription>
                  <Tri
                    bm="Resit anda yang lain masih tersimpan. Semak nombor resit, longgarkan tarikh, atau tekan Kosongkan."
                    zh="您其他的收据都还在。检查一下收据号码，把日期放宽，或者按「清掉条件」。"
                    en="Your other receipts are all still there. Check the number, widen the dates, or tap Clear."
                  />
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-base">
                  <Tri bm="Belum ada resit disimpan" zh="还没有保存的收据" en="No receipts saved yet" />
                </CardTitle>
                <CardDescription>
                  <Tri
                    bm="Jana resit di halaman Wang"
                    zh="请在财务页面生成收据"
                    en="Issue receipts on the Money page"
                  />
                </CardDescription>
              </>
            )}
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {wholeStory && !anyFilter ? (
                <>
                  {summary.total} <Tri bm="resit" zh="张收据" en="receipts" /> ·{" "}
                  <Tri bm="Jumlah" zh="总额" en="Total" /> {formatRm(totalCents)}
                </>
              ) : (
                /* The sum of THIS PAGE, said in those words. A figure labelled
                   "Total" that is the total of one page out of twenty-one is
                   the exact defect this replaces. */
                <Tri
                  bm={"Jumlah " + rows.length + " resit di halaman ini: " + formatRm(totalCents)}
                  zh={"这一页 " + rows.length + " 张收据合计：" + formatRm(totalCents)}
                  en={"These " + rows.length + " receipts on this page: " + formatRm(totalCents)}
                />
              )}
            </CardTitle>
            {!wholeStory && (
              <CardDescription>
                <Tri
                  bm="Bukan jumlah keseluruhan pertubuhan — guna butang halaman di bawah untuk melihat yang lain."
                  zh="这不是整个社团的总额 —— 用下面的翻页按钮可以看其余的。"
                  en="Not the society's overall total — use the page buttons below to see the rest."
                />
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Tri bm="No. Resit" zh="收据号" en="Receipt No." />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Penderma" zh="捐款人" en="Donor" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Tri bm="Jumlah" zh="金额" en="Amount" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Tujuan" zh="用途" en="Purpose" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Tarikh" zh="日期" en="Date" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Kustodi" zh="保管" en="Custody" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  // id anchor: the activity calendar deep-links to #receipt-N
                  <TableRow key={r.id} id={`receipt-${r.id}`} className="scroll-mt-24 target:bg-amber-50">
                    <TableCell className="font-mono">{r.receipt_no}</TableCell>
                    <TableCell>{r.donation?.donor_masked ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRm(r.donation?.amount_cents ?? 0)}
                    </TableCell>
                    <TableCell>{r.donation?.purpose ?? "—"}</TableCell>
                    <TableCell>{r.donation?.donated_at ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          CUSTODY_STYLE[r.donation?.custody_status ?? ""] ?? ""
                        }
                      >
                        {/* Was the raw enum "pending_remittance", untranslated,
                            while /money already had good trilingual wording. */}
                        <Tri
                          {...labelFor(
                            CUSTODY_STATUS_LABEL,
                            r.donation?.custody_status,
                          )}
                        />
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pager
        summary={summary}
        basePath="/money/history"
        params={filters}
        nounBm="resit"
        nounZh="张收据"
        nounEn="receipts"
      />
    </div>
  );
}
