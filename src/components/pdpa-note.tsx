"use client";

import { useState } from "react";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The PAID-TIER privacy notice (0-5, 2026-08-25 · F-2, work order 31 ·
// rewritten 2026-08-27, work order 32 拍板 0-2 · trimmed again 2026-08-27
// evening, J's launch feedback #18: the IC sentences are GONE — "爲什麽還要
// 特地寫關於身份證的？也不需要寫那些". One line says what happens; details
// add only the deletion promise.
//
// One component, because the same sentence belongs beside EVERY door that
// sends something to the AI (minutes photo page, home intake, ledger page) —
// and a copy per page is how the last warning went stale in one place first.
// ---------------------------------------------------------------------------

export function PdpaNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm text-muted-foreground">
      <p>
        🔒{" "}
        <Tri
          bm="Gambar yang dihantar dibaca oleh penyedia AI kami — itu sahaja."
          zh="照片只交给 AI 服务商读取 —— 只用于读取。"
          en="Photos you send are read by our AI provider — nothing more."
        />{" "}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="underline underline-offset-4"
        >
          {open ? (
            <Tri bm="Tutup" zh="收起" en="Hide" />
          ) : (
            <Tri bm="Butiran" zh="详情" en="Details" />
          )}
        </button>
      </p>
      {open && (
        <p className="mt-1">
          <Tri
            bm="Gambar atau tulisan yang anda hantar dibaca oleh penyedia perkhidmatan AI kami — itu sahaja tujuannya. Memadam pertubuhan akan memadam rekod dan fail tersimpan sekali."
            zh="您上传的照片或文字会交给我们的 AI 服务商读取 —— 只用于读取。删除机构时，记录和已储存的档案会一并删除。"
            en="Photos or text you send are read by our AI service provider — that is the only thing they are used for. Deleting the organisation deletes its records and stored files too."
          />
        </p>
      )}
    </div>
  );
}
