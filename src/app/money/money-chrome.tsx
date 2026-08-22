"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { SAMPLE_LEDGER_LABEL } from "@/lib/sample-ledger";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// The frame every /money page sits inside: title, which organisation this is,
// the one error line, and the tab rail that says where you are.
//
// Before the split (2026-08-23) this was the top ~150 lines of a 1734-line
// page. It is here so the four pages do not each carry their own copy of the
// heading — and, more usefully, so "delete everything and start again" has ONE
// home rather than being reachable only from whichever page happened to keep
// it.
// ---------------------------------------------------------------------------

const MONEY_TABS = [
  { href: "/money", labelBm: "Baca lejar", labelZh: "读账页", labelEn: "Read the ledger" },
  { href: "/money/receipts", labelBm: "Resit", labelZh: "开收据", labelEn: "Receipts" },
  { href: "/money/custody", labelBm: "Serah wang", labelZh: "交现金", labelEn: "Hand over cash" },
  { href: "/money/einvois", labelBm: "Fail cukai", labelZh: "税务文件", labelEn: "Tax file" },
  { href: "/money/history", labelBm: "Sejarah", labelZh: "历史", labelEn: "History" },
] as const;

export function MoneyChrome({ children }: { children: ReactNode }) {
  const t = useTriText();
  const pathname = usePathname();
  const {
    documentOrgName,
    ledgerSourceLabel,
    isRealLedger,
    isSampleLedger,
    donations,
    donationStore,
    receiptsIssued,
    ledgerRowsToCheck,
    rowsReadyToAdd,
    unreceipted,
    cashInHandCents,
    availableMonths,
    deleteEverything,
    error,
    setError,
  } = useRegister();

  const tabs: SectionTab[] = [
    {
      ...MONEY_TABS[0],
      status: isSampleLedger
        ? "example"
        : isRealLedger
          ? ledgerRowsToCheck > 0 || rowsReadyToAdd > 0
            ? "needs-you"
            : "done"
          : "needs-you",
      count: ledgerRowsToCheck > 0 ? ledgerRowsToCheck : rowsReadyToAdd,
    },
    {
      ...MONEY_TABS[1],
      status: donations.length === 0 ? "locked" : receiptsIssued ? "done" : "needs-you",
      count: unreceipted,
    },
    {
      ...MONEY_TABS[2],
      status: !receiptsIssued ? "locked" : cashInHandCents > 0 ? "needs-you" : "done",
    },
    {
      // The tax file only becomes real once a month with receipts exists. It is
      // a once-a-month errand, never "the next thing to do", so it never claims
      // the amber "needs you" colour the way its StepCard used to.
      ...MONEY_TABS[3],
      status: availableMonths.length > 0 && receiptsIssued ? "neutral" : "locked",
    },
    { ...MONEY_TABS[4], status: "neutral" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-emerald-400/15 dark:ring-white/10">
            🧾
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Wang & Resit" zh="财务与收据" en="Money & Receipts" />
            </span>
          </h1>
          {/* Only when the person asked for the example. A fresh page has
              nothing on it to label. */}
          {isSampleLedger && donations.length === 0 && (
            <Badge variant="secondary">
              <Tri bm="Contoh" zh="示范" en="Example" />
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              if (
                window.confirm(
                  // AUDIT FIX: the old wording ("reset to sample data") made
                  // this sound harmless, but it wipes the REAL register — every
                  // donation on this device, including rows that already carry
                  // an issued, gap-free receipt number.
                  t(
                    "PADAM semua rekod derma pada peranti ini dan mula semula?\n\nIni termasuk derma sebenar yang sudah ada nombor resit. Tidak boleh dibatalkan.",
                    "要删除这台设备上所有捐款记录、重新开始吗？\n\n这会连已经开了收据号码的真实捐款一起删掉，无法复原。",
                    "DELETE every donation record on this device and start again?\n\nThis includes real donations that already have issued receipt numbers. It cannot be undone.",
                  ),
                )
              ) {
                deleteEverything();
              }
            }}
          >
            ↺{" "}
            <Tri
              bm="Padam semua & mula semula"
              zh="全部删除，重新开始"
              en="Delete everything & start again"
            />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {documentOrgName}
          {ledgerSourceLabel ? ` · ${ledgerSourceLabel}` : ""}
          {isSampleLedger ? ` · ${SAMPLE_LEDGER_LABEL}` : ""}
        </p>
      </div>

      {/* The register could not be read back off this device — say so BEFORE
          anything on any of these pages is trusted. (usePersistentState moves
          the unreadable blob aside rather than overwriting it.) */}
      {donationStore.corrupt && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
          <Tri
            bm="Rekod yang tersimpan pada peranti ini tidak dapat dibaca, jadi daftar ini dimulakan kosong. Jangan jana resit sebelum menyemak “Sejarah resit” — resit yang sudah dijana tersimpan dengan selamat di sana."
            zh="这台设备上暂存的记录读不出来，所以登记簿从空的开始。开收据之前请先看「收据历史」—— 已经开出的收据都安全地存在那边。"
            en="The records saved on this device could not be read, so the register started empty. Before issuing any receipts, check “Receipt history” — receipts already issued are safely stored there."
          />
        </div>
      )}
      {donationStore.quotaFull && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
          <Tri
            bm="Peranti ini penuh, jadi daftar ini TIDAK dapat disimpan. Jangan tutup halaman: jana resit sekarang supaya rekod masuk ke pangkalan data."
            zh="这台设备的储存空间满了，登记簿没能存下来。请先不要关掉页面：现在就开收据，记录才会进到资料库。"
            en="This device is full, so the register could NOT be saved. Do not close the page: issue the receipts now so the records reach the database."
          />
        </div>
      )}
      {error && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
          <span className="min-w-56 flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => setError(null)}>
            <Tri bm="Tutup" zh="关掉" en="Dismiss" />
          </Button>
        </div>
      )}

      {/* Where am I? One rail, five addresses. */}
      <SectionTabs tabs={tabs} />

      {/* /money/history is a plain server page with its own heading; the rail
          above is all the frame it needs. */}
      <div key={pathname} className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
