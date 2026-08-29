"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmedAction } from "@/components/confirm-delete";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { Req } from "@/components/required-mark";
import {
  addAuditor,
  deleteAuditor,
  setAuditorStatus,
  type AuditorActionState,
} from "./auditor-actions";

// ---------------------------------------------------------------------------
// THE JURUAUDIT ROSTER (D2-1, work order 56) — what eROSES Penyata Tahunan
// step 4 asks for: name, e-mail, appointment date, status, with the warning
// that the ACTIVE count must match the constitution.
//
// Same shape as the committee card above it: form on top, list below (B-3);
// controlled inputs that survive React 19's post-action auto-reset (B-4);
// three-line errors localised to the reader (B-2).
//
// PDPA: the IC NAME is recorded (copied from the card, for the filing); the
// IC NUMBER is not — eROSES asks for that on its own form and the helper
// text says so.
// ---------------------------------------------------------------------------

export type AuditorRow = {
  id: number;
  person_name: string;
  name_official: string | null;
  email: string | null;
  appointed_on: string | null;
  status: "active" | "inactive";
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

const initialState: AuditorActionState = { error: null, ok: false };

export function AuditorsCard({
  rows,
  canEdit,
  dbBehind,
}: {
  rows: AuditorRow[];
  canEdit: boolean;
  /** True when the page's read failed in the migration-34-missing way. */
  dbBehind: boolean;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const [state, formAction] = useActionState(addAuditor, initialState);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // B-4: controlled fields survive the auto-reset; success clears them.
  const [personName, setPersonName] = useState("");
  const [nameOfficial, setNameOfficial] = useState("");
  const [email, setEmail] = useState("");
  const [appointedOn, setAppointedOn] = useState("");
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => {
      setPersonName("");
      setNameOfficial("");
      setEmail("");
      setAppointedOn("");
    }, 0);
    return () => clearTimeout(timer);
  }, [state]);

  const activeCount = rows.filter((r) => r.status === "active").length;

  function runRowAction(fn: () => Promise<AuditorActionState>) {
    setRowError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setRowError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {dbBehind && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50/80 p-3 text-sm font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Bahagian ini belum dibuka di pangkalan data (migration 34) — senarai belum dapat disimpan. Beritahu pentadbir sistem."
            zh="这部分的数据库还没开通（migration 34）—— 名单暂时存不进去。请告诉系统管理员。"
            en="This section is not enabled in the database yet (migration 34) — the list cannot be stored. Tell the system administrator."
          />
        </p>
      )}

      {canEdit && (
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 @3xl:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="Nama" zh="姓名" en="Name" />
                <Req />
              </span>
              <input
                name="personName"
                className={`${inputClass} ${state.field === "personName" && state.error ? "border-red-400" : ""}`}
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri
                  bm="Nama seperti dalam IC"
                  zh="身份证上的名字"
                  en="Name as on the IC"
                />
              </span>
              <input
                name="nameOfficial"
                className={inputClass}
                value={nameOfficial}
                onChange={(e) => setNameOfficial(e.target.value)}
                placeholder={t("salin dari IC", "照身份证抄", "copy from the IC")}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="E-mel" zh="电邮" en="E-mail" />
              </span>
              <input
                name="email"
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="Tarikh lantikan" zh="任命日期" en="Appointment date" />
              </span>
              <input
                name="appointedOn"
                inputMode="numeric"
                placeholder="2026-01-01"
                className={`${inputClass} ${state.field === "appointedOn" && state.error ? "border-red-400" : ""}`}
                value={appointedOn}
                onChange={(e) => setAppointedOn(e.target.value)}
              />
            </label>
          </div>
          {/* PDPA, said where the question would arise: eROSES will ask for
              the IC NUMBER on its own page — MinitAI never stores one. */}
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="eROSES akan minta nombor IC juruaudit pada borangnya sendiri — taip di sana. MinitAI tidak menyimpan nombor IC."
              zh="eROSES 会在它自己的表格里问审计员的身份证号码 —— 到那里再填。MinitAI 不保存身份证号码。"
              en="eROSES asks for the auditor's IC number on its own form — type it there. MinitAI never stores IC numbers."
            />
          </p>
          {state.error && (
            <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
              {localizeError(state.error)}
            </p>
          )}
          <Button type="submit" className="self-start">
            ＋ <Tri bm="Tambah juruaudit" zh="加审计员" en="Add auditor" />
          </Button>
        </form>
      )}

      <div className={canEdit ? "border-t border-border pt-5" : undefined}>
        {rows.length === 0 ? (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Belum ada juruaudit direkodkan. eROSES (Penyata Tahunan langkah 4) akan minta senarai ini."
              zh="还没有记录审计员。eROSES（年度呈报第 4 步）会要这份名单。"
              en="No auditors recorded yet. eROSES (Annual Return step 4) will ask for this list."
            />
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2 font-semibold">
                    <Tri bm="Nama" zh="姓名" en="Name" />
                  </th>
                  <th className="p-2 font-semibold">
                    <Tri bm="Nama IC" zh="身份证名字" en="IC name" />
                  </th>
                  <th className="p-2 font-semibold">
                    <Tri bm="E-mel" zh="电邮" en="E-mail" />
                  </th>
                  <th className="p-2 font-semibold">
                    <Tri bm="Tarikh lantikan" zh="任命日期" en="Appointed" />
                  </th>
                  <th className="p-2 font-semibold">
                    <Tri bm="Status" zh="状态" en="Status" />
                  </th>
                  {canEdit && <th className="p-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[color:var(--v2-border)]">
                    <td className="p-2 font-medium">{r.person_name}</td>
                    <td className="p-2">{r.name_official || "—"}</td>
                    <td className="p-2">{r.email || "—"}</td>
                    <td className="p-2">{r.appointed_on || "—"}</td>
                    <td className="p-2">
                      {r.status === "active" ? (
                        <Badge className="bg-green-600 text-white hover:bg-green-600">
                          <Tri bm="Aktif" zh="现任" en="Active" />
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Tri bm="Tidak aktif" zh="已卸任" en="Inactive" />
                        </Badge>
                      )}
                    </td>
                    {canEdit && (
                      <td className="p-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                            onClick={() =>
                              runRowAction(() =>
                                setAuditorStatus(
                                  r.id,
                                  r.status === "active" ? "inactive" : "active",
                                ),
                              )
                            }
                          >
                            {r.status === "active" ? (
                              <Tri bm="Tanda tidak aktif" zh="标为卸任" en="Mark inactive" />
                            ) : (
                              <Tri bm="Tanda aktif" zh="标为现任" en="Mark active" />
                            )}
                          </button>
                          {/* §1-10: the app's own dialog, never window.confirm. */}
                          <ConfirmedAction
                            body={
                              <Tri
                                bm={`Buang ${r.person_name} daripada senarai juruaudit? Ia tidak boleh dikembalikan.`}
                                zh={`要把 ${r.person_name} 从审计员名单删掉吗？删了就找不回来了。`}
                                en={`Remove ${r.person_name} from the auditors list? This cannot be undone.`}
                              />
                            }
                            confirmLabel={<Tri bm="Buang" zh="删除" en="Remove" />}
                            onConfirm={() => runRowAction(() => deleteAuditor(r.id))}
                            trigger={(open) => (
                              <button
                                type="button"
                                disabled={pending}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-red-700 underline underline-offset-4 hover:text-red-800"
                                onClick={open}
                              >
                                <Trash2 className="h-4 w-4" />
                                <Tri bm="Buang" zh="删除" en="Remove" />
                              </button>
                            )}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rowError && (
          <p className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {localizeError(rowError)}
          </p>
        )}
        {rows.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            <Tri
              bm={`Aktif sekarang: ${activeCount} orang. eROSES semak bilangan ini dengan perlembagaan anda.`}
              zh={`现任 ${activeCount} 人。eROSES 会拿这个人数对照你们的章程。`}
              en={`Active now: ${activeCount}. eROSES checks this count against your constitution.`}
            />
          </p>
        )}
      </div>
    </div>
  );
}
