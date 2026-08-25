"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  addCommitteeMember,
  importCommittee,
  removeCommitteeMember,
  type MemberActionState,
} from "./actions";

const INITIAL: MemberActionState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

const errorCls =
  "rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100";

/** The positions a Malaysian registered society actually files. Suggestions,
 *  not a fixed list — societies use their own wording, and being told "that is
 *  not a valid position" about your own committee is insulting. */
const SUGGESTED = [
  "Pengerusi / 主席",
  "Naib Pengerusi / 副主席",
  "Setiausaha / 秘书",
  "Naib Setiausaha / 副秘书",
  "Bendahari / 财政",
  "Naib Bendahari / 副财政",
  "Ahli Jawatankuasa (AJK) / 理事",
  "Juruaudit Dalam / 内部查账",
  "Ahli biasa / 普通会员",
];

/** One row, not a second card. Adding a person is part of reading the list —
 *  the previous layout put it in a separate panel below, which is how a page
 *  with two lists ended up looking like a page with four. */
export function AddCommitteeRow() {
  const [state, formAction, pending] = useActionState(addCommitteeMember, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr_1.2fr_0.8fr_0.8fr_auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Jawatan" zh="职位" en="Position" />
          </span>
          <input
            name="position"
            className={inputCls}
            required
            maxLength={120}
            list="committee-positions"
          />
          <datalist id="committee-positions">
            {SUGGESTED.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Nama" zh="姓名" en="Name" />
          </span>
          <input name="personName" className={inputCls} required maxLength={120} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Nama dalam IC (eROSES)"
              zh="身份证上的名字（eROSES）"
              en="Name on IC (eROSES)"
            />
          </span>
          <input name="nameOfficial" className={inputCls} maxLength={160} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Mula" zh="任期开始" en="From" />
          </span>
          <input name="termStart" className={inputCls} placeholder="2026-01-01" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Tamat" zh="任期结束" en="To" />
          </span>
          <input name="termEnd" className={inputCls} placeholder="2027-12-31" />
        </label>

        <Button type="submit" disabled={pending} className="md:mb-[1px]">
          {pending ? (
            <Tri bm="…" zh="…" en="…" />
          ) : (
            <Tri bm="Tambah" zh="加进名单" en="Add" />
          )}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Tarikh penggal boleh dibiarkan kosong. “Nama dalam IC” ialah nama yang eROSES mahu — salin daripada kad pengenalan, jangan terjemah sendiri; biarkan kosong jika anda belum tahu."
          zh="任期可以不填。「身份证上的名字」是 eROSES 要的那个 —— 请照身份证抄，不要自己音译；还不知道就留空。"
          en="The term dates can be left blank. “Name on IC” is the one eROSES wants — copy it from the identity card rather than transliterating it yourself; leave it blank if you do not know it yet."
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

/**
 * Bring in a list you already have.
 *
 * Text, not a file format: copying rows out of Excel puts tab-separated lines
 * on the clipboard, and a Word table or a WhatsApp message gives commas or
 * colons — all of which the parser takes. The file picker is a convenience
 * that fills the same box, so there is only one code path to get wrong.
 */
/**
 * Bring in a list you already have — two roads, and the person picks.
 *
 * 2026-08-19 (user: "這裏做成它可以選擇要excel還是拍照pdf那些。只是照片，pdf，或沒
 * 跟著格式就用AI咯"). That is the right division of labour and it is worth being
 * explicit about on screen: a spreadsheet HAS columns, so code reads it for
 * free; a photograph of the roster on the noticeboard does not, so that is what
 * the quota is for. Each button says which it is before it is pressed.
 *
 * Both roads end in the SAME box, which the person reads before pressing
 * Import. The AI never writes to the database — it fills in the text, and a
 * human still confirms it, exactly like step 2 of the minutes pipeline.
 */
export function ImportCommittee() {
  const [state, formAction, pending] = useActionState(importCommittee, INITIAL);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "ai">("file");
  const [text, setText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function askMinitToRead(body: FormData) {
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/import-roster", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !data?.text) {
        setAiError(data?.error ?? "…");
        return;
      }
      setText(data.text);
    } catch {
      setAiError("…");
    } finally {
      setAiBusy(false);
    }
  }

  function readWithAi(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    void askMinitToRead(body);
  }

  /**
   * The way out of a refused paste.
   *
   * The parser says "these lines were not understood, so NOTHING was added"
   * and lists the line numbers — correct, and still a dead end for someone who
   * cannot see what is wrong with their own list. The offer belongs HERE,
   * under the refusal, because that is the moment the person discovers the
   * problem; a warning at the top of the panel is read by nobody, since nobody
   * reads instructions before pasting. What they hold at that moment is text,
   * so this sends the text — the same box, re-filled, still theirs to check.
   */
  function readPastedWithAi() {
    const body = new FormData();
    body.append("text", text);
    void askMinitToRead(body);
  }

  const choiceCls = (active: boolean) =>
    "flex-1 min-w-[15rem] rounded-xl border-2 px-4 py-3 text-left transition " +
    (active
      ? "border-[#7c6cf5] bg-[#7c6cf5]/10"
      : "border-input hover:bg-black/5 dark:hover:bg-white/5");

  return (
    <div className="rounded-xl border border-input bg-white/40 p-4 dark:bg-white/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-base font-medium underline underline-offset-4"
      >
        {open ? "▾ " : "▸ "}
        <Tri
          bm="Sudah ada senarai? Bawa masuk sekali gus"
          zh="已经有名单了？一次过带进来"
          en="Already have a list? Bring it in all at once"
        />
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Which road — said plainly, including what it costs. */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMode("file")}
              aria-pressed={mode === "file"}
              className={choiceCls(mode === "file")}
            >
              <span className="block text-base font-semibold">
                📄 <Tri bm="Excel / CSV" zh="Excel / CSV" en="Excel / CSV" />
              </span>
              <span className="block text-sm text-muted-foreground">
                <Tri
                  bm="Dibaca oleh kod. Percuma — tidak menyentuh kuota AI anda."
                  zh="程式读的。免费 —— 不会动到您的 AI 额度。"
                  en="Read by code. Free — does not touch your AI allowance."
                />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("ai")}
              aria-pressed={mode === "ai"}
              className={choiceCls(mode === "ai")}
            >
              <span className="block text-base font-semibold">
                📷 <Tri bm="Gambar / PDF" zh="照片 / PDF" en="Photo / PDF" />
              </span>
              <span className="block text-sm text-muted-foreground">
                {/* 0-2: the paid-path marker stays, the "about 1%" goes. */}
                <Tri
                  bm="Untuk senarai bergambar atau format lain. Ini menggunakan kuota AI bulanan."
                  zh="给照片、PDF、或格式不对的名单。这条路会用本月的 AI 用量。"
                  en="For a photographed list or any other format. This uses the monthly AI allowance."
                />
              </span>
            </button>
          </div>

          {mode === "file" ? (
            <>
              <div className="rounded-lg border border-[#7c6cf5]/40 bg-[#7c6cf5]/5 p-3">
                <a
                  href="/api/list-template?kind=committee"
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
              {/* Kept short on purpose. The rules used to be spelled out here,
                  where they were read by nobody — people paste first and find
                  out afterwards. So this says the shape in one line and makes
                  the promise that matters: you will be told which lines. */}
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Atau tampal terus: satu orang satu baris, jawatan dahulu, kemudian nama — kalau ada baris yang tidak difahami, Minit akan beritahu yang mana satu."
                  zh="或者直接贴：一行一个人，先职位后姓名 —— 看不懂的行，Minit 会告诉您是哪几行。"
                  en="Or paste it straight in: one person per line, position first, then name — if any line is not understood, Minit will tell you which."
                />
              </p>
              <pre className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
{`主席, 陈大明, TAN TAI BENG
Setiausaha, 林小美
财政, 王小强, WONG SIEW KEONG, 2026-01-01, 2027-12-31`}
              </pre>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-wrap items-center gap-3 text-base">
                <span className="text-muted-foreground">
                  <Tri
                    bm="Pilih gambar atau PDF senarai:"
                    zh="选名单的照片或 PDF："
                    en="Choose a photo or PDF of the list:"
                  />
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="max-w-[18rem] text-sm"
                  disabled={aiBusy}
                  onChange={(e) => readWithAi(e.target.files?.[0])}
                />
              </label>
              {aiBusy && (
                <p className="text-base">
                  <Tri
                    bm="Minit sedang membacanya…"
                    zh="Minit 正在读…"
                    en="Minit is reading it…"
                  />
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Minit menaip apa yang dilihatnya ke dalam kotak di bawah. Ia TIDAK menyimpan apa-apa — baca dahulu, betulkan, kemudian tekan Import."
                  zh="Minit 会把它读到的打进下面那个框。它不会自己保存 —— 您先看一遍、改好，再按「加进名单」。"
                  en="Minit types what it sees into the box below. It saves nothing by itself — read it, fix it, then press Import."
                />
              </p>
              {aiError && <p className={errorCls}>{aiError}</p>}
            </div>
          )}

          <form action={formAction} className="flex flex-col gap-3">
            <textarea
              name="pasted"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              className={inputCls}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Tri bm="Mengimport…" zh="加入中…" en="Importing…" />
                ) : (
                  <Tri bm="Import senarai" zh="加进名单" en="Import the list" />
                )}
              </Button>
              {mode === "file" && (
                <label className="flex items-center gap-2 text-base">
                  <span className="text-muted-foreground">
                    <Tri
                      bm="atau muat naik fail:"
                      zh="或者上传档案："
                      en="or upload a file:"
                    />
                  </span>
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,.csv,.txt,.tsv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="max-w-[16rem] text-sm"
                  />
                </label>
              )}
            </div>
            {mode === "file" && (
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Menerima .xlsx, .csv dan .txt, dibaca oleh kod — tidak menggunakan kuota AI anda."
                  zh="接受 .xlsx、.csv、.txt，由程式读取 —— 不会用掉您的 AI 额度。"
                  en="Takes .xlsx, .csv and .txt, read by code — does not use your AI allowance."
                />
              </p>
            )}
            {state.ok && (
              <p className="text-base font-medium text-green-700 dark:text-green-300">
                ✓ <Tri bm="Senarai diimport" zh="名单加好了" en="The list was imported" />
              </p>
            )}
            {state.error && (
              <div className="flex flex-col gap-2">
                <p className={errorCls}>{state.error}</p>
                {/* The escape hatch, at the only place it is any use. The price
                    is on the button, not in a footnote: nobody should spend a
                    credit without having read the word "credit" first. */}
                {text.trim() !== "" && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={aiBusy}
                      onClick={readPastedWithAi}
                      className="self-start"
                    >
                      {aiBusy ? (
                        <Tri
                          bm="Minit sedang membacanya…"
                          zh="Minit 正在读…"
                          en="Minit is reading it…"
                        />
                      ) : (
                        <Tri
                          bm="Tak difahami? Biar Minit yang baca · guna kuota AI"
                          zh="看不懂？让 Minit 帮你读 · 会用 AI 用量"
                          en="Not understood? Let Minit read it · uses the AI allowance"
                        />
                      )}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      <Tri
                        bm="Minit akan menaip semula apa yang difahaminya ke dalam kotak yang sama. Ia tidak menyimpan apa-apa — baca dahulu, betulkan, kemudian tekan “Import senarai”."
                        zh="Minit 会把它读懂的内容重新打进上面同一个框。它不会自己保存 —— 您先看一遍、改好，再按「加进名单」。"
                        en="Minit retypes what it makes out into the same box above. It saves nothing by itself — read it, fix it, then press “Import the list”."
                      />
                    </p>
                  </>
                )}
                {aiError && <p className={errorCls}>{aiError}</p>}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

export function RemoveCommitteeButton({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState(removeCommitteeMember, INITIAL);
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
