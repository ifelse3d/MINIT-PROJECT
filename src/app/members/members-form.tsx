"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { toIsoDate } from "@/lib/date-input";
import {
  addCommitteeMember,
  importCommittee,
  removeCommitteeMember,
  type MemberActionState,
} from "./actions";
import { Trash2 } from "lucide-react";
import { AttachIcon, ChooseFileLabel } from "@/components/attach-icon";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { uploadErrorMessage } from "@/lib/shrink-photo";
import { prepareUploadForSend } from "@/lib/upload-relay-client";

const INITIAL: MemberActionState = { error: null, ok: false };

const inputCls =
  "w-full rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

/** B-2: the box the error is about turns red — appended to inputCls. */
const invalidCls =
  " border-red-400 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.18)]";

const errorCls =
  "rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100";

/** B-9: the file input AS a real button — the browser's "Choose file" small
 *  text was invisible to testers. Same file: classes create-org-form uses. */
const fileBtnCls =
  "text-base file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-[color:var(--v2-primary-fill)] file:px-4 file:py-2 file:text-base file:font-semibold file:text-white";

/**
 * #8 (launch feedback) + B-1 (work order 51): the appointment-date box.
 * Typing still takes any shape (20260101, 1/1/2026 — the dashes are our job,
 * normalised on blur), and the 📅 button opens the browser's own little
 * calendar for people who would rather tap than type.
 * CONTROLLED, like every box in this form: React 19 auto-resets a form after
 * its action returns — including after a refusal or the same-name question —
 * and a controlled value is the only kind that survives that reset.
 */
function TermDateInput({
  name,
  value,
  onChange,
  invalid,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const t = useTriText();
  const dateRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        className={inputCls + (invalid ? invalidCls : "") + " pr-11"}
        inputMode="numeric"
        placeholder="2026-01-01"
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={() => {
          const iso = toIsoDate(value);
          if (iso) onChange(iso);
        }}
      />
      <button
        type="button"
        aria-label={t("Buka kalendar", "打开小日历", "Open the calendar")}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-xs px-1.5 py-0.5 text-lg hover:bg-black/5 dark:hover:bg-white/10"
        onClick={() => {
          const d = dateRef.current;
          if (!d) return;
          try {
            d.showPicker();
          } catch {
            d.click();
          }
        }}
      >
        📅
      </button>
      {/* The native date input exists only to lend its picker; invisible,
          anchored to the box so the calendar opens in the right place. */}
      <input
        ref={dateRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
        onChange={(e) => {
          if (e.currentTarget.value) onChange(e.currentTarget.value);
        }}
      />
    </div>
  );
}

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

/** The society's own honorifics/titles — SUGGESTIONS only, from several
 *  Malaysian communities; whatever this society writes is the right answer. */
const HONORIFIC_SUGGESTED = [
  "Dato'",
  "Datin",
  "Dr.",
  "Haji",
  "Hajah",
  "Ustaz",
  "Ustazah",
  "讲师",
  "师兄",
  "师姐",
];

/** One row, not a second card. Adding a person is part of reading the list —
 *  the previous layout put it in a separate panel below, which is how a page
 *  with two lists ended up looking like a page with four. */
export function AddCommitteeRow() {
  const [state, formAction, pending] = useActionState(addCommitteeMember, INITIAL);
  const localizeError = useLocalizedError();
  // CONTROLLED fields, deliberately: React 19 auto-resets a form's
  // uncontrolled inputs the moment its action returns — including on a
  // refusal and on the same-name question — which would throw away what the
  // person typed exactly when they still need it (to fix one box, or to
  // answer "yes, another person" and re-submit the same values).
  const [position, setPosition] = useState("");
  const [personName, setPersonName] = useState("");
  const [honorific, setHonorific] = useState("");
  const [nameOfficial, setNameOfficial] = useState("");
  const [note, setNote] = useState("");
  const [termStart, setTermStart] = useState("");
  // Cancelling the same-name question: useActionState's state cannot be
  // cleared imperatively, so remember WHICH state object was dismissed (the
  // errorHiddenFor pattern from ImportCommittee below).
  const [askHiddenFor, setAskHiddenFor] = useState<MemberActionState | null>(null);
  const askSameName = state === askHiddenFor ? null : state.askSameName;

  // B-4 (work order 51): a successful add clears the WHOLE form (date
  // included) so the next person starts on a clean row. setTimeout(0), not a
  // bare setState-in-effect — the repo's eslint baseline forbids the latter.
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => {
      setPosition("");
      setPersonName("");
      setHonorific("");
      setNameOfficial("");
      setNote("");
      setTermStart("");
    }, 0);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 @3xl:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Jawatan" zh="职位" en="Position" />
          </span>
          <input
            name="position"
            value={position}
            onChange={(e) => setPosition(e.currentTarget.value)}
            className={inputCls + (state.field === "position" ? invalidCls : "")}
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
          <input
            name="personName"
            value={personName}
            onChange={(e) => setPersonName(e.currentTarget.value)}
            className={inputCls + (state.field === "personName" ? invalidCls : "")}
            required
            maxLength={120}
          />
        </label>

        {/* B-7 (拍板 7): the title the society itself uses (讲师, Dato',
            Ustaz…) — groundwork so a note that says 陈讲师 can later be
            matched to the right 陈. Optional, free text. */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Gelaran (jika ada)" zh="称呼/职衔（可不填）" en="Title (if any)" />
          </span>
          <input
            name="honorific"
            value={honorific}
            onChange={(e) => setHonorific(e.currentTarget.value)}
            className={inputCls}
            maxLength={60}
            list="committee-honorifics"
          />
          <datalist id="committee-honorifics">
            {HONORIFIC_SUGGESTED.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Nama dalam IC (eROSES)"
              zh="身份证上的名字（eROSES）"
              en="Name on IC (eROSES)"
            />
          </span>
          <input
            name="nameOfficial"
            value={nameOfficial}
            onChange={(e) => setNameOfficial(e.currentTarget.value)}
            className={inputCls}
            maxLength={160}
          />
        </label>

        {/* B-6 (拍板 6): the society's own way of telling two same-named
            people apart —（大）（小）, a village, a class. Never filed. */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Nota (bezakan nama sama)"
              zh="备注（同名时分辨用）"
              en="Note (tell same names apart)"
            />
          </span>
          <input
            name="note"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            className={inputCls}
            maxLength={120}
            placeholder="（大）／（小）"
          />
        </label>

        {/* B-1 (拍板 5): appointment date only — eROSES asks for it. The old
            "term end" field is gone; a committee change is a Mesyuarat Agung
            decision, not a date quietly expiring people. */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Tarikh perlantikan (eROSES)"
              zh="任命日期（eROSES 要的）"
              en="Appointment date (eROSES)"
            />
          </span>
          <TermDateInput
            name="termStart"
            value={termStart}
            onChange={setTermStart}
            invalid={state.field === "termStart"}
          />
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Tarikh boleh dibiarkan kosong — taip apa sahaja bentuk (20260101, 1/1/2026) atau tekan 📅. “Nama dalam IC” ialah nama yang eROSES mahu — salin daripada kad pengenalan, jangan terjemah sendiri; biarkan kosong jika anda belum tahu."
          zh="日期可以不填 —— 随便怎么打（20260101、1/1/2026）都行，或按 📅 选。「身份证上的名字」是 eROSES 要的那个 —— 请照身份证抄，不要自己音译；还不知道就留空。"
          en="The date can be left blank — type it any way (20260101, 1/1/2026) or tap 📅. “Name on IC” is the one eROSES wants — copy it from the identity card rather than transliterating it yourself; leave it blank if you do not know it yet."
        />
      </p>

      {/* B-6: same name, different IC name — ask, don't block and don't
          silently duplicate. The Yes button re-submits the SAME filled form
          with confirmSameName=1 (submitter name/value rides in FormData). */}
      {askSameName && (
        <div className="flex flex-col gap-2 rounded-md border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            🤔{" "}
            <Tri
              bm={`Sudah ada "${askSameName.name}" dalam senarai${askSameName.official ? ` (nama IC: ${askSameName.official})` : " (nama IC belum diisi)"}. Orang LAIN yang sama nama?`}
              zh={`名单里已经有「${askSameName.name}」${askSameName.official ? `（身份证名字：${askSameName.official}）` : "（身份证名字还没填）"}。这是另一位同名的人吗？`}
              en={`"${askSameName.name}" is already on the list${askSameName.official ? ` (IC name: ${askSameName.official})` : " (no IC name yet)"}. Is this a DIFFERENT person with the same name?`}
            />
          </p>
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            <Tri
              bm="Petua: isi kotak Nota (contohnya （大）／（小）) supaya semua orang tahu yang mana satu."
              zh="建议：在「备注」写点分辨的字（例如（大）（小）），大家才认得出是哪一位。"
              en="Tip: put something in the Note box (e.g. （大）／（小）) so everyone can tell which is which."
            />
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                // The same values, re-submitted with the person's answer.
                // Built by hand: whether a submit button's name/value rides
                // in the action's FormData varies by React version, and this
                // must not depend on it.
                const fd = new FormData();
                fd.set("position", position);
                fd.set("personName", personName);
                fd.set("honorific", honorific);
                fd.set("nameOfficial", nameOfficial);
                fd.set("note", note);
                fd.set("termStart", termStart);
                fd.set("confirmSameName", "1");
                startTransition(() => formAction(fd));
              }}
            >
              ✓{" "}
              <Tri
                bm="Ya, orang lain — tambah juga"
                zh="是另一位 —— 照加"
                en="Yes, another person — add them"
              />
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setAskHiddenFor(state)}
            >
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </div>
        </div>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Tri bm="…" zh="…" en="…" />
          ) : (
            <Tri bm="Tambah" zh="加进名单" en="Add" />
          )}
        </Button>
      </div>

      {state.ok && (
        <p className="text-base font-medium text-green-700 dark:text-green-300">
          ✓ <Tri bm="Ditambah" zh="加好了" en="Added" />
        </p>
      )}
      {state.error && <p className={errorCls}>{localizeError(state.error)}</p>}
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
  const localizeError = useLocalizedError();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "ai">("file");
  const [text, setText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // 工作单 48 第二案: which road started the last AI read — the escape-hatch
  // block under the paste form must stay on screen while ITS read runs, but
  // must not pop up because the FILE road failed.
  const [aiRoad, setAiRoad] = useState<"file" | "paste" | null>(null);
  // ONE error line at a time. useActionState owns `state`, so a stale form
  // refusal cannot be cleared imperatively — instead the state OBJECT that was
  // on screen when an AI read started is remembered, and its error is no
  // longer shown (the next form submit makes a new object, which shows again).
  // The tester's screen had TWO stacked red boxes: an old "paste your list
  // first" refusal plus the AI road's "…" — this is what prevents the repeat.
  const [errorHiddenFor, setErrorHiddenFor] =
    useState<MemberActionState | null>(null);

  const formError = state === errorHiddenFor ? null : state.error;
  // The AI error is always the newer of the two — it wins the single slot.
  const shownError = aiError ?? formError;

  async function askMinitToRead(body: FormData, road: "file" | "paste") {
    setAiRoad(road);
    setAiBusy(true);
    setAiError(null);
    setErrorHiddenFor(state);
    try {
      const res = await fetch("/api/import-roster", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !data?.text) {
        // Was `data?.error ?? "…"` — three literal dots was the whole message
        // a tester got when the platform 413'd a big scan (工作单 48 第二案).
        setAiError(uploadErrorMessage(res.status, data?.error));
        return;
      }
      setText(data.text);
    } catch {
      // The fetch itself threw: nothing reached the server, nothing charged.
      setAiError(joinUserError(USER_ERRORS.networkNoCharge));
    } finally {
      setAiBusy(false);
    }
  }

  function readWithAi(file: File | undefined) {
    if (!file) return;
    void (async () => {
      // 48 + A-4: shrink photos in the browser; relay a big PDF via Storage
      // (the tester's 6MB roster scan now goes through instead of the "too
      // large" refusal); refuse honestly what neither road can carry.
      const prepared = await prepareUploadForSend(file);
      if (prepared.send === "refuse") {
        setAiRoad("file");
        setAiError(prepared.error);
        setErrorHiddenFor(state);
        return;
      }
      const body = new FormData();
      if (prepared.send === "file") body.append("file", prepared.file);
      else body.append("storagePath", prepared.storagePath);
      await askMinitToRead(body, "file");
    })();
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
    void askMinitToRead(body, "paste");
  }

  const choiceCls = (active: boolean) =>
    "flex-1 min-w-[15rem] rounded-md border-2 px-4 py-3 text-left transition " +
    (active
      ? "border-[#a855f7] bg-[#a855f7]/10"
      : "border-input hover:bg-black/5 dark:hover:bg-white/5");

  return (
    <div className="rounded-md border border-input bg-white/40 p-4 dark:bg-white/5">
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
                <AttachIcon className="inline h-4 w-4 align-[-2px]" />{" "}
                <Tri bm="Gambar / PDF" zh="照片 / PDF" en="Photo / PDF" />
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
              <div className="rounded-sm border border-[#a855f7]/40 bg-[#a855f7]/5 p-3">
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
                  bm="Atau tampal terus: satu orang satu baris, jawatan dahulu, kemudian nama — kalau ada baris yang tidak difahami, MinitAI akan beritahu yang mana satu."
                  zh="或者直接贴：一行一个人，先职位后姓名 —— 看不懂的行，MinitAI 会告诉您是哪几行。"
                  en="Or paste it straight in: one person per line, position first, then name — if any line is not understood, MinitAI will tell you which."
                />
              </p>
              <pre className="rounded-sm bg-black/5 p-3 text-sm dark:bg-white/10">
{`主席, 陈大明, TAN TAI BENG
Setiausaha, 林小美
财政, 王小强, WONG SIEW KEONG, 2026-01-01, 2027-12-31`}
              </pre>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-wrap items-center gap-3 text-base">
                <span className="text-muted-foreground">
                  <ChooseFileLabel />
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  // B-9: a real button, not the browser's tiny default text.
                  className={"max-w-[20rem] " + fileBtnCls}
                  disabled={aiBusy}
                  onChange={(e) => readWithAi(e.target.files?.[0])}
                />
              </label>
              {aiBusy && (
                <p className="text-base">
                  <Tri
                    bm="MinitAI sedang membacanya…"
                    zh="MinitAI 正在读…"
                    en="MinitAI is reading it…"
                  />
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="MinitAI menaip apa yang dilihatnya ke dalam kotak di bawah. Ia TIDAK menyimpan apa-apa — baca dahulu, betulkan, kemudian tekan Import."
                  zh="MinitAI 会把它读到的打进下面那个框。它不会自己保存 —— 您先看一遍、改好，再按「加进名单」。"
                  en="MinitAI types what it sees into the box below. It saves nothing by itself — read it, fix it, then press Import."
                />
              </p>
            </div>
          )}

          {/* THE error line — one slot, whichever road failed last. Two
              independent red boxes stacking on one screen (the tester's
              screenshot, 工作单 48 第二案) is the layout this replaces. */}
          {shownError && <p className={errorCls}>{localizeError(shownError)}</p>}

          {/* The way out of a refused paste, kept next to the refusal it
              answers. Also shown while its own read runs, so the button's
              busy label is the progress indicator. */}
          {text.trim() !== "" &&
            (formError !== null || (aiRoad === "paste" && (aiBusy || aiError !== null))) && (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={aiBusy}
                  onClick={readPastedWithAi}
                  className="self-start"
                >
                  {aiBusy ? (
                    <Tri
                      bm="MinitAI sedang membacanya…"
                      zh="MinitAI 正在读…"
                      en="MinitAI is reading it…"
                    />
                  ) : (
                    <Tri
                      bm="Tak difahami? Biar MinitAI yang baca · guna kuota AI"
                      zh="看不懂？让 MinitAI 帮你读 · 会用 AI 用量"
                      en="Not understood? Let MinitAI read it · uses the AI allowance"
                    />
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="MinitAI akan menaip semula apa yang difahaminya ke dalam kotak yang sama. Ia tidak menyimpan apa-apa — baca dahulu, betulkan, kemudian tekan “Import senarai”."
                    zh="MinitAI 会把它读懂的内容重新打进下面同一个框。它不会自己保存 —— 您先看一遍、改好，再按「加进名单」。"
                    en="MinitAI retypes what it makes out into the same box below. It saves nothing by itself — read it, fix it, then press “Import the list”."
                  />
                </p>
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
              {/* Clearing the AI error on submit keeps the one-error rule the
                  other way round too: a new form refusal must not stack under
                  an old AI failure. */}
              <Button type="submit" disabled={pending} onClick={() => setAiError(null)}>
                {pending ? (
                  <Tri bm="Mengimport…" zh="加入中…" en="Importing…" />
                ) : (
                  <Tri bm="Import senarai" zh="加进名单" en="Import the list" />
                )}
              </Button>
              {mode === "file" && (
                <label className="flex items-center gap-2 text-base">
                  <span className="text-muted-foreground">
                    {/* Brackets differ on purpose: this picker takes a
                        spreadsheet, not a photo. */}
                    <ChooseFileLabel bm="Excel atau CSV" zh="Excel 或 CSV" en="Excel or CSV" />
                  </span>
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,.csv,.txt,.tsv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    // B-9: a real button, not the browser's tiny default text.
                    className={"max-w-[20rem] " + fileBtnCls}
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
      {/* B-3: removal reads as removal — red, with a bin icon. */}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10"
      >
        <Trash2 aria-hidden className="size-4" strokeWidth={2.2} />
        <Tri bm="Padam" zh="删除" en="Remove" />
      </Button>
      {state.error && <span className="sr-only">{state.error}</span>}
    </form>
  );
}
