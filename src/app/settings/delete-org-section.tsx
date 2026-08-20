"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { deleteOrg, type DeleteOrgState } from "./actions";

const INITIAL: DeleteOrgState = { error: null, ok: false };

// The irreversible-delete confirm flow (Hard Rule 5). Two steps:
//   1. A red button opens the confirmation area.
//   2. The user must TYPE the organisation's exact name before the real
//      delete button activates. One typo = nothing happens.
export function DeleteOrgSection({
  orgId,
  orgName,
}: {
  orgId: number;
  orgName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(deleteOrg, INITIAL);

  if (state.ok) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        <Tri
          bm="Pertubuhan dan semua datanya telah dipadam"
          zh="该组织及其所有数据已被删除"
          en="The organisation and all of its data have been deleted"
        />{" "}
        —{" "}
        <a href="/orgs" className="underline">
          <Tri bm="ke senarai pertubuhan" zh="前往组织列表" en="go to organisations" />
        </a>
      </p>
    );
  }

  return (
    <div className="rounded-3xl border border-red-300/70 bg-red-50/60 p-4 backdrop-blur dark:border-red-500/30 dark:bg-red-500/10">
      <h3 className="font-semibold text-red-900">
        <Tri bm="Padam pertubuhan ini" zh="删除该组织" en="Delete this organisation" />
      </h3>
      <p className="mt-1 text-base font-medium text-red-900">
        <Tri
          bm="TIDAK BOLEH DIUNDUR. Semua minit, derma, resit, gambar dan rekod lain untuk pertubuhan ini akan dipadam selama-lamanya — daripada Minit dan daripada storan. Tiada salinan tinggal."
          zh="此操作无法撤销。这个机构的所有会议记录、捐款、收据、照片和其他记录都会被永久删除 —— Minit 里和储存空间里都会删掉，不留备份。"
          en="CANNOT BE UNDONE. Every minutes document, donation, receipt, photo and other record for this organisation will be permanently deleted — from Minit and from storage. No copy is kept."
        />
      </p>

      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 border-red-400 text-red-700 hover:bg-red-100"
          onClick={() => setOpen(true)}
        >
          <Tri bm="Padam…" zh="删除…" en="Delete…" />
        </Button>
      ) : (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="orgId" value={orgId} />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-red-900">
              <Tri
                bm={`Taip nama pertubuhan untuk mengesahkan: "${orgName}"`}
                zh={`请输入组织名称以确认："${orgName}"`}
                en={`Type the organisation name to confirm: "${orgName}"`}
              />
            </span>
            <input
              name="confirmName"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-red-800/40 dark:bg-white/5"
              autoComplete="off"
            />
          </label>

          {state.error && (
            <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900">
              {state.error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={pending || typed !== orgName}
              className="bg-red-700 text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? (
                <Tri bm="Memadam…" zh="删除中…" en="Deleting…" />
              ) : (
                <Tri
                  bm="Padam selama-lamanya"
                  zh="永久删除"
                  en="Delete forever"
                />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
