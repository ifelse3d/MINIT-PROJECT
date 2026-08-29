"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmedAction } from "@/components/confirm-delete";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import {
  addBankAccount,
  deleteBankAccount,
  saveMaklumatAm,
  type MaklumatActionState,
} from "./maklumat-actions";

// ---------------------------------------------------------------------------
// MAKLUMAT AM (D2-2, work order 56) — the eROSES Annual Return step-2 fields
// that nothing else in Minit knows: society phone, financial year start,
// registered/voting member counts, bank accounts. The DERIVED numbers
// (office bearers = the committee roster; branches = the org tree) are shown
// read-only by the server component around this card — recorded facts and
// derived facts must not share an editable form.
//
// Controlled inputs (B-4: they survive React 19's post-action reset); errors
// three-line and localised (B-2).
// ---------------------------------------------------------------------------

export type BankAccountRow = { id: number; bank_name: string; account_no: string };

export type MaklumatAmValues = {
  phone: string;
  financialYearStart: string;
  membersRegistered: string;
  membersVoting: string;
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

const initialState: MaklumatActionState = { ok: false, error: null };

export function MaklumatAmCard({
  values,
  banks,
  canEdit,
  dbBehind,
}: {
  values: MaklumatAmValues;
  banks: BankAccountRow[];
  canEdit: boolean;
  /** True when the page's read failed in the migration-35-missing way. */
  dbBehind: boolean;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const [state, formAction] = useActionState(saveMaklumatAm, initialState);
  const [bankState, bankAction] = useActionState(addBankAccount, initialState);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [phone, setPhone] = useState(values.phone);
  const [fy, setFy] = useState(values.financialYearStart);
  const [registered, setRegistered] = useState(values.membersRegistered);
  const [voting, setVoting] = useState(values.membersVoting);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => setSavedFlash(true), 0);
    const hide = setTimeout(() => setSavedFlash(false), 4000);
    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
    };
  }, [state]);

  // B-4: the bank mini-form clears on success.
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  useEffect(() => {
    if (!bankState.ok) return;
    const timer = setTimeout(() => {
      setBankName("");
      setAccountNo("");
    }, 0);
    return () => clearTimeout(timer);
  }, [bankState]);

  return (
    <div className="flex flex-col gap-5">
      {dbBehind && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50/80 p-3 text-sm font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Bahagian ini belum dibuka di pangkalan data (migration 35) — nilai belum dapat disimpan. Beritahu pentadbir sistem."
            zh="这部分的数据库还没开通（migration 35）—— 暂时存不进去。请告诉系统管理员。"
            en="This section is not enabled in the database yet (migration 35) — values cannot be stored. Tell the system administrator."
          />
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid gap-3 @3xl:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri bm="No. telefon pertubuhan" zh="机构电话" en="Society phone" />
            </span>
            <input
              name="phone"
              inputMode="tel"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!canEdit}
              placeholder="03-1234 5678"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri
                bm="Tahun kewangan bermula"
                zh="财政年度开始日"
                en="Financial year starts"
              />
            </span>
            <input
              name="financialYearStart"
              inputMode="numeric"
              className={inputClass}
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              disabled={!canEdit}
              placeholder="2026-01-01"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri
                bm="Bilangan ahli berdaftar"
                zh="注册会员人数"
                en="Registered members"
              />
            </span>
            <input
              name="membersRegistered"
              inputMode="numeric"
              className={inputClass}
              value={registered}
              onChange={(e) => setRegistered(e.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri
                bm="Bilangan ahli layak mengundi"
                zh="有投票权人数"
                en="Voting members"
              />
            </span>
            <input
              name="membersVoting"
              inputMode="numeric"
              className={inputClass}
              value={voting}
              onChange={(e) => setVoting(e.target.value)}
              disabled={!canEdit}
            />
          </label>
        </div>
        {state.error && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {localizeError(state.error)}
          </p>
        )}
        {savedFlash && (
          <p className="rounded-md border-2 border-green-400 bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
            ✓ <Tri bm="Disimpan" zh="已保存" en="Saved" />
          </p>
        )}
        {canEdit && (
          <Button type="submit" className="self-start">
            <Tri bm="Simpan" zh="保存" en="Save" />
          </Button>
        )}
      </form>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-base font-semibold">
          <Tri
            bm="Akaun bank pertubuhan"
            zh="机构银行账户"
            en="Society bank accounts"
          />
        </p>
        {banks.length === 0 ? (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Belum ada akaun direkodkan."
              zh="还没有记录任何账户。"
              en="No accounts recorded yet."
            />
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {banks.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-sm border border-[color:var(--v2-border)] px-3 py-2 text-base"
              >
                <span className="font-medium">{b.bank_name}</span>
                <span className="font-mono">{b.account_no}</span>
                {canEdit && (
                  /* §1-10: the app's own dialog, never window.confirm. */
                  <ConfirmedAction
                    body={
                      <Tri
                        bm={`Buang akaun ${b.bank_name} ${b.account_no}? Ia tidak boleh dikembalikan.`}
                        zh={`要删掉 ${b.bank_name} ${b.account_no} 这个账户吗？删了就找不回来了。`}
                        en={`Remove the ${b.bank_name} ${b.account_no} account? This cannot be undone.`}
                      />
                    }
                    confirmLabel={<Tri bm="Buang" zh="删除" en="Remove" />}
                    onConfirm={() => {
                      setRowError(null);
                      startTransition(async () => {
                        const res = await deleteBankAccount(b.id);
                        if (!res.ok) setRowError(res.error);
                      });
                    }}
                    trigger={(open) => (
                      <button
                        type="button"
                        disabled={pending}
                        className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-red-700 underline underline-offset-4 hover:text-red-800"
                        onClick={open}
                      >
                        <Trash2 className="h-4 w-4" />
                        <Tri bm="Buang" zh="删除" en="Remove" />
                      </button>
                    )}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={bankAction} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-sm font-semibold">
                <Tri bm="Bank" zh="银行" en="Bank" />
              </span>
              <input
                name="bankName"
                className={inputClass}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder={t("cth: Maybank", "例：Maybank", "e.g. Maybank")}
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-sm font-semibold">
                <Tri bm="Nombor akaun" zh="账号" en="Account number" />
              </span>
              <input
                name="accountNo"
                inputMode="numeric"
                className={inputClass}
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
              />
            </label>
            <Button type="submit" variant="outline">
              ＋ <Tri bm="Tambah" zh="添加" en="Add" />
            </Button>
          </form>
        )}
        {bankState.error && (
          <p className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {localizeError(bankState.error)}
          </p>
        )}
        {rowError && (
          <p className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {localizeError(rowError)}
          </p>
        )}
      </div>
    </div>
  );
}
