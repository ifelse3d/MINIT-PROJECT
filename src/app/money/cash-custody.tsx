"use client";

import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { totalUnremittedCents } from "@/lib/custody";
import { formatRm } from "@/lib/minutes-draft";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money/custody — the CASH CUSTODY RECORD (B-3, 拍板 34 / D19).
//
// This page used to be "step 3" of the money flow. It is not a step of
// anybody's afternoon: it is the record of where the physical cash IS — who is
// holding how much, which hand-overs are waiting for HQ's tick, and what has
// already been counted and confirmed. The two-step job (read the ledger →
// issue receipts) ends on the receipts page; this page is where a treasurer
// or HQ admin comes to keep the cash honest.
//
// Bank transfers never appear here (D19): the account has that money, not a
// person. Goods (Derma Barangan) never appear either (D-1).
// ---------------------------------------------------------------------------

export function CashCustody() {
  const t = useTriText();
  const {
    donations,
    batches,
    balances,
    collectorsWithCashInHand,
    handOver,
    hqConfirm,
    receiptsIssued,
    cashInHandCents,
    custodyLocalOnly,
  } = useRegister();

  const pending = batches.filter((b) => b.status === "pending");
  const settled = batches.filter((b) => b.status === "settled");

  return (
    <PageSection
      titleBm="Rekod simpanan tunai"
      titleZh="现金保管记录"
      titleEn="Cash custody record"
      summary={
        cashInHandCents > 0 ? (
          <Tri
            bm={`${formatRm(cashInHandCents)} tunai masih belum disahkan diterima oleh HQ.`}
            zh={`还有 ${formatRm(cashInHandCents)} 现金没被总会确认收到。`}
            en={`${formatRm(cashInHandCents)} in cash has not been confirmed received by HQ.`}
          />
        ) : (
          <Tri
            bm="Siapa memegang berapa tunai, serahan mana menunggu pengesahan HQ — supaya tiada wang hilang di tengah jalan. Pindahan bank tidak melalui halaman ini."
            zh="谁手上有多少现金、哪笔交接还在等总会确认 —— 避免中间不见钱。转账不经过这一页。"
            en="Who is holding how much cash, and which hand-overs await HQ's confirmation — so no money goes missing in between. Bank transfers never pass through this page."
          />
        )
      }
    >
      {!receiptsIssued && donations.length > 0 && (
        <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Jana resit dahulu — tunai hanya boleh diserahkan selepas setiap derma ada nombor resit, kalau tidak tiada apa-apa untuk diikat pada serahan itu."
            zh="请先开收据 —— 只有每笔捐款都有收据号码之后才能交接，否则交出去的钱没有凭据可以对。"
            en="Issue the receipts first — cash can only be handed over once every donation has a receipt number, otherwise there is nothing to tie the hand-over to."
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
        {/* How cash moves — a legend, not steps of a form. */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:gap-3">
          <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            <Tri bm="Tunai di tangan pemungut" zh="钱在收款人手上" en="Cash with collector" />
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-900">
            <Tri bm="Diserah, tunggu HQ" zh="已交出，等待总会" en="Handed over, waiting for HQ" />
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="rounded-md bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            <Tri bm="Disahkan HQ" zh="总会已确认" en="Confirmed by HQ" />
          </span>
        </div>

        {/* WHO IS HOLDING HOW MUCH — the record this page exists for. */}
        {balances.length > 0 && (
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
        )}
        {balances.length === 0 && (
          <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
            <Tri
              bm="Tiada tunai dalam rekod lagi. Derma tunai yang diresitkan akan muncul di sini dengan nama pemegangnya."
              zh="记录里还没有现金。开了收据的现金捐款会出现在这里，写明在谁手上。"
              en="No cash on record yet. Receipted cash donations appear here, with who is holding them."
            />
          </p>
        )}

        {/* THE COLLECTOR'S ACTION: record a hand-over. */}
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Pemungut menyerahkan tunai kepada HQ"
              zh="收款人把现金交给总会"
              en="Collector hands the cash to HQ"
            />
          </p>
          <Button
            onClick={handOver}
            disabled={collectorsWithCashInHand.length === 0}
            size="lg"
            className="self-start text-base"
          >
            <Tri bm="Rekod serahan tunai" zh="记录这次交接" en="Record the hand-over" />
          </Button>
          {collectorsWithCashInHand.length === 0 && (
            <p className="text-sm text-muted-foreground">
              <Tri
                bm="Tiada tunai bercecir di tangan sesiapa buat masa ini."
                zh="现在没有现金停在任何人手上。"
                en="No cash is sitting in anyone's hands right now."
              />
            </p>
          )}
        </div>

        {/* WAITING FOR HQ: one tick per hand-over — "he brought it → confirm".
            The confirmer recorded is the REAL signed-in person (B-3): the
            "HQ Admin (Demo)" stamp is gone for good. */}
        {pending.map((batch) => (
          <div
            key={batch.id}
            className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-base"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  ⏳ {t("Menunggu HQ sahkan", "等待总会确认", "Waiting for HQ to confirm")}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {batch.collector} · {batch.handedOverAtIso} ·{" "}
                  {t("jumlah", "金额", "total")} {formatRm(batch.totalCents)} ·{" "}
                  {t("resit", "收据", "receipts")} {batch.receiptNos.join(", ")}
                </div>
              </div>
              <Button size="lg" className="text-base" onClick={() => hqConfirm(batch.id)}>
                ✓{" "}
                <Tri
                  bm="Wang sampai — sahkan"
                  zh="钱到了 —— 确认"
                  en="Money arrived — confirm"
                />
              </Button>
            </div>
          </div>
        ))}

        {/* THE HISTORY: hand-overs already counted and confirmed. */}
        {settled.map((batch) => (
          <div
            key={batch.id}
            className="rounded-lg border border-green-300 bg-green-50 p-4 text-base"
          >
            <div className="font-medium">
              ✅ {t("HQ sudah sahkan wang ini", "总会已确认这笔钱", "HQ has confirmed this money")}
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

        <p className="rounded-md bg-muted/40 p-3 text-base">
          <Tri
            bm="Jumlah tunai yang masih belum disahkan oleh HQ"
            zh="仍未被总会确认的现金总额"
            en="Total cash not yet confirmed by HQ"
          />
          :{" "}
          <span className="font-semibold text-foreground">
            {formatRm(totalUnremittedCents(donations))}
          </span>
        </p>
      </div>
    </PageSection>
  );
}
