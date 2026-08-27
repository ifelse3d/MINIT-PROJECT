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
import { formatMytDateTime } from "@/lib/history";
import { isIsoDate } from "@/lib/date-input";
import { PAGE_SIZE, pageRange, pageSummary, parsePage } from "@/lib/list-page";
import { Pager } from "@/components/pager";
import { ReceiptFilters } from "./filters";
import { DownloadReceiptButton } from "./row-actions";
import { UnreceiptedNote } from "./unreceipted-note";

// /money/history — every receipt saved for the active org (Phase 7).
// D18 (拍板 35, 2026-08-27): donor names show IN FULL here — the treasurer
// typed them, and a record system must show whose record it is. Masking is
// for the moments data LEAVES the app (print/share), not for this list.
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
    donor_name?: string | null;
    amount_cents: number;
    purpose: string | null;
    donated_at: string | null;
    custody_status: string;
    kind?: string | null;
    item_desc?: string | null;
    collector_name?: string | null;
    payment_method?: string | null;
  } | null;
};

/** B-6: newest columns first; each 42703 (that migration not applied yet)
 *  steps down one honest rung — PostgREST fails the WHOLE query over one
 *  unknown column, and an empty history reads as "this society never issued
 *  a receipt". */
const HISTORY_SELECT =
  "id, receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_masked, donor_name, amount_cents, purpose, donated_at, custody_status, kind, item_desc, collector_name, payment_method)";
/** While migration 26 (payment_method) is not applied. */
const HISTORY_SELECT_NO_PAYMENT =
  "id, receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_masked, donor_name, amount_cents, purpose, donated_at, custody_status, kind, item_desc, collector_name)";
/** While migration 25 (kind) / 20260827 (collector_name) are not applied. */
const HISTORY_SELECT_LEGACY =
  "id, receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_masked, donor_name, amount_cents, purpose, donated_at, custody_status)";

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
  const buildQuery = (select: string) => {
    let query = supabase
      .from("receipts")
      .select(select, { count: "exact" })
      .eq("org_id", active.id);
    // Receipt number only. The donor name is stored MASKED (Hard Rule 5), so
    // searching it would match against "T** A* K**" and mostly find nothing —
    // the form says so out loud rather than letting somebody conclude their
    // receipt has gone missing.
    if (q) query = query.ilike("receipt_no", "%" + q + "%");
    // issued_at is a timestamptz, so `lte` against a bare date would exclude
    // everything issued later that same day. The upper bound is the end of it.
    if (from) query = query.gte("issued_at", from);
    if (to) query = query.lte("issued_at", to + "T23:59:59.999Z");
    return query.order("id", { ascending: false }).range(rangeFrom, rangeTo);
  };
  let { data, count, error } = await buildQuery(HISTORY_SELECT);
  if (error) {
    const retry = await buildQuery(HISTORY_SELECT_NO_PAYMENT);
    data = retry.data;
    count = retry.count;
    error = retry.error;
  }
  if (error) {
    const retry = await buildQuery(HISTORY_SELECT_LEGACY);
    data = retry.data;
    count = retry.count;
    error = retry.error;
  }

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
    // F-1 (2026-08-25): a receipts TABLE page fills the section's width (the
    // /money chrome is max-w-5xl) — a narrower cap here just squeezed the
    // columns for nothing (STATE §6: 表格类内容用窄容器).
    <div className="mx-auto w-full max-w-5xl pb-10">
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
          {/* B-6: this list is INCOME only — receipts are issued for money
              coming in. Spending lives in its own book. */}
          <Tri
            bm="Semua resit = wang masuk. Perbelanjaan ada dalam buku sendiri:"
            zh="这里的收据都是收入。开支记在开支簿："
            en="Every receipt here is income. Spending lives in its own book:"
          />{" "}
          <Link href="/money/expenses" className="underline underline-offset-4">
            <Tri bm="Buku perbelanjaan" zh="开支簿" en="Expense book" /> →
          </Link>
        </p>
      </div>

      {/* §1-8: rows registered but not yet receipted are not in this list —
          say so, with the way there, instead of looking stale. */}
      <UnreceiptedNote />

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
                  {/* B-6: the direction column the tester missed — a receipt
                      is always money IN, and the column says so. */}
                  <TableHead>
                    <Tri bm="Arah" zh="方向" en="Direction" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Penderma" zh="捐款人" en="Donor" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Tri bm="Jumlah" zh="金额" en="Amount" />
                  </TableHead>
                  {/* B-6: "purpose" alone read like a mystery word. */}
                  <TableHead>
                    <Tri
                      bm="Tujuan derma / keterangan"
                      zh="捐款用途／款项说明"
                      en="Donation purpose / description"
                    />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Tarikh" zh="日期" en="Date" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Di mana wangnya" zh="钱现在在哪" en="Where the money is" />
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  // id anchor: the activity calendar deep-links to #receipt-N
                  <TableRow key={r.id} id={`receipt-${r.id}`} className="scroll-mt-24 target:bg-amber-50">
                    <TableCell>
                      <span className="font-mono">{r.receipt_no}</span>
                      {/* §1-11 (拍板 0-5): WHEN the receipt was issued, not
                          just the donation date two columns over. */}
                      <span className="block text-sm text-muted-foreground">
                        <Tri bm="dikeluarkan" zh="开出于" en="issued" />{" "}
                        {formatMytDateTime(r.issued_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="border-green-300 bg-green-50 text-green-800"
                      >
                        ↓ <Tri bm="Masuk" zh="收入" en="In" />
                      </Badge>
                    </TableCell>
                    {/* D18: the full name the treasurer typed. Older rows
                        (pre-donor_name select tiers) fall back to the mask. */}
                    <TableCell>
                      {r.donation?.donor_name ?? r.donation?.donor_masked ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* D-3: goods receipts show the goods, never RM0.00. */}
                      {r.donation?.kind === "in_kind" ? (
                        <span className="font-medium">
                          📦 {r.donation?.item_desc ?? "—"}
                        </span>
                      ) : (
                        formatRm(r.donation?.amount_cents ?? 0)
                      )}
                    </TableCell>
                    <TableCell>
                      {r.donation?.purpose ?? "—"}
                      {r.donation?.kind === "in_kind" && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-teal-300 bg-teal-50 text-teal-800"
                        >
                          <Tri bm="Barangan" zh="实物" en="In-kind" />
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.donation?.donated_at ?? "—"}</TableCell>
                    <TableCell>
                      {/* B-6: plain words, not a state-machine enum. */}
                      {r.donation?.kind === "in_kind" ? (
                        <span className="text-muted-foreground">
                          <Tri bm="Barangan — bukan wang" zh="实物 —— 不是钱" en="Goods — not money" />
                        </span>
                      ) : r.donation?.payment_method === "transfer" ? (
                        <Badge variant="outline" className="border-sky-300 bg-sky-100 text-sky-900">
                          🏦 <Tri bm="Pindahan — dalam akaun" zh="转账入户" en="Transfer — in the account" />
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={CUSTODY_STYLE[r.donation?.custody_status ?? ""] ?? ""}
                        >
                          {r.donation?.custody_status === "collected" ? (
                            r.donation?.collector_name ? (
                              <Tri
                                bm={`Tunai dengan ${r.donation.collector_name}`}
                                zh={`现金在 ${r.donation.collector_name} 手上`}
                                en={`Cash with ${r.donation.collector_name}`}
                              />
                            ) : (
                              <Tri bm="Tunai di tangan pemungut" zh="现金在收款人手上" en="Cash with the collector" />
                            )
                          ) : r.donation?.custody_status === "pending_remittance" ? (
                            <Tri bm="Diserah — tunggu HQ sahkan" zh="已交出，等总会确认" en="Handed over — awaiting HQ" />
                          ) : (
                            <Tri bm="Sudah diterima HQ" zh="已交总会" en="Received by HQ" />
                          )}
                        </Badge>
                      )}
                    </TableCell>
                    {/* B-6: the receipt itself, one tap away. */}
                    <TableCell>
                      <DownloadReceiptButton receiptNo={r.receipt_no} />
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
