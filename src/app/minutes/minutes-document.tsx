"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import { PhotoLightbox } from "@/components/page-thumbs";
import { cjkSegments, cjkSnippets } from "@/lib/bm-guard";
import { EinvoisBetaBadge } from "@/components/einvois-beta-badge";
import { useEinvoisVisible } from "@/lib/einvois-pref";
import {
  checkFinancialResolution,
  type EInvoisAuditStatus,
} from "@/lib/einvois-governance";
import { formatRm } from "@/lib/minit-format";
import { minutesStructure } from "@/lib/minutes-compose";
import { MINUTES_LANGUAGES, type MinutesLang } from "@/lib/minutes-lang";
import {
  applyNameSubstitutions,
  rosterNameSubstitutions,
} from "@/lib/roster-names";
import { glossaryTermSubstitutions, splitFlaggedLines } from "@/lib/bm-glossary";
import { useMinutes } from "./minutes-store";
import { TidyView } from "./tidy-view";

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

// ---------------------------------------------------------------------------
// e-INVOIS AUDIT BADGE (work order 94).
//
// One badge per status, and NOT ONE OF THEM says the government validated
// anything — there is no MyInvois API in v1 (src/lib/einvois.ts header), so a
// "LHDN Validated" badge would assert a reply we never received. Green here
// means "our side of the trail is finished": the row reached a batch file, or
// a named human recorded uploading it. What LHDN did with it afterwards is a
// fact this app cannot observe and therefore must not display.
// ---------------------------------------------------------------------------
const AUDIT_BADGE: Record<
  EInvoisAuditStatus,
  { cls: string; bm: string; zh: string; en: string }
> = {
  not_applicable: {
    cls: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:bg-neutral-400/10 dark:text-neutral-200",
    bm: "Tiada e-Invois diperlukan",
    zh: "不需要 e-Invois",
    en: "No e-Invois needed",
  },
  unknown: {
    cls: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100",
    bm: "Belum dapat ditentukan",
    zh: "还无法判断",
    en: "Cannot tell yet",
  },
  consolidated_pack: {
    cls: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-400/10 dark:text-sky-100",
    bm: "Untuk pakej gabungan bulanan",
    zh: "进月结合并单",
    en: "For the monthly consolidated pack",
  },
  individual_required: {
    cls: "border-orange-300 bg-orange-50 text-orange-900 dark:bg-orange-400/10 dark:text-orange-100",
    bm: "Perlu e-invois individu",
    zh: "需要单张 e-invois",
    en: "Needs its own e-invoice",
  },
  exported: {
    cls: "border-green-300 bg-green-50 text-green-900 dark:bg-green-400/10 dark:text-green-100",
    bm: "Dalam fail MyInvois yang dijana",
    zh: "已进生成的 MyInvois 档",
    en: "In a generated MyInvois file",
  },
  submitted: {
    cls: "border-green-400 bg-green-100 text-green-900 dark:bg-green-400/15 dark:text-green-100",
    bm: "Bendahari telah merekodkan muat naik",
    zh: "财政已记录上传",
    en: "Treasurer recorded the upload",
  },
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
    filingRoster,
    evRows,
    evBusy,
    evError,
    findEventsInMinutes,
    confirmEvent,
  } = useMinutes();

  const router = useRouter();
  const t = useTriText();
  const [einvoisVisible] = useEinvoisVisible();
  // §4-①: the "tidy into standard format" pass only makes sense on a document
  // that HAS a structure to keep (a printed/typed minit read by G1).
  const hasStructure = useMemo(
    () => minutesStructure(extraction) !== null,
    [extraction],
  );

  // e-INVOIS AUDIT TRAIL (work order 94). Every judgement here is arithmetic
  // over values a human already confirmed — no vendor call, nothing invented.
  //
  // 🔴 committeeApprovalLimitCents is null ON PURPOSE. The society's spending
  // ceiling lives in its OWN constitution, and this store does not carry the
  // confirmed clauses, so no approval-limit finding can be raised from this
  // screen yet. null means the check is SKIPPED — never that the limit is
  // zero, and never a made-up national figure (there is no such number).
  // To switch the check on, load the org's clauses, run
  // findCommitteeSpendingLimit() from @/lib/einvois-governance, and pass
  // { limitCents, clause.clause_no } through here.
  const financialRows = useMemo(() => {
    const rows = extraction.financial_resolutions ?? [];
    return rows.map((row) => {
      const vendorName = row.vendor_name.value;
      const amountCents = row.approved_amount_cents.value;
      const { status, findings } = checkFinancialResolution({
        resolution: {
          vendorName,
          approvedAmountCents: amountCents,
          purpose: row.purpose.value,
        },
        committeeApprovalLimitCents: null,
        einvoisEnabled: einvoisVisible,
      });
      return { vendorName, amountCents, purpose: row.purpose.value, status, findings };
    });
  }, [extraction.financial_resolutions, einvoisVisible]);

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

  // §2 (work order 116, J 8/31): the ORDINARY WORDS the guard flagged —
  // 助学金, 上年结存, 收入, 支出, 银行, 散会 — are settled society and
  // book-keeping vocabulary, not names. A fixed table swaps them for free,
  // exactly, inventing nothing, and CANNOT touch a person's name because a
  // name is not in the table. The roster's names, the org's registered name
  // and the signer are blanked before matching so a term sitting inside a
  // name can never claim it. Whatever is still flagged afterwards really is
  // a name, which is what the IC-name inputs below are for.
  const termSubs = useMemo(
    () =>
      bmOffenders.length > 0
        ? glossaryTermSubstitutions(shownDocument, [
            ...filingRoster.map((m) => m.name),
            documentOrgName,
            documentSigner,
          ])
        : [],
    [bmOffenders.length, shownDocument, filingRoster, documentOrgName, documentSigner],
  );

  // §2 second pass (116, J 8/31): the flagged list mixed two jobs. Money
  // lines (助学金, 上年结存, 收入:会员) sat next to real names (叶俊成,
  // 何淑仪, 苏明伟), every one of them asking a human for "the spelling on the
  // identity card". The glossary lines are now folded behind the button and
  // the table keeps only what a person genuinely has to spell — keyed on the
  // Chinese RUN, not the line, so filling in a name no longer replaces the
  // whole sentence it sits in.
  const split = useMemo(
    () =>
      splitFlaggedLines(bmOffenders, termSubs, [documentOrgName, documentSigner]),
    [bmOffenders, termSubs, documentOrgName, documentSigner],
  );

  // ⑦(c) (work order 89, J 8/30): the flagged lines are a MAPPING TABLE now,
  // not a list to stare at — each row shows the line, an input for what
  // should stand in its place (pre-filled from the roster when the roster
  // knows), and ONE button applies every filled row as plain string
  // replacement. Zero AI, nothing invented: what the person typed is what
  // lands. A row the roster did not know offers "add them to the roster"
  // (pre-filled) so next time the swap is automatic.
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const rosterFor = (snippet: string) =>
    nameSubs.find((s) => s.from === snippet.trim()) ?? null;
  const mappedValue = (snippet: string) =>
    nameMap[snippet] ?? rosterFor(snippet)?.to ?? "";
  const filledRows = split.nameTokens
    .map((s) => ({ from: s, to: mappedValue(s).trim() }))
    .filter((r) => r.to !== "" && r.to !== r.from);

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
      {/* §2 (work order 105): the two layers, above the Malay filing copy.
          「正式版」is the readable arrangement of what the paper says;
          「原文（逐字）」is what the paper says. The filing document below is
          built from the verbatim layer, as it always was. */}
      <TidyView extraction={extraction} enabled={!nothingYet} />

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
                  onClick={() => writeWithAi()}
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
                {/* §4-① (work order 100): a structured document assembles
                    free — this button is the PAID pass that expands
                    shorthand into standard minit prose (速記展開), guards
                    unchanged. The price is on the button (house rule). */}
                {hasStructure && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => writeWithAi(true)}
                    disabled={draftBusy}
                  >
                    ✨{" "}
                    <Tri
                      bm="Kemas ke format standard (1 tindakan AI)"
                      zh="整理成标准版式（用 1 次 AI 额度）"
                      en="Tidy into the standard format (1 AI action)"
                    />
                  </Button>
                )}
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
                // §3 (109, J: 「step 3 的文件框…它是這頁的主角，
                // 給它主要的高度」): a fixed 22 rows is a small box on a
                // large screen and a fair one on a laptop. The floor is now
                // most of the window, so the document a person came here to
                // read is the biggest thing on the page at any size.
                className="min-h-[60dvh] w-full rounded-md border-2 border-input bg-white/80 p-4 text-base leading-relaxed dark:bg-white/5"
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
            <pre className="min-h-[60dvh] rounded-md border-2 border-input bg-white/80 p-4 text-base whitespace-pre-wrap dark:bg-white/5">
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
                {/* §2 second pass (116): say which part is MinitAI's job and
                    which part is the reader's, before showing either. */}
                {split.termOnly.length > 0 && (
                  <p className="text-sm font-medium text-red-900/90 dark:text-red-100/90">
                    <Tri
                      bm={`${split.termOnly.length} baris ialah perkataan biasa — MinitAI boleh isi sendiri dengan butang di bawah (percuma).`}
                      zh={`其中 ${split.termOnly.length} 行是普通词语 —— 下面那颗按钮一键填好（免费）。`}
                      en={`${split.termOnly.length} of them are ordinary words — the button below fills those in for free.`}
                    />
                  </p>
                )}
                {split.nameTokens.length > 0 && (
                  <p className="text-sm text-red-900/80 dark:text-red-100/80">
                    <Tri
                      bm={`${split.nameTokens.length} nama perlu ejaan anda — salin daripada kad pengenalan, jangan transliterasi sendiri. Tekan mana-mana nama untuk mencarinya dalam dokumen.`}
                      zh={`有 ${split.nameTokens.length} 个名字要您来写 —— 请照身份证上的写法抄，不要自己音译。点名字就能在文件里找到它。`}
                      en={`${split.nameTokens.length} name(s) need your spelling — copy it from the identity card, never transliterate. Tap a name to find it in the document.`}
                    />
                  </p>
                )}
                {/* Third pass (116 §2): ordinary Chinese that the glossary
                    does not know is NOT a name. Show it so nothing is hidden,
                    but never ask for an identity card against a clause — the
                    BM rewrite below is what finishes these. */}
                {split.proseTokens.length > 0 && (
                  <p className="text-sm text-red-900/80 dark:text-red-100/80">
                    <Tri
                      bm={`${split.proseTokens.length} lagi ialah perkataan biasa yang tiada dalam senarai (${split.proseTokens.slice(0, 4).join("、")}${split.proseTokens.length > 4 ? "…" : ""}) — butang "biar AI tulis versi BM" di bawah akan menyelesaikannya. Ia bukan nama, jadi tiada apa untuk anda isi.`}
                      zh={`另外 ${split.proseTokens.length} 个是词汇表里没有的普通词语（${split.proseTokens.slice(0, 4).join("、")}${split.proseTokens.length > 4 ? "…" : ""}）—— 下面「让 AI 译成正式马来文」那颗按钮会处理。它们不是名字，您不用填。`}
                      en={`Another ${split.proseTokens.length} are ordinary words the table does not know (${split.proseTokens.slice(0, 4).join(", ")}${split.proseTokens.length > 4 ? "…" : ""}) — the "let the AI write the BM version" button below finishes those. They are not names, so there is nothing for you to fill in.`}
                    />
                  </p>
                )}
                {/* ⑦(c): line → what stands in — the in-place mapping table. */}
                <div
                  className="flex max-h-72 flex-col gap-2 overflow-y-auto"
                  data-probe="bm-name-map"
                >
                  {split.nameTokens.map((s) => {
                    const fromRoster = rosterFor(s);
                    const value = mappedValue(s);
                    return (
                      <div key={s} className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => locateInDocument(s)}
                          className="max-w-full truncate text-left text-sm text-red-900/90 underline-offset-4 hover:underline dark:text-red-100/90"
                          title={s}
                        >
                          {/* 97 §2: the characters that TRIGGERED the guard
                              are painted, so nobody plays spot-the-difference
                              with a line that looks fully BM. */}
                          · {cjkSegments(s).map((seg, i) =>
                            seg.cjk ? (
                              <mark
                                key={i}
                                className="rounded-xs bg-red-200 px-0.5 font-bold text-red-950 dark:bg-red-500/40 dark:text-red-50"
                              >
                                {seg.text}
                              </mark>
                            ) : (
                              <span key={i}>{seg.text}</span>
                            ),
                          )}
                        </button>
                        <span aria-hidden className="text-red-900/60 dark:text-red-100/60">→</span>
                        <input
                          value={value}
                          onChange={(e) =>
                            setNameMap((m) => ({ ...m, [s]: e.target.value }))
                          }
                          placeholder={t(
                            "nama seperti dalam kad pengenalan",
                            "身份证上的写法",
                            "the spelling on the identity card",
                          )}
                          className="min-w-[12rem] flex-1 rounded-sm border border-red-300 bg-white/80 px-2 py-1 text-sm dark:bg-white/10"
                        />
                        {fromRoster && (
                          <span className="rounded-xs bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-400/15 dark:text-green-200">
                            <Tri bm="dari senarai AJK" zh="名册里有" en="from the roster" />
                            {fromRoster.count > 1 ? ` ×${fromRoster.count}` : ""}
                          </span>
                        )}
                        {!fromRoster && value.trim() !== "" && (
                          <Link
                            href={`/members?tambah_nama=${encodeURIComponent(s)}&tambah_ic=${encodeURIComponent(value.trim())}`}
                            className="text-xs underline underline-offset-4"
                          >
                            ＋{" "}
                            <Tri
                              bm="tambah ke senarai AJK"
                              zh="要不要加进名册？"
                              en="add to the roster"
                            />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
                {termSubs.length > 0 && (
                  <div>
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-green-500"
                      onClick={() =>
                        setEdited(
                          applyNameSubstitutions(
                            shownDocument,
                            termSubs.map((r) => ({ ...r, count: 0 })),
                          ),
                        )
                      }
                    >
                      ✓{" "}
                      <Tri
                        bm={`Isikan ${termSubs.length} perkataan biasa dalam BM (bukan AI, percuma) — nama orang tidak disentuh`}
                        zh={`一键填好这 ${termSubs.length} 个普通词语的马来文（不用 AI，免费）—— 人名不会被动`}
                        en={`Fill in ${termSubs.length} ordinary word${termSubs.length > 1 ? "s" : ""} in BM (no AI, free) — names are not touched`}
                      />
                    </Button>
                  </div>
                )}
                {filledRows.length > 0 && (
                  <div>
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-green-500"
                      onClick={() =>
                        setEdited(
                          applyNameSubstitutions(
                            shownDocument,
                            filledRows.map((r) => ({ ...r, count: 0 })),
                          ),
                        )
                      }
                    >
                      ✓{" "}
                      <Tri
                        bm={`Gantikan ${filledRows.length} baris (bukan AI, percuma)`}
                        zh={`一键套用这 ${filledRows.length} 行（不用 AI，免费）`}
                        en={`Apply ${filledRows.length} row${filledRows.length > 1 ? "s" : ""} (no AI, free)`}
                      />
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="lg" onClick={() => writeWithAi()} disabled={draftBusy}>
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
              {/* D3 (拍板 9): saved → the question. The full guide (all nine
                  eROSES steps, every value with a COPY button) lives on its
                  own page. */}
              {savedDocId !== null && (
                <p className="rounded-md border-2 border-[#a855f7]/40 bg-purple-50/60 p-3 text-base font-medium dark:bg-purple-400/10">
                  🏛️{" "}
                  <Tri
                    bm="Mahu failkan ke eROSES?"
                    zh="要呈报 eROSES 吗？"
                    en="File this to eROSES?"
                  />{" "}
                  <Link
                    href={`/filings/eroses?doc=${savedDocId}`}
                    className="underline underline-offset-4"
                  >
                    <Tri
                      bm="Panduan langkah demi langkah"
                      zh="一步一步带你填"
                      en="Step-by-step guide"
                    />{" "}
                    →
                  </Link>
                </p>
              )}
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

      {/* --- e-INVOIS AUDIT TRAIL (work order 94) ---------------------------
          Money this meeting approved, and where each approval stands on the
          way to the treasurer's MyInvois upload. Hidden entirely when the
          organisation has not switched e-Invois on, and when the meeting
          approved no money — an empty compliance panel on a page about a
          social gathering is noise. */}
      {einvoisVisible && financialRows.length > 0 && (
        <PageSection
          titleBm="Kelulusan wang & status e-Invois"
          titleZh="批款与 e-Invois 状态"
          titleEn="Money approved & e-Invois status"
          summary={
            <>
              {/* D49: this panel is part of the e-Invois beta — only the
                  operator ever sees it, and it says so. */}
              <span className="mr-2 inline-flex align-middle">
                <EinvoisBetaBadge />
              </span>
              <Tri
                bm="Setiap kelulusan wang dalam minit ini, dan di mana ia berada dalam laluan audit. MinitAI mengira status ini daripada jumlah yang anda sahkan — ia tidak menghantar apa-apa kepada LHDN."
                zh="这份记录里每一笔批款，以及它走到审计链的哪一步。状态是 MinitAI 根据您确认的金额算出来的 —— 我们不会替您送去 LHDN。"
                en="Every money approval in these minutes, and where it sits on the audit trail. MinitAI works these out from the amounts you confirmed — it does not send anything to LHDN."
              />
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {financialRows.map((row, i) => {
              const badge = AUDIT_BADGE[row.status];
              return (
                <div key={i} className="rounded-sm border bg-background p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-40 flex-1">
                      <div className="font-medium">
                        {row.vendorName || (
                          <em className="text-muted-foreground">
                            <Tri bm="penerima tidak dinyatakan" zh="没写收款方" en="no payee named" />
                          </em>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {row.amountCents === null ? (
                          <Tri bm="jumlah tidak terbaca" zh="金额读不出" en="amount unreadable" />
                        ) : (
                          formatRm(row.amountCents)
                        )}
                        {row.purpose && ` · ${row.purpose}`}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${badge.cls}`}
                    >
                      {t(badge.bm, badge.zh, badge.en)}
                    </span>
                  </div>
                  {row.findings.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-2 border-t pt-2">
                      {row.findings.map((f) => (
                        <li key={f.code} className="text-sm">
                          <span className="mr-1">⚠️</span>
                          {t(f.message.bm, f.message.zh, f.message.en)}
                          {f.basis && (
                            <span className="block text-muted-foreground">
                              {t(f.basis.bm, f.basis.zh, f.basis.en)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <p className="text-sm text-muted-foreground">
              <Tri
                bm="MinitAI menyediakan fail untuk dimuat naik ke Portal MyInvois oleh bendahari. Ia tidak berhubung terus dengan LHDN, jadi ia tidak boleh mengesahkan apa yang LHDN terima."
                zh="MinitAI 只准备档案给财政上传到 MyInvois Portal。我们没有直连 LHDN，所以无法确认 LHDN 那边收到什么。"
                en="MinitAI prepares the file for the treasurer to upload to the MyInvois Portal. It has no direct link to LHDN, so it cannot confirm what LHDN received."
              />
            </p>
          </div>
        </PageSection>
      )}

      {/* D3 (work order 56, 拍板 9): the "values to paste into eROSES" block
          that used to live HERE moved to /filings/eroses — the step-by-step
          guide asked for AFTER the document is saved, where the whole return
          (not just this meeting's values) is walked through. */}

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
