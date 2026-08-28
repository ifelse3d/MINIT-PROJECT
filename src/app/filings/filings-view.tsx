"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri, useTriText } from "@/components/language-provider";
import { hasCjk } from "@/lib/bm-guard";
import { buildPastePack, type FilingRosterEntry } from "@/lib/paste-pack";
import { buildMeetingFormPack, erosesMeetingKind } from "@/lib/eroses-meeting";
import {
  isErosesFileable,
  meetingTypeUiLabelTri,
  NOT_FOR_ANNUAL_RETURN,
} from "@/lib/meeting-types";
import type {
  ConfirmedMinutesDoc,
  ConfirmedMinutesListItem,
} from "@/db/minutes-list";
import {
  DEADLINE_LABELS,
  daysLeftParts,
  deadlineUrgency,
  type Urgency,
} from "@/lib/deadlines";
import {
  computeStandardDeadlines,
  type ConfirmedAgm,
} from "@/lib/standard-deadlines";
import { dayIsoMalaysia } from "@/lib/history";
import { formatRm } from "@/lib/minutes-draft";

// ---------------------------------------------------------------------------
// /filings — REDESIGNED 2026-08-28 around J's own eROSES screenshots (item 6:
// the page never said WHAT was being filed). The portal has two separate jobs
// and the page now walks them in order:
//
//   1. PICK the meeting (year → that year's confirmed minutes).
//   2. REGISTER that meeting on eROSES (Pengurusan Mesyuarat → Tambah):
//      each portal box, ready to paste, plus the PDF its upload slot takes.
//   3. The ANNUAL RETURN (Penyata Tahunan) — separate, once a year, AGM/EGM
//      only; the paste-pack table lives here.
//
// Still a THIN page: every value comes from a CONFIRMED row in the database
// (S0-5) and the deadlines from computeStandardDeadlines. Read-only — no
// data-entry forms (the eROSES test).
// ---------------------------------------------------------------------------

const URGENCY_STYLE: Record<Urgency, string> = {
  overdue: "border-red-300 bg-red-100 text-red-900",
  due_soon: "border-amber-300 bg-amber-100 text-amber-900",
  ok: "border-green-300 bg-green-100 text-green-800",
  done: "border-slate-300 bg-slate-100 text-slate-700",
};

/** F-3: this year's statement totals, computed server-side — never typed. */
export type FilingsFinance = {
  year: string;
  /** The day the totals run to (today, Malaysia time). */
  toIso: string;
  incomeTotalCents: number;
  paymentsTotalCents: number;
  netCents: number;
};

const UNDATED = "—";

export function FilingsView({
  agm,
  meetings,
  selected,
  orgType = null,
  finance = null,
  filingRoster = [],
}: {
  agm: ConfirmedAgm | null;
  /** Every confirmed minutes document, newest first (server, org-scoped). */
  meetings: ConfirmedMinutesListItem[];
  /** The chosen document's stored facts (server) — ?doc=<id>. */
  selected: ConfirmedMinutesDoc | null;
  /** B-5: 'committee' = internal committee — no eROSES, no annual return. */
  orgType?: "registered" | "committee" | null;
  /** F-3: computed financial figures for the annual return, or null. */
  finance?: FilingsFinance | null;
  /** G-1: the committee roster (with IC names) the paste-pack files from. */
  filingRoster?: FilingRosterEntry[];
}) {
  const t = useTriText();
  const [copied, setCopied] = useState<string | null>(null);
  const [todayIso, setTodayIso] = useState<string | null>(null);

  useEffect(() => {
    setTodayIso(dayIsoMalaysia(new Date().toISOString()));
  }, []);

  // ---- Step 1: year → meetings of that year -------------------------------
  const years = useMemo(() => {
    const seen = new Set<string>();
    for (const m of meetings) {
      seen.add(m.meetingDateIso ? m.meetingDateIso.slice(0, 4) : UNDATED);
    }
    // Newest year first; the undated bucket (old rows) last.
    return [...seen].sort((a, b) =>
      a === UNDATED ? 1 : b === UNDATED ? -1 : b.localeCompare(a),
    );
  }, [meetings]);
  const [year, setYear] = useState<string>(() =>
    selected?.meetingDateIso
      ? selected.meetingDateIso.slice(0, 4)
      : (years[0] ?? UNDATED),
  );
  const yearMeetings = meetings.filter(
    (m) => (m.meetingDateIso ? m.meetingDateIso.slice(0, 4) : UNDATED) === year,
  );

  // ---- Step 2: the Tambah Mesyuarat pack for the chosen meeting -----------
  const meetingPack = useMemo(
    () =>
      selected
        ? buildMeetingFormPack({
            meetingType: selected.meetingType,
            meetingTypeLabel: selected.meetingTypeLabel,
            title: selected.title,
            meetingDateIso: selected.meetingDateIso,
            extraction: selected.extraction,
          })
        : null,
    [selected],
  );

  // ---- Step 3: the Annual Return pack (AGM/EGM only) ----------------------
  const annualPack = useMemo(
    () =>
      selected?.extraction && isErosesFileable(selected.meetingType)
        ? buildPastePack(selected.extraction, filingRoster)
        : null,
    [selected, filingRoster],
  );

  const deadlines = useMemo(
    () => (todayIso ? computeStandardDeadlines(todayIso, { agm, orgType }) : []),
    [todayIso, agm, orgType],
  );

  async function copyValue(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard unavailable — the value is still visible to copy by hand
    }
  }

  const copyButton = (key: string, value: string, disabled = false) => (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || value === "—"}
      onClick={() => copyValue(key, value)}
    >
      {copied === key ? (
        <>✓ <Tri bm="Disalin" zh="已复制" en="Copied" /></>
      ) : (
        <Tri bm="Salin" zh="复制" en="Copy" />
      )}
    </Button>
  );

  const meetingName = (m: ConfirmedMinutesListItem) => {
    if (m.title) return m.title;
    const l = meetingTypeUiLabelTri(m.meetingType, m.meetingTypeLabel);
    return `${t(l.bm, l.zh, l.en)}${m.meetingDateIso ? ` — ${m.meetingDateIso}` : ""}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-blue-400/15 dark:ring-white/10">
            📋
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Pemfailan eROSES" zh="eROSES 申报" en="eROSES Filings" />
            </span>
          </h1>
        </div>
        {/* Item 6's core complaint: the page never said what it was FOR. */}
        <p className="max-w-3xl text-base text-muted-foreground">
          <Tri
            bm="eROSES ialah laman web Jabatan Pendaftaran Pertubuhan (ROS). Ada DUA kerja di sana: ① daftarkan setiap mesyuarat penting (dan muat naik minitnya sebagai PDF); ② hantar Penyata Tahunan sekali setahun (perlu AGM). Halaman ini sediakan kedua-duanya — pilih mesyuarat dahulu."
            zh="eROSES 是社团注册局（ROS）的官方网站。在那边要做的其实是两件事：① 把重要会议登记上去（并上传会议记录 PDF）；② 每年交一次年度呈报（要有 AGM）。这一页把两件事的材料都准备好 —— 先选一场会议。"
            en="eROSES is the Registry of Societies' website. There are TWO jobs there: ① register each important meeting (and upload its minutes as a PDF); ② file the Annual Return once a year (needs an AGM). This page prepares both — pick a meeting first."
          />
        </p>
      </div>

      {/* B-5: an internal committee files nothing with ROS — say so instead
          of nagging, but keep the page working (a saved link must not break). */}
      {orgType === "committee" && (
        <p className="rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4 text-base">
          ℹ️{" "}
          <Tri
            bm="Pertubuhan ini didaftarkan dalam MinitAI sebagai jawatankuasa dalaman/sementara — ia tidak memfailkan apa-apa dengan eROSES. Bahagian di bawah kekal untuk rujukan."
            zh="这个机构在 MinitAI 里登记为内部／临时委员会 —— 不需要向 eROSES 申报。下面的内容仅供参考。"
            en="This organisation is set up in MinitAI as an internal/ad-hoc committee — it files nothing with eROSES. The sections below stay for reference."
          />
        </p>
      )}

      {/* 1 — pick the year, then the meeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            1 · <Tri bm="Pilih mesyuarat" zh="选一场会议" en="Pick the meeting" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Hanya minit yang SUDAH DISAHKAN boleh difailkan."
              zh="只有「已确认」的会议记录才能拿去申报。"
              en="Only CONFIRMED minutes can be filed."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {meetings.length === 0 ? (
            <p className="text-muted-foreground">
              <Tri
                bm="Pertubuhan ini belum ada minit mesyuarat yang disahkan."
                zh="这个机构还没有已确认的会议记录。"
                en="This organisation has no confirmed minutes yet."
              />{" "}
              <Link href="/minutes" className="underline underline-offset-4">
                <Tri bm="Pergi ke Minit" zh="前往会议记录" en="Go to Minutes" /> →
              </Link>
            </p>
          ) : (
            <>
              <label className="flex flex-wrap items-center gap-2 text-base">
                <span className="font-medium">
                  <Tri bm="Tahun" zh="哪一年" en="Year" />
                </span>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="h-11 min-w-32 rounded-sm border-2 border-input bg-white px-2 text-base dark:bg-transparent"
                  aria-label={t("Tahun", "哪一年", "Year")}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y === UNDATED ? t("Tiada tarikh", "没有日期", "No date") : y}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2">
                {yearMeetings.length === 0 && (
                  <p className="text-muted-foreground">
                    <Tri
                      bm="Tiada minit disahkan pada tahun ini."
                      zh="这一年没有已确认的会议记录。"
                      en="No confirmed minutes in this year."
                    />
                  </p>
                )}
                {yearMeetings.map((m) => {
                  const here = selected?.id === m.id;
                  const typeLabel = meetingTypeUiLabelTri(m.meetingType, m.meetingTypeLabel);
                  return (
                    <Link
                      key={m.id}
                      href={`/filings?doc=${m.id}`}
                      aria-current={here ? "true" : undefined}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-sm border-2 p-3 transition ${
                        here
                          ? "border-[#a855f7] bg-[#a855f7]/10"
                          : "border-input hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{meetingName(m)}</span>
                        {m.title && (
                          <span className="text-sm text-muted-foreground">
                            <Tri {...typeLabel} />
                            {m.meetingDateIso ? ` — ${m.meetingDateIso}` : ""}
                          </span>
                        )}
                      </span>

                      <span className="flex items-center gap-2">
                        {/* 28/8 evening item 8: say up front which meetings
                            the portal actually takes — picking an unmarked
                            one and only THEN being told "usually not
                            registered" was the 怪怪的. */}
                        {erosesMeetingKind(m.meetingType) !== null && (
                          <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-900">
                            <Tri
                              bm="Boleh didaftar di eROSES"
                              zh="可登记进 eROSES"
                              en="Registrable on eROSES"
                            />
                          </Badge>
                        )}
                        {isErosesFileable(m.meetingType) && (
                          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-900">
                            <Tri
                              bm="Masuk Penyata Tahunan"
                              zh="进年度呈报"
                              en="Annual Return meeting"
                            />
                          </Badge>
                        )}
                        {here && (
                          <Badge className="bg-[#a855f7] text-white hover:bg-[#a855f7]">
                            <Tri bm="Dipilih" zh="已选" en="Selected" />
                          </Badge>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2 — register THAT meeting on the portal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            2 ·{" "}
            <Tri
              bm="Daftarkan mesyuarat ini di eROSES"
              zh="把这场会议登记进 eROSES"
              en="Register this meeting on eROSES"
            />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Di eROSES: Pertubuhan → pilih pertubuhan anda → Pengurusan Mesyuarat → Tambah. Kemudian salin nilai di bawah ke dalam kotak yang sama nama."
              zh="在 eROSES 网站：Pertubuhan → 选你们的机构 → Pengurusan Mesyuarat → 按 Tambah。然后把下面的值一格一格贴进同名的框。"
              en="On eROSES: Pertubuhan → your organisation → Pengurusan Mesyuarat → Tambah. Then copy each value below into the box with the same name."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!selected || !meetingPack ? (
            <p className="text-muted-foreground">
              <Tri
                bm="Pilih mesyuarat di bahagian 1 dahulu."
                zh="请先在第 1 步选一场会议。"
                en="Pick a meeting in step 1 first."
              />
            </p>
          ) : erosesMeetingKind(selected.meetingType) === null ? (
            // 28/8 evening item 8 (「还是怪怪的」): the page used to lay out
            // the whole paste-the-values walk for a meeting, then admit in a
            // footnote that this KIND of meeting is not in the portal's
            // dropdown at all. The conclusion now comes first; the values
            // stay one fold away for the person who wants them anyway.
            <div className="flex flex-col gap-3">
              <p className="rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4 text-base">
                ✅{" "}
                <Tri
                  bm="Mesyuarat ini TIDAK perlu didaftarkan di eROSES. Dropdown portal hanya ada Mesyuarat Agung / Khas / AJK (dan pembubaran) — mesyuarat program/aktiviti seperti ini cukup disimpan dalam MinitAI. Kalau ia sebenarnya mesyuarat jawatankuasa, betulkan jenisnya pada minit itu."
                  zh="这场会议不用登记进 eROSES。portal 的下拉里只有 常年大会 / 特别大会 / 理事会议（和解散会议）—— 像这样的活动会议，记录留在 MinitAI 就够了。要登记的会议，请在第 1 步选有「可登记进 eROSES」标记的那场；如果这场其实是理事开的会，就回去把那份记录的会议类型改成理事会议。"
                  en="This meeting does NOT need registering on eROSES. The portal's dropdown only has general / extraordinary / committee meetings (and dissolution) — a programme/activity meeting like this one is fully served by its MinitAI record. To register a meeting, pick one tagged 'Registrable on eROSES' in step 1; if this really was a committee sitting, fix that document's meeting type."
                />
              </p>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
                  <Tri
                    bm="Saya nak daftarkannya juga — tunjukkan nilai medan"
                    zh="我还是要登记它 —— 展开逐栏的值"
                    en="I want to register it anyway — show the field values"
                  />
                </summary>
                <div className="mt-3 grid gap-3">
                  {meetingPack.map((row) => (
                    <div key={row.field} className="rounded-sm border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{row.field}</div>
                          <div className="text-sm text-muted-foreground">{row.fieldEn}</div>
                        </div>
                        {row.copyable && copyButton(`meeting-${row.field}`, row.value)}
                      </div>
                      <div className="mt-2 whitespace-normal">{row.value}</div>
                      {row.note && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <Tri {...row.note} />
                        </p>
                      )}
                    </div>
                  ))}
                  <div>
                    <Button asChild size="lg" variant="outline">
                      <a
                        href={`/api/minutes-pdf?id=${selected.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        📄{" "}
                        <Tri
                          bm="Muat turun PDF minit"
                          zh="下载会议记录 PDF"
                          en="Download the minutes PDF"
                        />
                      </a>
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          ) : (
            <>
              {selected.extraction === null && (
                <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                  <Tri
                    bm="Minit ini disimpan sebelum MinitAI mula menyimpan butiran semakan — tempat dan bilangan kehadiran tiada di sini. Buka dokumennya di Sejarah untuk menyalin sendiri."
                    zh="这份记录是旧版保存的，没有存核对资料 —— 地点和出席人数这里给不了。可以到「历史」打开文件自己抄。"
                    en="This document was saved before MinitAI stored the review details — venue and attendance are not available here. Open it in History to copy by hand."
                  />
                </p>
              )}
              <div className="grid gap-3">
                {meetingPack.map((row) => (
                  <div key={row.field} className="rounded-sm border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{row.field}</div>
                        <div className="text-sm text-muted-foreground">{row.fieldEn}</div>
                      </div>
                      {row.copyable && copyButton(`meeting-${row.field}`, row.value)}
                    </div>
                    <div className="mt-2 whitespace-normal">
                      {row.value}
                      {hasCjk(row.value) && (
                        <div className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
                          🛑{" "}
                          <Tri
                            bm="Masih berbahasa Cina — eROSES perlukan Bahasa Malaysia."
                            zh="这一格还有华语 —— eROSES 要马来文。"
                            en="Still contains Chinese — eROSES needs Bahasa Malaysia."
                          />
                        </div>
                      )}
                    </div>
                    {row.note && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        <Tri {...row.note} />
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <a
                    href={`/api/minutes-pdf?id=${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    📄{" "}
                    <Tri
                      bm="Muat turun PDF minit (untuk kotak Muat Naik)"
                      zh="下载会议记录 PDF（就是上传框要的文件）"
                      en="Download the minutes PDF (the file the upload box takes)"
                    />
                  </a>
                </Button>
                <span className="text-sm text-muted-foreground">
                  <Tri
                    bm="PDF, bawah 25MB — sama seperti templat portal."
                    zh="PDF、25MB 以内 —— 符合网站的要求。"
                    en="PDF, under 25MB — what the portal accepts."
                  />
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3 — the Annual Return (a separate, once-a-year job) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            3 ·{" "}
            <Tri
              bm="Penyata Tahunan (sekali setahun)"
              zh="年度呈报（一年一次）"
              en="Annual Return (once a year)"
            />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Di eROSES: Pertubuhan → Penyata Tahunan → Tambah → pilih tahun. Ia dibina daripada mesyuarat agung (AGM/EGM) tahun itu."
              zh="在 eROSES 网站：Pertubuhan → Penyata Tahunan → Tambah → 选年份。它要用那一年的会员大会（AGM/EGM）资料。"
              en="On eROSES: Pertubuhan → Penyata Tahunan → Tambah → pick the year. It is built from that year's general meeting (AGM/EGM)."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {annualPack ? (
            <div className="overflow-x-auto rounded-sm border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Tri bm="Medan eROSES" zh="eROSES 字段" en="eROSES field" />
                    </TableHead>
                    <TableHead>
                      <Tri bm="Nilai untuk ditampal" zh="要粘贴的值" en="Value to paste" />
                    </TableHead>
                    <TableHead>
                      <Tri bm="Status" zh="状态" en="Status" />
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {annualPack.map((row) => (
                    <TableRow key={row.erosesField}>
                      <TableCell>
                        <div className="font-medium">{row.erosesField}</div>
                        <div className="text-sm text-muted-foreground">{row.erosesFieldEn}</div>
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        {row.value}
                        {/* BM guard (J 8/27): eROSES fields must be BM. */}
                        {hasCjk(row.value) && (
                          <div className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
                            🛑{" "}
                            <Tri
                              bm="Masih berbahasa Cina — eROSES perlukan Bahasa Malaysia. Betulkan pada minit itu."
                              zh="这一格还有华语 —— eROSES 要马来文。请回到那份会议记录改。"
                              en="Still contains Chinese — eROSES needs Bahasa Malaysia. Fix it on that minutes document."
                            />
                          </div>
                        )}
                        {row.note && (
                          <div className="mt-1 text-sm text-muted-foreground">{row.note}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge level={row.confidence} />
                      </TableCell>
                      <TableCell>
                        {copyButton(`annual-${row.erosesField}`, row.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : selected && !isErosesFileable(selected.meetingType) ? (
            <div className="flex flex-col gap-2">
              <p className="rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-3 text-base">
                ℹ️ <Tri {...NOT_FOR_ANNUAL_RETURN} />
              </p>
              <p className="text-sm text-muted-foreground">
                {meetings.some((m) => isErosesFileable(m.meetingType)) ? (
                  <Tri
                    bm="Untuk Penyata Tahunan: pilih minit AGM/EGM anda di bahagian 1 (bertanda 'Masuk Penyata Tahunan')."
                    zh="要做年度呈报：回到第 1 步选你们的 AGM/EGM 记录（有「进年度呈报」标记的那场）。"
                    en="For the Annual Return: pick your AGM/EGM minutes in step 1 (the one tagged 'Annual Return meeting')."
                  />
                ) : (
                  <Tri
                    bm="Pertubuhan ini belum ada minit AGM/EGM yang disahkan — sahkan minit mesyuarat agung anda dahulu, barulah Penyata Tahunan ada bahan."
                    zh="这个机构还没有已确认的 AGM/EGM 记录 —— 先把会员大会的会议记录确认了，年度呈报才有材料。"
                    en="This organisation has no confirmed AGM/EGM minutes yet — confirm your general meeting's minutes first, then the Annual Return has its material."
                  />
                )}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              <Tri
                bm="Pilih mesyuarat di bahagian 1 dahulu."
                zh="请先在第 1 步选一场会议。"
                en="Pick a meeting in step 1 first."
              />
            </p>
          )}
        </CardContent>
      </Card>

      {/* F-3 (work order 27): the annual return's FINANCIAL figures — computed
          from the statement (a table lookup, AI involved nowhere), with the
          source one tap away. Copyable like the paste-pack rows. */}
      {finance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              💰{" "}
              <Tri
                bm={`Angka kewangan ${finance.year} (dikira daripada penyata)`}
                zh={`${finance.year} 年财务数字（由财报算出）`}
                en={`${finance.year} financial figures (computed from the statement)`}
              />
            </CardTitle>
            <CardDescription>
              <Tri
                bm={`Sehingga ${finance.toIso}. Dikira oleh sistem daripada rekod tersimpan — bukan AI, bukan taipan tangan.`}
                zh={`算到 ${finance.toIso}。由系统从已保存的记录算出 —— 不是 AI，也不是手抄。`}
                en={`Up to ${finance.toIso}. Computed by the system from stored records — not AI, not hand-typed.`}
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[
              {
                key: "income",
                bm: "Jumlah penerimaan / Total income",
                zh: "收入合计",
                en: "Total income",
                cents: finance.incomeTotalCents,
              },
              {
                key: "payments",
                bm: "Jumlah pembayaran / Total payments",
                zh: "支出合计",
                en: "Total payments",
                cents: finance.paymentsTotalCents,
              },
              {
                key: "net",
                bm: "Lebihan / Kurangan (bersih)",
                zh: "结余（净额）",
                en: "Net surplus / deficit",
                cents: finance.netCents,
              },
            ].map((row) => {
              const value = `${row.cents < 0 ? "-" : ""}${formatRm(Math.abs(row.cents))}`;
              return (
                <div
                  key={row.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border p-3"
                >
                  <span className="font-medium">
                    <Tri bm={row.bm} zh={row.zh} en={row.en} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{value}</span>
                    {copyButton(`finance-${row.key}`, value)}
                  </span>
                </div>
              );
            })}
            <p className="text-sm text-muted-foreground">
              <Link href="/money/report" className="underline underline-offset-4">
                <Tri
                  bm="Lihat penyata penuh (sumber angka ini)"
                  zh="看完整财报（这些数字的来源）"
                  en="See the full statement (the source of these figures)"
                />{" "}
                →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4 — Deadlines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <Tri bm="Tarikh akhir" zh="截止日期" en="Deadlines" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Dikira oleh sistem, bukan AI."
              zh="由系统计算，不是 AI。"
              en="Computed by the system, not the AI."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* No confirmed AGM ⇒ no annual-return deadline is shown at all. */}
          {!agm && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="Tarikh akhir Penyata Tahunan belum boleh dikira: pertubuhan ini belum ada minit Mesyuarat Agung yang disahkan. Sahkan minit AGM anda dahulu."
                zh="还不能算出年度呈报的截止日期：这个机构还没有已确认的会员大会（AGM）记录。请先确认您的 AGM 会议记录。"
                en="The Annual Return deadline cannot be worked out yet: this organisation has no confirmed AGM minutes. Confirm your AGM minutes first."
              />{" "}
              <Link href="/minutes" className="underline underline-offset-4">
                <Tri bm="Pergi ke Minit" zh="前往会议记录" en="Go to Minutes" /> →
              </Link>
            </p>
          )}
          {todayIso &&
            deadlines.map((d) => {
              const u = deadlineUrgency(d, todayIso);
              const label = DEADLINE_LABELS[d.kind];
              return (
                <div
                  key={`${d.kind}-${d.dueDateIso}`}
                  className="flex flex-wrap items-center gap-3 rounded-sm border p-4"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      <Tri bm={label.bm} zh={label.zh} en={label.en} />
                    </p>
                    <p className="text-sm text-muted-foreground">{d.source}</p>
                  </div>
                  <span className="font-mono text-sm">{d.dueDateIso}</span>
                  <Badge variant="outline" className={URGENCY_STYLE[u]}>
                    <Tri {...daysLeftParts(d, todayIso)} />
                  </Badge>
                </div>
              );
            })}
          <Link href="/calendar" className="text-sm underline underline-offset-4">
            <Tri bm="Lihat kalendar penuh" zh="查看完整日历" en="See the full calendar" /> →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
