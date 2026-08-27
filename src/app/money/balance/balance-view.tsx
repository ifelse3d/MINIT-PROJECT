"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { formatRm } from "@/lib/minutes-draft";

// ---------------------------------------------------------------------------
// The balance CARD (client half of /money/balance). The amount starts hidden
// behind an eye (D31): the page often faces a hall of people, and the
// society's balance is the treasurer's to reveal, not the screen's. The
// reveal is per-visit, deliberately not persisted — walking away from the
// laptop must not leave the number on show next time.
// ---------------------------------------------------------------------------

export function BalanceView({
  incomeTotalCents,
  paymentsTotalCents,
  asOfIso,
}: {
  incomeTotalCents: number;
  paymentsTotalCents: number;
  asOfIso: string;
}) {
  const t = useTriText();
  const [shown, setShown] = useState(false);
  const balanceCents = incomeTotalCents - paymentsTotalCents;

  return (
    <PageSection
      titleBm="Baki semasa"
      titleZh="现有资金"
      titleEn="Current funds"
      summary={
        <Tri
          bm={`Wang masuk tolak wang keluar, atas SEMUA rekod yang tersimpan — dikira oleh sistem, setakat ${asOfIso}.`}
          zh={`收入减支出，算的是已保存的全部记录 —— 由系统加总，算到 ${asOfIso}。`}
          en={`Money in minus money out, over EVERY saved record — summed by the system, as of ${asOfIso}.`}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-5">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              <Tri bm="Baki sekarang" zh="现在还有多少钱" en="Balance now" />
            </span>
            <span
              className={`text-3xl font-semibold tabular-nums ${
                shown
                  ? balanceCents < 0
                    ? "text-red-700 dark:text-red-300"
                    : ""
                  : "select-none tracking-widest text-muted-foreground"
              }`}
            >
              {shown ? formatRm(balanceCents) : "RM ••••••"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            className="flex min-h-11 items-center gap-2 rounded-md border-2 border-[color:var(--v2-outline-border)] px-4 text-base font-medium hover:bg-[color:var(--v2-card-nested)]"
          >
            {shown ? (
              <>
                <EyeOff className="h-5 w-5" strokeWidth={1.8} />
                {t("Sorok", "遮住", "Hide")}
              </>
            ) : (
              <>
                <Eye className="h-5 w-5" strokeWidth={1.8} />
                {t("Tunjuk", "看金额", "Show")}
              </>
            )}
          </button>
        </div>

        {/* The two halves of the subtraction — only while revealed, for the
            same over-the-shoulder reason as the balance itself. */}
        {shown && (
          <div className="grid gap-3 @md:grid-cols-2">
            <div className="rounded-md border bg-green-50 p-4 dark:bg-green-400/10">
              <div className="text-sm text-muted-foreground">
                <Tri bm="Jumlah masuk" zh="收入合计" en="Total in" />
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {formatRm(incomeTotalCents)}
              </div>
            </div>
            <div className="rounded-md border bg-red-50 p-4 dark:bg-red-400/10">
              <div className="text-sm text-muted-foreground">
                <Tri bm="Jumlah keluar" zh="支出合计" en="Total out" />
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {formatRm(paymentsTotalCents)}
              </div>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Asas tunai: hanya wang yang benar-benar bergerak. Tuntutan yang belum dibayar belum dikira; barangan (derma barangan) tiada dalam kiraan wang."
            zh="现金制：只算真正动过的钱。还没付的报销不在里面；实物捐赠不算钱。"
            en="Cash basis: only money that actually moved. Unpaid claims are not counted yet; in-kind goods are never money."
          />
        </p>
      </div>
    </PageSection>
  );
}
