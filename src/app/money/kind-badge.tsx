"use client";

import { useState } from "react";
import { Tri } from "@/components/language-provider";
import type { LedgerRowKind } from "@/lib/extraction";
import type { RowKindReading } from "@/lib/ledger-hints";

// ---------------------------------------------------------------------------
// 136: the KIND badge under every ledger review row — income / expense /
// balance / total — the reader's label, coloured by its confidence
// (confirmed green, check amber), or grey with "(guessed by code)" when the
// 135 balance word-list stood in for a silent reader. Tap it to change: the
// picker offers income / expense / balance; picking makes it a confirmed,
// person-sourced label (the caller writes it). A row without any label shows
// NO badge — it is not income by default — only a small "label it" link.
//
// Once a row has been handed to the expenses page the badge is frozen: the
// same amount must not come back as a receipt through a second tap.
// ---------------------------------------------------------------------------

const LABEL: Record<LedgerRowKind, { bm: string; zh: string; en: string }> = {
  income: { bm: "Pendapatan", zh: "收入", en: "Income" },
  expense: { bm: "Perbelanjaan", zh: "支出", en: "Expense" },
  balance: { bm: "Baki", zh: "结余", en: "Balance" },
  total: { bm: "Jumlah", zh: "总计", en: "Total" },
};

const PICKABLE: LedgerRowKind[] = ["income", "expense", "balance"];

function toneClass(reading: RowKindReading, sent: boolean): string {
  if (sent) return "border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200";
  if (reading.inferred) return "border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200";
  if (reading.confidence === "check") return "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100";
  if (reading.kind === "income") return "border-green-300 bg-green-50 text-green-900 dark:bg-green-400/15 dark:text-green-100";
  return "border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100";
}

export function KindBadge({
  reading,
  sent,
  onPick,
  onConfirm,
}: {
  reading: RowKindReading;
  /** Already handed to /money/expenses — frozen. */
  sent: boolean;
  onPick: (kind: LedgerRowKind) => void;
  /** Present only for a "check" label: one tap agrees with the reader. */
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const picker = open && !sent && (
    <span className="inline-flex flex-wrap items-center gap-1" data-probe="ledger-kind-picker">
      {PICKABLE.map((k) => (
        <button
          key={k}
          type="button"
          data-probe={`ledger-kind-pick-${k}`}
          className="rounded-md border px-2 py-0.5 text-sm hover:bg-accent"
          onClick={() => {
            setOpen(false);
            onPick(k);
          }}
        >
          <Tri bm={LABEL[k].bm} zh={LABEL[k].zh} en={LABEL[k].en} />
        </button>
      ))}
      <button
        type="button"
        className="text-sm text-muted-foreground underline underline-offset-4"
        onClick={() => setOpen(false)}
      >
        <Tri bm="Batal" zh="先不要" en="Cancel" />
      </button>
    </span>
  );

  if (reading.kind === null) {
    // No label from the reader, no balance word: nothing is claimed. A quiet
    // link lets a person say what it is — never a green badge by default.
    return (
      <>
        {!open && (
          <button
            type="button"
            data-probe="ledger-kind-unlabelled"
            className="text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setOpen(true)}
          >
            <Tri bm="Jenis baris?" zh="这行是什么？" en="Row type?" />
          </button>
        )}
        {picker}
      </>
    );
  }

  const label = LABEL[reading.kind];
  return (
    <>
      <button
        type="button"
        data-probe="ledger-kind-badge"
        data-kind={reading.kind}
        data-confidence={reading.inferred ? "inferred" : reading.confidence}
        disabled={sent}
        title={
          sent
            ? undefined
            : reading.inferred
              ? "Ditentukan oleh kod, bukan MinitAI · 是码推的，不是 MinitAI 标的 · Guessed by code, not by MinitAI"
              : undefined
        }
        className={`inline-flex min-h-7 items-center gap-1 rounded-xs border px-2.5 py-1 text-sm font-semibold ${toneClass(reading, sent)} ${
          sent ? "" : "cursor-pointer hover:brightness-95"
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        {reading.confidence === "check" && !reading.inferred ? "❓ " : ""}
        <Tri bm={label.bm} zh={label.zh} en={label.en} />
        {reading.inferred && (
          <span className="font-normal">
            {" "}
            (<Tri bm="teka kod" zh="码推的" en="code guess" />)
          </span>
        )}
      </button>
      {onConfirm && !sent && !open && (
        <button
          type="button"
          data-probe="ledger-kind-confirm"
          className="rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-sm font-medium text-green-900 hover:bg-green-100 dark:bg-green-400/15 dark:text-green-100"
          onClick={onConfirm}
        >
          ✓ <Tri bm="Betul" zh="对" en="Correct" />
        </button>
      )}
      {picker}
    </>
  );
}
