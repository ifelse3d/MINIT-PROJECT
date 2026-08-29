"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { UsesOneAiAction } from "@/components/attach-icon";
import type { LaporanDraft } from "@/lib/laporan-aktiviti";

// ---------------------------------------------------------------------------
// The Laporan Aktiviti flow (D2-3, work order 56), in the order the hard
// rules demand: AI drafts (from the org's own records) → THE PERSON EDITS
// EVERY SENTENCE → only then a PDF exists, carrying their name on the audit
// line (Hard Rule 8). The eROSES test: nothing here asks anyone to key
// structured data — the records were already in the calendar and the
// minutes; this page only words them.
// ---------------------------------------------------------------------------

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

export function LaporanView({
  todayIso,
  fence,
}: {
  todayIso: string;
  /** null = paid org (no fence talk). */
  fence: { downloadsRemaining: number; docsRemaining: number } | null;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const year = todayIso.slice(0, 4);
  const [fromIso, setFromIso] = useState(`${year}-01-01`);
  const [toIso, setToIso] = useState(todayIso);
  const [busy, setBusy] = useState<"draft" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LaporanDraft | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");

  async function generate() {
    setError(null);
    setBusy("draft");
    try {
      const res = await fetch("/api/draft-activity-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromIso, toIso }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.draft) {
        setError(
          body?.error ??
            t(
              "Tidak berjaya — cuba lagi.",
              "没有成功 —— 请再试一次。",
              "Something went wrong — please try again.",
            ),
        );
        return;
      }
      setDraft(body.draft as LaporanDraft);
      setPeriodLabel(body.periodLabel as string);
    } catch {
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The internet connection dropped. Please try again.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf(clean: boolean) {
    if (!draft) return;
    setError(null);
    setBusy("pdf");
    try {
      const res = await fetch("/api/laporan-aktiviti-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: periodLabel || `${fromIso} hingga ${toIso}`,
          pengenalan: draft.pengenalan,
          aktiviti: draft.aktiviti,
          clean,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(
          body?.error ??
            t(
              "Muat turun tidak berjaya — cuba lagi.",
              "下载没有成功 —— 请再试一次。",
              "The download did not work — please try again.",
            ),
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "laporan-aktiviti.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Laporan Aktiviti" zh="活动报告" en="Laporan Aktiviti" />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Penyata Tahunan eROSES (langkah 6) minta laporan aktiviti pertubuhan. MinitAI menyusun draf daripada kalendar dan minit yang DISAHKAN — anda semak, betulkan, kemudian muat turun PDF."
            zh="eROSES 年度呈报（第 6 步）要一份机构活动报告。MinitAI 会用日历和已确认的会议记录起草 —— 您核对、修改，然后下载 PDF。"
            en="The eROSES Annual Return (step 6) asks for an activity report. MinitAI drafts one from your calendar and CONFIRMED minutes — you check it, fix it, then download the PDF."
          />
        </p>
      </div>

      {/* 1 — the period + generate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            1 · <Tri bm="Tempoh" zh="选时间段" en="The period" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Biasanya tahun kewangan yang dilaporkan."
              zh="通常就是要呈报的那个财政年度。"
              en="Usually the financial year being filed."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              <Tri bm="Dari" zh="从" en="From" />
            </span>
            <input
              type="date"
              className={inputClass}
              value={fromIso}
              onChange={(e) => setFromIso(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              <Tri bm="Hingga" zh="到" en="To" />
            </span>
            <input
              type="date"
              className={inputClass}
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button size="lg" disabled={busy !== null} onClick={() => void generate()}>
              {busy === "draft" ? (
                <Tri bm="MinitAI sedang menyusun…" zh="MinitAI 起草中…" en="Drafting…" />
              ) : draft ? (
                <Tri bm="Susun semula" zh="重新起草" en="Draft again" />
              ) : (
                <Tri bm="Susun draf" zh="起草" en="Draft it" />
              )}
            </Button>
            <UsesOneAiAction />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-4 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {localizeError(error)}
        </p>
      )}

      {/* 2 — the person's review. Every box editable; nothing is final here. */}
      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              2 · <Tri bm="Semak & betulkan" zh="核对与修改" en="Check & fix" />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="MinitAI hanya menyusun ayat daripada rekod anda — ia tidak mereka fakta. Tetap semak setiap ayat: dokumen ini pergi kepada Pendaftar."
                zh="MinitAI 只是把你们的记录写成句子 —— 不会自己编。但每句都请过目：这份文件是交给社团注册局的。"
                en="MinitAI only words your own records — it invents nothing. Still read every sentence: this document goes to the Registrar."
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="Pengenalan" zh="开头段" en="Introduction" />
              </span>
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={draft.pengenalan}
                onChange={(e) => setDraft({ ...draft, pengenalan: e.target.value })}
              />
            </label>
            <div className="flex flex-col gap-3">
              {draft.aktiviti.map((a, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-[color:var(--v2-border)] p-3"
                >
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={`${inputClass} max-w-40`}
                      value={a.tarikh}
                      aria-label={t(`Tarikh, aktiviti ${i + 1}`, `日期，第 ${i + 1} 项`, `Date, activity ${i + 1}`)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          aktiviti: draft.aktiviti.map((x, j) =>
                            j === i ? { ...x, tarikh: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <input
                      className={`${inputClass} min-w-40 flex-1`}
                      value={a.nama}
                      aria-label={t(`Nama aktiviti ${i + 1}`, `第 ${i + 1} 项名称`, `Activity ${i + 1} name`)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          aktiviti: draft.aktiviti.map((x, j) =>
                            j === i ? { ...x, nama: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          aktiviti: draft.aktiviti.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Tri bm="Buang" zh="删掉" en="Remove" />
                    </button>
                  </div>
                  <textarea
                    className={`${inputClass} min-h-16 resize-y`}
                    value={a.penerangan}
                    aria-label={t(
                      `Penerangan, aktiviti ${i + 1}`,
                      `说明，第 ${i + 1} 项`,
                      `Description, activity ${i + 1}`,
                    )}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        aktiviti: draft.aktiviti.map((x, j) =>
                          j === i ? { ...x, penerangan: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3 — the PDF. Fence document line, cost written on the buttons. */}
      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              3 · <Tri bm="Muat turun PDF" zh="下载 PDF" en="Download the PDF" />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="PDF membawa baris audit dengan nama anda — memuat turun bermakna anda sudah semak."
                zh="PDF 上会有写着您名字的确认行 —— 下载即表示您已核对。"
                en="The PDF carries the audit line with your name — downloading means you have checked it."
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {fence ? (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void downloadPdf(false)}
                >
                  <Tri
                    bm="PDF (dengan tera air)"
                    zh="下载（带水印）"
                    en="PDF (watermarked)"
                  />
                </Button>
                <Button
                  size="lg"
                  disabled={
                    busy !== null ||
                    fence.downloadsRemaining <= 0 ||
                    fence.docsRemaining <= 0
                  }
                  onClick={() => void downloadPdf(true)}
                >
                  <Tri
                    bm={`Muat turun bersih (baki ${Math.min(fence.downloadsRemaining, fence.docsRemaining)})`}
                    zh={`干净下载（剩 ${Math.min(fence.downloadsRemaining, fence.docsRemaining)} 次）`}
                    en={`Clean download (${Math.min(fence.downloadsRemaining, fence.docsRemaining)} left)`}
                  />
                </Button>
                <span className="text-sm text-muted-foreground">
                  <Tri
                    bm="Bersih = 1 dokumen + 1 muat turun daripada had percuma."
                    zh="干净下载会用掉免费版的 1 份文件＋1 次下载。"
                    en="Clean spends 1 document + 1 download of the free allowance."
                  />{" "}
                  <Link href="/settings/plan" className="underline underline-offset-4">
                    <Tri bm="Lihat pelan" zh="看方案" en="See plans" />
                  </Link>
                </span>
              </>
            ) : (
              <Button size="lg" disabled={busy !== null} onClick={() => void downloadPdf(true)}>
                {busy === "pdf" ? (
                  <Tri bm="Menyediakan…" zh="正在生成…" en="Preparing…" />
                ) : (
                  <Tri bm="Muat turun PDF" zh="下载 PDF" en="Download the PDF" />
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
