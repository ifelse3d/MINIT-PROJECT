"use client";

import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { StepGroup } from "@/components/step-card";
import { NextStepLink, PageSection } from "@/components/page-section";
import { formatDateLong, isIsoDate } from "@/lib/date-input";
import { MEETING_TYPES, MEETING_TYPE_LABEL, meetingTypeLabel } from "@/lib/meeting-types";
import { formatRm } from "@/lib/minutes-draft";
import { parseRmToCents } from "@/lib/receipts";
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
  const {
    sourceLabel,
    photoDataUrl,
    aiBusy,
    aiError,
    nothingYet,
    outstandingHereOutsideAttendance,
    groups,
    firstUnfinished,
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
    openSample,
    backToEmpty,
  } = useMinutes();

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
              bm="Satu gambar, satu halaman. Minit membaca tulisan tangan Bahasa Malaysia, Cina dan Inggeris. Atau taip sendiri."
              zh="一张照片拍一页。Minit 能读马来文、中文和英文的手写字。也可以自己打字。"
              en="One photo per page. Minit reads handwriting in Malay, Chinese and English. Or type it in yourself."
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
                📷 <Tri bm="Pilih / ambil gambar" zh="选择照片" en="Choose / take a photo" />
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={aiBusy}
              onChange={(e) => {
                onPhotoPicked(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
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
        {aiError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
            {aiError}
          </div>
        )}
        {photoDataUrl && (
          <details className="group rounded-lg border bg-background">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-medium hover:bg-accent">
              🖼️ <Tri bm="Lihat gambar asal" zh="查看原始照片" en="View the original photo" />
              <span className="ml-auto text-muted-foreground transition-transform group-open:rotate-90">›</span>
            </summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoDataUrl}
              alt={t("Gambar asal", "原始照片", "Original photo")}
              className="max-h-[70vh] w-full rounded-b-lg object-contain"
            />
          </details>
        )}
        <p className="text-base text-muted-foreground">
          ⚠{" "}
          <Tri
            bm="Guna nota contoh dahulu — jangan muat naik nama atau nombor IC orang sebenar sampai kami bertukar ke pelan berbayar. Ini melindungi privasi mereka."
            zh="目前请先用示范笔记 —— 在我们换成付费方案之前，先不要上传真实的姓名或身份证号码，以保护他们的隐私。"
            en="Use example notes for now — do not upload real names or IC numbers until we move to a paid plan. This protects their privacy."
          />
        </p>
        {/* Opt-in example. Deliberately quiet and LAST: someone holding their
            own notes should reach for the camera, not this. It exists so a
            first-timer (or a demo) can see what a finished page looks like. */}
        {nothingYet && (
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
        )}
      </div>
      </PageSection>

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
          defaultOpen={firstUnfinished === "meeting"}
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
                : t(
                    meetingTypeLabel(extraction.meeting_type.value, "bm", extraction.meeting_type_label),
                    meetingTypeLabel(extraction.meeting_type.value, "zh", extraction.meeting_type_label),
                    meetingTypeLabel(extraction.meeting_type.value, "en", extraction.meeting_type_label),
                  )
            }
            editor={{
              kind: "choice",
              choices: MEETING_TYPES.map((v) => ({
                value: v,
                label: t(
                  MEETING_TYPE_LABEL[v].bm,
                  MEETING_TYPE_LABEL[v].zh,
                  MEETING_TYPE_LABEL[v].en,
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
          defaultOpen={firstUnfinished === "resolutions"}
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
          defaultOpen={firstUnfinished === "figures"}
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
          defaultOpen={firstUnfinished === "bearers"}
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
            nothingYet ? (
              <Tri
                bm="Belum ada nota dibaca."
                zh="还没有读到任何笔记。"
                en="No notes have been read yet."
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
    </>
  );
}
