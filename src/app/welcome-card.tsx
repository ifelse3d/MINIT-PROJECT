"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// A-4 (2026-08-25, J's #4): creating an organisation no longer dumps the
// person onto the constitution page. They land HOME, with this card saying
// what is worth doing next — the constitution upload is one item on the list
// and explicitly skippable, not a toll gate.
//
// Shown only on the ?welcome=1 arrival from the create-org form. Dismissing
// it (or navigating anywhere) simply shows the normal home page — this is a
// landing note, not persistent state.
// ---------------------------------------------------------------------------

const NEXT_STEPS = [
  {
    href: "/constitution",
    icon: "📜",
    bm: "Muat naik perlembagaan (boleh langkau — buat bila-bila)",
    zh: "上传章程（可以跳过，随时再做）",
    en: "Upload the constitution (skippable — any time)",
  },
  {
    href: "/settings",
    icon: "🔤",
    bm: "Pilih huruf resit pertubuhan anda (sebelum resit pertama)",
    zh: "选收据字母（开第一张收据之前）",
    en: "Choose your receipt letters (before the first receipt)",
  },
  {
    href: "/minutes",
    icon: "📝",
    bm: "Ambil gambar nota mesyuarat pertama anda",
    zh: "拍下第一份会议笔记试试",
    en: "Photograph your first meeting notes",
  },
] as const;

export function WelcomeCard() {
  const params = useSearchParams();
  const t = useTriText();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || params.get("welcome") !== "1") return null;
  return (
    <div className="v2-glass flex flex-col gap-3 border-2 border-green-400/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xl font-semibold">
          🎉{" "}
          <Tri
            bm="Pertubuhan anda sudah siap. Apa seterusnya?"
            zh="您的机构开好了。接下来做什么？"
            en="Your organisation is set up. What next?"
          />
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60"
          aria-label={t("Tutup", "关闭", "Close")}
        >
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {NEXT_STEPS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex min-h-11 items-center gap-3 rounded-xl border-2 border-[color:var(--v2-border)] px-3 py-2 text-base font-medium hover:border-[color:var(--v2-primary)] hover:bg-[color:var(--v2-primary-soft)]"
            >
              <span aria-hidden>{s.icon}</span>
              <Tri bm={s.bm} zh={s.zh} en={s.en} />
              <span className="ml-auto" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Tiada satu pun yang wajib sekarang — kotak di bawah sentiasa sedia menerima apa sahaja kertas di tangan anda."
          zh="这些都不是现在必须做的 —— 下面的框随时可以收您手上的任何文件。"
          en="None of this is required right now — the box below is always ready for whatever paper is in your hand."
        />
      </p>
    </div>
  );
}
