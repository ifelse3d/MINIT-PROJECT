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
import { buildPastePack } from "@/lib/paste-pack";
import type { MeetingNotesExtraction } from "@/lib/extraction";
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
// /filings — a THIN aggregation page (FIX 5). Nothing is rebuilt here:
// the paste-pack comes from the latest CONFIRMED minutes in the database
// (S0-5, 2026-08-25 — it used to read this browser's half-checked draft, so a
// government filing could be pasted from a document no human had signed), and
// the deadlines come from the same computeStandardDeadlines the /calendar
// sidebar uses. Read-only — no data-entry forms (the eROSES test).
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

export function FilingsView({
  agm,
  confirmed,
  orgType = null,
  finance = null,
}: {
  agm: ConfirmedAgm | null;
  /** The latest CONFIRMED minutes' extraction, from the server (S0-5). */
  confirmed: { extraction: MeetingNotesExtraction; confirmedOnIso: string | null } | null;
  /** B-5: 'committee' = internal committee — no eROSES, no annual return. */
  orgType?: "registered" | "committee" | null;
  /** F-3: computed financial figures for the annual return, or null. */
  finance?: FilingsFinance | null;
}) {
  const t = useTriText();
  const extraction = confirmed?.extraction ?? null;
  const [copied, setCopied] = useState<string | null>(null);
  const [todayIso, setTodayIso] = useState<string | null>(null);

  useEffect(() => {
    setTodayIso(dayIsoMalaysia(new Date().toISOString()));
  }, []);

  const pastePack = useMemo(
    () => (extraction ? buildPastePack(extraction) : null),
    [extraction],
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

  const filingYear = extraction?.meeting_date.value
    ? extraction.meeting_date.value.slice(0, 4)
    : null;
  const packReady =
    pastePack !== null && pastePack.every((r) => r.confidence !== "missing");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-blue-400/15 dark:ring-white/10">
            📋
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Pemfailan" zh="申报" en="Filings" />
            </span>
          </h1>
        </div>
      </div>

      {/* B-5: an internal committee files nothing with ROS — say so instead
          of nagging, but keep the page working (a saved link must not break). */}
      {orgType === "committee" && (
        <p className="rounded-xl border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4 text-base">
          ℹ️{" "}
          <Tri
            bm="Pertubuhan ini didaftarkan dalam Minit sebagai jawatankuasa dalaman/sementara — ia tidak memfailkan Penyata Tahunan eROSES. Bahagian di bawah kekal untuk rujukan."
            zh="这个机构在 Minit 里登记为内部／临时委员会 —— 不需要向 eROSES 提交年度呈报。下面的内容仅供参考。"
            en="This organisation is set up in Minit as an internal/ad-hoc committee — it does not file an eROSES Annual Return. The sections below stay for reference."
          />
        </p>
      )}

      {/* 1 — eROSES Annual Return paste-pack */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            1 · <Tri bm="Penyata Tahunan eROSES" zh="eROSES 年度呈报" en="eROSES Annual Return" />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="DRAF — semak sebelum guna."
              zh="草稿 —— 使用前请核对。"
              en="DRAFT — review before use."
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pastePack ? (
            <div className="overflow-x-auto rounded-lg border">
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
                  {pastePack.map((row) => (
                    <TableRow key={row.erosesField}>
                      <TableCell>
                        <div className="font-medium">{row.erosesField}</div>
                        <div className="text-sm text-muted-foreground">{row.erosesFieldEn}</div>
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        {row.value}
                        {row.note && (
                          <div className="mt-1 text-sm text-muted-foreground">{row.note}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge level={row.confidence} />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.value === "—"}
                          onClick={() => copyValue(row.erosesField, row.value)}
                        >
                          {copied === row.erosesField ? (
                            <>✓ <Tri bm="Disalin" zh="已复制" en="Copied" /></>
                          ) : (
                            <Tri bm="Salin" zh="复制" en="Copy" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground">
              <Tri
                bm="Pertubuhan ini belum ada minit mesyuarat yang DISAHKAN. Pek tampal hanya dibina daripada dokumen yang sudah disahkan."
                zh="这个机构还没有「已确认」的会议记录。粘贴包只会用已经确认过的文件来做。"
                en="This organisation has no CONFIRMED minutes yet. The paste-pack is only built from a confirmed document."
              />{" "}
              <Link href="/minutes" className="underline underline-offset-4">
                <Tri bm="Pergi ke Minit" zh="前往会议记录" en="Go to Minutes" /> →
              </Link>
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
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <span className="font-medium">
                    <Tri bm={row.bm} zh={row.zh} en={row.en} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{value}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyValue(`finance-${row.key}`, value)}
                    >
                      {copied === `finance-${row.key}` ? (
                        <>✓ <Tri bm="Disalin" zh="已复制" en="Copied" /></>
                      ) : (
                        <Tri bm="Salin" zh="复制" en="Copy" />
                      )}
                    </Button>
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

      {/* 2 — Deadlines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            2 · <Tri bm="Tarikh akhir" zh="截止日期" en="Deadlines" />
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
          {/* No confirmed AGM ⇒ no annual-return deadline is shown at all. We
              used to show one computed from fictional sample minutes. */}
          {!agm && (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
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
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-4"
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

      {/* 3 — Status checklist (derived, read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            3 · <Tri bm="Status pemfailan" zh="申报状态" en="Filing status" />
          </CardTitle>
          <CardDescription>
            {filingYear ? (
              <>
                <Tri bm="Tahun" zh="年度" en="Year" /> {filingYear}
              </>
            ) : (
              <Tri bm="Tiada tahun pemfailan lagi" zh="暂无申报年度" en="No filing year yet" />
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ChecklistItem
            done={extraction !== null}
            label={t("Minit mesyuarat diproses?", "会议记录已处理？", "Meeting minutes processed?")}
            href="/minutes"
          />
          <ChecklistItem
            done={packReady}
            label={t(
              "Pek tampal eROSES lengkap (tiada medan kosong)?",
              "eROSES 粘贴包完整（没有缺失字段）？",
              "eROSES paste-pack complete (no missing fields)?",
            )}
            href="/minutes"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
          done ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
        }`}
      >
        {done ? "✓" : "…"}
      </span>
      <span className="flex-1">{label}</span>
      {!done && (
        <Link href={href} className="text-sm underline underline-offset-4">
          <Tri bm="Selesaikan" zh="去完成" en="Complete it" /> →
        </Link>
      )}
    </div>
  );
}
