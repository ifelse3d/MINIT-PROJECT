"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { setReceiptPrefix } from "../orgs/actions";
import { SettingsRow } from "./ui";

// ---------------------------------------------------------------------------
// Settings → the letters on this organisation's receipts (2026-08-22).
//
// J was asked who decides the receipt numbering and answered:
// 「我覺得系統直接定，他們一般不會想這些，或我們可以做給那邊有個 setting，
//   不過定了就不能改了」— so both halves are built here:
//
//   * The system decides by default. Every org starts at MIN-<year>-0001 and a
//     society that never opens this page never has to think about it.
//   * A society that DOES care can set its own letters — once.
//
// AND EACH BRANCH SETS ITS OWN (J, same day: 「分會各自一套收據，才能知道是誰
// 發出來的」). The series has always been per-org in the database; what was
// missing was any way to make the branches' letters DIFFER, so two branches
// both printed MIN-2026-0001 and the paper did not say which one issued it.
//
// 🔴 THE "ONCE" IS ENFORCED IN THE DATABASE, NOT HERE.
// freeze_receipt_series() (20260730000000_receipt_series.sql) refuses any
// change after the first receipt exists. This component hides the control at
// that point — but hiding is a courtesy for the reader, not the rule. The rule
// is the trigger, and the server action still handles its refusal.
//
// Why it must be one-way: the numbers on issued receipts do not change when the
// prefix does. Change PSH to KLG after 40 receipts and the society's book runs
// PSH-2026-0001…0040 then KLG-2026-0041 — two series pretending to be one, and
// the gap-free check in issue_receipts() would then read the year as broken.
// ---------------------------------------------------------------------------

export function ReceiptSeriesRows({
  orgId,
  prefix,
  /** True once at least one receipt exists — the series is then frozen. */
  frozen,
  year,
}: {
  orgId: number;
  prefix: string;
  frozen: boolean;
  year: number;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(prefix);
  const [state, action, pending] = useActionState(setReceiptPrefix, {
    error: null,
    ok: false,
  });

  const sample = `${(value || prefix).toUpperCase()}-${year}-0001`;

  return (
    <SettingsRow
      label={<Tri bm="Nombor resit" zh="收据字号" en="Receipt numbers" />}
      sub={
        frozen ? (
          <Tri
            bm="Sudah dikunci — resit telah dikeluarkan"
            zh="已锁定 —— 已经开过收据"
            en="Locked — receipts have been issued"
          />
        ) : undefined
      }
      help={
        <Tri
          bm={
            "Setiap resit diberi nombor sendiri oleh Minit, mengikut urutan dan tanpa nombor terlewat: " +
            `${prefix}-${year}-0001, ${prefix}-${year}-0002, dan seterusnya. Nombor bermula semula dari 0001 setiap tahun baharu. ` +
            "Huruf di hadapan itu milik pertubuhan anda — setiap cawangan guna hurufnya sendiri, supaya resit itu sendiri memberitahu siapa yang mengeluarkannya. " +
            "Ia hanya boleh ditetapkan SEKALI, sebelum resit pertama: nombor pada resit yang sudah dikeluarkan tidak berubah, jadi menukarnya kemudian memecahkan siri itu."
          }
          zh={
            "每一张收据的号码都是 Minit 自己给的，一张接一张，中间不会跳号：" +
            `${prefix}-${year}-0001、${prefix}-${year}-0002，依此类推。每逢新的一年，号码从 0001 重新开始。` +
            "前面那几个字母是你们自己的 —— 每个分会用自己的字母，这样单看收据就知道是谁开的。" +
            "只能设定一次，而且要在开第一张收据之前：已经开出去的收据号码不会跟着改，之后再改就等于把一套号码拆成两套。"
          }
          en={
            "Minit numbers every receipt itself, in order and with no gaps: " +
            `${prefix}-${year}-0001, ${prefix}-${year}-0002, and so on. The count restarts at 0001 each new year. ` +
            "The letters in front are your organisation's own — each branch uses its own, so the receipt itself says who issued it. " +
            "They can be set ONCE, before the first receipt: numbers already printed do not change, so changing the letters later splits one series into two."
          }
        />
      }
    >
      <div className="flex flex-col items-start gap-2">
        <p className="font-mono text-base font-medium">
          {prefix}-{year}-0001
        </p>

        {state.ok && (
          <p className="rounded-md border-2 border-green-400 bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
            ✓ <Tri bm="Sudah disimpan." zh="已经保存了。" en="Saved." />
          </p>
        )}

        {/* After a save the form closes itself: revalidatePath has already
            refreshed the row above with the new letters. */}
        {!frozen && (!open || state.ok) && (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <Tri
              bm="Tukar huruf resit…"
              zh="更改收据字号…"
              en="Change the receipt letters…"
            />
          </Button>
        )}

        {!frozen && open && !state.ok && (
          <form action={action} className="flex w-full flex-col gap-3">
            <input type="hidden" name="orgId" value={orgId} />
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri
                  bm="Huruf di hadapan nombor resit"
                  zh="收据号码前面的字母"
                  en="The letters in front of the number"
                />
              </span>
              <input
                name="prefix"
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                maxLength={8}
                minLength={2}
                required
                autoComplete="off"
                spellCheck={false}
                // Same rule as the database's check constraint, so the browser
                // and Postgres can never disagree about what is acceptable.
                pattern="[A-Za-z][A-Za-z0-9]{1,7}"
                className="w-full rounded-md border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 font-mono text-base uppercase text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]"
              />
              <span className="text-sm leading-relaxed text-muted-foreground">
                <Tri
                  bm={`2–8 huruf besar atau nombor. Resit pertama nanti: ${sample}`}
                  zh={`2–8 个大写字母或数字。第一张收据会是：${sample}`}
                  en={`2–8 capital letters or digits. Your first receipt will be: ${sample}`}
                />
              </span>
            </label>

            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              ⚠{" "}
              <Tri
                bm="Selepas resit pertama dikeluarkan, huruf ini tidak boleh ditukar lagi."
                zh="开出第一张收据以后，这几个字母就不能再改了。"
                en="Once the first receipt is issued, these letters can no longer be changed."
              />
            </p>

            {state.error && (
              <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
                {state.error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
                ) : (
                  <Tri bm="Simpan" zh="保存" en="Save" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setValue(prefix);
                  setOpen(false);
                }}
              >
                <Tri bm="Batal" zh="取消" en="Cancel" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </SettingsRow>
  );
}
