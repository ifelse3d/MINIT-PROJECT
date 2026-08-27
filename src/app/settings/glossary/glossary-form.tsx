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
  "w-full rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

const errorCls =
  "rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100";

const LANGS = [
  { value: "zh", bm: "Cina", zh: "中文", en: "Chinese" },
  { value: "bm", bm: "Bahasa Malaysia", zh: "马来文", en: "Malay" },
  { value: "en", bm: "Inggeris", zh: "英文", en: "English" },
] as const;

const LANG_WORD: Record<"bm" | "zh" | "en", { bm: string; zh: string; en: string }> = {
  bm: { bm: "Bahasa Malaysia", zh: "马来文", en: "Malay" },
  zh: { bm: "Cina", zh: "中文", en: "Chinese" },
  en: { bm: "Inggeris", zh: "英文", en: "English" },
};

/** #10 (launch feedback): the entry is the ORIGINAL word + which language it
 *  is, and how the other two languages say it — any language can be the
 *  original. Leave both empty = keep the word exactly, never translated. */
export function AddTermForm() {
  const [state, formAction, pending] = useActionState(addGlossaryTerm, INITIAL);
  const [lang, setLang] = useState<"bm" | "zh" | "en">("zh");
  const others = (["bm", "zh", "en"] as const).filter((l) => l !== lang);
  const renderField: Record<"bm" | "zh" | "en", string> = {
    bm: "renderBm",
    zh: "renderZh",
    en: "renderEn",
  };

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Perkataan asal (seperti anda menulisnya)"
              zh="原本的词（照你们写的样子）"
              en="The original word (as you write it)"
            />
          </span>
          <input name="term" className={inputCls} required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Ia bahasa apa?" zh="这是什么语言？" en="Which language is it?" />
          </span>
          <select
            name="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as "bm" | "zh" | "en")}
            className={inputCls}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.zh} · {l.bm} · {l.en}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {others.map((l) => (
          <label key={l} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              <Tri
                bm={`Dalam ${LANG_WORD[l].bm} dipanggil…`}
                zh={`${LANG_WORD[l].zh}的叫法…`}
                en={`In ${LANG_WORD[l].en} it is called…`}
              />
            </span>
            <input name={renderField[l]} className={inputCls} maxLength={160} />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri bm="Ia apa?" zh="这是什么？" en="What is it?" />
        </span>
        <input
          name="note"
          className={inputCls}
          maxLength={200}
          placeholder="ahli / kelas / ajaran"
        />
      </label>

      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Biarkan kedua-dua kotak kosong untuk nama orang, ajaran dan gelaran — perkataan itu DIKEKALKAN, tidak diterjemah."
          zh="人名、法号、称谓这类，两个叫法都留空 —— 那个词会保持原字，永远不被翻译。"
          en="Leave both boxes empty for people's names, teachings and titles — the word is then KEPT exactly, never translated."
        />
      </p>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? (
          <Tri bm="…" zh="…" en="…" />
        ) : (
          <Tri bm="Tambah" zh="加进词库" en="Add" />
        )}
      </Button>

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
    <div className="rounded-md border border-input bg-white/40 p-4 dark:bg-white/5">
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
          <div className="rounded-sm border border-[#a855f7]/40 bg-[#a855f7]/5 p-3">
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
          <pre className="rounded-sm bg-black/5 p-3 text-sm dark:bg-white/10">
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
