import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { getActiveOrg } from "@/lib/active-org";
import { getFenceState } from "@/lib/fence";
import {
  buildFinancialStatement,
  type FinancialStatement,
} from "@/lib/financial-statement";
import { formatRm } from "@/lib/minutes-draft";
import { dayIsoMalaysia } from "@/lib/history";
import { loadLatestRecordMonth, loadStatementRows } from "./data";
import { DownloadStatementButton } from "./download-button";

// ---------------------------------------------------------------------------
// /money/report — the financial statement (Stage F, work order 27; the home
// page's card ③ lands here). Server-rendered from DATABASE rows only:
// localStorage register drafts are per-device, and a statement built from one
// device's draft is two account books. Every figure is summed by
// lib/financial-statement.ts (Hard Rule 2); AI is involved nowhere.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type Query = { dari?: string; hingga?: string };

function monthBounds(todayIso: string): { fromIso: string; toIso: string } {
  const month = todayIso.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { fromIso: `${month}-01`, toIso: `${month}-${String(last).padStart(2, "0")}` };
}

function lastMonthBounds(todayIso: string): { fromIso: string; toIso: string } {
  const [y, m] = todayIso.slice(0, 7).split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const month = `${prevY}-${String(prevM).padStart(2, "0")}`;
  const last = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return { fromIso: `${month}-01`, toIso: `${month}-${String(last).padStart(2, "0")}` };
}

export default async function MoneyReportPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const sp = await searchParams;
  const active = await getActiveOrg();
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      </div>
    );
  }

  // D44: null = paid org, the page stays exactly as it was.
  const fenceState = await getFenceState(active);

  // The period: ?dari & ?hingga when valid, else THIS YEAR SO FAR.
  // §1-7 (work order 32): the default used to be this month — J's two receipts
  // were dated 2026-04 and 2025-12, so first load showed RM0.00 everywhere and
  // read as broken. A year-to-date default shows the numbers that exist.
  const thisMonth = monthBounds(todayIso);
  const thisYear = { fromIso: `${todayIso.slice(0, 4)}-01-01`, toIso: todayIso };
  const dari = ISO_DAY.test(sp.dari ?? "") ? (sp.dari as string) : "";
  const hingga = ISO_DAY.test(sp.hingga ?? "") ? (sp.hingga as string) : "";
  const period =
    dari && hingga && dari <= hingga ? { fromIso: dari, toIso: hingga } : thisYear;

  const rows = await loadStatementRows(active.id, period);
  let statement: FinancialStatement | null = null;
  if (rows) {
    statement = buildFinancialStatement(rows, period);
  }

  // §1-7: an empty period needs a way out, not a wall of zeros. Only looked
  // up when the period actually came back empty.
  const periodIsEmpty =
    statement !== null &&
    statement.income.length === 0 &&
    statement.payments.length === 0 &&
    statement.inKind.length === 0;
  const latestMonth = periodIsEmpty ? await loadLatestRecordMonth(active.id) : null;
  // The latest record's month as a period, for the one-tap jump link.
  const latestMonthPeriod =
    latestMonth !== null ? monthBounds(`${latestMonth}-01`) : null;

  const lastMonth = lastMonthBounds(todayIso);
  // Year-to-date first: it is the default period since §1-7.
  const quick = [
    { ...thisYear, bm: "Tahun ini", zh: "今年到今天", en: "This year so far" },
    { ...thisMonth, bm: "Bulan ini", zh: "本月", en: "This month" },
    { ...lastMonth, bm: "Bulan lepas", zh: "上个月", en: "Last month" },
  ];

  return (
    <PageSection
      titleBm="Penyata kewangan"
      titleZh="财报"
      titleEn="Financial statement"
      summary={
        <Tri
          bm="Penyata Penerimaan dan Pembayaran — dikira oleh sistem daripada rekod yang tersimpan, bukan AI."
          zh="收支表（Penyata Penerimaan dan Pembayaran）—— 由系统从已保存的记录算出，不经 AI。"
          en="A Receipts and Payments statement — computed by the system from stored records, never AI."
        />
      }
    >
      <div className="flex flex-col gap-5">
        {/* Period picker: three quick links + a custom range (plain GET). */}
        <div className="flex flex-wrap items-center gap-2">
          {quick.map((qk) => {
            const activePeriod = qk.fromIso === period.fromIso && qk.toIso === period.toIso;
            return (
              <Link
                key={qk.en}
                href={`/money/report?dari=${qk.fromIso}&hingga=${qk.toIso}`}
                className={`inline-flex min-h-11 items-center rounded-xs border-2 px-4 text-base font-medium ${
                  activePeriod
                    ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)]"
                    : "border-[color:var(--v2-outline-border)] hover:bg-[color:var(--v2-primary-soft)]"
                }`}
              >
                <Tri bm={qk.bm} zh={qk.zh} en={qk.en} />
              </Link>
            );
          })}
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              name="dari"
              defaultValue={period.fromIso}
              className="rounded-md border border-input bg-background px-2 py-2 text-base"
              aria-label="Dari / 从 / From"
            />
            <span aria-hidden>–</span>
            <input
              type="date"
              name="hingga"
              defaultValue={period.toIso}
              className="rounded-md border border-input bg-background px-2 py-2 text-base"
              aria-label="Hingga / 到 / To"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border-2 border-[color:var(--v2-outline-border)] px-4 text-base font-medium hover:bg-accent"
            >
              <Tri bm="Tunjuk" zh="显示" en="Show" />
            </button>
          </form>
        </div>

        {statement === null ? (
          <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Penyata tidak dapat dikira sekarang — pangkalan data tidak dapat dibaca. Cuba sebentar lagi."
              zh="现在算不出财报 —— 数据库读取不了。请稍后再试。"
              en="The statement cannot be computed right now — the database could not be read. Try again shortly."
            />
          </p>
        ) : (
          <>
            {/* §1-7: an empty period is not a dead wall — say where the money
                actually is, with a one-tap jump. */}
            {periodIsEmpty && (
              <p className="rounded-md border-2 border-[color:var(--v2-outline-border)] bg-muted/30 p-4 text-base">
                {latestMonthPeriod ? (
                  <>
                    <Tri
                      bm={`Tiada rekod dalam tempoh ini. Rekod terkini pada ${latestMonth}.`}
                      zh={`这段期间没有记录 —— 最近一笔在 ${latestMonth}。`}
                      en={`No records in this period. The latest record is in ${latestMonth}.`}
                    />{" "}
                    <Link
                      href={`/money/report?dari=${latestMonthPeriod.fromIso}&hingga=${latestMonthPeriod.toIso}`}
                      className="font-medium underline underline-offset-4"
                    >
                      <Tri
                        bm="Lompat ke bulan itu"
                        zh="一键跳到那个月"
                        en="Jump to that month"
                      />{" "}
                      →
                    </Link>
                  </>
                ) : (
                  <Tri
                    bm="Tiada rekod wang lagi. Rekodkan pendapatan atau perbelanjaan dahulu."
                    zh="还没有任何钱的记录。请先去记一笔收入或开支。"
                    en="No money records yet. Record an income or an expense first."
                  />
                )}
              </p>
            )}
            {/* The statement table. */}
            <div className="overflow-x-auto rounded-md border-2 border-[color:var(--v2-border)]">
              <table className="w-full text-base">
                <tbody>
                  <tr className="border-b border-[color:var(--v2-border)] bg-muted/40">
                    <td className="px-4 py-2.5 font-semibold" colSpan={2}>
                      <Tri bm="PENERIMAAN" zh="收入（PENERIMAAN）" en="Receipts (PENERIMAAN)" />
                    </td>
                  </tr>
                  {statement.income.length === 0 && (
                    <tr className="border-b border-[color:var(--v2-border)]">
                      <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                        <Tri bm="— tiada —" zh="—— 没有 ——" en="— none —" />
                      </td>
                    </tr>
                  )}
                  {statement.income.map((line) => (
                    <tr key={`in-${line.category}`} className="border-b border-[color:var(--v2-border)]">
                      <td className="px-4 py-2 pl-8">
                        {line.category}{" "}
                        <span className="text-sm text-muted-foreground">({line.count})</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatRm(line.totalCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b-2 border-[color:var(--v2-border)] font-semibold">
                    <td className="px-4 py-2.5">
                      <Tri bm="Jumlah penerimaan" zh="收入合计" en="Total receipts" />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatRm(statement.incomeTotalCents)}
                    </td>
                  </tr>

                  <tr className="border-b border-[color:var(--v2-border)] bg-muted/40">
                    <td className="px-4 py-2.5 font-semibold" colSpan={2}>
                      <Tri bm="PEMBAYARAN" zh="支出（PEMBAYARAN）" en="Payments (PEMBAYARAN)" />
                    </td>
                  </tr>
                  {statement.payments.length === 0 && (
                    <tr className="border-b border-[color:var(--v2-border)]">
                      <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                        <Tri bm="— tiada —" zh="—— 没有 ——" en="— none —" />
                      </td>
                    </tr>
                  )}
                  {statement.payments.map((line) => (
                    <tr key={`out-${line.category}`} className="border-b border-[color:var(--v2-border)]">
                      <td className="px-4 py-2 pl-8">
                        {line.category}{" "}
                        <span className="text-sm text-muted-foreground">({line.count})</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatRm(line.totalCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b-2 border-[color:var(--v2-border)] font-semibold">
                    <td className="px-4 py-2.5">
                      <Tri bm="Jumlah pembayaran" zh="支出合计" en="Total payments" />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatRm(statement.paymentsTotalCents)}
                    </td>
                  </tr>

                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-4 py-3">
                      {statement.netCents >= 0 ? (
                        <Tri bm="LEBIHAN (surplus)" zh="结余（收入 − 支出）" en="SURPLUS (receipts − payments)" />
                      ) : (
                        <Tri bm="KURANGAN (defisit)" zh="亏空（收入 − 支出）" en="DEFICIT (receipts − payments)" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {statement.netCents < 0 ? "−" : ""}
                      {formatRm(Math.abs(statement.netCents))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* In-kind schedule: goods, never money (拍板③). */}
            {statement.inKind.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border-2 border-teal-200 p-4 dark:border-teal-400/30">
                <p className="font-semibold">
                  📦{" "}
                  <Tri
                    bm="Lampiran: derma barangan (bukan wang)"
                    zh="附表：实物捐赠（不是钱）"
                    en="Schedule: in-kind donations (not money)"
                  />
                </p>
                <ul className="flex flex-col gap-1 text-base">
                  {statement.inKind.map((g, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {g.dateIso} · {g.itemDesc}
                      </span>
                      <span className="text-muted-foreground">
                        {g.estValueCents === null ? (
                          <Tri bm="tiada anggaran" zh="没有估值" en="no estimate" />
                        ) : (
                          <>
                            <Tri bm="anggaran" zh="估值" en="est." /> {formatRm(g.estValueCents)}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <DownloadStatementButton
                fromIso={period.fromIso}
                toIso={period.toIso}
                fence={
                  fenceState
                    ? {
                        docsRemaining: fenceState.remaining.docs,
                        downloadsRemaining: fenceState.remaining.downloads,
                      }
                    : null
                }
              />
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="PDF membawa kepala surat pertubuhan dan baris audit — sesuai untuk mesyuarat atau juruaudit."
                  zh="PDF 带机构抬头和审计行 —— 可以直接拿去开会或给审计。"
                  en="The PDF carries the letterhead and the audit line — ready for a meeting or the auditor."
                />
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              <Tri
                bm="Nota: penyata ini mengira wang yang BERGERAK dalam tempoh itu (asas tunai). Tuntutan yang belum dibayar belum termasuk — ia muncul sebaik sahaja ditanda “sudah dibayar”."
                zh="说明：这份表算的是期间内实际动过的钱（现金制）。还没付的报销不在里面 —— 标了「已付款」就会出现。"
                en="Note: this statement counts money that MOVED in the period (cash basis). Unpaid claims are not in it — they appear the moment they are marked paid."
              />
            </p>
          </>
        )}
      </div>
    </PageSection>
  );
}
