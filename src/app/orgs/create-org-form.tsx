"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { createOrg, type OrgActionState } from "./actions";

const INITIAL: OrgActionState = { error: null, ok: false };

export function CreateOrgForm({
  parentChoices,
}: {
  /** Orgs the user administers (hq_admin) — allowed parents for a branch. */
  parentChoices: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createOrg, INITIAL);

  const inputCls =
    "w-full rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-base outline-none backdrop-blur focus:ring-2 focus:ring-[#7c6cf5]/40 dark:border-white/10 dark:bg-white/5";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri bm="Nama pertubuhan" zh="组织名称" en="Organisation name" />
        </span>
        <input name="name" className={inputCls} required maxLength={200} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri
            bm="Nama anda (untuk rekod jawatankuasa)"
            zh="您的姓名（用于委员会记录）"
            en="Your name (for the committee records)"
          />
        </span>
        <input name="yourName" className={inputCls} maxLength={120} />
      </label>

      {parentChoices.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            <Tri
              bm="Pertubuhan induk (kosongkan untuk pertubuhan baharu)"
              zh="上级组织（留空表示新的独立组织）"
              en="Parent organisation (leave empty for a new independent org)"
            />
          </span>
          <select name="parentOrgId" className={inputCls} defaultValue="">
            <option value="">
              — <Tri bm="Tiada (induk baharu)" zh="无（新总部）" en="None (new HQ)" /> —
            </option>
            {parentChoices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {state.error && (
        <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900">
          {state.error}
        </p>
      )}

      {/* 2026-07-28 AUDIT — THE app's worst dead end.
          On success this used to print a green line and stop. The user sat on
          /orgs with a confirmation and had to discover the sidebar or the ☰ menu
          unaided to find out what to do next. For someone who has never used a
          computer, that is where the journey ended. One button fixes it. */}
      {state.ok ? (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-green-400 bg-green-50 p-4">
          <p className="text-lg font-semibold text-green-900">
            ✓{" "}
            <Tri
              bm="Siap. Pertubuhan anda sudah didaftarkan dalam Minit."
              zh="好了。您的机构已经登记在 Minit 里。"
              en="Done. Your organisation is now set up in Minit."
            />
          </p>
          <p className="text-base text-green-900">
            <Tri
              bm="Langkah seterusnya: ambil gambar nota mesyuarat tulisan tangan anda, atau halaman lejar derma. AI akan membacanya dan anda hanya perlu menyemak."
              zh="下一步：拍下您手写的会议笔记，或者捐款账页。AI 会读出内容，您只需要核对。"
              en="Next step: take a photo of your handwritten meeting notes, or of a donation ledger page. Minit reads it and you just check it."
            />
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/minutes">
                📝{" "}
                <Tri
                  bm="Gambar nota mesyuarat"
                  zh="拍会议笔记"
                  en="Photo of meeting notes"
                />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/money">
                🧾{" "}
                <Tri
                  bm="Gambar lejar derma"
                  zh="拍捐款账页"
                  en="Photo of a ledger page"
                />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
          ) : (
            <Tri bm="Cipta Pertubuhan" zh="创建组织" en="Create organisation" />
          )}
        </Button>
      )}
    </form>
  );
}
