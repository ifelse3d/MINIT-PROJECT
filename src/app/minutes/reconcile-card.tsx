"use client";

import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { reconcileExtraction } from "@/lib/financial-reconcile";
import { formatRm } from "@/lib/minit-format";
import { useMinutes } from "./minutes-store";

// ---------------------------------------------------------------------------
// THE RECONCILE CARD (work order 125 §4-3 — 8/31 real paper §1).
//
// J's AGM page: 7,680 + 13,600 − 10,150 = 11,130; the page says the bank
// holds 11,590. Nobody mentioned the 460. Code does the sum now (Hard Rule 2,
// src/lib/financial-reconcile.ts) and, when it does not balance, this card
// asks — it never changes a number:
//
//   "⚠️ These figures do not add up by RM460.00 (…). "
//   [I misread them — I will correct]   [The figures are right; the page says so]
//
// The first button changes nothing — the rows are right below to edit. The
// second marks the mismatch as noted, and the document then carries ONE
// note line saying so. A page that balances shows no card at all.
//
// 🔴 Icon: ⚠️ — a warning sign, no community; checked against the house rule.
// ---------------------------------------------------------------------------

export function ReconcileCard() {
  const { extraction, isSample, updateField } = useMinutes();
  if (isSample) return null;
  const r = reconcileExtraction(extraction);
  if (r.status !== "mismatch") return null;

  const diff = formatRm(Math.abs(r.diffCents));
  const computed = formatRm(r.computedCents);
  const stated = formatRm(r.statedCents);
  const noted = extraction.figures_mismatch_noted === true;

  if (noted) {
    return (
      <div
        data-probe="reconcile-card"
        data-state="noted"
        className="flex flex-wrap items-center gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-3 text-sm"
      >
        <p className="min-w-56 flex-1">
          <Tri
            bm={`Angka tidak seimbang sebanyak ${diff} — anda telah mengambil maklum; minit akan mencatat satu baris nota. Tiada angka diubah.`}
            zh={`这份账相差 ${diff} —— 您已知悉；会议记录会留一行注记。没有改动任何数字。`}
            en={`The figures are off by ${diff} — you have noted it; the minutes will carry one note line. No figure was changed.`}
          />
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            updateField((e) => {
              delete e.figures_mismatch_noted;
              return e;
            })
          }
        >
          <Tri bm="Tarik balik" zh="撤回" en="Take it back" />
        </Button>
      </div>
    );
  }

  return (
    <div
      data-probe="reconcile-card"
      data-state="mismatch"
      data-diff={r.diffCents}
      className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-400/10 dark:text-amber-50"
    >
      <p className="text-base font-semibold">
        ⚠️{" "}
        <Tri
          bm={`Angka ini tidak seimbang sebanyak ${diff}.`}
          zh={`这份账对不上 ${diff}。`}
          en={`These figures do not add up — off by ${diff}.`}
        />
      </p>
      <p className="text-base">
        <Tri
          bm={`Baki lepas + pendapatan − perbelanjaan = ${computed}, tetapi kertas menulis baki ${stated}. Saya tidak mengubah apa-apa angka — sama ada saya tersalah baca, atau kertas memang begitu.`}
          zh={`上期结存 + 收入 − 支出 = ${computed}，但纸上写的结存是 ${stated}。我没有改任何数字 —— 要么是我读错了，要么纸上本来就这样。`}
          en={`Opening + income − expenses = ${computed}, but the page states a balance of ${stated}. I changed no figure — either I misread one, or the page really says so.`}
        />
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            document.getElementById("figures-rows")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          <Tri bm="Saya tersalah baca — saya betulkan" zh="这些数字我读错了，我来改" en="I misread them — I will correct" />
        </Button>
        <Button
          type="button"
          onClick={() =>
            updateField((e) => {
              e.figures_mismatch_noted = true;
              return e;
            })
          }
          data-probe="reconcile-noted"
        >
          <Tri bm="Angka betul, kertas memang begitu" zh="数字没错，纸上本来就这样" en="The figures are right; the page says so" />
        </Button>
      </div>
      <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
        <Tri
          bm="Kedua-dua butang tidak mengubah angka. Yang kedua hanya mencatat bahawa anda tahu, dan minit akan membawa satu baris nota."
          zh="两颗按钮都不会改数字。第二颗只是记下您已知悉，会议记录会留一行注记。"
          en="Neither button changes a figure. The second only records that you know, and the minutes will carry one note line."
        />
      </p>
    </div>
  );
}
