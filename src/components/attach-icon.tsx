import { Paperclip } from "lucide-react";
import { Tri } from "@/components/language-provider";
import { RELAY_MAX_BYTES } from "@/lib/upload-relay";

// ---------------------------------------------------------------------------
// THE ATTACH CONTROL'S SHARED PARTS — one icon and one sentence for every
// "choose a file" in the app (J, 2026-08-28:
// 「所有選檔案還是上傳的都用這個回形針的LOGO」 and
// 「全部統一字為 Choose a file (PDF or photo)」).
//
// Before this, the same job wore three icons and six different labels: "Take a
// photo / choose a file (photo or PDF)", "Photo / choose the receipt file (1 AI
// action)", "Ambil gambar slip", "Attach the transfer screenshot", "or upload a
// file:", "Choose a file (PDF or photo)". The emoji were worse than untidy —
// 📷 and 📎 are drawn by the operating system, so the same button looked like a
// different product on Windows, Android and iOS.
//
// 🔴 A paperclip even where the label used to say "take a photo". On a phone
// the one control opens the camera, the album and the file browser together, so
// the button's real job is "attach something".
//
// 🔴 ONLY THE BRACKETS MAY VARY, and only when the picker genuinely takes
// something else — the calendar one accepts a spreadsheet and not a PDF, and
// labelling it "PDF or photo" would be the app lying about what it will accept.
// Everything else, including the word order, comes from here.
//
// NOT for: a badge saying where data came from, a "view the original photo"
// button, or the walkthrough's step illustrations. Those attach nothing.
// ---------------------------------------------------------------------------

export function AttachIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <Paperclip className={className} strokeWidth={2} aria-hidden />;
}

/**
 * "Choose file (PDF or photo)", in the three languages. Pass the three
 * bracket strings only if this particular picker accepts something different —
 * they must match its `accept` attribute.
 * C-3 (work order 51, tester C16): SHORT phrasing — the zh label used to be a
 * sentence ("选一个档案（…）") and wrapped to two lines on phone buttons.
 */
export function ChooseFileLabel({
  bm = "PDF atau gambar",
  zh = "PDF 或照片",
  en = "PDF or photo",
}: {
  bm?: string;
  zh?: string;
  en?: string;
}) {
  return (
    <Tri
      bm={`Pilih fail (${bm})`}
      zh={`选档案（${zh}）`}
      en={`Choose file (${en})`}
    />
  );
}

/**
 * D0-3 (work order 56, 拍板 4): the REMAINING size limit, in writing, at the
 * door — "不准讓人白歡喜". Photos shrink in the browser so they have no
 * number to state; a PDF (and, where the door takes them, a Word/PowerPoint
 * file) rides the Storage relay up to RELAY_MAX_BYTES. The number is
 * computed from the constant so this sentence cannot go stale.
 */
export function UploadLimitNote({ office = false }: { office?: boolean }) {
  const mb = Math.round(RELAY_MAX_BYTES / (1024 * 1024));
  return (
    <span className="text-sm text-[color:var(--v2-text-soft)]">
      {office ? (
        <Tri
          bm={`Gambar dikecilkan secara automatik · PDF / Word / PowerPoint sehingga ${mb}MB`}
          zh={`照片会自动缩小 · PDF / Word / PowerPoint 最大 ${mb}MB`}
          en={`Photos shrink automatically · PDF / Word / PowerPoint up to ${mb}MB`}
        />
      ) : (
        <Tri
          bm={`Gambar dikecilkan secara automatik · PDF sehingga ${mb}MB`}
          zh={`照片会自动缩小 · PDF 最大 ${mb}MB`}
          en={`Photos shrink automatically · PDF up to ${mb}MB`}
        />
      )}
    </span>
  );
}

/** The cost line that used to be crammed into a button's own label. */
export function UsesOneAiAction() {
  return (
    <span className="text-sm text-[color:var(--v2-text-soft)]">
      <Tri
        bm="Guna 1 tindakan AI"
        zh="用 1 次 AI 额度"
        en="Uses 1 AI action"
      />
    </span>
  );
}
