"use client";

import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { useRegister } from "../register-store";

// ---------------------------------------------------------------------------
// §1-8 (work order 32): J registered 4 manual rows, opened receipt history,
// and saw only his 2 old receipts — because the new rows had NO receipts yet.
// The page was honest but silent about it, which reads as "history is stale".
// This banner says where the missing rows actually are. It reads the shared
// register store (this page lives under the /money layout), so the count is
// the same one the receipts page shows.
// ---------------------------------------------------------------------------

export function UnreceiptedNote() {
  const { unreceipted } = useRegister();
  if (unreceipted === 0) return null;
  return (
    <p className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
      💡{" "}
      <Tri
        bm={`${unreceipted} rekod lagi sudah didaftar tetapi belum ada resit — ia belum muncul di sini.`}
        zh={`另有 ${unreceipted} 笔已登记、还没开收据 —— 所以还不会出现在这里。`}
        en={`${unreceipted} more row(s) are registered but have no receipt yet — so they are not listed here.`}
      />{" "}
      <Link href="/money/receipts" className="font-medium underline underline-offset-4">
        <Tri bm="Pergi jana resit" zh="去开收据" en="Go issue receipts" /> →
      </Link>
    </p>
  );
}
