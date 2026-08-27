"use client";

import { useState } from "react";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The PAID-TIER privacy notice (0-5, 2026-08-25 · F-2, work order 31).
//
// F-2 (J's old #2/#5): the four-sentence paragraph sat beside EVERY AI door
// and was long enough that nobody read it. Default is now ONE line — the two
// facts a person needs before pressing send — with a "details" toggle that
// expands the full text. The IC sentence is rewritten to say where official
// names/IC actually go: the Members page, which never passes through the AI
// (photos sent to the AI almost never need an IC number at all).
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
          bm="Gambar yang dihantar dibaca oleh penyedia AI kami; di bawah terma berbayar ia tidak digunakan untuk latihan."
          zh="照片会交给 AI 读取；付费条款下不用于训练。"
          en="Photos you send are read by our AI provider; under the paid terms they are not used for training."
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
            bm="Gambar atau tulisan yang anda hantar dibaca oleh penyedia perkhidmatan AI kami. Di bawah terma berbayar, ia TIDAK digunakan untuk melatih model mereka. Gambar yang diambil untuk dibaca AI biasanya tidak memerlukan nombor IC; nama rasmi / IC ahli jawatankuasa diisi di halaman “Ahli”, yang tidak melalui AI. Memadam pertubuhan akan memadam rekod dan fail tersimpan sekali."
            zh="您上传的照片或文字会交给我们的 AI 服务商读取。在付费条款下，这些内容不会被拿去训练模型。拍给 AI 读的照片通常不需要身份证号码；委员的官方姓名／IC 在「成员」页填写，那里不经过 AI。删除机构时，记录和已储存的档案会一并删除。"
            en="Photos or text you send are read by our AI service provider. Under the paid terms they are NOT used to train its models. Photos taken for the AI to read almost never need an IC number; committee members' official names / IC are entered on the Members page, which never passes through the AI. Deleting the organisation deletes its records and stored files too."
          />
        </p>
      )}
    </div>
  );
}
