"use client";

import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import { totalUnremittedCents } from "@/lib/custody";
import { formatRm } from "@/lib/minutes-draft";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money/custody — STEP 3: cash leaves the collector's hands and reaches HQ.
//
// This is the screen a branch treasurer and an HQ admin look at TOGETHER, at a
// hand-over, usually on a phone on a table. Before the 2026-08-23 split it was
// the third of four cards on a page that also held the ledger camera and the
// month-end tax file — a lot of scrolling to do with somebody waiting.
// ---------------------------------------------------------------------------

export function CashCustody() {
  const t = useTriText();
  const {
    donations,
    batches,
    balances,
    collectorsWithCashInHand,
    hasPendingBatch,
    handOver,
    hqConfirm,
    receiptsIssued,
    cashInHandCents,
    availableMonths,
    custodyLocalOnly,
  } = useRegister();

  return (
    <PageSection
      step={3}
      titleBm="Serahan wang tunai kepada HQ"
      titleZh="把现金交给总会"
      titleEn="Handing the cash over to HQ"
      summary={
        cashInHandCents > 0 ? (
          <Tri
            bm={`${formatRm(cashInHandCents)} masih belum sampai ke HQ.`}
            zh={`还有 ${formatRm(cashInHandCents)} 没交到总会。`}
            en={`${formatRm(cashInHandCents)} has not reached HQ yet.`}
          />
        ) : (
          <Tri
            bm="Mengesan tunai daripada pemungut sampai ke HQ, supaya tiada wang hilang di tengah jalan."
            zh="追踪现金从收款人手上交到总会的过程，避免中间不见钱。"
            en="Tracks cash from the collector to HQ, so no money goes missing in between."
          />
        )
      }
    >
      {!receiptsIssued && (
        /* The card version of this refused to open and showed this sentence
           INSTEAD of its contents. As a page it stays readable — the balances
           and past hand-overs are worth seeing either way — but the two buttons
           below are disabled for exactly this reason, so the explanation sits
           above them rather than in place of everything. */
        <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Jana resit di langkah 2 dahulu — wang hanya boleh diserahkan selepas setiap derma ada nombor resit, kalau tidak tiada apa-apa untuk diikat pada serahan itu."
            zh="请先在第 2 步开收据 —— 只有每笔捐款都有收据号码之后才能交接，否则交出去的钱没有凭据可以对。"
            en="Issue the receipts in step 2 first — cash can only be handed over once every donation has a receipt number, otherwise there is nothing to tie the hand-over to."
          />
        </p>
      )}

      {/* A hand-over is one person's claim that they gave money to another
          person. It is worth what the record BOTH of them can see — so if it
          only reached this device, that has to be on screen, not swallowed. */}
      {custodyLocalOnly && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Serahan ini tercatat pada peranti ini sahaja — ia belum sampai ke rekod pertubuhan, jadi HQ tidak dapat melihatnya lagi. Pilih pertubuhan anda, atau buka halaman ini semula apabila ada talian."
            zh="这次交接只记在这台设备上 —— 还没有进到机构的记录里，所以总会那边看不到。请选好您的机构，或者等有网络时再打开这一页一次。"
            en="This hand-over is recorded on this device only — it has not reached the organisation's records, so HQ cannot see it yet. Choose your organisation, or open this page again when you have a signal."
          />
        </p>
      )}

      <div className="flex flex-col gap-5">
        {/* The three custody states, as a compact status strip */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:gap-3">
          <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            1 · <Tri bm="Wang di tangan pemungut" zh="钱在收款人手上" en="Cash with collector" />
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-900">
            2 · <Tri bm="Diserah, tunggu HQ" zh="已交出，等待总会" en="Handed over, waiting for HQ" />
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="rounded-md bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            3 · <Tri bm="Disahkan HQ" zh="总会已确认" en="Confirmed by HQ" />
          </span>
        </div>

        {/* Two clearly-labelled actions */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">
              <Tri bm="Langkah 1 · Pemungut" zh="第一步 · 收款人" en="Step 1 · Collector" />
            </p>
            <Button
              onClick={handOver}
              disabled={collectorsWithCashInHand.length === 0}
              size="lg"
              className="text-base"
            >
              <Tri bm="Serah wang ke HQ" zh="交钱给总会" en="Hand over to HQ" />
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">
              <Tri bm="Langkah 2 · HQ" zh="第二步 · 总会" en="Step 2 · HQ" />
            </p>
            <Button
              onClick={hqConfirm}
              disabled={!hasPendingBatch}
              size="lg"
              variant="outline"
              className="text-base"
            >
              <Tri bm="Sahkan wang diterima" zh="确认收到钱" en="Confirm money received" />
            </Button>
          </div>
        </div>
        {batches.map((batch) => (
          <div
            key={batch.id}
            className={`rounded-lg border p-4 text-base ${
              batch.status === "settled"
                ? "border-green-300 bg-green-50"
                : "border-blue-300 bg-blue-50"
            }`}
          >
            <div className="font-medium">
              {batch.status === "settled" ? "✅ " : "⏳ "}
              {batch.status === "settled"
                ? t("HQ sudah sahkan wang ini", "总会已确认这笔钱", "HQ has confirmed this money")
                : t("Menunggu HQ sahkan", "等待总会确认", "Waiting for HQ to confirm")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {batch.collector} · {batch.handedOverAtIso} ·{" "}
              {t("jumlah", "金额", "total")} {formatRm(batch.totalCents)} ·{" "}
              {t("resit", "收据", "receipts")} {batch.receiptNos.join(", ")}
              {batch.confirmedByHq
                ? ` · ${t("disahkan oleh", "确认人", "confirmed by")} ${batch.confirmedByHq}`
                : ""}
            </div>
          </div>
        ))}

        {/* Per-collector cards instead of a wide table — no sideways scroll */}
        <div className="grid gap-3 sm:grid-cols-2">
          {balances.map((b) => (
            <div key={b.collector} className="rounded-lg border p-4">
              <p className="font-medium">{b.collector}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-amber-50 p-2">
                  <div className="text-sm text-muted-foreground">
                    <Tri bm="Di tangan" zh="手上" en="In hand" />
                  </div>
                  <div className="font-semibold tabular-nums">{formatRm(b.collectedCents)}</div>
                </div>
                <div className="rounded-md bg-blue-50 p-2">
                  <div className="text-sm text-muted-foreground">
                    <Tri bm="Tunggu HQ" zh="等待总会" en="Waiting HQ" />
                  </div>
                  <div className="font-semibold tabular-nums">{formatRm(b.pendingCents)}</div>
                </div>
                <div className="rounded-md bg-green-50 p-2">
                  <div className="text-sm text-muted-foreground">
                    <Tri bm="Selesai" zh="已完成" en="Done" />
                  </div>
                  <div className="font-semibold tabular-nums">{formatRm(b.settledCents)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="rounded-md bg-muted/40 p-3 text-base">
          <Tri
            bm="Jumlah wang tunai yang masih belum sampai ke HQ"
            zh="仍未交到总会的现金总额"
            en="Total cash not yet reached HQ"
          />
          :{" "}
          <span className="font-semibold text-foreground">
            {formatRm(totalUnremittedCents(donations))}
          </span>
        </p>
      </div>

      <NextStepLink
        href="/money/einvois"
        labelBm="Ke fail cukai hujung bulan"
        labelZh="去月底税务文件"
        labelEn="On to the month-end tax file"
        blockedReason={
          availableMonths.length === 0 || !receiptsIssued ? (
            <Tri
              bm="Belum ada resit untuk difailkan. Fail cukai dibuat daripada resit, jadi tiada resit bermakna tiada apa-apa untuk difailkan."
              zh="还没有可以申报的收据。税务文件是根据收据做的，没有收据就没有东西可以报。"
              en="No receipts to file yet. The tax file is built from receipts, so no receipts means nothing to file."
            />
          ) : undefined
        }
      />
    </PageSection>
  );
}
