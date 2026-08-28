"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import { PhotoLightbox } from "@/components/page-thumbs";
import { cjkSnippets, hasCjk } from "@/lib/bm-guard";
import { MINUTES_LANGUAGES, type MinutesLang } from "@/lib/minutes-lang";
import {
  applyNameSubstitutions,
  rosterNameSubstitutions,
} from "@/lib/roster-names";
import { useMinutes } from "./minutes-store";

// ---------------------------------------------------------------------------
// /minutes/document — the finished document, saving it, and the values to paste
// into eROSES. The three things you do AFTER the facts are settled.
//
// These were StepCards 3, 4 and the events card of a 2039-line page. They stay
// together because they are one sitting: read the document, save it, then copy
// the numbers into the government form. What they no longer sit under is the
// hundred-row attendance list.
// ---------------------------------------------------------------------------

/** Each choice is written in the language it produces — a person looking for
 *  中文 finds 中文, whatever language the interface happens to be in. */
const LANGUAGE_CHOICE: Record<MinutesLang, string> = {
  bm: "Bahasa Malaysia (eROSES)",
  // C-10 (work order 51, J): ONE word — "华语 / 中文" read as two options.
  zh: "中文",
  en: "English",
};

export function MinutesDocument() {
  const {
    documentOrgName,
    documentSigner,
    extraction,
    isReal,
    isSample,
    nothingYet,
    typedByHand,
    allReviewed,
    attendanceMissing,
    outstanding,
    shownDocument,
    docLang,
    setDocLang,
    aiDraft,
    draftError,
    draftBusy,
    writeWithAi,
    edited,
    setEdited,
    saveBusy,
    alreadySaved,
    saveResult,
    savedDocId,
    saveToHistory,
    backToEmpty,
    photoPages,
    docTitle,
    setDocTitle,
    suggestedTitle,
    pastePack,
    filingRoster,
    evRows,
    evBusy,
    evError,
    findEventsInMinutes,
    confirmEvent,
  } = useMinutes();

  // --- one-tap copy for each eROSES value ----------------------------------
  // 2026-08-07 (user: "为什么不做可以直接 click copy，不需要 user highlight 再 copy")
  // /filings already had this button (filings-view.tsx) while this screen — the
  // one a secretary actually finishes a meeting on — made them drag-select the
  // text by hand. Same paste pack, same helper, same behaviour now.
  const [copiedEroses, setCopiedEroses] = useState<string | null>(null);
  const router = useRouter();

  // J 28/8 evening item 5: 「在这里也没有得看回照片」 — while correcting the
  // document, one button opens the ORIGINAL handwriting in a popup (zoom
  // in/out inside), and closing it lands right back in the editor. State
  // here, viewer shared (PhotoLightbox).
  const [photoOpen, setPhotoOpen] = useState<number | null>(null);

  // BM GUARD (J 8/27 下午): a BM document bound for eROSES must not carry
  // Chinese. Free, deterministic scan of exactly what would be saved; the
  // fix is the person's CHOICE — AI (the existing metered draft) or their
  // own hands. Only the BM version is guarded: 中文/EN versions are for the
  // organisation's own use.
  // The org's REGISTERED name and the signer's name print verbatim (never
  // rewritten) — a Chinese org name must not block its own documents.
  const bmOffenders = useMemo(
    () =>
      docLang === "bm" && isReal && allReviewed
        ? cjkSnippets(shownDocument, [documentOrgName, documentSigner])
        : [],
    [docLang, isReal, allReviewed, shownDocument, documentOrgName, documentSigner],
  );

  // J 28/8 item 1: the roster already maps 喜益 → TAN XI YI (name_official,
  // typed by a human against the IC). Offering that replacement is CODE, not
  // AI — free, exact, nothing invented. Only shown while the BM guard flags.
  const nameSubs = useMemo(
    () =>
      bmOffenders.length > 0
        ? rosterNameSubstitutions(shownDocument, filingRoster)
        : [],
    [bmOffenders.length, shownDocument, filingRoster],
  );

  // J 28/8 item 2: tap a flagged line to FIND it — the editor scrolls there
  // and selects it, which is the browser's own highlight.
  function locateInDocument(snippet: string) {
    const el = document.getElementById("minutes-document") as HTMLTextAreaElement | null;
    if (!el) return;
    const idx = el.value.indexOf(snippet);
    if (idx === -1) return;
    el.focus();
    el.setSelectionRange(idx, idx + snippet.length);
    // Rough but effective: place the selected line near the middle.
    const lineIndex = el.value.slice(0, idx).split("\n").length - 1;
    const totalLines = el.value.split("\n").length;
    el.scrollTop = Math.max(
      0,
      (lineIndex / Math.max(1, totalLines)) * el.scrollHeight - el.clientHeight / 2,
    );
  }

  async function copyErosesValue(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEroses(field);
      setTimeout(() => setCopiedEroses(null), 1500);
    } catch {
      // clipboard blocked (insecure origin / permission) — the value is still
      // on screen and selectable, so this degrades instead of breaking.
    }
  }

  /** Minit must not write an official document from unconfirmed facts. */
  const notReady = nothingYet ? (
    <Tri
      bm="Ambil gambar nota mesyuarat dahulu. MinitAI tidak menulis dokumen rasmi daripada halaman yang kosong."
      zh="请先拍下会议笔记。空白的内容，MinitAI 不会拿去写正式文件。"
      en="Take a photo of the notes first. MinitAI does not write an official document from an empty page."
    />
  ) : !allReviewed ? (
    // D-4: "still to be CHECKED" is review language. Somebody typing has
    // nothing to check — they have blanks to fill.
    typedByHand ? (
      <Tri
        bm={`Masih ada ${outstanding} perkara belum diisi. MinitAI tidak akan menulis dokumen rasmi daripada borang yang belum lengkap.`}
        zh={`还有 ${outstanding} 项没填。还没填完的内容，MinitAI 不会拿去写正式文件。`}
        en={`${outstanding} item(s) still to fill in. MinitAI will not write an official document from an unfinished form.`}
      />
    ) : (
      <Tri
        bm={`Masih ada ${outstanding} perkara untuk disemak. MinitAI tidak akan menulis dokumen rasmi daripada maklumat yang belum anda sahkan.`}
        zh={`还有 ${outstanding} 项要核对。您还没确认的内容，MinitAI 不会拿去写正式文件。`}
        en={`${outstanding} item(s) still need checking. MinitAI will not write an official document from anything you have not confirmed.`}
      />
    )
  ) : null;

  return (
    <>
      <PageSection
        step={4}
        titleBm="Minit siap (Bahasa Malaysia)"
        titleZh="做好的会议记录（马来文）"
        titleEn="The finished minutes (in Malay)"
        summary={
          <Tri
            bm="MinitAI menulis dokumen rasmi dalam Bahasa Malaysia daripada perkara yang anda sahkan. Baca sekali, kemudian simpan."
            zh="MinitAI 会用您确认过的内容，写成马来文的正式文件。看一遍，然后保存。"
            en="MinitAI writes the official Malay document from what you confirmed. Read it once, then save."
          />
        }
      >
        {notReady ? (
          <>
            <p className="rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
              {notReady}
            </p>
            <NextStepLink
              href="/minutes"
              back
              labelBm="Kembali ke semakan"
              labelZh="回去核对内容"
              labelEn="Back to the review"
            />
          </>
        ) : (
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted-foreground">
            {aiDraft ? (
              <Tri
                bm="MinitAI telah menyusun perkara yang anda sahkan menjadi dokumen rasmi dalam Bahasa Malaysia. Sila baca sekali sebelum simpan."
                zh="MinitAI 已经把您确认的内容整理成马来文的正式文件。保存前请看一遍。"
                en="MinitAI has organised what you confirmed into the formal Malay document. Please read it once before saving."
              />
            ) : allReviewed ? (
              <Tri
                bm="Ini paparan ringkas — perkara anda mengikut susunan asal nota. Tekan butang di bawah dan MinitAI akan menyusunnya menjadi dokumen rasmi Bahasa Malaysia."
                zh="这只是快速预览 —— 内容还是照笔记原本的顺序排。按下面的按钮，MinitAI 会把它整理成正式的马来文文件。"
                en="This is the quick preview — your items in the order they were written. Tap the button below and MinitAI will organise them into the formal Malay document."
              />
            ) : (
              <Tri
                bm="Paparan ini dikemas kini secara langsung semasa anda mengesahkan di atas."
                zh="您在上面每确认一项，这个预览就会跟着更新。"
                en="This preview updates as you confirm things above."
              />
            )}
          </p>
          {isReal && allReviewed && (
            <div className="flex flex-col gap-3">
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="mb-1 text-base font-medium">
                  <Tri
                    bm="Dokumen ini dalam bahasa apa?"
                    zh="这份文件要用什么语言？"
                    en="What language should this document be in?"
                  />
                </legend>
                {MINUTES_LANGUAGES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setDocLang(code)}
                    aria-pressed={docLang === code}
                    className={
                      "rounded-md border-2 px-4 py-2 text-base transition " +
                      (docLang === code
                        ? "border-[#a855f7] bg-[#a855f7]/10 font-semibold"
                        : "border-input hover:bg-black/5 dark:hover:bg-white/5")
                    }
                  >
                    {LANGUAGE_CHOICE[code]}
                  </button>
                ))}
              </fieldset>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Bahasa Malaysia ialah versi untuk eROSES. Versi lain adalah untuk kegunaan pertubuhan anda sendiri — ambil gambar sekali, buat mana-mana versi yang anda perlukan."
                  zh="要交去 eROSES 的是马来文版。另外两个是给你们社团自己看的 —— 拍一次照，要哪个版本就做哪个。"
                  en="Bahasa Malaysia is the version for eROSES. The others are for your own organisation — photograph once, produce whichever version you need."
                />
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  variant={aiDraft ? "outline" : "default"}
                  onClick={writeWithAi}
                  disabled={draftBusy}
                >
                  {draftBusy ? (
                    <Tri
                      bm="MinitAI sedang menulis…"
                      zh="MinitAI 正在写…"
                      en="MinitAI is writing…"
                    />
                  ) : aiDraft ? (
                    <Tri bm="Tulis semula" zh="重写一次" en="Write it again" />
                  ) : (
                    <Tri
                      bm="✍️ Minta MinitAI tulis dokumen rasmi"
                      zh="✍️ 让 MinitAI 写成正式记录"
                      en="✍️ Have MinitAI write the official document"
                    />
                  )}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {/* 0-2: path marker only — no "about X%" promise. */}
                  <Tri
                    bm="Ini menggunakan kuota AI bulanan."
                    zh="这会用本月的 AI 用量。"
                    en="This uses the monthly AI allowance."
                  />
                </span>
              </div>
              {/* A-6 (work order 51): shown here only while the BM guard box
                  is not on screen — when it is, the SAME error renders inside
                  that box, next to the button that was actually pressed.
                  Twice on one screen would be the two-red-boxes trap. */}
              {draftError && bmOffenders.length === 0 && (
                <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
                  {draftError}
                  {"\n"}
                  <Tri
                    bm="Paparan ringkas di bawah masih boleh disimpan — kuota anda tidak ditolak."
                    zh="下面那份快速预览还是可以保存 —— 额度没有被扣。"
                    en="The plain preview below can still be saved — your allowance was not charged."
                  />
                </p>
              )}
            </div>
          )}
          {isReal && allReviewed ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="minutes-document"
                  className="text-base font-medium"
                >
                  <Tri
                    bm="Anda boleh betulkan terus di sini — ini dokumen anda."
                    zh="您可以直接在这里修改 —— 这是您的文件。"
                    en="You can correct it directly here — this is your document."
                  />
                </label>
                {/* J 28/8 evening item 5: the original handwriting, one tap
                    away WHILE editing — a popup with zoom, never a page
                    change, so nothing typed is disturbed. */}
                {photoPages.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPhotoOpen(0)}
                  >
                    📷{" "}
                    <Tri
                      bm={`Lihat gambar asal (${photoPages.length})`}
                      zh={`看原稿照片（${photoPages.length}）`}
                      en={`See the original photos (${photoPages.length})`}
                    />
                  </Button>
                )}
              </div>
              <textarea
                id="minutes-document"
                value={shownDocument}
                onChange={(e) =>
                  setEdited(e.target.value)
                }
                spellCheck={false}
                rows={22}
                className="w-full rounded-md border-2 border-input bg-white/80 p-4 text-base leading-relaxed dark:bg-white/5"
              />
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Baris tajuk dan baris audit sentiasa ditulis semula oleh MinitAI semasa menyimpan, jadi nama pertubuhan dan nama pengesah tidak boleh salah."
                  zh="抬头那一行和最下面的审计行，保存时 MinitAI 一定会重写一次 —— 机构名和确认人不会写错。"
                  en="The letterhead and the audit line are always rewritten by MinitAI when you save, so the organisation and the confirming name cannot be wrong."
                />
              </p>
              {edited !== null && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEdited(null)}
                  >
                    ↩︎{" "}
                    <Tri
                      bm="Buang suntingan saya"
                      zh="放弃我的修改"
                      en="Discard my edits"
                    />
                  </Button>
                </div>
              )}
              {photoOpen !== null && (
                <PhotoLightbox
                  pages={photoPages.map((p) => ({
                    name: p.name,
                    src: p.dataUrl || null,
                  }))}
                  index={photoOpen}
                  onIndex={setPhotoOpen}
                  onClose={() => setPhotoOpen(null)}
                />
              )}
            </div>
          ) : (
            <pre className="rounded-md border-2 border-input bg-white/80 p-4 text-base whitespace-pre-wrap dark:bg-white/5">
              {shownDocument}
            </pre>
          )}
          <div className="flex flex-col gap-3">
            {isSample && (
              <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Ini contoh — tidak boleh disimpan ke sejarah pertubuhan anda. Ambil gambar nota anda dahulu."
                  zh="这是示范内容，不能保存到您机构的历史。请先拍下您自己的笔记。"
                  en="This is the example — it cannot be saved into your organisation's history. Take a photo of your own notes first."
                />
              </p>
            )}
            {/* THE BM GUARD: saving is blocked while Chinese remains in the
                BM document, and the person chooses the way out (J 8/27:
                「先問 user 要 AI 幫忙還是 user 自己改」). */}
            {bmOffenders.length > 0 && (
              <div className="flex flex-col gap-3 rounded-md border-2 border-red-300 bg-red-50 p-4 dark:bg-red-400/10">
                <p className="text-base font-semibold text-red-900 dark:text-red-100">
                  🛑{" "}
                  <Tri
                    bm={`Dokumen Bahasa Malaysia ini masih mengandungi ${bmOffenders.length} baris berbahasa Cina — eROSES memerlukan Bahasa Malaysia sepenuhnya.`}
                    zh={`这份要交 eROSES 的马来文文件里还有 ${bmOffenders.length} 行华语 —— eROSES 要全马来文。`}
                    en={`This Bahasa Malaysia document still contains ${bmOffenders.length} line(s) of Chinese — eROSES requires full Bahasa Malaysia.`}
                  />
                </p>
                <p className="text-sm text-red-900/80 dark:text-red-100/80">
                  <Tri
                    bm="Tekan mana-mana baris — editor akan skrol ke situ dan menandakannya."
                    zh="点任何一行 —— 编辑框会跳到那里并选中它，方便找。"
                    en="Tap any line — the editor scrolls there and highlights it."
                  />
                </p>
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm text-red-900/90 dark:text-red-100/90">
                  {bmOffenders.map((s) => (
                    <li key={s} className="truncate">
                      <button
                        type="button"
                        onClick={() => locateInDocument(s)}
                        className="max-w-full truncate text-left underline-offset-4 hover:underline"
                        title={s}
                      >
                        · {s}
                      </button>
                    </li>
                  ))}
                </ul>
                {/* J 28/8 item 1: the roster's IC names, one tap, no AI. */}
                {nameSubs.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-md border-2 border-green-400 bg-green-50 p-3 dark:bg-green-400/10">
                    <p className="text-base font-medium text-green-900 dark:text-green-100">
                      <Tri
                        bm={`${nameSubs.length} nama ini ada dalam senarai AJK — nama rasmi (IC) boleh diganti terus, percuma (bukan AI):`}
                        zh={`这里有 ${nameSubs.length} 个人名在名册里 —— 可以直接用官方（IC）姓名顶上，免费（不用 AI）：`}
                        en={`${nameSubs.length} of these names are on the committee roster — the official (IC) names can stand in directly, free (no AI):`}
                      />
                    </p>
                    <ul className="flex flex-col gap-0.5 text-sm text-green-900/90 dark:text-green-100/90">
                      {nameSubs.map((s) => (
                        <li key={s.from}>
                          · {s.from} → <span className="font-semibold">{s.to}</span>
                          {s.count > 1 ? ` (×${s.count})` : ""}
                        </li>
                      ))}
                    </ul>
                    <div>
                      <Button
                        size="lg"
                        variant="outline"
                        className="border-green-500"
                        onClick={() =>
                          setEdited(applyNameSubstitutions(shownDocument, nameSubs))
                        }
                      >
                        ✓{" "}
                        <Tri
                          bm="Ganti dengan nama rasmi (IC)"
                          zh="用名册的官方（IC）姓名顶上"
                          en="Put in the official (IC) names"
                        />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="lg" onClick={writeWithAi} disabled={draftBusy}>
                    {draftBusy ? (
                      <Tri bm="MinitAI sedang menulis…" zh="MinitAI 正在写…" en="MinitAI is writing…" />
                    ) : (
                      <Tri
                        bm="✍️ Biar AI tulis versi BM (guna kuota AI)"
                        zh="✍️ 让 AI 译成正式马来文（用 AI 额度）"
                        en="✍️ Let the AI write the BM version (uses AI allowance)"
                      />
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      const el = document.getElementById("minutes-document");
                      el?.scrollIntoView({ block: "center" });
                      el?.focus();
                    }}
                  >
                    ✏️ <Tri bm="Saya betulkan sendiri" zh="我自己改" en="I will fix it myself" />
                  </Button>
                </div>
                {/* A-6 (work order 51, tester: "按了没动静"): when the AI
                    write fails, the error used to render only at the TOP of
                    the page — far above this button, off screen. It shows
                    HERE, beside the button that was pressed. */}
                {draftError && (
                  <p className="rounded-md border-2 border-red-400 bg-white/80 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-950/40 dark:text-red-100">
                    {draftError}
                    {"\n"}
                    <Tri
                      bm="Kuota anda tidak ditolak. Anda juga boleh betulkan baris di atas sendiri."
                      zh="额度没有被扣。您也可以直接自己改上面那几行。"
                      en="Your allowance was not charged. You can also fix the lines above by hand."
                    />
                  </p>
                )}
                <p className="text-sm text-red-900/80 dark:text-red-100/80">
                  <Tri
                    bm="Nama yang tiada dalam senarai ahli: tambah dia (dengan nama IC) di halaman Ahli — lain kali butang di atas menggantikannya sendiri."
                    zh="名册里没有的人名：去「成员」页把这个人（连 IC 姓名）加进去 —— 下次上面那颗按钮就会自动帮您顶上。"
                    en="A name not on the roster: add the person (with their IC name) on the Members page — next time the button above swaps it for you."
                  />{" "}
                  <Link href="/members" className="underline underline-offset-4">
                    <Tri bm="Ke halaman Ahli" zh="去成员页" en="To Members" /> →
                  </Link>
                </p>
              </div>
            )}
            {/* D30 (J #33): a report with zero attendance cannot be
                confirmed — eROSES needs "Bilangan Ahli Hadir". Deferring on
                the attendance page unblocked the REVIEW; the save waits here
                until at least one name exists. */}
            {attendanceMissing && allReviewed && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                <span className="min-w-56 flex-1 font-medium">
                  <Tri
                    bm="Kehadiran masih kosong — minit tidak boleh disahkan tanpa sekurang-kurangnya seorang hadir (eROSES perlukan bilangannya)."
                    zh="出席名单还是空的 —— 至少要记一个人出席才能确认保存（eROSES 要这个人数）。"
                    en="Attendance is still empty — the minutes cannot be confirmed without at least one attendee (eROSES needs the number)."
                  />
                </span>
                <Link
                  href="/minutes/attendance"
                  className="font-medium underline underline-offset-4"
                >
                  <Tri bm="Isi kehadiran" zh="去补名单" en="Fill in attendance" /> →
                </Link>
              </div>
            )}
            {/* J 28/8 item 3: the document's NAME, asked BEFORE saving — like
                Google Docs' title box, pre-filled so nobody has to invent one.
                This is what History lists and what search matches. */}
            {isReal && allReviewed && !alreadySaved && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="minutes-title" className="text-base font-medium">
                  <Tri
                    bm="Nama dokumen ini (untuk dicari semula nanti)"
                    zh="这份记录叫什么名字？（以后要找回，就靠这个名字）"
                    en="A name for this document (how you will find it later)"
                  />
                </label>
                <input
                  id="minutes-title"
                  value={docTitle}
                  maxLength={200}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder={suggestedTitle}
                  className="h-12 w-full max-w-xl rounded-sm border-2 border-input bg-white px-3 text-base dark:bg-transparent"
                />
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm={`Biarkan kosong untuk guna cadangan MinitAI${suggestedTitle ? ` ("${suggestedTitle}")` : ""} — atau taip nama anda sendiri.`}
                    zh={`留空就用 MinitAI 建议的名字${suggestedTitle ? `（「${suggestedTitle}」）` : ""}——也可以直接打你们自己的叫法。`}
                    en={`Leave it empty to use MinitAI's suggestion${suggestedTitle ? ` ("${suggestedTitle}")` : ""} — or type your own.`}
                  />
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={async () => {
                  // J 28/8 evening items 6+7: a successful save lands ON the
                  // finished document — its own History page, with the final
                  // preview, 🖨 Print/PDF, the photos and Edit all right
                  // there. No more hunting through 以前的记录 to print what
                  // you just made. (id null = an idempotent race hid the id;
                  // the history list still shows the document first.)
                  const res = await saveToHistory();
                  if (res.ok) {
                    router.push(
                      res.id ? `/minutes/history/${res.id}` : "/minutes/history",
                    );
                  }
                }}
                // Neither the example nor an empty page may enter a real
                // organisation's audit trail — hence isReal, not !isSample.
                // `alreadySaved`: THIS document is stored; a second press
                // must not store it twice (S0-3 — found by e2e-minutes.mjs).
                // Editing anything unlocks the button again. The BM guard
                // (above) blocks while Chinese remains in the BM version.
                // D30: and zero attendance blocks (the server re-checks).
                disabled={
                  !allReviewed ||
                  attendanceMissing ||
                  saveBusy ||
                  !isReal ||
                  alreadySaved ||
                  bmOffenders.length > 0
                }
              >
                {saveBusy ? (
                  <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
                ) : alreadySaved ? (
                  <Tri bm="✓ Sudah disimpan" zh="✓ 已保存" en="✓ Saved" />
                ) : (
                  <Tri bm="Simpan ke Sejarah" zh="保存到历史" en="Save to History" />
                )}
              </Button>
              <Link
                href="/minutes/history"
                className="text-base underline underline-offset-4"
              >
                <Tri bm="Sejarah minit" zh="历史记录" en="Minutes history" /> →
              </Link>
            </div>
          </div>
          {alreadySaved && (
            <>
              <p className="rounded-md border-2 border-green-400 bg-green-50 p-3 text-base font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
                ✓{" "}
                <Tri
                  bm="Minit disimpan ke sejarah pertubuhan."
                  zh="会议记录已经保存到机构的历史里了。"
                  en="The minutes are saved in the organisation's history."
                />
              </p>
              {/* Normally the save above already walked to the finished
                  document's page; this panel is the browser-Back view of a
                  saved sitting. Everything it offers lives THERE now. */}
              <div className="flex flex-wrap items-center gap-3">
                {savedDocId !== null && (
                  <Button asChild size="lg" variant="outline">
                    <Link href={`/minutes/history/${savedDocId}`}>
                      📄{" "}
                      <Tri
                        bm="Buka dokumen siap (cetak / PDF di sana)"
                        zh="打开成品页（打印 / PDF 都在那里）"
                        en="Open the finished document (print / PDF there)"
                      />
                    </Link>
                  </Button>
                )}
                <Button size="lg" onClick={backToEmpty}>
                  <Tri
                    bm="Mula mesyuarat baharu"
                    zh="开始记录新的会议"
                    en="Start a new meeting"
                  />
                </Button>
                <p className="text-base text-muted-foreground">
                  <Tri
                    bm="Halaman kerja dikosongkan — minit yang disimpan kekal dalam Sejarah."
                    zh="工作区会清空 —— 已保存的会议记录还在「历史」里，不会不见。"
                    en="Clears this workspace — the saved minutes stay in History."
                  />
                </p>
              </div>
            </>
          )}
          {saveResult && saveResult !== "ok" && (
            <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
              {saveResult}
            </p>
          )}
        </div>
        )}
      </PageSection>

      <PageSection
        step={5}
        titleBm="Nilai untuk ditampal ke eROSES"
        titleZh="要贴进 eROSES 的内容"
        titleEn="Values to paste into eROSES"
        summary={
          <Tri
            bm="eROSES ialah laman web Jabatan Pendaftaran Pertubuhan (ROS) tempat penyata tahunan difailkan. Salin nilai di sini satu-satu ke dalam borang di laman itu."
            zh="eROSES 是社团注册局（ROS）用来提交年度报告的官方网站。把这里的内容一项一项复制、贴进那个网站的表格。"
            en="eROSES is the Registry of Societies' website where the annual return is filed. Copy each value here into the matching box on that website."
          />
        }
      >
        {notReady ? (
          <p className="rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
            {notReady}
          </p>
        ) : (
        <div>
          <p className="mb-4 rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            ⚠{" "}
            <Tri
              bm="Semak nama medan dengan portal sebenar sebelum menghantar. Nama medan di laman ROS boleh berubah."
              zh="送出前请先跟正式网站上的栏位名称核对一次。ROS 网站上的栏位名称有可能改动。"
              en="Check the field names against the live portal before you submit — the names on the ROS site can change."
            />
          </p>
          <div className="grid gap-3">
            {pastePack.map((row) => (
              <div key={row.erosesField} className="rounded-sm border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.erosesField}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.erosesFieldEn}
                    </div>
                  </div>
                  <ConfidenceBadge level={row.confidence} />
                </div>
                <div className="mt-3 grid gap-3 @xl:grid-cols-2">
                  <div className="rounded-md bg-blue-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        <Tri bm="Nilai untuk ditampal" zh="要粘贴的值" en="Value to paste" />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={row.value === "—"}
                        onClick={() => copyErosesValue(row.erosesField, row.value)}
                      >
                        {copiedEroses === row.erosesField ? (
                          <>
                            ✓ <Tri bm="Disalin" zh="已复制" en="Copied" />
                          </>
                        ) : (
                          <Tri bm="Salin" zh="复制" en="Copy" />
                        )}
                      </Button>
                    </div>
                    <div className="mt-1 whitespace-normal">{row.value}</div>
                    {/* BM guard: eROSES fields must be Bahasa Malaysia. */}
                    {hasCjk(row.value) && (
                      <div className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
                        🛑{" "}
                        <Tri
                          bm="Nilai ini masih berbahasa Cina — eROSES perlukan Bahasa Malaysia. Betulkan medan asalnya, atau salin daripada dokumen BM yang ditulis AI."
                          zh="这一格还有华语 —— eROSES 要马来文。请回去改这一栏，或从 AI 写好的马来文文件里取。"
                          en="This value still contains Chinese — eROSES needs Bahasa Malaysia. Fix the source field, or take it from the AI-written BM document."
                        />
                      </div>
                    )}
                    {row.note && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {row.note}
                      </div>
                    )}
                  </div>
                  <div className="rounded-md bg-amber-50 p-3">
                    <div className="text-sm font-medium text-muted-foreground">
                      <Tri bm="Sumber (dari nota)" zh="来源（取自记录）" en="Source (from the notes)" />
                    </div>
                    <div className="mt-1 whitespace-normal font-mono text-sm text-muted-foreground">
                      {row.source || "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </PageSection>

      <PageSection
        titleBm="Acara dalam minit ini"
        titleZh="这份记录里的活动"
        titleEn="Events mentioned in these minutes"
        summary={
          <Tri
            bm="Kalau mesyuarat menyebut tarikh akan datang, MinitAI boleh masukkannya ke kalendar untuk anda. Pilihan sahaja."
            zh="如果会议里提到将来的日期，MinitAI 可以帮您加进日历。这一步可以不做。"
            en="If the meeting mentioned a future date, MinitAI can put it in your calendar. Optional."
          />
        }
      >
      <div className="flex flex-col gap-3">
        {(nothingYet || extraction.resolutions.length === 0) && (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Belum ada keputusan dalam minit ini untuk dicari tarikhnya."
              zh="这份记录里还没有决议，没有东西可以找日期。"
              en="There are no resolutions in these minutes yet, so there is nothing to find dates in."
            />
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* Disabled when there is nothing to search. This button SPENDS A
              CREDIT, and running it over an empty extraction spends one to be
              told there were no dates in a document that does not exist —
              "choosing a file silently charged you" is already on the UX defect
              list, and this is the same mistake with a different trigger. */}
          <Button
            onClick={findEventsInMinutes}
            disabled={evBusy || nothingYet || extraction.resolutions.length === 0}
            variant="outline"
            size="lg"
          >
            {evBusy ? (
              <Tri bm="⏳ AI sedang mencari…" zh="⏳ AI 寻找中…" en="⏳ AI is looking…" />
            ) : (
              <Tri bm="Cari acara dalam minit" zh="找出记录里的活动" en="Find events in these minutes" />
            )}
          </Button>
          {evRows?.some((r) => r.added) && (
            <a href="/calendar" className="font-medium text-sky-800 underline underline-offset-4">
              <Tri bm="Buka kalendar →" zh="打开日历 →" en="Open the calendar →" />
            </a>
          )}
        </div>
        {evError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">{evError}</div>
        )}
        {evRows && evRows.length === 0 && (
          <p className="text-muted-foreground">
            <Tri
              bm="Tiada acara bertarikh dalam keputusan mesyuarat ini."
              zh="这份记录的决议里没有带日期的活动。"
              en="No dated events in these resolutions."
            />
          </p>
        )}
        {evRows?.map((r, i) => (
          <div
            key={i}
            className={`flex flex-wrap items-center gap-3 rounded-sm border bg-background p-3 ${
              // Was opacity-60 on the whole row including its text.
              r.added ? "border-green-300 bg-green-50" : ""
            }`}
          >
            <span className="text-xl">🎉</span>
            <div className="min-w-40 flex-1">
              <div className="font-medium">{r.title || <em>—</em>}</div>
              <div className="text-sm text-muted-foreground">
                {r.dateIso || <Tri bm="tiada tarikh" zh="没有日期" en="no date" />}
                {r.timeText && ` · ${r.timeText}`}
              </div>
            </div>
            <Button
              variant={r.added ? "ghost" : "default"}
              disabled={r.added || !r.dateIso}
              onClick={() => confirmEvent(i)}
            >
              {r.added ? (
                <Tri bm="✓ Dalam kalendar" zh="✓ 已进日历" en="✓ In the calendar" />
              ) : (
                <Tri bm="+ Masuk kalendar" zh="+ 加进日历" en="+ Add to calendar" />
              )}
            </Button>
          </div>
        ))}
      </div>

        <NextStepLink
          href="/minutes/history"
          back
          labelBm="Lihat sejarah minit"
          labelZh="看历史记录"
          labelEn="See the minutes history"
        />
      </PageSection>
    </>
  );
}
