"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { taxDeductibilityLineBm } from "@/lib/receipts";
import { formatRm } from "@/lib/minutes-draft";
import { holdsCash } from "@/lib/receipts";
import { IssueControls } from "../issue-controls";
import { ReceiptActions } from "../receipt-actions";
import { useRegister } from "../register-store";

// ---------------------------------------------------------------------------
// /money/issue — STEP 2: receipts for THIS ROUND (launch feedback #3).
//
// 「那一輪就是那一輪的東西，不會有其他東西的」: only the rows recorded in
// step 1 of this sitting appear here. Old rows, other days, other batches —
// those live on the receipts MANAGEMENT page (/money/receipts), not in the
// middle of the flow.
//
// The order is money-first (#4): the money was already received when it was
// recorded in step 1; the receipt is the donor's proof, issued here; handing
// the CASH to the treasurer/HQ is recorded on /money/custody afterwards —
// and no longer requires the receipt to exist first.
// ---------------------------------------------------------------------------

export function IssueRound() {
  const t = useTriText();
  const router = useRouter();
  const {
    taxStatus,
    roundIds,
    roundDonations,
    finishRound,
  } = useRegister();
  const [confirmFinish, setConfirmFinish] = useState(false);

  const unreceipted = roundDonations.filter((d) => d.receiptNo === null);
  const receipted = roundDonations.filter((d) => d.receiptNo !== null);
  const cashRows = roundDonations.filter(
    (d) => holdsCash(d) && d.custodyStatus === "collected",
  );
  const cashCents = cashRows.reduce((s, d) => s + d.amountCents, 0);
  const allDone = roundDonations.length > 0 && unreceipted.length === 0;

  function finishAndGoHome() {
    finishRound();
    setConfirmFinish(false);
    router.push("/money");
  }

  return (
    <PageSection
      step={2}
      titleBm="Jana resit — pusingan ini"
      titleZh="开收据 · 这一轮"
      titleEn="Issue receipts — this round"
      summary={
        roundDonations.length === 0 ? (
          <Tri
            bm="Tiada pusingan yang sedang berjalan."
            zh="现在没有进行中的一轮。"
            en="No round is in progress."
          />
        ) : (
          <Tri
            bm={`${roundDonations.length} baris pusingan ini sahaja — daftar penuh ada di halaman “Resit · urus”.`}
            zh={`只显示这一轮的 ${roundDonations.length} 笔 —— 完整登记簿在「开收据 · 管理」那一页。`}
            en={`Only this round's ${roundDonations.length} row(s) — the full register lives on the receipts management page.`}
          />
        )
      }
    >
      <div className="flex flex-col gap-4">
        {roundDonations.length === 0 ? (
          <div className="rounded-md border-2 border-dashed p-5 text-base">
            <p className="font-semibold">
              <Tri
                bm="Tiada baris dalam pusingan ini."
                zh="这一轮还没有记录。"
                en="Nothing in this round yet."
              />
            </p>
            <p className="mt-1 text-muted-foreground">
              <Tri
                bm="Rekod wang masuk di langkah 1 dahulu — atau, untuk baris lama yang belum ada resit, buka halaman urus resit."
                zh="请先到第 1 步记收入 —— 以前记了还没开收据的，去「开收据 · 管理」处理。"
                en="Record income in step 1 first — or, for older rows without receipts, open the receipts management page."
              />
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/money">
                  ← <Tri bm="Ke langkah 1" zh="去第 1 步记收入" en="To step 1" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/money/receipts">
                  <Tri bm="Urus resit" zh="开收据 · 管理" en="Manage receipts" /> →
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* The sentence printed on every receipt — same box as the
                management page, because screen and paper must match. */}
            <div className="rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
              <p className="text-sm font-medium text-muted-foreground">
                <Tri
                  bm="Ayat ini dicetak pada setiap resit, tepat seperti di bawah:"
                  zh="下面这一句会原样印在每一张收据上："
                  en="This sentence is printed on every receipt, exactly as below:"
                />
              </p>
              <p className="mt-1 text-base font-medium">
                {taxDeductibilityLineBm(taxStatus)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {taxStatus === "s44_6" ? (
                  <Tri
                    bm="Maksudnya: penderma boleh menuntut pelepasan cukai dengan resit ini."
                    zh="意思是：捐款人可以用这张收据申报扣税。"
                    en="What it means: the donor can claim a tax deduction with this receipt."
                  />
                ) : (
                  <Tri
                    bm="Maksudnya: penderma TIDAK boleh menuntut pelepasan cukai dengan resit ini."
                    zh="意思是：捐款人不能用这张收据申报扣税。"
                    en="What it means: the donor cannot claim a tax deduction with this receipt."
                  />
                )}
              </p>
            </div>

            {/* The round, row by row — with its receipt (or its wait). */}
            <div className="flex flex-col gap-2">
              {roundDonations.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-sm border p-3"
                >
                  <div className="min-w-40">
                    <p className="font-medium">{d.donorName}</p>
                    <p className="font-mono text-sm text-muted-foreground">
                      {d.receiptNo ?? t("belum ada resit", "还没有收据", "no receipt yet")}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {d.kind === "in_kind" ? `📦 ${d.itemDesc || "—"}` : formatRm(d.amountCents)}
                  </span>
                  {d.receiptNo ? (
                    <ReceiptActions d={d} />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      <Tri bm="menunggu nombor" zh="等生成编号" en="awaiting its number" />
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <IssueControls ids={roundIds} count={unreceipted.length} />
              {allDone && (
                <p className="rounded-md border-2 border-green-400 bg-green-50 px-3 py-2 text-base font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
                  ✓{" "}
                  <Tri
                    bm={`Semua ${receipted.length} resit pusingan ini sudah dijana.`}
                    zh={`这一轮的 ${receipted.length} 张收据都开好了。`}
                    en={`All ${receipted.length} receipt(s) for this round are issued.`}
                  />
                </p>
              )}
            </div>

            {/* Money-first (#4): the cash goes to the treasurer/HQ — the
                custody page records that hand-over, receipts or not. */}
            {cashRows.length > 0 && (
              <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                💰{" "}
                <Tri
                  bm={`${formatRm(cashCents)} tunai pusingan ini masih di tangan pemungut. Rekod serahannya kepada bendahari/HQ di halaman simpanan tunai — resit tidak wajib dahulu.`}
                  zh={`这一轮有 ${formatRm(cashCents)} 现金还在收款人手上。记得到「交现金」记录交给财政／总会 —— 不必等收据开完。`}
                  en={`${formatRm(cashCents)} of this round's cash is still with the collector. Record its hand-over to the treasurer/HQ on the cash custody page — receipts are not required first.`}
                />{" "}
                <Link href="/money/custody" className="font-medium underline underline-offset-4">
                  <Tri bm="Rekod serahan" zh="去交现金" en="Record the hand-over" /> →
                </Link>
              </p>
            )}

            {/* Close the round. If receipts are still missing, say what that
                means and where they can be issued later — never a dead end. */}
            <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--v2-border)] pt-4">
              {confirmFinish && !allDone ? (
                <>
                  <span className="text-base font-medium text-amber-900 dark:text-amber-100">
                    <Tri
                      bm={`${unreceipted.length} baris masih tiada resit — boleh dijana kemudian di halaman urus resit. Tutup pusingan ini?`}
                      zh={`还有 ${unreceipted.length} 笔没开收据 —— 之后可以在「开收据 · 管理」补开。确定完成这一轮？`}
                      en={`${unreceipted.length} row(s) still have no receipt — they can be issued later on the management page. Close this round?`}
                    />
                  </span>
                  <Button onClick={finishAndGoHome}>
                    <Tri bm="Ya, tutup" zh="是，完成" en="Yes, close it" />
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmFinish(false)}>
                    <Tri bm="Belum" zh="先不要" en="Not yet" />
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  variant={allDone ? "default" : "outline"}
                  className="text-base"
                  onClick={() => {
                    if (allDone) finishAndGoHome();
                    else setConfirmFinish(true);
                  }}
                >
                  ✓{" "}
                  <Tri
                    bm="Selesai pusingan ini — mula yang baharu"
                    zh="完成这一轮，开始新的一轮"
                    en="Finish this round — start a new one"
                  />
                </Button>
              )}
              <Link
                href="/money/receipts"
                className="text-sm underline underline-offset-4"
              >
                <Tri
                  bm="Semua resit & daftar penuh"
                  zh="全部收据与完整登记簿"
                  en="All receipts & the full register"
                />{" "}
                →
              </Link>
            </div>
          </>
        )}
      </div>
    </PageSection>
  );
}
