"use client";

import { Tri } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import { FieldRow } from "./field-row";
import { useMinutes } from "./minutes-store";

// ---------------------------------------------------------------------------
// /minutes/attendance — who was at the meeting.
//
// WHY IT IS A PAGE (2026-08-23 split). This was one group in the middle of the
// review list. A temple AGM has a hundred names, so a hundred rows sat between
// "what was decided" and the money — the two things somebody scrolls down here
// to check. Attendance is also the one part somebody else can do while you deal
// with the rest, and now it has an address to send them to.
//
// ⚠ Still one full row per person. Making this a compact one-line-per-name list
// with the "please check" names lifted to the top, plus a batch "all correct",
// is item 3 of docs/界面重做-计划.md §2 — the next thing after the split.
// ---------------------------------------------------------------------------

export function AttendanceReview() {
  const {
    extraction,
    groups,
    nothingYet,
    updateField,
    confirmField: confirm,
    editField: edit,
    markAbsent,
  } = useMinutes();

  return (
    <PageSection
      step={3}
      titleBm="Siapa yang hadir"
      titleZh="谁出席了"
      titleEn="Who attended"
      summary={
        groups.attendees.total === 0 ? (
          <Tri
            bm="Minit belum membaca sebarang nama."
            zh="Minit 还没读到任何名字。"
            en="Minit has not read any names yet."
          />
        ) : (
          <Tri
            bm={`${groups.attendees.total} nama · ${groups.attendees.outstanding} masih perlu disemak.`}
            zh={`${groups.attendees.total} 个名字 · 还有 ${groups.attendees.outstanding} 个要核对。`}
            en={`${groups.attendees.total} name(s) · ${groups.attendees.outstanding} still need checking.`}
          />
        )
      }
    >
      {nothingYet ? (
        <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Ambil gambar nota mesyuarat dahulu — Minit hanya boleh menyemak nama yang ia sudah baca."
            zh="请先拍下会议笔记 —— Minit 只能核对它已经读到的名字。"
            en="Take a photo of the notes first — Minit can only check names it has read."
          />
        </p>
      ) : (
        <div className="flex flex-col">
          {extraction.attendees.map((a, i) => (
            <FieldRow
              key={`att-${i}`}
              labelBm={`Hadir ${i + 1}`}
              labelZh={`出席者 ${i + 1}`}
              labelEn={`Attendee ${i + 1}`}
              field={a.name}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.attendees[i].name);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.attendees[i].name, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.attendees[i].name);
                  return e;
                })
              }
            />
          ))}
        </div>
      )}

      <NextStepLink
        href="/minutes/document"
        labelBm="Ke minit yang siap"
        labelZh="去做好的会议记录"
        labelEn="On to the finished minutes"
      />
      <NextStepLink
        href="/minutes"
        back
        labelBm="Kembali ke semakan"
        labelZh="回去核对内容"
        labelEn="Back to the review"
      />
    </PageSection>
  );
}
