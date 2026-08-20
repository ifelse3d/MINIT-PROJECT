"use client";

import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
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
  buildAgmNoticeBm,
  defaultAgmAgendaBm,
  findSignatoryResolutions,
  formatDateBm,
  latestNoticeDateIso,
} from "@/lib/agm-pack";
import { sampleAgmPackParams, sampleConfirmedMinutes } from "@/lib/sample-roster";

// ---------------------------------------------------------------------------
// The AGM PACK screen (Phase 4 foundation). Driven by sample data until the
// API key + Supabase are connected; the date math and document builders are
// the real, unit-tested functions. The eROSES test: the human reviews and
// taps — no data-entry forms.
// ---------------------------------------------------------------------------

async function downloadFromApi(url: string, body: unknown, fallbackName: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? joinUserError(USER_ERRORS.downloadFailed));
  }
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  // Revoking immediately after click() races the download in Firefox/Safari.
  // Give the browser a moment to take ownership of the blob. (2026-07-28 audit.)
  const href = a.href;
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

export function AgmPackReview() {
  const p = sampleAgmPackParams;
  const [error, setError] = useState<{ where: "pack" | "bank"; msg: string } | null>(null);
  // Every download here is a server round-trip that builds a PDF. Without a
  // busy state the button looked dead for several seconds and our users tapped
  // it repeatedly, starting overlapping downloads. (2026-07-28 audit.)
  const [busy, setBusy] = useState<"pack" | "bank" | null>(null);

  const noticePreview = useMemo(() => buildAgmNoticeBm(p), [p]);
  const signatoryHits = useMemo(
    () => new Set(findSignatoryResolutions(sampleConfirmedMinutes.resolutions)),
    []
  );

  async function downloadPack() {
    setError(null);
    setBusy("pack");
    try {
      await downloadFromApi("/api/agm-pdf", p, `contoh-pek-agm-${p.year}.pdf`);
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
        sampleConfirmedMinutes,
        "contoh-petikan-bank.pdf"
      );
    } catch (e) {
      setError({ where: "bank", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const errorBanner = (where: "pack" | "bank") =>
    error && error.where === where ? (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
        {error.msg}
      </div>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-blue-400/15 dark:ring-white/10">
            🏛️
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Pek AGM" zh="年度大会文件包" en="AGM Pack" />
            </span>
          </h1>
          {/* The "Sample data" badge is gone: the paragraph below says the same
              thing properly, and two labels for one fact is just noise. This
              page really is entirely an example, so the paragraph STAYS —
              deleting it would leave a lie on screen. */}
        </div>
        <p className="text-base text-muted-foreground">
          {p.orgName} · AGM {p.year}
        </p>
        {/* A badge on a page that can NEVER show real data is mislabelling: it
            implies "sample for now". Say what is actually true. (2026-07-28.) */}
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Halaman ini masih contoh sepenuhnya. Nama pertubuhan, tarikh AGM, tempat dan senarai AJK di bawah adalah rekaan — bukan milik anda. PDF yang dimuat turun dicap “CONTOH — JANGAN GUNA” pada setiap halaman dan tidak boleh diserahkan kepada ROS atau bank."
            zh="这一页目前完全是示范内容。下面的机构名称、大会日期、地点和理事名单都是虚构的，不是您的资料。下载的 PDF 每一页都会盖上「示范 — 请勿使用」，不能拿去交给社团注册局或银行。"
            en="This page is still entirely an example. The organisation, AGM date, venue and committee list below are invented — they are not yours. Any PDF you download is stamped “SAMPLE — DO NOT USE” on every page and cannot be given to the Registry of Societies or a bank."
          />
        </p>
      </div>

      {/* 1 — Meeting facts + roster review */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">1 · <Tri bm="Semakan maklumat" zh="核对资料" en="Review the facts" /></CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            ⚠{" "}
            {/* Was "notice period from settings" — /settings has no such
                control, so the user was pointed at a lever that does not exist.
                (2026-07-28 audit.) */}
            <Tri
              bm={`Tempoh notis ${p.noticePeriodDays} hari ialah nilai lalai Minit, BUKAN daripada perlembagaan anda. Semak fasal notis dalam perlembagaan pertubuhan anda. Notis terakhir yang dibenarkan:`}
              zh={`${p.noticePeriodDays} 天的通知期是 Minit 的预设值，不是从您的章程读出来的。请自行核对章程里关于通知期的条文。最迟发出通知的日期：`}
              en={`The ${p.noticePeriodDays}-day notice period is Minit's default, NOT read from your constitution. Check the notice clause in your own constitution. Latest permitted notice date:`}
            />{" "}
            <span className="font-semibold">
              {formatDateBm(latestNoticeDateIso(p.meetingDateIso, p.noticePeriodDays))}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border p-4">
              <div className="text-sm text-muted-foreground">
                <Tri bm="Tarikh & masa" zh="日期与时间" en="Date & time" />
              </div>
              <div className="font-semibold">
                {formatDateBm(p.meetingDateIso)} · {p.meetingTimeText}
              </div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-sm text-muted-foreground">
                <Tri bm="Tempat" zh="地点" en="Venue" />
              </div>
              <div className="font-semibold">{p.venue}</div>
            </div>
          </div>
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead><Tri bm="Jawatan" zh="职位" en="Position" /></TableHead>
                <TableHead><Tri bm="Nama" zh="姓名" en="Name" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.roster.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{m.position}</TableCell>
                  <TableCell className="whitespace-normal font-medium">{m.personName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 2 — Pack preview + download */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">2 · <Tri bm="Jana pek AGM" zh="生成大会文件包" en="Generate the AGM pack" /></CardTitle>
          <CardDescription>
            <Tri
              bm={`Notis, agenda (${defaultAgmAgendaBm(p.year).length}), senarai kehadiran, borang proksi. Bertanda air DRAF.`}
              zh={`通知、议程（${defaultAgmAgendaBm(p.year).length} 项）、出席名单、委托书。带草稿水印。`}
              en={`Notice, agenda (${defaultAgmAgendaBm(p.year).length}), attendance list, proxy forms. DRAFT watermark.`}
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4 text-base whitespace-pre-wrap">
            {noticePreview}
          </pre>
          {errorBanner("pack")}
          <Button
            onClick={downloadPack}
            size="lg"
            disabled={busy !== null}
            className="self-start"
          >
            {busy === "pack" ? (
              <Tri bm="Sedang menyiapkan…" zh="正在准备…" en="Preparing…" />
            ) : (
              <>
                <Download className="h-5 w-5" strokeWidth={2} />
                <Tri
                  bm="Muat turun contoh pek AGM"
                  zh="下载示范用的大会文件包"
                  en="Download the sample AGM pack"
                />{" "}
                (PDF)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 3 — Bank-resolution extract */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            3 · <Tri bm="Petikan minit untuk bank" zh="给银行的会议记录摘录" en="Bank-resolution extract" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Daripada minit disahkan sahaja, kata demi kata."
              zh="仅取自已确认的会议记录，逐字引用。"
              en="From confirmed minutes only, verbatim."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {sampleConfirmedMinutes.resolutions.map((r, i) => (
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
          {/* The second button here used to be labelled "try it, it will be
              rejected" — a developer demo control sitting beside the real
              download, same size, same row. An elderly user taps it and gets
              "Extract refused" in English. Nothing offered to this user should
              be designed to fail, so it is gone. (2026-07-28 audit.) */}
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
                <Tri
                  bm="Muat turun contoh petikan bank"
                  zh="下载示范用的银行摘录"
                  en="Download the sample bank extract"
                />{" "}
                (PDF)
              </>
            )}
          </Button>
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Minit yang belum disahkan tidak akan pernah menghasilkan petikan ini — Minit menolaknya, kerana bank bertindak atas dokumen ini."
              zh="还没确认的会议记录永远不会生成这份摘录 —— Minit 会直接拒绝，因为银行会依据这份文件办事。"
              en="Unconfirmed minutes will never produce this extract — Minit refuses, because a bank acts on this document."
            />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
