"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError } from "@/components/language-provider";
import { hasCjk } from "@/lib/bm-guard";
import { updateSavedMinutes } from "../actions";

// ---------------------------------------------------------------------------
// WHAT YOU CAN DO WITH A SAVED MINUTES DOCUMENT (J review 2026-08-28, item 4:
// 「保存后哪里 PRINT? …没得作修改」).
//
//   🖨 Print / PDF — /api/minutes-pdf opens the A4 document in a new tab;
//     the browser's viewer prints it, and Save-as gives the exact file the
//     eROSES meeting form's "Muat Naik Minit Mesyuarat" slot uploads.
//   ✏ Edit — the stored document, correctable in place. Every save APPENDS a
//     visible "Dipinda oleh <who> pada <when>" line (the server does this;
//     see updateSavedMinutes) — J's own condition: 「做修改下面就要写几时 EDIT」.
// ---------------------------------------------------------------------------

export function MinutesHistoryActions({
  docId,
  finalMd,
  showPrint = true,
}: {
  docId: number;
  finalMd: string;
  /** The finished-document page renders its own big Print button — it passes
   *  false so the same control does not appear twice. */
  showPrint?: boolean;
}) {
  const router = useRouter();
  const localizeError = useLocalizedError();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(finalMd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await updateSavedMinutes({ id: docId, finalMd: text });
      if (res.ok) {
        setSaved(true);
        setEditing(false);
        // Server-rendered list: pull the fresh row (with its new edit line).
        router.refresh();
      } else {
        setError(res.error ?? "");
      }
    } catch {
      setError(
        "Tidak berjaya disimpan — cuba lagi / 没有保存成功 —— 请再试一次 / Could not save — try again",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {showPrint && (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/minutes-pdf?id=${docId}`} target="_blank" rel="noreferrer">
              🖨 <Tri bm="Cetak / PDF" zh="打印 / PDF" en="Print / PDF" />
            </a>
          </Button>
        )}
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
          >
            ✏️ <Tri bm="Pinda" zh="修改" en="Edit" />
          </Button>
        )}
        {showPrint && (
          <span className="text-sm text-muted-foreground">
            <Tri
              bm="PDF ini juga fail untuk 'Muat Naik Minit Mesyuarat' di eROSES."
              zh="这份 PDF 也就是 eROSES「上传会议记录」要的那个文件。"
              en="This PDF is also the file eROSES's 'Muat Naik Minit Mesyuarat' slot takes."
            />
          </span>
        )}
      </div>

      {saved && !editing && (
        <p className="rounded-md border-2 border-green-400 bg-green-50 p-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
          ✓{" "}
          <Tri
            bm="Pindaan disimpan — baris 'Dipinda oleh…' tercatat di hujung dokumen."
            zh="修改已保存 —— 文件末尾已记下「几时、谁改的」。"
            en="Edit saved — the 'Edited by…' line is recorded at the end of the document."
          />
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full rounded-md border-2 border-input bg-white/80 p-3 text-sm leading-relaxed dark:bg-white/5"
            aria-label="Edit the saved minutes"
          />
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Setiap pindaan menambah baris 'Dipinda oleh (nama) pada (masa)' di hujung dokumen — rekod rasmi mesti tunjuk siapa ubah, bila."
              zh="每次保存修改，文件末尾会自动加一行「几时、谁改的」—— 正式记录必须留痕。"
              en="Every saved edit appends an 'Edited by (name) on (time)' line — an official record must show who changed it, when."
            />
          </p>
          {/* The document language is not stored; a BM document that grows
              Chinese here will be caught again on /filings (the paste-pack's
              BM guard) — this is a soft heads-up, not a block. */}
          {hasCjk(text) && !hasCjk(finalMd) && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-2 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              ⚠{" "}
              <Tri
                bm="Anda menambah tulisan Cina ke dokumen yang tadinya penuh BM — kalau ini versi eROSES, kekalkan Bahasa Malaysia."
                zh="您在原本全马来文的文件里加了华语 —— 如果这份是要交 eROSES 的版本，请保持马来文。"
                en="You are adding Chinese to a document that was fully BM — if this is the eROSES version, keep it Bahasa Malaysia."
              />
            </p>
          )}
          {error && (
            <p className="rounded-md border-2 border-red-300 bg-red-50 p-2 text-sm font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
              {localizeError(error)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={busy || text.trim() === ""}>
              {busy ? (
                <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
              ) : (
                <Tri bm="Simpan pindaan" zh="保存修改" en="Save the edit" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setText(finalMd);
                setError(null);
              }}
            >
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
