"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  addGlossaryTerm,
  deleteGlossaryTerm,
  importGlossary,
  type GlossaryActionState,
} from "./actions";

const INITIAL: GlossaryActionState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

const errorCls =
  "rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100";

/** One row inside the card it feeds, not a second card below it. */
export function AddTermForm() {
  const [state, formAction, pending] = useActionState(addGlossaryTerm, INITIAL);
  // The second box only means anything for "translate", so it appears when it
  // is needed instead of sitting there greyed out asking to be understood.
  const [mode, setMode] = useState<"keep" | "translate">("keep");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1.2fr_1.4fr_auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Perkataan (seperti dalam nota)"
              zh="那个词（照笔记上的样子）"
              en="The word (as in the notes)"
            />
          </span>
          <input name="term" className={inputCls} required maxLength={80} />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Bagaimana ditulis?" zh="要怎么处理？" en="How is it written?" />
          </span>
          <div className="flex flex-wrap items-center gap-4 py-2">
            <label className="flex items-center gap-2 text-base">
              <input
                type="radio"
                name="action"
                value="keep"
                className="h-5 w-5"
                checked={mode === "keep"}
                onChange={() => setMode("keep")}
              />
              <Tri bm="Kekalkan asal" zh="保持原字" en="Keep as written" />
            </label>
            <label className="flex items-center gap-2 text-base">
              <input
                type="radio"
                name="action"
                value="translate"
                className="h-5 w-5"
                checked={mode === "translate"}
                onChange={() => setMode("translate")}
              />
              <Tri bm="Tulis sebagai…" zh="翻译成…" en="Write it as…" />
            </label>
          </div>
        </div>

        <Button type="submit" disabled={pending} className="md:mb-[9px]">
          {pending ? (
            <Tri bm="…" zh="…" en="…" />
          ) : (
            <Tri bm="Tambah" zh="加进词库" en="Add" />
          )}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {mode === "translate" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              <Tri bm="Ditulis sebagai" zh="翻译成" en="Written as" />
            </span>
            <input name="translation" className={inputCls} maxLength={160} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Ia apa?"
              zh="这是什么？"
              en="What is it?"
            />
          </span>
          <input
            name="note"
            className={inputCls}
            maxLength={200}
            placeholder="ahli / kelas / ajaran"
          />
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        <Tri
          bm="“Kekalkan asal” untuk nama orang, ajaran dan gelaran jawatan."
          zh="人名、法号、称谓这类，选「保持原字」。"
          en="Choose “keep as written” for people's names, teachings and titles of office."
        />
      </p>

      {state.ok && (
        <p className="text-base font-medium text-green-700 dark:text-green-300">
          ✓ <Tri bm="Ditambah" zh="加好了" en="Added" />
        </p>
      )}
      {state.error && <p className={errorCls}>{state.error}</p>}
    </form>
  );
}

export function DeleteTermButton({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState(deleteGlossaryTerm, INITIAL);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <Tri bm="Padam" zh="删除" en="Remove" />
      </Button>
      {state.error && <span className="sr-only">{state.error}</span>}
    </form>
  );
}


/**
 * Bring in a glossary you already have.
 *
 * A bare word means "keep it exactly", which is the safe default — leaving a
 * word alone can never turn it into a different word. See src/lib/bulk-paste.ts
 * for why this takes text rather than a file format.
 */
export function ImportGlossary() {
  const [state, formAction, pending] = useActionState(importGlossary, INITIAL);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-input bg-white/40 p-4 dark:bg-white/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-base font-medium underline underline-offset-4"
      >
        {open ? "▾ " : "▸ "}
        <Tri
          bm="Tampal banyak perkataan sekali gus"
          zh="一次过贴很多个词"
          en="Paste many words at once"
        />
      </button>

      {open && (
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <div className="rounded-lg border border-[#7c6cf5]/40 bg-[#7c6cf5]/5 p-3">
            <a
              href="/api/list-template?kind=glossary"
              className="text-base font-medium underline underline-offset-4"
            >
              ⬇︎{" "}
              <Tri
                bm="Muat turun borang Excel"
                zh="下载 Excel 表格"
                en="Download the Excel form"
              />
            </a>
            <p className="mt-1 text-sm text-muted-foreground">
              <Tri
                bm="Cara paling senang: muat turun, isi dalam Excel, kemudian muat naik semula di bawah. Borang itu sudah ada lajur yang betul dan contoh."
                zh="最省事的做法：下载、在 Excel 里填好、再从下面传上来。表格里已经有正确的栏位和示范。"
                en="The easiest way: download it, fill it in in Excel, then upload it below. The form already has the right columns and examples."
              />
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Satu perkataan satu baris. Perkataan sahaja = kekalkan seperti asal. Tambah “=” dan cara ia patut ditulis untuk menterjemah."
              zh="一行一个词。只写那个词 = 保持原字。要翻译的话，加「=」再写要翻成什么。"
              en="One word per line. The word alone = keep it exactly. Add “=” and the wording to translate it."
            />
          </p>
          <pre className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
{`崇德
点传师
家长班 = Kelas Ibu Bapa
青班 = Kelas Qing`}
          </pre>
          <textarea
            name="pasted"
            rows={8}
            spellCheck={false}
            className={inputCls}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Tri bm="Mengimport…" zh="加入中…" en="Importing…" />
              ) : (
                <Tri bm="Import senarai" zh="加进词库" en="Import the list" />
              )}
            </Button>
            <label className="flex items-center gap-2 text-base">
              <span className="text-muted-foreground">
                <Tri bm="atau muat naik fail:" zh="或者上传档案：" en="or upload a file:" />
              </span>
              <input
                type="file"
                name="file"
                accept=".xlsx,.csv,.txt,.tsv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="max-w-[16rem] text-sm"
              />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Menerima .xlsx, .csv dan .txt. Ia dibaca oleh kod, bukan oleh AI — jadi TIDAK menggunakan kuota AI anda. Gambar dan PDF senarai belum boleh."
              zh="接受 .xlsx、.csv、.txt。这是程式读的，不是 AI 读的 —— 所以不会用掉您的 AI 额度。名单的照片和 PDF 还不行。"
              en="Takes .xlsx, .csv and .txt. It is read by code, not by AI — so it does NOT use your AI allowance. Photos and PDFs of a list are not supported yet."
            />
          </p>

          {state.ok && (
            <p className="text-base font-medium text-green-700 dark:text-green-300">
              ✓ <Tri bm="Diimport" zh="加好了" en="Imported" />
            </p>
          )}
          {state.error && <p className={errorCls}>{state.error}</p>}
        </form>
      )}
    </div>
  );
}
