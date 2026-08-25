"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { SAMPLE_UPLOAD_LABEL } from "@/lib/sample-data";
import { useMinutes } from "./minutes-store";

// ---------------------------------------------------------------------------
// The frame every /minutes page sits inside: whose meeting this is, the
// "this is only the example" warning, the storage alarms, and the tab rail.
//
// Before the 2026-08-23 split this was the top of a 2039-line page.
// ---------------------------------------------------------------------------

const MINUTES_TABS = [
  // R-4 (2026-08-25): named for what the person DOES, and typing is a first-
  // class way in — not "photo & check", the pipeline's name for itself.
  { href: "/minutes", labelBm: "Ambil / taip", labelZh: "拍或打字", labelEn: "Photo or type" },
  { href: "/minutes/attendance", labelBm: "Kehadiran", labelZh: "出席者", labelEn: "Attendance" },
  { href: "/minutes/document", labelBm: "Minit siap", labelZh: "做好的记录", labelEn: "The document" },
] as const;

// E-1 (2026-08-25): history is the section's RECORDS, not step 4. It renders
// apart from the numbered chain — no number, never locked.
// The label stays "Sejarah / 历史 / History" — the same word the save button
// and the menus already use for this concept (STATE §6: same concept, same
// words on every screen).
const MINUTES_RECORDS = {
  href: "/minutes/history",
  labelBm: "Sejarah",
  labelZh: "历史",
  labelEn: "History",
} as const;

export function MinutesChrome({ children }: { children: ReactNode }) {
  const t = useTriText();
  const pathname = usePathname();
  const {
    sourceLabel,
    typedByHand,
    documentOrgName,
    isReal,
    isSample,
    nothingYet,
    allReviewed,
    outstanding,
    outstandingHereOutsideAttendance,
    groups,
    attendanceUnsettled,
    saveResult,
    storageNote,
    backToEmpty,
  } = useMinutes();

  const tabs: SectionTab[] = [
    {
      ...MINUTES_TABS[0],
      status: isSample
        ? "example"
        : !isReal
          ? "needs-you"
          : outstandingHereOutsideAttendance > 0
            ? "needs-you"
            : "done",
      count: outstandingHereOutsideAttendance,
    },
    {
      ...MINUTES_TABS[1],
      status: nothingYet
        ? "locked"
        : isSample
          ? "example"
          : // An empty list is one thing outstanding, not none — see
            // attendance-review.tsx. The tab used to show a green tick over a
            // meeting that recorded nobody.
            groups.attendees.outstanding > 0 || attendanceUnsettled
            ? "needs-you"
            : "done",
      count: groups.attendees.outstanding,
    },
    {
      ...MINUTES_TABS[2],
      status:
        saveResult === "ok"
          ? "done"
          : isSample
            ? "example"
            : allReviewed && isReal
              ? "needs-you"
              : "locked",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-amber-400/15 dark:ring-white/10">
            📝
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Minit Mesyuarat" zh="会议记录" en="Meeting Minutes" />
            </span>
          </h1>
          {/* No badge on a fresh page: there is nothing to label, and "Sample
              data" on an empty screen only raises a question. The example, if
              the person asks for it, still says so. */}
          {sourceLabel ? (
            <Badge variant="secondary">📷 {sourceLabel}</Badge>
          ) : typedByHand ? (
            <Badge variant="secondary">
              ⌨️ <Tri bm="Ditaip sendiri" zh="自己打字" en="Typed in" />
            </Badge>
          ) : isSample ? (
            <Badge variant="secondary">
              <Tri bm="Contoh" zh="示范" en="Example" />
            </Badge>
          ) : null}
        </div>
        <p className="text-base text-muted-foreground">
          {documentOrgName ||
            t("Pilih pertubuhan dahulu", "请先选择机构", "Choose an organisation first")}
          {sourceLabel ? ` · ${sourceLabel}` : ""}
          {isSample ? ` · ${SAMPLE_UPLOAD_LABEL}` : ""}
        </p>
        {/* Shown ONLY to someone who asked for the example — and it has a way
            out, instead of just telling them they are in the wrong place. */}
        {isSample && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
            <p className="min-w-56 flex-1 text-base font-medium text-amber-900 dark:text-amber-100">
              <Tri
                bm="Ini contoh sahaja — bukan data anda, dan hanya boleh dilihat. Ia tidak boleh diubah atau disimpan."
                zh="这是示范内容，不是您的资料，只能看——不能修改，也不能保存。"
                en="This is the worked example — not your data, and view-only. It cannot be edited or saved."
              />
            </p>
            {/* Stage 0-1: the way OUT of the example is the biggest thing in
                the banner — for the person who tapped it by accident. */}
            <Button size="lg" className="text-base" onClick={backToEmpty}>
              <Tri bm="Tutup contoh" zh="关掉示范" en="Close the example" />
            </Button>
          </div>
        )}
        {storageNote === "photo-dropped" && (
          <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Telefon ini penuh, jadi gambar asal tidak dapat disimpan. Medan anda selamat. Simpan minit ini ke Sejarah sekarang."
              zh="这台手机的储存空间满了，原始照片没能留下。您填的内容还在。请现在就把会议记录保存到「历史」。"
              en="This phone's storage is full, so the original photo could not be kept. Your fields are safe. Save these minutes to History now."
            />
          </p>
        )}
        {storageNote === "failed" && (
          <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Kerja ini TIDAK dapat disimpan pada peranti ini. Jangan tutup halaman — semak semua medan dan tekan “Simpan ke Sejarah” sekarang."
              zh="这些内容无法暂存在这台设备上。请先不要关掉页面 —— 核对好所有栏位，马上按「保存到历史」。"
              en="This work could NOT be kept on this device. Do not close the page — check the fields and tap “Save to History” now."
            />
          </p>
        )}
      </div>

      {/* Where am I? One rail: three steps, and the records apart from them. */}
      <SectionTabs tabs={tabs} records={MINUTES_RECORDS} />

      {/* The one sentence answering "what do I do now?" — it has to survive the
          split, because on a single page the answer was "scroll down". */}
      <p className="rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/60 p-4 text-base font-medium dark:bg-white/5">
        {!isReal ? (
          <Tri
            bm="Mula di sini: ambil gambar nota mesyuarat tulisan tangan anda dan Minit akan membacanya — atau taip sendiri kalau tiada gambar."
            zh="从这里开始：拍下您手写的会议笔记，Minit 会读出来 —— 没有照片的话，也可以自己打字。"
            en="Start here: take a photo of your handwritten meeting notes and Minit reads it — or type it in yourself if there is no photo."
          />
        ) : outstanding === 0 && attendanceUnsettled ? (
          <Tri
            bm="Satu perkara lagi: tiada seorang pun direkodkan sebagai hadir. Buka “Kehadiran”."
            zh="还差一件事：一个出席者都没有。请打开「出席者」。"
            en="One thing left: nobody is recorded as having attended. Open “Attendance”."
          />
        ) : !allReviewed ? (
          <Tri
            bm={`Ada ${outstanding} perkara yang Minit mahu anda semak — ${outstandingHereOutsideAttendance} di halaman ini, ${groups.attendees.outstanding} dalam senarai kehadiran.`}
            zh={`有 ${outstanding} 项 Minit 希望您核对 —— 这一页 ${outstandingHereOutsideAttendance} 项，出席者名单 ${groups.attendees.outstanding} 项。`}
            en={`${outstanding} item(s) need your check — ${outstandingHereOutsideAttendance} on this page, ${groups.attendees.outstanding} in the attendance list.`}
          />
        ) : saveResult === "ok" ? (
          <Tri
            bm="Siap — minit ini sudah tersimpan dalam sejarah pertubuhan anda."
            zh="完成 —— 这份会议记录已经存进您机构的历史里了。"
            en="Done — these minutes are saved in your organisation's history."
          />
        ) : (
          <Tri
            bm="Semua sudah disemak. Pergi ke “Minit siap” dan simpan ke Sejarah."
            zh="全部核对好了。去「做好的记录」，保存到「历史」。"
            en="Everything is checked. Go to “The document” and save it to History."
          />
        )}
      </p>

      <div key={pathname} className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
