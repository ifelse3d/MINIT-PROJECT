"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { formatRm } from "@/lib/minutes-draft";
import type { RegisterDonation } from "@/lib/receipts";
import { DonationEditor } from "./donation-editor";
import {
  CUSTODY_LABEL,
  CUSTODY_STYLE,
  TRANSFER_LABEL,
  TRANSFER_STYLE,
} from "./custody-labels";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// "THIS ROUND, SO FAR" — J's launch feedback #3 (2026-08-27 evening):
// 「我按了把這 1 筆加進名冊，然後直接不見……爲什麽不是會在下面 DOUBLE
// CONFIRM，然後才到下一頁」. Every row recorded this sitting appears HERE,
// right under the entry doors, editable and deletable — the double-check —
// and the one way forward is "issue receipts for exactly these".
// ---------------------------------------------------------------------------

export function RoundList() {
  const t = useTriText();
  const { roundDonations, saveDonation, deleteDonation } = useRegister();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (roundDonations.length === 0) return null;

  const totalCents = roundDonations
    .filter((d) => d.kind !== "in_kind")
    .reduce((s, d) => s + d.amountCents, 0);

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/40 bg-[color:var(--v2-primary-soft)]/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">
          ✅{" "}
          <Tri
            bm={`Pusingan ini: ${roundDonations.length} baris direkodkan`}
            zh={`这一轮已记 ${roundDonations.length} 笔`}
            en={`This round: ${roundDonations.length} row(s) recorded`}
          />
        </p>
        <p className="text-base font-semibold tabular-nums">
          <Tri bm="Jumlah" zh="合计" en="Total" /> {formatRm(totalCents)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Semak sekali di sini — ubah atau buang baris yang salah. Kemudian tekan “Jana resit untuk pusingan ini” di bawah."
          zh="在这里再核对一次 —— 有错就修改或删掉。没问题就按下面的「为这一轮开收据」。"
          en="Double-check here — edit or remove anything wrong. Then press “Issue receipts for this round” below."
        />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-base">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-left text-sm text-muted-foreground">
              <th className="px-2 py-2"><Tri bm="Penderma" zh="捐款人" en="Donor" /></th>
              <th className="px-2 py-2 text-right"><Tri bm="Jumlah" zh="金额" en="Amount" /></th>
              <th className="px-2 py-2"><Tri bm="Tujuan" zh="用途" en="Purpose" /></th>
              <th className="px-2 py-2"><Tri bm="Tarikh" zh="日期" en="Date" /></th>
              <th className="px-2 py-2"><Tri bm="Cara" zh="方式" en="How" /></th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {roundDonations.map((d) => (
              <Fragment key={d.id}>
                <tr className="border-b border-[color:var(--v2-border)] last:border-b-0">
                  <td className="px-2 py-2 font-medium">{d.donorName}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {d.kind === "in_kind" ? (
                      <span className="font-medium">📦 {d.itemDesc || "—"}</span>
                    ) : (
                      formatRm(d.amountCents)
                    )}
                  </td>
                  <td className="px-2 py-2 text-sm">{d.purpose}</td>
                  <td className="px-2 py-2 text-sm tabular-nums">{d.donatedAtIso}</td>
                  <td className="px-2 py-2">
                    <RoundRowBadge d={d} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1.5">
                      {d.receiptNo === null && editingId !== d.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(d.id)}
                          aria-label={t("Ubah", "修改", "Edit")}
                        >
                          ✏️
                        </Button>
                      )}
                      {d.receiptNo === null && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:hover:bg-red-400/10"
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  `Buang baris ini? ${d.donorName} · ${formatRm(d.amountCents)}. Tidak boleh dibatalkan.`,
                                  `要删掉这一笔吗？${d.donorName} · ${formatRm(d.amountCents)}。删了无法复原。`,
                                  `Remove this row? ${d.donorName} · ${formatRm(d.amountCents)}. This cannot be undone.`,
                                ),
                              )
                            ) {
                              deleteDonation(d.id);
                            }
                          }}
                          aria-label={t("Buang", "删掉", "Remove")}
                        >
                          🗑
                        </Button>
                      )}
                      {d.receiptNo !== null && (
                        <span className="font-mono text-sm text-muted-foreground">
                          {d.receiptNo}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {editingId === d.id && (
                  <tr>
                    <td colSpan={6} className="px-2 pb-3">
                      <DonationEditor
                        donation={d}
                        onSave={saveDonation}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoundRowBadge({ d }: { d: RegisterDonation }) {
  if (d.paymentMethod === "transfer") {
    return (
      <Badge variant="outline" className={TRANSFER_STYLE}>
        🏦 <Tri {...TRANSFER_LABEL} />
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={CUSTODY_STYLE[d.custodyStatus]}>
      <Tri {...CUSTODY_LABEL[d.custodyStatus]} />
    </Badge>
  );
}
