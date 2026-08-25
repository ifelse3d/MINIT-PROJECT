"use client";

import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The PAID-TIER privacy notice (0-5, 2026-08-25).
//
// Until 8/25 the upload surfaces warned "use sample data until we go paid" —
// written when the AI provider ran on a FREE tier, whose terms allow training
// on inputs. J confirmed on 2026-08-25 that the API has been on the PAID tier
// (paid API terms do not train on inputs), so that warning was both stale and
// wrong. What a person deserves to know BEFORE uploading now:
//   1. the photo/text goes to an AI service provider to be read;
//   2. under the paid terms it is not used to train their models;
//   3. even so, send as little unnecessary personal data as possible —
//      IC numbers in particular are almost never needed;
//   4. deleting the organisation removes the records AND the stored files
//      (that function exists — Hard Rule 5).
//
// One component, because the same sentence belongs beside EVERY door that
// sends something to the AI (minutes photo page, home intake, ledger page) —
// and a copy per page is how the last warning went stale in one place first.
// ---------------------------------------------------------------------------

export function PdpaNote() {
  return (
    <p className="text-sm text-muted-foreground">
      🔒{" "}
      <Tri
        bm="Gambar atau tulisan yang anda hantar dibaca oleh penyedia perkhidmatan AI kami. Di bawah terma berbayar, ia TIDAK digunakan untuk melatih model mereka. Walaupun begitu, elakkan butiran peribadi yang tidak perlu — nombor IC hampir tidak pernah diperlukan. Memadam pertubuhan akan memadam rekod dan fail tersimpan sekali."
        zh="您上传的照片或文字会交给我们的 AI 服务商读取。在付费条款下，这些内容不会被拿去训练模型。即便如此，也请少传不必要的个人资料 —— 身份证号码几乎从来用不上。删除机构时，记录和已储存的档案会一并删除。"
        en="Photos or text you send are read by our AI service provider. Under the paid terms they are NOT used to train its models. Even so, avoid unnecessary personal details — IC numbers are almost never needed. Deleting the organisation deletes its records and stored files too."
      />
    </p>
  );
}
