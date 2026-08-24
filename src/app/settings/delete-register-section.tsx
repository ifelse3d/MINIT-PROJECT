"use client";

// ---------------------------------------------------------------------------
// "Delete the register on this device" (R-5, 2026-08-25).
//
// This control used to sit in the /money page header, one accidental tap from
// the daily work. It wipes the DEVICE's working copy of the register — every
// donation row and hand-over batch in this browser's storage — including rows
// that already carry issued, gap-free receipt numbers. The organisation's
// records in the database are deliberately NOT touched (receipts and
// hand-overs are an audit trail; a trail one device can erase is not one).
//
// It now lives here, and requires typing the organisation's exact name —
// the same bar the delete-organisation control sets. One typo = nothing
// happens.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { scopedKey } from "@/lib/storage-scope-core";

export function DeleteRegisterSection({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  function wipe() {
    try {
      window.localStorage.removeItem(scopedKey("money:donations:v1"));
      window.localStorage.removeItem(scopedKey("money:batches:v1"));
    } catch {
      // storage unavailable — nothing stored, nothing to wipe
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        <Tri
          bm="Daftar pada peranti ini sudah dipadam. Resit yang pernah dijana masih selamat dalam Sejarah resit."
          zh="这台设备上的登记簿已经清空。开过的收据仍然安全地存在「收据历史」里。"
          en="The register on this device has been cleared. Receipts already issued are still safe in Receipt history."
        />
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-red-300/70 bg-red-50/60 p-4 dark:border-red-500/30 dark:bg-red-500/10">
      <h3 className="font-semibold text-red-900">
        <Tri
          bm="Padam daftar derma pada peranti ini"
          zh="删除这台设备上的捐款登记簿"
          en="Delete the donation register on this device"
        />
      </h3>
      <p className="mt-1 text-base text-red-900">
        <Tri
          bm="Memadam SEMUA baris derma dan serahan tunai yang tersimpan pada peranti ini — termasuk yang sudah ada nombor resit. Rekod pertubuhan dalam pangkalan data TIDAK dipadam."
          zh="会删掉这台设备上暂存的所有捐款行和交接记录 —— 包括已经有收据号码的。资料库里机构的正式记录不会被删。"
          en="Deletes EVERY donation row and hand-over saved on this device — including rows with issued receipt numbers. The organisation's records in the database are NOT deleted."
        />
      </p>
      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 border-red-400 text-red-700 hover:bg-red-100"
          onClick={() => setOpen(true)}
        >
          <Tri bm="Padam daftar…" zh="删除登记簿…" en="Delete the register…" />
        </Button>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-red-900">
              <Tri
                bm={`Taip nama pertubuhan untuk mengesahkan: "${orgName}"`}
                zh={`请输入机构名称以确认："${orgName}"`}
                en={`Type the organisation name to confirm: "${orgName}"`}
              />
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-red-800/40 dark:bg-white/5"
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={typed.trim() !== orgName}
              onClick={wipe}
              className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Tri bm="Padam sekarang" zh="确认删除" en="Delete now" />
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
