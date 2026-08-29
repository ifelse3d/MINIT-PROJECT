"use client";

// §1-15a (work order 69): the FULL drafts list, on its own address. The
// workspace keeps only the two most recent; this page holds the long tail
// (5–10 drafts were drowning the workspace). Resume hands over to the
// workspace via /minutes?draft=<key> — the store stashes whatever is on
// screen first (G3-2), so resuming can never eat anything.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { ConfirmingDeleteButton } from "@/components/confirm-delete";
import { dropDraft, type DraftListItem } from "../draft-actions";

export function DraftsList({ drafts }: { drafts: DraftListItem[] }) {
  const t = useTriText();
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (drafts.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        <Tri
          bm="Tiada draf belum siap. Draf disimpan sendiri semasa anda bekerja di ruang kerja Minit."
          zh="没有未完成的草稿。在工作区写东西时，草稿会自动存起来。"
          en="No unfinished drafts. Drafts save themselves while you work in the minutes workspace."
        />{" "}
        <Link href="/minutes" className="underline underline-offset-4">
          <Tri bm="Ke ruang kerja" zh="去工作区" en="To the workspace" /> →
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Disusun ikut kemas kini terbaru. “Sambung” membuka draf itu di ruang kerja — kerja yang sedang terbuka di sana disimpan dahulu secara automatik, tiada yang hilang."
          zh="按最后更新时间排。「继续这一份」会在工作区打开它 —— 工作区里正开着的那份会先自动存成草稿，不会丢。"
          en="Sorted by last update. “Resume” opens the draft in the workspace — whatever is open there is stashed first, automatically; nothing is lost."
        />
      </p>
      <ul className="flex flex-col divide-y divide-border/60 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 px-4 dark:bg-white/5">
        {drafts.map((d) => (
          <li
            key={d.clientKey}
            className="flex flex-wrap items-center justify-between gap-2 py-3"
            data-probe="draft-row"
          >
            <span className="min-w-40 flex-1">
              <span className="font-medium">
                {d.title || t("(tiada nama)", "（未命名）", "(untitled)")}
              </span>
              {d.updatedAt && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {d.updatedAt.slice(0, 16).replace("T", " ")}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {/* A FULL navigation on purpose (plain <a>, not <Link>): the
                  minutes provider lives in the section layout and stays
                  mounted across an SPA hop, so its "resume ?draft once on
                  mount" effect would never re-run — the ref was already
                  consumed when THIS page rendered under the same provider.
                  A full load remounts the provider and the param is honoured. */}
              <Button asChild size="sm">
                <a href={`/minutes?draft=${encodeURIComponent(d.clientKey)}`}>
                  <Tri bm="Sambung" zh="继续这一份" en="Resume" />
                </a>
              </Button>
              {/* §1-10: the app's own confirm dialog, never a bare one. */}
              <ConfirmingDeleteButton
                size="sm"
                busy={busyKey === d.clientKey}
                className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10"
                body={
                  <Tri
                    bm="Buang draf ini dari awan? Ia tidak boleh dikembalikan."
                    zh="要删掉这份云端草稿吗？删了就找不回来了。"
                    en="Delete this cloud draft? It cannot be recovered."
                  />
                }
                onConfirm={() => {
                  setBusyKey(d.clientKey);
                  void dropDraft(d.clientKey).then(() => {
                    setBusyKey(null);
                    router.refresh();
                  });
                }}
              >
                <Tri bm="Padam" zh="删除" en="Delete" />
              </ConfirmingDeleteButton>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Dokumen yang sudah DISIMPAN ada dalam Sejarah, bukan di sini."
          zh="已经「保存」的文件在「历史」里，不在这里。"
          en="Documents you already SAVED live in History, not here."
        />{" "}
        <Link href="/minutes/history" className="underline underline-offset-4">
          <Tri bm="Sejarah" zh="历史" en="History" /> →
        </Link>
      </p>
    </div>
  );
}
