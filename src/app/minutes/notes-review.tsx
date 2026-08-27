"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { StepGroup } from "@/components/step-card";
import { NextStepLink, PageSection } from "@/components/page-section";
import { PageThumbs } from "@/components/page-thumbs";
import { PdpaNote } from "@/components/pdpa-note";
import { HowItWorksButton } from "@/app/how-it-works";
import { formatDateLong, isIsoDate } from "@/lib/date-input";
import type { KnownMeetingFacts } from "@/lib/meeting-facts";
import { MEETING_TYPES, meetingTypeUiLabelTri } from "@/lib/meeting-types";
import { formatRm } from "@/lib/minutes-draft";
import { parseRmToCents } from "@/lib/receipts";
import { BeforeReading } from "./before-reading";
import { FieldRow } from "./field-row";
import { AddRowButton, DeletableRow } from "./row-controls";
import { useMinutes, type TextLikeField } from "./minutes-store";

// ---------------------------------------------------------------------------
// /minutes — take a photo of the handwritten notes, then check what Minit read.
//
// WHO ATTENDED is NOT here: a hundred attendees is a hundred rows, and it used
// to sit in the MIDDLE of this list, so everything after it — what was decided,
// the money, the office bearers — was below a wall of names. It has a page of
// its own now (/minutes/attendance).
//
// This was StepCards 1 and 2 of a 2039-line page, before the 2026-08-23 split.
// ---------------------------------------------------------------------------

export function NotesReview() {
  const t = useTriText();
  /**
   * The file somebody has chosen but not yet sent.
   *
   * There is now a step between choosing and reading — three optional boxes for
   * what the person already knows (see before-reading.tsx). Two reasons, both
   * J's own: 「想 type 跟他说这是什么会议没办法」, and the one no prompt can fix —
   * a whiteboard carries the meeting's date AND the date of the event it agreed
   * to hold, and on the board they look identical.
   */
  const [pending, setPending] = useState<File | null>(null);
  /**
   * 0-1 (26 号报告 2-1): a photo taken while the workspace still shows a
   * meeting that is ALREADY SAVED to History. Before this question existed,
   * next month's photo silently merged into last month's saved meeting — the
   * old confirmed date and venue overrode the new page's, the save gate
   * stayed green, and a July-dated document with August content walked
   * straight into History. The file and typed facts wait here until the
   * person answers "same meeting, or a new one?".
   */
  const [askWhichMeeting, setAskWhichMeeting] = useState<{
    file: File;
    facts: KnownMeetingFacts;
  } | null>(null);
  /**
   * D-1 (work order 31, 客⑭): after a save, /minutes shows a clean "saved"
   * card instead of the whole review wall wearing green ticks. This flag is
   * the small way back IN — for adding a page to the saved meeting or fixing
   * something — and it deliberately does not persist: a fresh visit to a
   * saved workspace should always start at the card.
   */
  const [reopenSaved, setReopenSaved] = useState(false);
  const {
    sourceLabel,
    photoPages,
    aiBusy,
    aiError,
    nothingYet,
    isReal,
    minutesDraft,
    allReviewed,
    attendanceUnsettled,
    checkOutstanding,
    missingOutstanding,
    confirmAllChecks,
    outstandingHereOutsideAttendance,
    groups,
    firstUnfinishedHere,
    extraction,
    updateField,
    confirmField: confirm,
    editField: edit,
    markAbsent,
    addExtractionRow,
    removeExtractionRow,
    rowHasContent,
    onPhotoPicked,
    startTyping,
    typedByHand,
    mixedInput,
    openSample,
    backToEmpty,
    alreadySaved,
  } = useMinutes();

  // D-4: has the typist actually entered anything yet? Decides when the
  // document preview earns its place in typing mode — a preview of an empty
  // page helps nobody and buries the form it is telling the person to fill.
  const anythingTyped =
    extraction.meeting_type.value !== "" ||
    extraction.meeting_date.value !== "" ||
    extraction.meeting_venue.value !== "" ||
    extraction.attendees.some((a) => a.name.value !== "") ||
    extraction.resolutions.some((r) => r.text.value !== "") ||
    extraction.figures.some(
      (f) => f.description.value !== "" || f.amount_cents.value !== null,
    ) ||
    extraction.office_bearers.some(
      (b) => b.position.value !== "" || b.person_name.value !== "",
    );

  // The "Your document" hero. One definition, two positions: the photo flow
  // shows it FIRST (the person's document is the point, R-4), the typing flow
  // shows it AFTER the form and only once there is content (D-4).
  const documentPreview = isReal && !aiBusy && (!typedByHand || anythingTyped) && (
    <PageSection
      titleBm="Dokumen anda"
      titleZh="您的文件"
      titleEn="Your document"
      summary={
        allReviewed && !attendanceUnsettled ? (
          <Tri
            bm="Semua sudah disemak. Teruskan ke dokumen siap untuk simpan."
            zh="全部核对好了。到「做好的文件」那一页去确认保存。"
            en="Everything is checked. Go on to the finished document to save it."
          />
        ) : typedByHand ? (
          <Tri
            bm="Ini pratonton. Setiap perkara yang anda isi akan muncul di sini."
            zh="这是预览。您每填好一项，都会出现在这份文件里。"
            en="This is a preview. Everything you fill in appears here."
          />
        ) : (
          <Tri
            bm="Ini pratonton. Hanya perkara BERTANDA KUNING perlu anda sentuh — yang hijau sudah pasti."
            zh="这是预览。只有「黄色标记」的地方需要您看 —— 绿色的已经确定了。"
            en="This is a preview. Only the AMBER items need you — the green ones are settled."
          />
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-xl border border-[color:var(--v2-border)]">
          {!(allReviewed && !attendanceUnsettled) && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            >
              <span className="rotate-[-18deg] select-none rounded border-4 border-red-400/50 px-6 py-2 text-4xl font-black tracking-widest text-red-500/40">
                DRAF
              </span>
            </span>
          )}
          <pre className="v2-scroll max-h-96 overflow-auto whitespace-pre-wrap bg-[color:var(--v2-card)] p-4 text-sm leading-relaxed">
            {minutesDraft}
          </pre>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {checkOutstanding > 0 && (
            <Button size="lg" className="text-base" onClick={confirmAllChecks}>
              ✓{" "}
              <Tri
                bm={`Semuanya betul — sahkan ${checkOutstanding} perkara kuning`}
                zh={`全部没问题 —— 一键确认 ${checkOutstanding} 个黄标`}
                en={`All fine — confirm ${checkOutstanding} amber item${checkOutstanding > 1 ? "s" : ""}`}
              />
            </Button>
          )}
          {missingOutstanding > 0 && (
            <span className="rounded-full bg-rose-100 px-3 py-1.5 text-sm font-semibold text-rose-900 dark:bg-rose-400/15 dark:text-rose-200">
              {/* D-4: "N items unreadable" is the truth about a photo and a
                  lie about typing — nothing was read at all.
                  I-3: and a lie about a MIXED document too — those fields were
                  never in the photo; neutral wording instead. */}
              {typedByHand || mixedInput ? (
                <Tri
                  bm={`Sila isi ${missingOutstanding} perkara lagi — di bawah`}
                  zh={`请再填 ${missingOutstanding} 项 —— 在下面`}
                  en={`Please fill in ${missingOutstanding} more item${missingOutstanding > 1 ? "s" : ""} — below`}
                />
              ) : (
                <Tri
                  bm={`${missingOutstanding} perkara tidak terbaca — isi di bawah`}
                  zh={`${missingOutstanding} 项没读到 —— 请在下面补上`}
                  en={`${missingOutstanding} item${missingOutstanding > 1 ? "s" : ""} unreadable — fill in below`}
                />
              )}
            </span>
          )}
        </div>

        {allReviewed && !attendanceUnsettled && (
          <NextStepLink
            href="/minutes/document"
            labelBm="Ke dokumen siap — sahkan & simpan"
            labelZh="去做好的文件 —— 确认并保存"
            labelEn="To the finished document — confirm & save"
          />
        )}
      </div>
    </PageSection>
  );

  // D-1: the clean completion card. The whole review UI (fields, preview,
  // green ticks) stays out of sight until the person explicitly reopens it.
  if (alreadySaved && !reopenSaved) {
    return (
      <PageSection
        titleBm="Mesyuarat sebelum ini sudah disimpan ✓"
        titleZh="上一场已存好 ✓"
        titleEn="The last meeting is saved ✓"
        summary={
          <Tri
            bm="Ia selamat dalam Sejarah pertubuhan anda. Halaman kerja ini sedia untuk mesyuarat yang seterusnya."
            zh="它已经安全存进机构的「历史」里了。这个工作区随时可以开始记下一场。"
            en="It is safe in your organisation's History. This workspace is ready for the next meeting."
          />
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={backToEmpty}>
            <Tri
              bm="Mula mesyuarat baharu"
              zh="开始新的会议"
              en="Start a new meeting"
            />
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/minutes/document">
              <Tri
                bm="Lihat dokumen yang siap"
                zh="查看做好的文件"
                en="See the finished document"
              />
            </Link>
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setReopenSaved(true)}
          className="self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          <Tri
            bm="Perlu betulkan sesuatu atau tambah halaman untuk mesyuarat itu? Buka semula ruang kerja"
            zh="要修改内容、或补拍同一场会议的另一页？重新打开工作区"
            en="Need to fix something, or add another page of that meeting? Reopen the workspace"
          />
        </button>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection
        step={1}
        titleBm="Ambil gambar nota mesyuarat"
        titleZh="拍下手写的会议笔记"
        titleEn="Photo of your meeting notes"
        summary={
          sourceLabel ? (
            <>📄 {sourceLabel}</>
          ) : typedByHand ? (
            <Tri
              bm="Ditaip sendiri — tiada gambar. Isi setiap perkara di bawah."
              zh="自己打字的 —— 没有照片。请在下面把每一项填好。"
              en="Typed in by hand — no photo. Fill in each item below."
            />
          ) : (
            <Tri
              bm="Gambar atau PDF (paling banyak 5 muka surat). Minit membaca tulisan tangan Bahasa Malaysia, Cina dan Inggeris. Atau taip sendiri."
              zh="照片或 PDF（最多 5 页）。Minit 能读马来文、中文和英文的手写字。也可以自己打字。"
              en="A photo or a PDF (up to 5 pages). Minit reads handwriting in Malay, Chinese and English. Or type it in yourself."
            />
          )
        }
      >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 text-base font-semibold text-white ${
              aiBusy
                ? "cursor-wait bg-muted-foreground"
                : "v2-pill bg-gradient-to-r from-[#5b4bd6] to-[#6f5ef2] shadow-[0_10px_26px_-10px_rgba(124,108,245,0.8)]"
            }`}
          >
            {aiBusy ? (
              <>
                ⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" />
              </>
            ) : (
              <>
                📷 <Tri bm="Ambil gambar" zh="拍照" en="Take a photo" />
              </>
            )}
            {/* THE CAMERA. `capture` and `accept="image/*"` belong together and
                nowhere else: on a phone, `capture` opens the camera directly,
                which is the whole point here — and which is also why a PDF can
                never be chosen through this input, whatever `accept` says. That
                is the trap. Adding "application/pdf" to a capture input on
                2026-08-23 made the label promise something a phone cannot do.
                Two inputs, like src/app/ask-box.tsx already had. */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={aiBusy}
              onChange={(e) => {
                setPending(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>

          {/* THE FILE. No `capture`, so this opens the file picker on every
              platform and a scanned PDF is reachable. Until 2026-08-23 the same
              page of minutes was accepted from a phone and refused from a
              scanner; the route counts pages before charging (5 for minutes),
              so a 40-page scan is turned away with a reason instead of a bill. */}
          {!aiBusy && (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--v2-border)] px-5 text-base font-medium hover:bg-accent">
              📄{" "}
              <Tri
                bm="Pilih fail (gambar atau PDF)"
                zh="选一个档案（照片或 PDF）"
                en="Choose a file (photo or PDF)"
              />
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  setPending(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {/* J's UX list N1: Minit only took photos. Typing costs no credit, no
              upload and no model — and it is the answer when the photo will not
              read, when the notes are already on a laptop, or when four people
              met in a kopitiam and nobody wrote anything down. */}
          {!typedByHand && !sourceLabel && !aiBusy && (
            <Button
              variant="outline"
              size="lg"
              onClick={startTyping}
            >
              ⌨️{" "}
              <Tri
                bm="Taip sendiri, tanpa gambar"
                zh="不用照片，自己打字"
                en="Type it in, no photo"
              />
            </Button>
          )}
          {(sourceLabel || typedByHand) && !aiBusy && (
            <Button
              variant="outline"
              onClick={() => {
                // This DISCARDS the user's uploaded extraction. It used to be
                // a quiet ghost button with no confirmation, while the
                // harmless actions did confirm. (2026-07-28 audit.)
                const ok = window.confirm(
                  t(
                    "Buang kerja ini dan mula semula? Medan yang anda semak akan hilang dan tidak boleh dikembalikan.",
                    "要丢掉这份记录、重新开始吗？您核对过的栏位会消失，无法复原。",
                    "Discard this work and start again? The fields you reviewed will be lost and cannot be recovered.",
                  ),
                );
                if (!ok) return;
                backToEmpty();
              }}
            >
              <Tri
                bm="Buang & mula semula"
                zh="丢掉，重新开始"
                en="Discard & start again"
              />
            </Button>
          )}
        </div>
        {/* D-6 → F-10 (拍板 41): Word/Excel now goes through the HOME page's
            box, which converts it to text on the server (no AI charge for the
            conversion). This gate still takes photos/PDFs only, so keep the
            PDF workaround as the second half of the sentence. */}
        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Fail Word/Excel: masukkannya ke dalam kotak di halaman Utama — Minit membacanya terus. Di sini, sila simpan sebagai PDF dahulu (telefon: Kongsi → Cetak → Simpan sebagai PDF)."
            zh="Word/Excel 档：放进主页的框，Minit 可以直接读；在这一页则请先另存为 PDF（手机：分享 → 列印 → 存成 PDF）。"
            en="Word/Excel files: drop them in the Home page box — Minit reads them directly. Here, save as PDF first (on a phone: Share → Print → Save as PDF)."
          />
        </p>
        {/* The step between choosing a file and spending a credit on it. */}
        {pending && (
          <BeforeReading
            fileName={pending.name}
            busy={aiBusy}
            onCancel={() => setPending(null)}
            onRead={(facts) => {
              const file = pending;
              setPending(null);
              // 0-1: the workspace still shows a meeting that is already in
              // History — ask which meeting this photo belongs to BEFORE
              // reading, or last month's saved fields merge over this one's.
              if (alreadySaved) {
                setAskWhichMeeting({ file, facts });
                return;
              }
              void onPhotoPicked(file, facts);
            }}
          />
        )}
        {/* 0-1 (26 号报告 2-1): which meeting is this photo? */}
        {askWhichMeeting && !aiBusy && (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:bg-amber-400/10">
            <p className="text-base font-medium text-amber-900 dark:text-amber-100">
              <Tri
                bm="Mesyuarat di skrin ini sudah disimpan ke Sejarah. Gambar baharu ini —"
                zh="现在画面上的这场会议已经保存到历史了。这张新照片是 ——"
                en="The meeting on screen is already saved to History. This new photo is —"
              />
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => {
                  const a = askWhichMeeting;
                  setAskWhichMeeting(null);
                  // A new meeting: the workspace is replaced wholesale and the
                  // old meeting stays safe in History.
                  void onPhotoPicked(a.file, a.facts, "fresh");
                }}
              >
                <Tri
                  bm="Mesyuarat BAHARU — mula halaman bersih"
                  zh="新的一场会议 —— 开新的一份"
                  en="A NEW meeting — start a clean page"
                />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  const a = askWhichMeeting;
                  setAskWhichMeeting(null);
                  // Another page of the SAME meeting: the usual page-by-page
                  // merge. Editing re-opens saving, so the person can save the
                  // grown document again afterwards.
                  void onPhotoPicked(a.file, a.facts);
                }}
              >
                <Tri
                  bm="Halaman lagi untuk mesyuarat YANG SAMA"
                  zh="同一场会议的另一页 —— 加进来"
                  en="Another page of the SAME meeting"
                />
              </Button>
              <button
                type="button"
                className="text-base text-muted-foreground underline underline-offset-4"
                onClick={() => setAskWhichMeeting(null)}
              >
                <Tri bm="Batal" zh="先不要" en="Cancel" />
              </button>
            </div>
          </div>
        )}
        {aiError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
            {aiError}
          </div>
        )}
        {/* D-3 (work order 31, J #8): the same look-back the money review has —
            every uploaded page as a tappable thumbnail (shared page-thumbs.tsx),
            instead of a fold-out stack of full-size images. */}
        <PageThumbs pages={photoPages} />
        {/* 0-5 (2026-08-25): the old "use sample data until we go paid"
            warning dated from the free-tier days and had gone wrong — the API
            is on the PAID tier (J confirmed 8/25). Real data is allowed; what
            people deserve to know is in the shared PdpaNote. */}
        <PdpaNote />
        {/* Opt-in example. Deliberately quiet and LAST: someone holding their
            own notes should reach for the camera, not this. It exists so a
            first-timer (or a demo) can see what a finished page looks like. */}
        {nothingYet && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={openSample}
              className="self-start text-base text-muted-foreground underline underline-offset-4"
            >
              <Tri
                bm="Belum ada nota? Lihat contoh yang sudah siap"
                zh="还没有笔记？看一个做好的示范"
                en="No notes yet? See a worked example"
              />
            </button>
            {/* A-3: the walkthrough entry lives on the empty states too. */}
            <HowItWorksButton variant="link" />
          </div>
        )}
      </div>
      </PageSection>

      {/* -------------------------------------------------------------------
          R-4 (2026-08-25): THE HERO — the moment the AI finishes reading, the
          person sees their DOCUMENT, not a wall of fields. Unconfirmed = a
          visible DRAF watermark. Only the amber fields need a human; one tap
          says "all of it is fine". Red fields (nothing readable) still need
          typing or an explicit "not in the notes" below.

          D-4 (2026-08-25, J #6): NOT for typing mode. Somebody who chose
          "type it in" was greeted by an empty DRAF document and a red badge
          counting things "Minit could not read" — Minit had read nothing,
          there was nothing to preview, and the form was below the fold. In
          typing mode this section renders AFTER the fill-in form, and only
          once something has actually been typed. The photo flow is unchanged.
          ------------------------------------------------------------------- */}
      {!typedByHand && documentPreview}

      <PageSection
        step={2}
        titleBm={typedByHand ? "Isi butiran mesyuarat" : "Semak apa yang Minit baca"}
        titleZh={typedByHand ? "填写会议内容" : "核对 Minit 读到的内容"}
        titleEn={typedByHand ? "Fill in the meeting" : "Check what Minit read"}
        summary={
          typedByHand ? (
            /* Nothing was read, so there is nothing to agree or disagree with —
               "Correct / Edit / Not in the notes" is the wrong sentence for
               somebody starting from a blank sheet. */
            <Tri
              bm="Tekan “Ubah” pada setiap baris dan taip apa yang berlaku. Guna “Tambah” untuk baris baharu."
              zh="每一行按「修改」，把内容打进去。要多一行就按「自己加一行」。"
              en="Tap “Edit” on each row and type what happened. Use “Add” for a new row."
            />
          ) : (
            <Tri
              bm="Untuk setiap perkara: “Betul” kalau Minit baca dengan tepat, “Ubah” kalau salah, atau “Tiada dalam nota” kalau memang tidak ditulis."
              zh="每一项请按：读对了按「没错」，读错了按「修改」，笔记里本来就没写就按「笔记里没写」。"
              en="For each item: “Correct” if Minit read it right, “Edit” if not, or “Not in the notes” if it was never written down."
            />
          )
        }
      >
        {nothingYet ? (
          <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
            <Tri
              bm="Ambil gambar nota mesyuarat di atas dahulu — Minit hanya boleh menyemak perkara yang ia sudah baca."
              zh="请先在上面拍下会议笔记 —— Minit 只能核对它已经读到的内容。"
              en="Take a photo of the notes above first — Minit can only check what it has read."
            />
          </p>
        ) : (
          <div className="flex flex-col gap-3">
        <StepGroup
          titleBm="Maklumat mesyuarat"
          titleZh="会议基本资料"
          titleEn="Meeting details"
          outstanding={groups.meeting.outstanding}
          total={groups.meeting.total}
          defaultOpen={firstUnfinishedHere === "meeting"}
        >
          {/* The three boxes J filled in by hand on 2026-08-20. The type is a
              list and the date is a date picker because a box that cannot
              produce an illegal value is the only real fix; the labels say
              "MEETING date" and "MEETING venue" because "Date"/"Venue" next to
              an upload card is ambiguous — a whiteboard often carries the
              EVENT's date, not the meeting's. */}
          <FieldRow
            labelBm="Jenis mesyuarat"
            labelZh="会议类型"
            labelEn="Meeting type"
            field={extraction.meeting_type as unknown as TextLikeField}
            display={
              extraction.meeting_type.value === ""
                ? undefined
                : // G-4 (J #19): zh/EN interfaces carry the BM official name —
                  // it is the term on the government form. Documents keep the
                  // single-language meetingTypeLabel.
                  (() => {
                    const l = meetingTypeUiLabelTri(
                      extraction.meeting_type.value,
                      extraction.meeting_type_label,
                    );
                    return t(l.bm, l.zh, l.en);
                  })()
            }
            editor={{
              kind: "choice",
              choices: MEETING_TYPES.map((v) => ({
                value: v,
                label: t(
                  meetingTypeUiLabelTri(v).bm,
                  meetingTypeUiLabelTri(v).zh,
                  meetingTypeUiLabelTri(v).en,
                ),
              })),
            }}
            onConfirm={() =>
              updateField((e) => {
                confirm(e.meeting_type as unknown as TextLikeField);
                return e;
              })
            }
            onEdit={(v) =>
              updateField((e) => {
                edit(e.meeting_type as unknown as TextLikeField, v);
                // The society's own name belongs to "other" and nothing else.
                // Leaving it behind after switching to a real type would print
                // it on a document whose type no longer matches it.
                if (v !== "other") e.meeting_type_label = undefined;
                return e;
              })
            }
            onMarkAbsent={() =>
              updateField((e) => {
                markAbsent(e.meeting_type as unknown as TextLikeField);
                e.meeting_type_label = undefined;
                return e;
              })
            }
          />

          {extraction.meeting_type.value === "other" && (
            <div className="flex flex-col gap-1.5 border-b py-4">
              <span className="min-w-44 text-base font-semibold">
                <Tri
                  bm="Nama mesyuarat anda sendiri"
                  zh="你们自己的会议名称"
                  en="Your own name for this meeting"
                />
              </span>
              <input
                value={extraction.meeting_type_label ?? ""}
                maxLength={120}
                onChange={(ev) => {
                  const v = ev.target.value;
                  updateField((e) => {
                    e.meeting_type_label = v;
                    return e;
                  });
                }}
                placeholder={t(
                  "contohnya: Mesyuarat Ranting Muda",
                  "例如：青年组周会",
                  "for example: Youth Section weekly meeting",
                )}
                className="h-12 w-full max-w-md rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label="Your own name for this meeting"
              />
              <p className="text-base text-muted-foreground">
                <Tri
                  bm="Nama ini untuk dokumen pertubuhan anda sahaja. Ia tidak dihantar ke eROSES."
                  zh="这个名称只用在你们自己的文件上，不会送去 eROSES。"
                  en="This name is only for your own documents. It is never sent to eROSES."
                />
              </p>
            </div>
          )}

          <FieldRow
            labelBm="Tarikh mesyuarat"
            labelZh="会议日期"
            labelEn="Meeting date"
            field={extraction.meeting_date}
            editor={{ kind: "date" }}
            display={
              isIsoDate(extraction.meeting_date.value)
                ? t(
                    formatDateLong(extraction.meeting_date.value, "bm"),
                    formatDateLong(extraction.meeting_date.value, "zh"),
                    formatDateLong(extraction.meeting_date.value, "en"),
                  )
                : undefined
            }
            onConfirm={() =>
              updateField((e) => {
                confirm(e.meeting_date);
                return e;
              })
            }
            onEdit={(v) =>
              updateField((e) => {
                edit(e.meeting_date, v);
                return e;
              })
            }
            onMarkAbsent={() =>
              updateField((e) => {
                markAbsent(e.meeting_date);
                return e;
              })
            }
          />
          <FieldRow
            labelBm="Tempat mesyuarat"
            labelZh="会议地点"
            labelEn="Meeting venue"
            field={extraction.meeting_venue}
            onConfirm={() =>
              updateField((e) => {
                confirm(e.meeting_venue);
                return e;
              })
            }
            onEdit={(v) =>
              updateField((e) => {
                edit(e.meeting_venue, v);
                return e;
              })
            }
            onMarkAbsent={() =>
              updateField((e) => {
                markAbsent(e.meeting_venue);
                return e;
              })
            }
          />

        </StepGroup>
        <StepGroup
          titleBm="Apa yang diputuskan"
          titleZh="做了什么决定"
          titleEn="What was decided"
          outstanding={groups.resolutions.outstanding}
          total={groups.resolutions.total}
          defaultOpen={firstUnfinishedHere === "resolutions"}
        >
          {extraction.resolutions.map((r, i) => (
            <DeletableRow
              key={`res-${i}`}
              onDelete={() => removeExtractionRow("resolutions", i)}
              hasContent={rowHasContent("resolutions", i)}
              what={t(`Keputusan ${i + 1}`, `决议 ${i + 1}`, `Resolution ${i + 1}`)}
            >
            <FieldRow
              labelBm={`Keputusan ${i + 1}`}
              labelZh={`决议 ${i + 1}`}
              labelEn={`Resolution ${i + 1}`}
              field={r.text}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.resolutions[i].text);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.resolutions[i].text, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.resolutions[i].text);
                  return e;
                })
              }
            />
            </DeletableRow>
          ))}
          <AddRowButton
            onClick={() => addExtractionRow("resolutions")}
            labelBm="Tambah keputusan"
            labelZh="自己加一条决议"
            labelEn="Add a resolution"
          />
        </StepGroup>

        <StepGroup
          titleBm="Angka wang dalam nota"
          titleZh="笔记里的金额"
          titleEn="Money amounts in the notes"
          outstanding={groups.figures.outstanding}
          total={groups.figures.total}
          defaultOpen={firstUnfinishedHere === "figures"}
        >
          {extraction.figures.map((f, i) => (
            <DeletableRow
              key={`fig-${i}`}
              onDelete={() => removeExtractionRow("figures", i)}
              hasContent={rowHasContent("figures", i)}
              what={t(`Angka ${i + 1}`, `第 ${i + 1} 笔金额`, `Amount ${i + 1}`)}
            >
            <FieldRow
              labelBm={`Angka ${i + 1} — perkara`}
              labelZh={`数字 ${i + 1} — 项目`}
              labelEn={`Figure ${i + 1} — what it is`}
              field={f.description}
              display={f.description.value}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.figures[i].description);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.figures[i].description, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.figures[i].description);
                  return e;
                })
              }
            />
            {/* The AMOUNT is now reviewable in its own right.
                Before this, only the description could be confirmed, while
                `amount_cents` was silently excluded from the "everything
                reviewed?" count — so an unread ringgit figure could be printed
                into a document carrying the Hard Rule 8 audit line, and the
                user had no control to confirm or correct it. Hard Rule 2 still
                holds: the string is parsed to integer cents by deterministic
                TypeScript, never by the model. */}
            <FieldRow
              labelBm={`Angka ${i + 1} — jumlah (RM)`}
              labelZh={`数字 ${i + 1} — 金额（RM）`}
              labelEn={`Figure ${i + 1} — amount (RM)`}
              field={{
                value:
                  f.amount_cents.value === null
                    ? ""
                    : (f.amount_cents.value / 100).toFixed(2),
                confidence: f.amount_cents.confidence,
                source_ref: f.amount_cents.source_ref,
              }}
              display={
                f.amount_cents.value === null
                  ? ""
                  : formatRm(f.amount_cents.value)
              }
              onConfirm={() =>
                updateField((e) => {
                  e.figures[i].amount_cents.confidence = "confirmed";
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  const cents = parseRmToCents(v);
                  if (cents === null) return e; // keep the old value on nonsense
                  e.figures[i].amount_cents.value = cents;
                  e.figures[i].amount_cents.confidence = "confirmed";
                  e.figures[i].amount_cents.source_ref = {
                    location: t("diisi oleh anda", "由您填写", "entered by you"),
                    snippet: v,
                  };
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  // No amount was written down: keep it null (never 0, which
                  // would read as "the meeting recorded RM0.00") and mark it
                  // reviewed so the document simply omits the line.
                  e.figures[i].amount_cents.value = null;
                  e.figures[i].amount_cents.confidence = "confirmed";
                  e.figures[i].amount_cents.source_ref = {
                    location: t("disemak oleh anda", "由您核对", "reviewed by you"),
                    snippet: t(
                      "tiada dalam nota",
                      "笔记里没写",
                      "not written down in the notes",
                    ),
                  };
                  return e;
                })
              }
            />
            </DeletableRow>
          ))}
          <AddRowButton
            onClick={() => addExtractionRow("figures")}
            labelBm="Tambah angka"
            labelZh="自己加一笔金额"
            labelEn="Add an amount"
          />
        </StepGroup>

        <StepGroup
          titleBm="Pemegang jawatan"
          titleZh="职位与人名"
          titleEn="Who holds which position"
          outstanding={groups.bearers.outstanding}
          total={groups.bearers.total}
          defaultOpen={firstUnfinishedHere === "bearers"}
        >
          {extraction.office_bearers.map((b, i) => (
            <DeletableRow
              key={`ob-${i}`}
              onDelete={() => removeExtractionRow("office_bearers", i)}
              hasContent={rowHasContent("office_bearers", i)}
              what={t(
                `Jawatan ${i + 1}`,
                `第 ${i + 1} 个职位`,
                `Position ${i + 1}`,
              )}
            >
            {/* The POSITION now has its own row.
                Before this it was the only field counted by `outstanding` with no
                control anywhere in the UI — this row bound `field={b.person_name}`
                and merely READ `b.position.value` for its label. So a real photo
                where the job title was illegible left `position.confidence:
                "missing"`, `allReviewed` false forever, and "Save to History"
                permanently disabled with no way out. (2026-07-28 audit.) */}
            <FieldRow
              labelBm={`Jawatan ${i + 1}`}
              labelZh={`职位 ${i + 1}`}
              labelEn={`Position ${i + 1}`}
              field={b.position}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.office_bearers[i].position);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.office_bearers[i].position, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.office_bearers[i].position);
                  return e;
                })
              }
            />
            <FieldRow
              labelBm={
                b.position.value
                  ? `${b.position.value} — siapa`
                  : `Siapa (jawatan ${i + 1})`
              }
              labelZh={
                b.position.value ? `${b.position.value} — 是谁` : `谁（职位 ${i + 1}）`
              }
              // Was `"name"`, which with all three languages on rendered as
              // "Pengerusi · Pengerusi · name". (2026-07-28 audit.)
              labelEn={
                b.position.value
                  ? `${b.position.value} — who`
                  : `Who (position ${i + 1})`
              }
              field={b.person_name}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.office_bearers[i].person_name);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.office_bearers[i].person_name, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.office_bearers[i].person_name);
                  return e;
                })
              }
            />
            </DeletableRow>
          ))}
          <AddRowButton
            onClick={() => addExtractionRow("office_bearers")}
            labelBm="Tambah jawatan"
            labelZh="自己加一个职位"
            labelEn="Add a position"
          />
        </StepGroup>

          </div>
        )}

        <NextStepLink
          href="/minutes/attendance"
          labelBm="Ke senarai kehadiran"
          labelZh="去出席者名单"
          labelEn="On to who attended"
          blockedReason={
            // E-3: why it is locked AND what unlocks it, in one sentence.
            nothingYet ? (
              <Tri
                bm="Belum ada nota dibaca — ambil gambar atau taip di atas dahulu, dan senarai kehadiran akan dibuka."
                zh="还没有读到任何笔记 —— 先在上面拍照或打字，出席者名单就会打开。"
                en="No notes have been read yet — take a photo or type them in above, and the attendance list opens."
              />
            ) : undefined
          }
        />
        {!nothingYet && outstandingHereOutsideAttendance > 0 && (
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm={`Masih ada ${outstandingHereOutsideAttendance} perkara di halaman ini.`}
              zh={`这一页还有 ${outstandingHereOutsideAttendance} 项没核对。`}
              en={`${outstandingHereOutsideAttendance} item(s) on this page still need you.`}
            />
          </p>
        )}
      </PageSection>

      {/* D-4: in typing mode the form comes first; the preview appears here,
          after it, once something has been typed. */}
      {typedByHand && documentPreview}
    </>
  );
}
