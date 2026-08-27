"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { FieldRow } from "./field-row";
import { DeletableRow } from "./row-controls";
import { RosterPicker } from "./roster-picker";
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
// WHY IT LOOKS LIKE THIS (J's UX list, N4: "一百个出席者是一百张大卡片，滚不完").
// Three changes, in the order they matter:
//
//   1. The names that NEED you come first. A hundred rows where three are amber
//      is a hunt; the same hundred with those three at the top is three taps.
//   2. A name Minit read cleanly is ONE LINE, not a card. It only turns into the
//      full editing row when you tap it — which is the rare case.
//   3. "All of these are correct" confirms every clean name at once. Reading a
//      list and agreeing with it is one decision, not ninety.
//
// The names Minit is unsure about are never batch-confirmed: that button would
// be a machine ticking its own homework.
//
// 🔴 AND AN EMPTY LIST IS NOT "ALL CHECKED". 产品缺口盘点 §3 item 3: this used
// to read "Who attended ✓ All checked (0)", because the outstanding count
// counts unconfirmed FIELDS and no attendees means no fields. So a set of
// minutes recording nobody sailed through — and that number goes into eROSES
// as "Bilangan Ahli Hadir". Zero people at a meeting that happened is either a
// notes problem or a filing problem; either way it is not something to pass
// silently. A person has to say which it is.
// ---------------------------------------------------------------------------

export function AttendanceReview() {
  const t = useTriText();
  const {
    extraction,
    groups,
    nothingYet,
    isSample,
    updateField,
    confirmField: confirm,
    editField: edit,
    markAbsent,
    addNamedAttendees,
    removeExtractionRow,
    rowHasContent,
    noAttendeesRecorded,
    setNoAttendeesRecorded,
    attendanceUnsettled,
  } = useMinutes();

  /**
   * D-2 (work order 31, 客⑫⑬): adding a person is TYPING A NAME, Excel-style —
   * not "add an empty red row" (which sorted itself to the TOP of the list,
   * into the needs-you pile, while the person was building the list from the
   * bottom). A typed name is a human assertion, so it arrives confirmed with
   * "entered by you" as its provenance (same standard as editField), lands at
   * the END of the list, and the input stays put for the next name.
   */
  const [newName, setNewName] = useState("");
  const addTypedAttendee = () => {
    const v = newName.trim();
    if (v === "") return;
    updateField((e) => {
      const have = new Set(
        e.attendees.map((a) => a.name.value.trim().toLowerCase()),
      );
      // Typing somebody twice is a slip, not an instruction to record twice —
      // same rule as the roster picker.
      if (!have.has(v.toLowerCase())) {
        e.attendees.push({
          name: {
            value: v,
            confidence: "confirmed",
            source_ref: {
              location: t("diisi oleh anda", "由您填写", "entered by you"),
              snippet: v,
            },
          },
        });
      }
      return e;
    });
    setNewName("");
  };

  /** Rows opened for editing. A clean name stays one line until tapped. */
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const toggleRow = (i: number) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Original index kept on every entry: it is what every edit addresses, and
  // sorting must never quietly renumber the extraction underneath.
  const ordered = useMemo(() => {
    const rows = extraction.attendees.map((a, i) => ({ a, i }));
    const needsYou = rows.filter(({ a }) => a.name.confidence !== "confirmed");
    const done = rows.filter(({ a }) => a.name.confidence === "confirmed");
    return { needsYou, done };
  }, [extraction.attendees]);

  /** One tap agrees with every name Minit read cleanly. */
  function confirmAllChecked() {
    const toConfirm = extraction.attendees
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.name.confidence === "check")
      .map(({ i }) => i);
    if (toConfirm.length === 0) return;
    updateField((e) => {
      for (const i of toConfirm) confirm(e.attendees[i].name);
      return e;
    });
  }

  /**
   * How many the batch button would confirm.
   *
   * `check` only — NOT `missing`. A missing name is one Minit could not read at
   * all, so there is nothing on screen for a person to be agreeing with; those
   * keep their own row and their own three buttons.
   */
  const batchCount = extraction.attendees.filter(
    (a) => a.name.confidence === "check",
  ).length;

  const fieldRowProps = (i: number) => ({
    labelBm: `Hadir ${i + 1}`,
    labelZh: `出席者 ${i + 1}`,
    labelEn: `Attendee ${i + 1}`,
    field: extraction.attendees[i].name,
    onConfirm: () =>
      updateField((e) => {
        confirm(e.attendees[i].name);
        return e;
      }),
    onEdit: (v: string) =>
      updateField((e) => {
        edit(e.attendees[i].name, v);
        return e;
      }),
    onMarkAbsent: () =>
      updateField((e) => {
        markAbsent(e.attendees[i].name);
        return e;
      }),
  });

  const row = (i: number) => (
    <DeletableRow
      key={`att-${i}`}
      onDelete={() => {
        removeExtractionRow("attendees", i);
        setOpenRows(new Set());
      }}
      hasContent={rowHasContent("attendees", i)}
      what={t(`Hadir ${i + 1}`, `出席者 ${i + 1}`, `Attendee ${i + 1}`)}
    >
      <FieldRow {...fieldRowProps(i)} />
    </DeletableRow>
  );

  return (
    <PageSection
      step={3}
      titleBm="Siapa yang hadir"
      titleZh="谁出席了"
      titleEn="Who attended"
      summary={
        groups.attendees.total === 0 ? (
          <Tri
            bm="MinitAI belum membaca sebarang nama. Anda boleh menambah sendiri di bawah."
            zh="MinitAI 还没读到任何名字。您可以在下面自己加。"
            en="MinitAI has not read any names yet. You can add them yourself below."
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
      {/* The one question an empty list has to answer. Not a validation error:
          "the notes do not record who attended" is a perfectly normal thing for
          a page of scribbled notes to be true of, and the person is the only
          one who can say so (Hard Rule 1 — a human may assert it, nothing may
          assume it). */}
      {attendanceUnsettled && !nothingYet && (
        <div className="flex flex-col gap-3 rounded-md border-2 border-amber-400 bg-amber-50 p-4 dark:bg-amber-400/10">
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm="Tiada seorang pun direkodkan sebagai hadir."
              zh="现在一个出席者都没有。"
              en="Nobody is recorded as having attended."
            />
          </p>
          <p className="text-base text-amber-900 dark:text-amber-100">
            <Tri
              bm="Bilangan ini masuk ke penyata tahunan eROSES (“Bilangan Ahli Hadir”), jadi MinitAI tidak boleh menganggap sifar bermakna anda sudah semak. Tambah nama di bawah — atau beritahu MinitAI yang nota mesyuarat memang tidak mencatat kehadiran."
              zh="这个人数会进 eROSES 年度报告的「出席人数」，所以 MinitAI 不能把「0 个」当成您已经核对好了。请在下面加名字 —— 或者告诉 MinitAI，这份笔记本来就没有记出席。"
              en="This number goes into the eROSES annual return (“Bilangan Ahli Hadir”), so MinitAI cannot treat zero as checked. Add names below — or tell MinitAI that the notes simply do not record attendance."
            />
          </p>
          <Button
            variant="outline"
            size="lg"
            className="self-start"
            onClick={() => setNoAttendeesRecorded(true)}
          >
            <Tri
              bm="Nota ini tidak mencatat kehadiran"
              zh="这份笔记没有记出席"
              en="These notes do not record attendance"
            />
          </Button>
        </div>
      )}

      {/* Said, and reversible. Somebody who ticked it and then found the list
          on the back of the page must be able to take it back. */}
      {noAttendeesRecorded && groups.attendees.total === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
          <p className="min-w-56 flex-1 text-base">
            <Tri
              bm="Anda beritahu MinitAI yang nota ini tidak mencatat kehadiran."
              zh="您告诉了 MinitAI：这份笔记没有记出席。"
              en="You told MinitAI these notes do not record attendance."
            />
          </p>
          <Button variant="outline" onClick={() => setNoAttendeesRecorded(false)}>
            <Tri bm="Sebenarnya ada" zh="其实有记" en="They do, actually" />
          </Button>
        </div>
      )}

      {nothingYet && groups.attendees.total === 0 ? (
        <p className="rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Ambil gambar nota mesyuarat dahulu — atau tambah nama sendiri di bawah."
            zh="请先拍下会议笔记 —— 或者在下面自己加名字。"
            en="Take a photo of the notes first — or add the names yourself below."
          />
        </p>
      ) : (
        <>
          {/* 1 · The ones that need you, first. */}
          {ordered.needsYou.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold">
                  <Tri
                    bm={`${ordered.needsYou.length} nama perlu disemak`}
                    zh={`有 ${ordered.needsYou.length} 个名字要核对`}
                    en={`${ordered.needsYou.length} name(s) need checking`}
                  />
                </h3>
                {batchCount > 0 && (
                  <Button variant="outline" onClick={confirmAllChecked} className="ml-auto">
                    <Check aria-hidden className="size-5" strokeWidth={2.4} />
                    <Tri
                      bm={`Semua ${batchCount} ini betul`}
                      zh={`这 ${batchCount} 个都没错`}
                      en={`All ${batchCount} of these are correct`}
                    />
                  </Button>
                )}
              </div>
              {batchCount > 0 && batchCount < ordered.needsYou.length && (
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="Butang itu hanya mengesahkan nama yang MinitAI sudah baca. Nama yang langsung tidak terbaca (merah) tetap perlu anda isi satu-satu."
                    zh="那个按钮只会确认 MinitAI 已经读到的名字。完全读不出来的（红色）还是要您一个一个填。"
                    en="That button only confirms names MinitAI did read. Ones it could not read at all (red) still need you, one by one."
                  />
                </p>
              )}
              <div className="flex flex-col">{ordered.needsYou.map(({ i }) => row(i))}</div>
            </div>
          )}

          {/* 2 · The rest: one line each, until you tap one. */}
          {ordered.done.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">
                <Tri
                  bm={`${ordered.done.length} sudah disemak`}
                  zh={`已经核对好的 ${ordered.done.length} 个`}
                  en={`${ordered.done.length} already checked`}
                />
              </h3>
              <ul className="divide-y rounded-md border">
                {ordered.done.map(({ a, i }) =>
                  openRows.has(i) ? (
                    <li key={`att-open-${i}`} className="px-3">
                      {row(i)}
                      <button
                        type="button"
                        onClick={() => toggleRow(i)}
                        className="pb-3 text-sm text-muted-foreground underline underline-offset-4"
                      >
                        <Tri bm="Tutup" zh="收起来" en="Close" />
                      </button>
                    </li>
                  ) : (
                    <li key={`att-${i}`}>
                      <button
                        type="button"
                        onClick={() => toggleRow(i)}
                        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-base hover:bg-accent"
                      >
                        <span className="w-8 shrink-0 text-sm tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="flex-1 truncate">
                          {a.name.value || (
                            <span className="text-muted-foreground">
                              <Tri
                                bm="(tiada dalam nota)"
                                zh="（笔记里没写）"
                                en="(not in the notes)"
                              />
                            </span>
                          )}
                        </span>
                        <ConfidenceBadge level={a.name.confidence} />
                      </button>
                    </li>
                  ),
                )}
              </ul>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Tekan satu nama untuk mengubah atau membuangnya."
                  zh="点一个名字就可以修改或删掉它。"
                  en="Tap a name to change or remove it."
                />
              </p>
            </div>
          )}

          {/* Ticking beats typing for the hundred-name case, and the committee
              list already has most of those names on it. Shown above the
              type-it-yourself button because it is the faster path when it
              applies — and it renders nothing at all when the society has no
              roster recorded, rather than offering an empty list. */}
          <RosterPicker
            alreadyThere={
              new Set(
                extraction.attendees.map((a) => a.name.value.trim().toLowerCase()),
              )
            }
            onAdd={addNamedAttendees}
          />

          {/* D-2: type a name, press Enter, type the next — the row appears at
              the END of the list and this box does not move. (Replaces the old
              "add an empty row" button, whose blank red row jumped to the top
              of the needs-you pile.) */}
          {!isSample && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="add-attendee" className="text-base font-semibold">
                <Tri
                  bm="Tambah nama lain"
                  zh="自己补名字"
                  en="Add more names"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="add-attendee"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTypedAttendee();
                    }
                  }}
                  maxLength={120}
                  placeholder={t(
                    "Taip satu nama, tekan Enter",
                    "打一个名字，按 Enter 加入",
                    "Type one name, press Enter",
                  )}
                  className="h-12 w-full max-w-md rounded-sm border border-input bg-white px-3 text-base dark:bg-transparent"
                />
                <Button
                  variant="outline"
                  size="lg"
                  onClick={addTypedAttendee}
                  disabled={newName.trim() === ""}
                >
                  + <Tri bm="Tambah" zh="加入" en="Add" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Nama baharu masuk di HUJUNG senarai; kotak ini kekal di sini — taip nama demi nama."
                  zh="新名字会排在名单最后，这个输入格不会跳走 —— 可以一个接一个打。"
                  en="New names join the END of the list and this box stays put — type name after name."
                />
              </p>
            </div>
          )}
        </>
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
