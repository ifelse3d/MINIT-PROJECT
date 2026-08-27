"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError } from "@/components/language-provider";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
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

// Launch feedback #3 (2026-08-27 evening): the JOB is one round — record the
// money that arrived, check it, issue receipts for EXACTLY those rows. The
// second step is the ROUND's receipts page (/money/issue); the whole-register
// receipts view became a management page beside custody and history.
// Handing cash to HQ stays a RECORD page — and since #4 it no longer waits
// for receipts (money moves first, the receipt follows).
const MONEY_TABS = [
  // G-4 (2026-08-25, J #19): the BM official term rides along in zh/EN — it
  // is the word on the ledger book, the bank slip and the auditor's mouth.
  { href: "/money", labelBm: "Rekod wang masuk", labelZh: "收钱记账 · Lejar", labelEn: "Record money in · Lejar" },
  { href: "/money/issue", labelBm: "Resit pusingan ini", labelZh: "开收据 · 这一轮", labelEn: "Receipts · this round" },
] as const;

// #12/#16 (J review 27-evening, 2026-08-28): the rail's right side used to
// repeat Manage receipts / Cash custody / Tax file / History — every one of
// them already a sidebar row in the 钱 group. The rail now carries ONLY the
// two numbered steps of the job; the records pages live in the sidebar,
// once.

export function MoneyChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const localizeError = useLocalizedError();
  const {
    documentOrgName,
    ledgerSourceLabel,
    isRealLedger,
    isSampleLedger,
    donations,
    donationStore,
    ledgerRowsToCheck,
    rowsReadyToAdd,
    roundDonations,
    registerLocalOnly,
    error,
    setError,
  } = useRegister();

  const roundUnreceipted = roundDonations.filter((d) => d.receiptNo === null).length;
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
      // #3: the step is about THIS ROUND only. No round = locked; a round
      // with unreceipted rows wants you; a fully-receipted round is done.
      status:
        roundDonations.length === 0
          ? "locked"
          : roundUnreceipted > 0
            ? "needs-you"
            : "done",
      count: roundUnreceipted,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-green-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-emerald-400/15 dark:ring-white/10">
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
          {/* R-5 (2026-08-25): "delete everything" no longer lives one tap
              from the daily work. It moved to Settings, where it requires
              typing the organisation's name — a destructive control does not
              belong in a page header. */}
        </div>
        <p className="text-sm text-muted-foreground">
          {documentOrgName}
          {/* F-8: one sample badge, not badge + suffix (see minutes-chrome). */}
          {ledgerSourceLabel ? ` · ${ledgerSourceLabel}` : ""}
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
      {/* D32: a recorded row that never reached the organisation's records is
          one browser's private money — said out loud, same as custody. */}
      {registerLocalOnly && (
        <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Rekod wang yang baru ditambah tercatat pada peranti ini sahaja — ia belum sampai ke rekod pertubuhan. Pilih pertubuhan anda, atau buka halaman ini semula apabila ada talian."
            zh="刚记的钱只存在这台设备上 —— 还没有进到机构的记录里。请选好您的机构，或者等有网络时再打开这一页一次。"
            en="The money just recorded is saved on this device only — it has not reached the organisation's records. Choose your organisation, or open this page again when you have a signal."
          />
        </div>
      )}
      {error && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
          <span className="min-w-56 flex-1">{localizeError(error)}</span>
          <Button size="sm" variant="outline" onClick={() => setError(null)}>
            <Tri bm="Tutup" zh="关掉" en="Dismiss" />
          </Button>
        </div>
      )}

      {/* Where am I? The two steps of the round — the record pages (custody,
          tax file, history) are sidebar rows, not rail pills (#12/#16). */}
      <SectionTabs tabs={tabs} />

      {/* /money/history is a plain server page with its own heading; the rail
          above is all the frame it needs. */}
      <div key={pathname} className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
