"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import { MINUTES_LANGUAGES, type MinutesLang } from "@/lib/minutes-lang";
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
  zh: "华语 / 中文",
  en: "English",
};

export function MinutesDocument() {
  const {
    extraction,
    isReal,
    isSample,
    nothingYet,
    typedByHand,
    allReviewed,
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
    saveToHistory,
    pastePack,
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
      bm="Ambil gambar nota mesyuarat dahulu. Minit tidak menulis dokumen rasmi daripada halaman yang kosong."
      zh="请先拍下会议笔记。空白的内容，Minit 不会拿去写正式文件。"
      en="Take a photo of the notes first. Minit does not write an official document from an empty page."
    />
  ) : !allReviewed ? (
    // D-4: "still to be CHECKED" is review language. Somebody typing has
    // nothing to check — they have blanks to fill.
    typedByHand ? (
      <Tri
        bm={`Masih ada ${outstanding} perkara belum diisi. Minit tidak akan menulis dokumen rasmi daripada borang yang belum lengkap.`}
        zh={`还有 ${outstanding} 项没填。还没填完的内容，Minit 不会拿去写正式文件。`}
        en={`${outstanding} item(s) still to fill in. Minit will not write an official document from an unfinished form.`}
      />
    ) : (
      <Tri
        bm={`Masih ada ${outstanding} perkara untuk disemak. Minit tidak akan menulis dokumen rasmi daripada maklumat yang belum anda sahkan.`}
        zh={`还有 ${outstanding} 项要核对。您还没确认的内容，Minit 不会拿去写正式文件。`}
        en={`${outstanding} item(s) still need checking. Minit will not write an official document from anything you have not confirmed.`}
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
            bm="Minit menulis dokumen rasmi dalam Bahasa Malaysia daripada perkara yang anda sahkan. Baca sekali, kemudian simpan."
            zh="Minit 会用您确认过的内容，写成马来文的正式文件。看一遍，然后保存。"
            en="Minit writes the official Malay document from what you confirmed. Read it once, then save."
          />
        }
      >
        {notReady ? (
          <>
            <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
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
                bm="Minit telah menyusun perkara yang anda sahkan menjadi dokumen rasmi dalam Bahasa Malaysia. Sila baca sekali sebelum simpan."
                zh="Minit 已经把您确认的内容整理成马来文的正式文件。保存前请看一遍。"
                en="Minit has organised what you confirmed into the formal Malay document. Please read it once before saving."
              />
            ) : allReviewed ? (
              <Tri
                bm="Ini paparan ringkas — perkara anda mengikut susunan asal nota. Tekan butang di bawah dan Minit akan menyusunnya menjadi dokumen rasmi Bahasa Malaysia."
                zh="这只是快速预览 —— 内容还是照笔记原本的顺序排。按下面的按钮，Minit 会把它整理成正式的马来文文件。"
                en="This is the quick preview — your items in the order they were written. Tap the button below and Minit will organise them into the formal Malay document."
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
                      "rounded-xl border-2 px-4 py-2 text-base transition " +
                      (docLang === code
                        ? "border-[#7c6cf5] bg-[#7c6cf5]/10 font-semibold"
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
                      bm="Minit sedang menulis…"
                      zh="Minit 正在写…"
                      en="Minit is writing…"
                    />
                  ) : aiDraft ? (
                    <Tri bm="Tulis semula" zh="重写一次" en="Write it again" />
                  ) : (
                    <Tri
                      bm="✍️ Minta Minit tulis dokumen rasmi"
                      zh="✍️ 让 Minit 写成正式记录"
                      en="✍️ Have Minit write the official document"
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
              {draftError && (
                <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
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
              <textarea
                id="minutes-document"
                value={shownDocument}
                onChange={(e) =>
                  setEdited(e.target.value)
                }
                spellCheck={false}
                rows={22}
                className="w-full rounded-xl border-2 border-input bg-white/80 p-4 text-base leading-relaxed dark:bg-white/5"
              />
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Baris tajuk dan baris audit sentiasa ditulis semula oleh Minit semasa menyimpan, jadi nama pertubuhan dan nama pengesah tidak boleh salah."
                  zh="抬头那一行和最下面的审计行，保存时 Minit 一定会重写一次 —— 机构名和确认人不会写错。"
                  en="The letterhead and the audit line are always rewritten by Minit when you save, so the organisation and the confirming name cannot be wrong."
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
            </div>
          ) : (
            <pre className="rounded-xl border-2 border-input bg-white/80 p-4 text-base whitespace-pre-wrap dark:bg-white/5">
              {shownDocument}
            </pre>
          )}
          <div className="flex flex-col gap-3">
            {isSample && (
              <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Ini contoh — tidak boleh disimpan ke sejarah pertubuhan anda. Ambil gambar nota anda dahulu."
                  zh="这是示范内容，不能保存到您机构的历史。请先拍下您自己的笔记。"
                  en="This is the example — it cannot be saved into your organisation's history. Take a photo of your own notes first."
                />
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={saveToHistory}
                // Neither the example nor an empty page may enter a real
                // organisation's audit trail — hence isReal, not !isSample.
                // `alreadySaved`: THIS document is stored; a second press
                // must not store it twice (S0-3 — found by e2e-minutes.mjs).
                // Editing anything unlocks the button again.
                disabled={!allReviewed || saveBusy || !isReal || alreadySaved}
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
          {saveResult === "ok" && (
            <>
              <p className="rounded-xl border-2 border-green-400 bg-green-50 p-3 text-base font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
                ✓{" "}
                <Tri
                  bm="Minit disimpan ke sejarah pertubuhan."
                  zh="会议记录已经保存到机构的历史里了。"
                  en="The minutes are saved in the organisation's history."
                />
              </p>
            </>
          )}
          {saveResult && saveResult !== "ok" && (
            <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
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
          <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
            {notReady}
          </p>
        ) : (
        <div>
          <p className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            ⚠{" "}
            <Tri
              bm="Semak nama medan dengan portal sebenar sebelum menghantar. Nama medan di laman ROS boleh berubah."
              zh="送出前请先跟正式网站上的栏位名称核对一次。ROS 网站上的栏位名称有可能改动。"
              en="Check the field names against the live portal before you submit — the names on the ROS site can change."
            />
          </p>
          <div className="grid gap-3">
            {pastePack.map((row) => (
              <div key={row.erosesField} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.erosesField}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.erosesFieldEn}
                    </div>
                  </div>
                  <ConfidenceBadge level={row.confidence} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
            bm="Kalau mesyuarat menyebut tarikh akan datang, Minit boleh masukkannya ke kalendar untuk anda. Pilihan sahaja."
            zh="如果会议里提到将来的日期，Minit 可以帮您加进日历。这一步可以不做。"
            en="If the meeting mentioned a future date, Minit can put it in your calendar. Optional."
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
            className={`flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 ${
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
