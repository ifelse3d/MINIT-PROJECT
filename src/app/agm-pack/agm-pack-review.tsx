"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tri, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  defaultAgmAgendaBm,
  findSignatoryResolutions,
  formatDateBm,
  latestNoticeDateIso,
} from "@/lib/agm-pack";
import { hasCjk } from "@/lib/bm-guard";
import { sampleAgmPackParams, sampleConfirmedMinutes } from "@/lib/sample-roster";
import { dayIsoMalaysia } from "@/lib/history";
import { downloadFromApi } from "@/lib/download-file";

// ---------------------------------------------------------------------------
// The AGM PACK screen, rebuilt for real data (G-2, work order 27).
//
//   * REAL mode (default): the roster comes from the database; the person
//     announces the meeting facts (a FUTURE meeting only they know — the
//     legitimate exception to "no data-entry", like the claim form); the
//     downloads carry NO CONTOH mark. Empty roster = an honest empty state
//     pointing at /members — never a sample dressed as your document.
//   * SAMPLE mode (?contoh=1): the fictional society, clearly labelled,
//     CONTOH on every page, the real letterhead nowhere near it.
//
// G-4: "AGM" is spelled out everywhere — Mesyuarat Agung Tahunan / 常年大会.
// ---------------------------------------------------------------------------

const NOTICE_DAYS_DEFAULT = 14;

export function AgmPackReview({
  mode,
  roster,
  confirmedResolutions,
}: {
  mode: "real" | "sample";
  /** The DATABASE roster (display names) — [] = none recorded yet. */
  roster: { position: string; personName: string }[];
  /** Resolutions of the latest CONFIRMED minutes, or null when none exist. */
  confirmedResolutions: string[] | null;
}) {
  const t = useTriText();
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const [error, setError] = useState<{ where: "pack" | "bank"; msg: string } | null>(null);
  const [busy, setBusy] = useState<"pack" | "bank" | null>(null);

  // The meeting facts the person announces (real mode).
  const [dateIso, setDateIso] = useState("");
  const [timeText, setTimeText] = useState("");
  const [venue, setVenue] = useState("");

  const factsReady = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) && timeText.trim() !== "" && venue.trim() !== "";
  const year = factsReady ? Number(dateIso.slice(0, 4)) : new Date().getFullYear();

  const signatoryHits = useMemo(
    () =>
      new Set(
        findSignatoryResolutions(
          mode === "sample"
            ? sampleConfirmedMinutes.resolutions
            : confirmedResolutions ?? [],
        ),
      ),
    [mode, confirmedResolutions],
  );

  async function downloadPack() {
    setError(null);
    setBusy("pack");
    try {
      if (mode === "sample") {
        await downloadFromApi("/api/agm-pdf", { sample: true }, "contoh-pek-agm.pdf");
      } else {
        await downloadFromApi(
          "/api/agm-pdf",
          {
            year,
            meetingDateIso: dateIso,
            meetingTimeText: timeText.trim(),
            venue: venue.trim(),
            noticePeriodDays: NOTICE_DAYS_DEFAULT,
          },
          `pek-agm-${year}.pdf`,
        );
      }
    } catch (e) {
      setError({ where: "pack", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function downloadBankExtract() {
    setError(null);
    setBusy("bank");
    try {
      await downloadFromApi(
        "/api/bank-extract-pdf",
        mode === "sample" ? { sample: true } : {},
        "petikan-bank.pdf",
      );
    } catch (e) {
      setError({ where: "bank", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const errorBanner = (where: "pack" | "bank") =>
    error && error.where === where ? (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base whitespace-pre-line text-red-900">
        {error.msg}
      </div>
    ) : null;

  const heading = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-blue-400/15 dark:ring-white/10">
          🏛️
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            {/* G-4: the abbreviation is spelled out, all three languages. */}
            <Tri
              bm="Pek Mesyuarat Agung Tahunan (AGM)"
              zh="常年大会文件包（Mesyuarat Agung Tahunan · AGM）"
              en="Annual General Meeting (AGM) pack"
            />
          </span>
        </h1>
      </div>
    </div>
  );

  // ---- SAMPLE MODE: the fictional society, loudly labelled. ---------------
  if (mode === "sample") {
    const p = sampleAgmPackParams;
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
        {heading}
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm={`Anda sedang melihat CONTOH. Semuanya di bawah — pertubuhan "${p.orgName}", tarikh, AJK — adalah rekaan. PDF dicap “CONTOH — JANGAN GUNA” pada setiap halaman.`}
            zh={`您现在看的是【示范】。下面的一切 ——「${p.orgName}」、日期、理事 —— 都是虚构的。PDF 每页盖「示范 — 请勿使用」。`}
            en={`You are looking at the WORKED EXAMPLE. Everything below — the society "${p.orgName}", dates, committee — is fictional. The PDFs are stamped "SAMPLE — DO NOT USE" on every page.`}
          />{" "}
          <Link href="/agm-pack" className="font-semibold underline underline-offset-4">
            <Tri bm="Kembali ke data anda" zh="回到您自己的资料" en="Back to your own data" /> →
          </Link>
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              <Tri bm="Contoh pek AGM" zh="示范：大会文件包" en="Sample AGM pack" />
            </CardTitle>
            <CardDescription>
              <Tri
                bm={`Notis, agenda (${defaultAgmAgendaBm(p.year).length}), senarai kehadiran, borang proksi — semuanya rekaan.`}
                zh={`通知、议程（${defaultAgmAgendaBm(p.year).length} 项）、出席名单、委托书 —— 全部虚构。`}
                en={`Notice, agenda (${defaultAgmAgendaBm(p.year).length}), attendance list, proxy forms — all fictional.`}
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {errorBanner("pack")}
            <Button onClick={downloadPack} size="lg" disabled={busy !== null} className="self-start">
              {busy === "pack" ? (
                <Tri bm="Sedang menyiapkan…" zh="正在准备…" en="Preparing…" />
              ) : (
                <>
                  <Download className="h-5 w-5" strokeWidth={2} />
                  <Tri bm="Muat turun contoh pek AGM" zh="下载示范文件包" en="Download the sample pack" /> (PDF)
                </>
              )}
            </Button>
            {errorBanner("bank")}
            <Button onClick={downloadBankExtract} size="lg" variant="outline" disabled={busy !== null} className="self-start">
              {busy === "bank" ? (
                <Tri bm="Sedang menyiapkan…" zh="正在准备…" en="Preparing…" />
              ) : (
                <>
                  <Download className="h-5 w-5" strokeWidth={2} />
                  <Tri bm="Muat turun contoh petikan bank" zh="下载示范银行摘录" en="Download the sample bank extract" /> (PDF)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- REAL MODE, EMPTY ROSTER: honest, and it says what unlocks it. ------
  if (roster.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
        {heading}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              <Tri
                bm="Senarai AJK anda belum ada dalam sistem"
                zh="您的理事名单还没进系统"
                en="Your committee roster is not in the system yet"
              />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Pek AGM dibina daripada AJK pertubuhan anda sendiri — notis, senarai kehadiran dan borang proksi semuanya menyebut nama sebenar. Tambah ahli dahulu (taip, atau import Excel), dan halaman ini terus berfungsi."
                zh="大会文件包是用您社团自己的理事做的 —— 通知、出席名单、委托书上印的都是真名。先把成员加进来（打字或导入 Excel），这一页就能用了。"
                en="The AGM pack is built from your own committee — the notice, attendance sheet and proxy forms all carry real names. Add your members first (typed or Excel import) and this page comes alive."
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/members">
                👥 <Tri bm="Pergi ke halaman Ahli" zh="去「成员」页" en="Go to Members" /> →
              </Link>
            </Button>
            {/* The sample is a SEPARATE thing, and says so (拍板⑥). */}
            <Link
              href="/agm-pack?contoh=1"
              className="text-base text-muted-foreground underline underline-offset-4"
            >
              <Tri
                bm="Lihat contoh siap (data rekaan)"
                zh="看一个做好的示范（虚构资料）"
                en="See a worked example (fictional data)"
              />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- REAL MODE, ROSTER PRESENT: the real thing, no CONTOH. --------------
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      {heading}

      {/* 1 — the meeting facts (the person is ANNOUNCING a future meeting —
          these three answers exist nowhere else) + the real roster. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            1 · <Tri bm="Maklumat mesyuarat & AJK" zh="会议资料与理事名单" en="Meeting facts & committee" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Isi tarikh, masa dan tempat mesyuarat agung anda; senarai AJK diambil terus daripada rekod pertubuhan."
              zh="填上大会的日期、时间、地点；理事名单直接取自机构的记录。"
              en="Fill in your general meeting's date, time and venue; the committee list comes straight from the organisation's records."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="Tarikh" zh="日期" en="Date" />
              </span>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-2 text-base"
                value={dateIso}
                min={todayIso}
                onChange={(e) => setDateIso(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="Masa" zh="时间" en="Time" />
              </span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-base"
                placeholder={t("cth: 10:00 pagi", "例：早上 10 点", "e.g. 10:00 am")}
                value={timeText}
                onChange={(e) => setTimeText(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri bm="Tempat" zh="地点" en="Venue" />
              </span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-base"
                placeholder={t("cth: Dewan utama", "例：大礼堂", "e.g. Main hall")}
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
              {/* BM guard (J 8/27): the notice/agenda/proxy are official BM
                  documents — a Chinese venue lands verbatim in all of them. */}
              {hasCjk(venue) && (
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  🛑{" "}
                  <Tri
                    bm="Dokumen pek AGM ialah dokumen rasmi Bahasa Malaysia — tulis tempat dalam BM (cth: Dewan Besar)."
                    zh="AGM 文件包是马来文正式文件 —— 地点请写马来文（例：Dewan Besar）。"
                    en="The AGM pack is an official Bahasa Malaysia document — write the venue in BM (e.g. Dewan Besar)."
                  />
                </span>
              )}
            </label>
          </div>
          {factsReady && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              ⚠{" "}
              <Tri
                bm={`Tempoh notis ${NOTICE_DAYS_DEFAULT} hari ialah nilai lalai Minit, BUKAN daripada perlembagaan anda — semak fasal notis perlembagaan sendiri. Notis terakhir yang dibenarkan:`}
                zh={`${NOTICE_DAYS_DEFAULT} 天通知期是 Minit 的预设值，不是从您的章程读的 —— 请自行核对章程的通知条文。最迟发通知日期：`}
                en={`The ${NOTICE_DAYS_DEFAULT}-day notice period is Minit's default, NOT read from your constitution — check your own notice clause. Latest permitted notice date:`}
              />{" "}
              <span className="font-semibold">
                {formatDateBm(latestNoticeDateIso(dateIso, NOTICE_DAYS_DEFAULT))}
              </span>
            </div>
          )}
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead><Tri bm="Jawatan" zh="职位" en="Position" /></TableHead>
                <TableHead><Tri bm="Nama" zh="姓名" en="Name" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{m.position}</TableCell>
                  <TableCell className="whitespace-normal font-medium">{m.personName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 2 — the pack itself. DRAF watermark until confirmed; never CONTOH. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            2 · <Tri bm="Jana pek AGM anda" zh="生成您的大会文件包" en="Generate your AGM pack" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm={`Notis, agenda (${defaultAgmAgendaBm(year).length}), senarai kehadiran, borang proksi — atas nama pertubuhan anda sendiri, bertanda air DRAF sehingga disahkan.`}
              zh={`通知、议程（${defaultAgmAgendaBm(year).length} 项）、出席名单、委托书 —— 用您自己机构的名义，确认前带草稿水印。`}
              en={`Notice, agenda (${defaultAgmAgendaBm(year).length}), attendance sheet, proxy forms — on your own organisation's name, DRAFT-watermarked until confirmed.`}
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!factsReady && (
            <p className="rounded-md border-2 border-dashed p-3 text-base text-muted-foreground">
              <Tri
                bm="Isi tarikh, masa dan tempat di atas dahulu."
                zh="请先在上面填好日期、时间、地点。"
                en="Fill in the date, time and venue above first."
              />
            </p>
          )}
          {errorBanner("pack")}
          <Button
            onClick={downloadPack}
            size="lg"
            disabled={busy !== null || !factsReady}
            className="self-start"
          >
            {busy === "pack" ? (
              <Tri bm="Sedang menyiapkan…" zh="正在准备…" en="Preparing…" />
            ) : (
              <>
                <Download className="h-5 w-5" strokeWidth={2} />
                <Tri bm="Muat turun pek AGM" zh="下载大会文件包" en="Download the AGM pack" /> (PDF)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 3 — bank-resolution extract, from CONFIRMED minutes in the DB only. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            3 · <Tri bm="Petikan minit untuk bank" zh="给银行的会议记录摘录" en="Bank-resolution extract" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Daripada minit DISAHKAN pertubuhan anda sahaja, kata demi kata — bank bertindak atas dokumen ini."
              zh="只取自您机构「已确认」的会议记录，逐字引用 —— 银行会依据这份文件办事。"
              en="From your organisation's CONFIRMED minutes only, verbatim — a bank acts on this document."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {confirmedResolutions === null || confirmedResolutions.length === 0 ? (
            <p className="rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
              <Tri
                bm="Belum ada minit disahkan dengan keputusan untuk dipetik. Sahkan minit mesyuarat itu dahulu."
                zh="还没有已确认、带决议的会议记录可以摘录。请先去确认那场会议的记录。"
                en="No confirmed minutes with resolutions to extract yet. Confirm that meeting's minutes first."
              />{" "}
              <Link href="/minutes" className="underline underline-offset-4">
                <Tri bm="Pergi ke Minit" zh="去会议记录" en="Go to Minutes" /> →
              </Link>
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {confirmedResolutions.map((r, i) => (
                  <div
                    key={i}
                    className={
                      signatoryHits.has(r)
                        ? "rounded-md border border-green-300 bg-green-50 p-4"
                        : "rounded-md border p-4 text-muted-foreground"
                    }
                  >
                    {signatoryHits.has(r) && (
                      <Badge variant="outline" className="mb-1 border-green-300 bg-green-100 text-green-800">
                        <Tri bm="Akan disertakan" zh="会收录" en="Will be included" />
                      </Badge>
                    )}
                    <div>{r}</div>
                  </div>
                ))}
              </div>
              {errorBanner("bank")}
              <Button
                onClick={downloadBankExtract}
                size="lg"
                disabled={busy !== null}
                className="self-start"
              >
                {busy === "bank" ? (
                  <Tri bm="Sedang menyiapkan…" zh="正在准备…" en="Preparing…" />
                ) : (
                  <>
                    <Download className="h-5 w-5" strokeWidth={2} />
                    <Tri bm="Muat turun petikan bank" zh="下载银行摘录" en="Download the bank extract" /> (PDF)
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/agm-pack?contoh=1" className="underline underline-offset-4">
          <Tri
            bm="Lihat contoh siap (data rekaan, dicap CONTOH)"
            zh="看一个做好的示范（虚构资料，盖 CONTOH 章）"
            en="See a worked example (fictional data, stamped CONTOH)"
          />
        </Link>
      </p>
    </div>
  );
}
