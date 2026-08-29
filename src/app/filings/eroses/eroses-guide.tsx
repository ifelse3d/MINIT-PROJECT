"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri, useTriText } from "@/components/language-provider";
import { hasCjk } from "@/lib/bm-guard";
import { isErosesFileable } from "@/lib/meeting-types";
import { penyataAmount, type PenyataKewangan } from "@/lib/eroses-penyata";
import type { PastePackRow } from "@/lib/paste-pack";

// ---------------------------------------------------------------------------
// THE NINE STEPS, exactly as the portal's "Langkah penyata tahunan" rail
// names them (J's screenshots, 2026-08-29). Left side: what THAT eROSES page
// asks, in words (the screenshots are J's own org and are not shipped).
// Right side: Minit's value with a COPY button — or the honest sentence
// naming the page that records it.
//
// Every ringgit figure arrives pre-computed by the server (eroses-penyata.ts,
// Hard Rule 2); this component only renders and copies.
// ---------------------------------------------------------------------------

export type GuideAuditor = {
  person_name: string;
  name_official: string | null;
  email: string | null;
  appointed_on: string | null;
  status: "active" | "inactive";
};

export type GuideMaklumat = {
  phone: string | null;
  financialYearStart: string | null;
  membersRegistered: number | null;
  membersVoting: number | null;
  banks: { bankName: string; accountNo: string }[];
};

type Props = {
  meetings: { id: number; label: string; meetingType: string }[];
  selectedId: number | null;
  selectedLabel: string | null;
  selectedMeetingType: string | null;
  pastePack: PastePackRow[] | null;
  /** null = database behind migration 34 (say so, never "no auditors"). */
  auditors: GuideAuditor[] | null;
  /** null = database behind migration 35. */
  maklumat: GuideMaklumat | null;
  committeeCount: number;
  branchCount: number;
  missingOfficialCount: number;
  penyata: PenyataKewangan | null;
  fromIso: string;
  toIso: string;
};

/** One value row: label → value → COPY (or the fix-it sentence). Module
 *  level (react-hooks/static-components); each row owns its "copied" tick. */
function ValueRow({
  id,
  labelBm,
  labelSub,
  value,
  fix,
  mono = false,
}: {
  id: string;
  labelBm: string;
  labelSub?: React.ReactNode;
  /** null/"" = missing → render `fix` instead of a copy button. */
  value: string | null;
  fix?: React.ReactNode;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const missing = value === null || value.trim() === "" || value === "—";
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-[color:var(--v2-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{labelBm}</div>
          {labelSub && <div className="text-sm text-muted-foreground">{labelSub}</div>}
        </div>
        {!missing && (
          <Button
            size="sm"
            variant="outline"
            data-copy-id={id}
            onClick={() => {
              // clipboard blocked (insecure origin / permission) — the value
              // is still on screen and selectable, so degrade, never break.
              void navigator.clipboard
                ?.writeText(value)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() => {});
            }}
          >
            {copied ? (
              <>✓ <Tri bm="Disalin" zh="已复制" en="Copied" /></>
            ) : (
              <Tri bm="Salin" zh="复制" en="Copy" />
            )}
          </Button>
        )}
      </div>
      {missing ? (
        <div className="text-base text-amber-900 dark:text-amber-100">{fix ?? "—"}</div>
      ) : (
        <div className={`whitespace-pre-wrap ${mono ? "font-mono" : ""}`}>{value}</div>
      )}
      {!missing && hasCjk(value) && (
        <div className="text-sm font-medium text-red-700 dark:text-red-300">
          🛑{" "}
          <Tri
            bm="Nilai ini masih berbahasa Cina — eROSES perlukan Bahasa Malaysia."
            zh="这一格还有华语 —— eROSES 要马来文。"
            en="This value still contains Chinese — eROSES needs Bahasa Malaysia."
          />
        </div>
      )}
    </div>
  );
}

/** A step card: number, the portal's own BM title (what the person must find
 *  on screen), the reader's language as a gloss beside it. */
function Step({
  n,
  titleBm,
  zh,
  en,
  describe,
  children,
}: {
  n: number;
  titleBm: string;
  zh: string;
  en: string;
  describe: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTriText();
  const gloss = t("", zh, en);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {n} · {titleBm}
          {gloss !== "" && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {gloss}
            </span>
          )}
        </CardTitle>
        <CardDescription>{describe}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

export function ErosesGuide(p: Props) {
  const t = useTriText();
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(key: string, value: string) {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
      })
      .catch(() => {
        // clipboard blocked — the value stays selectable on screen.
      });
  }

  const packRow = (field: string): PastePackRow | null =>
    p.pastePack?.find((r) => r.erosesField === field) ?? null;
  const fileable =
    p.selectedMeetingType !== null && isErosesFileable(p.selectedMeetingType);

  const goFix = (href: string, bm: string, zh: string, en: string) => (
    <span>
      <Tri bm={bm} zh={zh} en={en} />{" "}
      <Link href={href} className="underline underline-offset-4">
        <Tri bm="Pergi ke sana" zh="去补" en="Go there" /> →
      </Link>
    </span>
  );

  const dbBehindLine = (migration: number) => (
    <p className="rounded-md border-2 border-amber-300 bg-amber-50/80 p-3 text-sm font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
      <Tri
        bm={`Bahagian ini belum dibuka di pangkalan data (migration ${migration}) — beritahu pentadbir sistem, kemudian isi nilainya dahulu di tapak eROSES sendiri.`}
        zh={`这部分的数据库还没开通（migration ${migration}）—— 请告诉系统管理员；这一步先直接在 eROSES 上手填。`}
        en={`This section is not enabled in the database yet (migration ${migration}) — tell the system administrator; fill this eROSES step by hand for now.`}
      />
    </p>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri
              bm="Penyata Tahunan eROSES — langkah demi langkah"
              zh="eROSES 年度呈报 —— 一步一步带你填"
              en="eROSES Annual Return — step by step"
            />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Buka eROSES di tab lain: Pertubuhan → Penyata Tahunan → Tambah. Rel kiri di sana bernama “Langkah penyata tahunan” — sembilan langkah di bawah mengikut rel itu satu-satu. Salin nilai dari sini ke sana."
            zh="在另一个浏览器分页打开 eROSES：Pertubuhan → Penyata Tahunan → Tambah。那边左侧有一条「Langkah penyata tahunan」进度栏 —— 下面九步就是照着它排的，一格一格从这里复制过去。"
            en="Open eROSES in another tab: Pertubuhan → Penyata Tahunan → Tambah. Its left rail is called “Langkah penyata tahunan” — the nine steps below follow it one by one. Copy each value across."
          />
        </p>
        <p className="text-sm text-muted-foreground">
          ⚠{" "}
          <Tri
            bm="Nama medan di portal boleh berubah — semak dengan skrin sebenar semasa menampal."
            zh="portal 上的栏位名称可能改动 —— 贴的时候对一眼真画面。"
            en="Portal field names can change — glance at the live screen as you paste."
          />
        </p>
      </div>

      {/* Which meeting this filing is about. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <Tri bm="Mesyuarat yang difailkan" zh="要呈报哪一场会议？" en="The meeting being filed" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {p.meetings.length === 0 ? (
            <p className="text-base text-muted-foreground">
              <Tri
                bm="Belum ada minit yang DISAHKAN. Sahkan minit mesyuarat agung anda dahulu —"
                zh="还没有已确认的会议记录。请先确认你们会员大会的记录 ——"
                en="No CONFIRMED minutes yet. Confirm your general meeting's minutes first —"
              />{" "}
              <Link href="/minutes" className="underline underline-offset-4">
                <Tri bm="Minit" zh="会议记录" en="Minutes" /> →
              </Link>
            </p>
          ) : (
            <>
              <select
                className="w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm"
                value={p.selectedId ?? undefined}
                onChange={(e) => {
                  router.push(
                    `/filings/eroses?doc=${e.target.value}&dari=${p.fromIso}&hingga=${p.toIso}`,
                  );
                }}
                aria-label={t("Pilih mesyuarat", "选会议", "Pick the meeting")}
              >
                {p.meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {!fileable && p.selectedId !== null && (
                <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                  <Tri
                    bm="Penyata Tahunan dibina daripada mesyuarat agung (AGM/EGM). Mesyuarat yang dipilih bukan AGM/EGM — pilih yang betul di atas, atau sahkan minit AGM anda dahulu."
                    zh="年度呈报要用会员大会（AGM/EGM）的资料。现在选的这场不是 AGM/EGM —— 请在上面换一场，或先确认 AGM 的会议记录。"
                    en="The Annual Return is built from a general meeting (AGM/EGM). The selected meeting is not one — pick the right one above, or confirm your AGM minutes first."
                  />
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 1 — Mesyuarat */}
      <Step
        n={1}
        titleBm="Mesyuarat"
        zh="会议"
        en="Meeting"
        describe={
          <Tri
            bm="Halaman pertama minta maklumat mesyuarat pembentangan penyata: pilih mesyuarat dari senarai, kaedah & platform, tujuan, tarikh & masa, alamat tempat (peta, negeri, daerah, poskod), JUMLAH KEHADIRAN, dan MUAT NAIK fail minit."
            zh="第一页要填呈报所依据的那场会议：从下拉选会议、开会方式与平台、目的、日期与时间、地点整套（地图/州/县/邮编）、出席人数，以及上传会议记录文件。"
            en="The first page asks about the meeting the return rests on: pick it from the dropdown, method & platform, purpose, date & time, the venue block (map, state, district, postcode), the ATTENDANCE COUNT, and the minutes file upload."
          />
        }
      >
        {/* 前置引导 (拍板): the dropdown only lists REGISTERED meetings. */}
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          🔑{" "}
          <Tri
            bm="Senarai Mesyuarat di eROSES hanya menunjukkan mesyuarat yang SUDAH didaftarkan. Kalau mesyuarat anda tiada dalam dropdown itu: pergi dahulu ke Pertubuhan → Pengurusan Mesyuarat → daftarkan mesyuarat itu (tarikh & jenis), kemudian kembali ke Penyata Tahunan."
            zh="eROSES 的会议下拉只列「已登记」的会议。如果下拉里找不到你们那场会：先去 Pertubuhan → Pengurusan Mesyuarat 把那场会登记好（日期和类型），再回来做 Penyata Tahunan。"
            en="The eROSES meeting dropdown only lists REGISTERED meetings. If yours is not there: go to Pertubuhan → Pengurusan Mesyuarat first, register the meeting (date & type), then come back to the Annual Return."
          />
        </p>
        {(["Jenis Mesyuarat", "Tarikh Mesyuarat Agung", "Tempat Mesyuarat", "Bilangan Ahli Hadir"] as const).map(
          (f) => {
            const row = packRow(f);
            return (
              <ValueRow
                key={f}
                id={`s1-${f}`}
                labelBm={f}
                labelSub={
                  row ? (
                    <span className="flex items-center gap-2">
                      {row.erosesFieldEn} <ConfidenceBadge level={row.confidence} />
                    </span>
                  ) : undefined
                }
                value={row?.value ?? null}
                fix={goFix(
                  "/minutes",
                  "Nilai ini datang daripada minit yang disahkan.",
                  "这个值来自已确认的会议记录。",
                  "This value comes from the confirmed minutes.",
                )}
              />
            );
          },
        )}
        <ValueRow
          id="s1-upload"
          labelBm="Muat Naik Minit Mesyuarat"
          labelSub={<Tri bm="fail PDF minit BM" zh="上传马来文会议记录 PDF" en="the BM minutes PDF" />}
          value={null}
          fix={
            p.selectedId !== null ? (
              <span>
                <Tri
                  bm="Muat turun PDF minit BM dari halaman dokumen siap, kemudian muat naik di sini."
                  zh="到成品页下载马来文版 PDF，再传到 eROSES 这一格。"
                  en="Download the BM minutes PDF from the finished-document page, then upload it here."
                />{" "}
                <Link
                  href={`/minutes/history/${p.selectedId}`}
                  className="underline underline-offset-4"
                >
                  <Tri bm="Buka dokumen" zh="打开成品页" en="Open the document" /> →
                </Link>
              </span>
            ) : undefined
          }
        />
      </Step>

      {/* 2 — Maklumat Am */}
      <Step
        n={2}
        titleBm="Maklumat Am"
        zh="基本资料"
        en="General information"
        describe={
          <Tri
            bm="Kategori pertubuhan sudah diisi oleh portal. Yang perlu anda isi: no. telefon, tahun kewangan bermula, BILANGAN AHLI BERDAFTAR*, BILANGAN PEMEGANG JAWATAN*, BILANGAN AHLI LAYAK MENGUNDI*, bilangan cawangan, gabungan, dan jadual akaun bank."
            zh="机构类别 portal 会自己带出。要你填的是：电话、财政年度开始日、注册会员数*、职位数*、有投票权人数*、分会数、联盟，以及银行户口表。"
            en="The category is pre-filled by the portal. You fill: phone, financial year start, REGISTERED MEMBERS*, OFFICE BEARERS*, VOTING MEMBERS*, branches, affiliation, and the bank-account table."
          />
        }
      >
        {p.maklumat === null ? (
          dbBehindLine(35)
        ) : (
          <>
            <ValueRow
              id="s2-phone"
              labelBm="No. telefon Pertubuhan"
              value={p.maklumat.phone}
              fix={goFix(
                "/settings/general",
                "Belum direkodkan — isi di Tetapan → Pertubuhan.",
                "还没记录 —— 到 设置 → 机构 填。",
                "Not recorded yet — fill it in Settings → Organisation.",
              )}
            />
            <ValueRow
              id="s2-fy"
              labelBm="Tahun kewangan bermula"
              value={p.maklumat.financialYearStart}
              fix={goFix(
                "/settings/general",
                "Belum direkodkan — isi di Tetapan → Pertubuhan.",
                "还没记录 —— 到 设置 → 机构 填。",
                "Not recorded yet — fill it in Settings → Organisation.",
              )}
            />
            <ValueRow
              id="s2-reg"
              labelBm="Bilangan ahli yang berdaftar"
              value={
                p.maklumat.membersRegistered === null
                  ? null
                  : String(p.maklumat.membersRegistered)
              }
              fix={goFix(
                "/settings/general",
                "Belum direkodkan — isi di Tetapan → Pertubuhan.",
                "还没记录 —— 到 设置 → 机构 填。",
                "Not recorded yet — fill it in Settings → Organisation.",
              )}
            />
            <ValueRow
              id="s2-bearers"
              labelBm="Bilangan Pemegang Jawatan"
              labelSub={
                <Tri
                  bm="dikira daripada Senarai AJK anda"
                  zh="照你们的理事名单自动数的"
                  en="counted from your committee list"
                />
              }
              value={p.committeeCount > 0 ? String(p.committeeCount) : null}
              fix={goFix(
                "/members",
                "Senarai AJK masih kosong.",
                "理事名单还是空的。",
                "The committee list is still empty.",
              )}
            />
            <ValueRow
              id="s2-vote"
              labelBm="Bilangan ahli yang layak mengundi"
              value={
                p.maklumat.membersVoting === null ? null : String(p.maklumat.membersVoting)
              }
              fix={goFix(
                "/settings/general",
                "Belum direkodkan — isi di Tetapan → Pertubuhan.",
                "还没记录 —— 到 设置 → 机构 填。",
                "Not recorded yet — fill it in Settings → Organisation.",
              )}
            />
            <ValueRow
              id="s2-branches"
              labelBm="Bilangan cawangan Pertubuhan"
              labelSub={
                <Tri bm="dikira daripada pokok pertubuhan" zh="照机构树自动数的" en="counted from the org tree" />
              }
              value={String(p.branchCount)}
            />
            <div className="flex flex-col gap-1 rounded-sm border border-[color:var(--v2-border)] p-3">
              <div className="font-medium">Maklumat akaun bank pertubuhan</div>
              {p.maklumat.banks.length === 0 ? (
                <div className="text-base text-amber-900 dark:text-amber-100">
                  {goFix(
                    "/settings/general",
                    "Belum ada akaun direkodkan — tambah di Tetapan → Pertubuhan.",
                    "还没记录任何户口 —— 到 设置 → 机构 添加。",
                    "No accounts recorded — add them in Settings → Organisation.",
                  )}
                </div>
              ) : (
                p.maklumat.banks.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3">
                    <span>{b.bankName}</span>
                    <span className="font-mono">{b.accountNo}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(`s2-bank-${i}`, b.accountNo)}
                    >
                      {copied === `s2-bank-${i}` ? (
                        <>✓ <Tri bm="Disalin" zh="已复制" en="Copied" /></>
                      ) : (
                        <Tri bm="Salin no. akaun" zh="复制账号" en="Copy account no." />
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Step>

      {/* 3 — Maklumat AJK */}
      <Step
        n={3}
        titleBm="Maklumat AJK"
        zh="理事资料"
        en="Committee"
        describe={
          <Tri
            bm="Portal menunjukkan Senarai AJK yang sedia ada (jawatan, nama, e-mel, negeri), minta TARIKH PERLANTIKAN AJK, mengingatkan bilangan AJK mesti ikut perlembagaan, dan ada kotak pengesahan Seksyen 9A untuk ditanda."
            zh="这一页显示已登记的理事名单（职位/姓名/电邮/州属），要填「理事任命日期」，提醒理事人数要照章程，最后有一个 Seksyen 9A 的宣誓勾选框。"
            en="The portal shows its existing committee list (position, name, e-mail, state), asks for the APPOINTMENT DATE, reminds you the count must follow the constitution, and has a Seksyen 9A confirmation checkbox."
          />
        }
      >
        {(() => {
          const row = packRow("Senarai Ahli Jawatankuasa");
          return (
            <ValueRow
              id="s3-ajk"
              labelBm="Senarai AJK (jawatan: nama IC)"
              labelSub={
                row ? (
                  <span className="flex items-center gap-2">
                    {row.erosesFieldEn} <ConfidenceBadge level={row.confidence} />
                  </span>
                ) : undefined
              }
              value={row?.value ?? null}
              fix={
                p.missingOfficialCount > 0
                  ? goFix(
                      "/members",
                      `${p.missingOfficialCount} orang belum ada nama IC — lengkapkan dahulu.`,
                      `还有 ${p.missingOfficialCount} 位没填身份证名字 —— 先去补齐。`,
                      `${p.missingOfficialCount} member(s) still have no IC name — complete them first.`,
                    )
                  : goFix(
                      "/members",
                      "Senarai AJK belum ada dalam sistem.",
                      "理事名单还没进系统。",
                      "The committee roster is not in the system yet.",
                    )
              }
            />
          );
        })()}
        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Tarikh perlantikan = tarikh mesyuarat agung yang melantik jawatankuasa ini (biasanya tarikh AGM di langkah 1). Kemas kini AJK sendiri dibuat di AJK & Keahlian, bukan di sini."
            zh="任命日期＝选出这届理事的那场会员大会的日期（通常就是第 1 步那个 AGM 日期）。理事名单本身要在 AJK & Keahlian 那边改，不在这页。"
            en="The appointment date = the general meeting that elected this committee (usually the AGM date from step 1). Editing the committee itself happens under AJK & Keahlian, not on this page."
          />
        </p>
        <p className="text-sm text-muted-foreground">
          ☑️{" "}
          <Tri
            bm="Kotak Seksyen 9A: anda mengesahkan tiada AJK yang hilang kelayakan di bawah Akta Pertubuhan 1966 — baca dan tanda sendiri."
            zh="Seksyen 9A 勾选框：你确认所有理事都没有丧失任职资格（1966 年社团法令）—— 自己读一遍再勾。"
            en="The Seksyen 9A box: you confirm no committee member is disqualified under the Societies Act 1966 — read it and tick it yourself."
          />
        </p>
      </Step>

      {/* 4 — Maklumat Juruaudit */}
      <Step
        n={4}
        titleBm="Maklumat Juruaudit"
        zh="审计员资料"
        en="Auditors"
        describe={
          <Tri
            bm="Portal menunjukkan senarai juruaudit (nama, no. pengenalan, e-mel, tarikh lantik, status) dan minta TARIKH PELANTIKAN JURUAUDIT. Peringatannya: bilangan juruaudit AKTIF mesti ikut perlembagaan."
            zh="这一页显示审计员名单（姓名/身份证号/电邮/任命日期/状态），要填「审计员任命日期」。它的提醒是：现任审计员人数要照章程。"
            en="The portal shows the auditors list (name, ID number, e-mail, appointment date, status) and asks for the APPOINTMENT DATE. Its warning: the ACTIVE auditor count must follow the constitution."
          />
        }
      >
        {p.auditors === null ? (
          dbBehindLine(34)
        ) : p.auditors.length === 0 ? (
          <p className="text-base text-amber-900 dark:text-amber-100">
            {goFix(
              "/members",
              "Belum ada juruaudit direkodkan — tambah di halaman Ahli.",
              "还没记录审计员 —— 到「成员」页添加。",
              "No auditors recorded yet — add them on the Members page.",
            )}
          </p>
        ) : (
          <>
            {p.auditors.map((a, i) => (
              <ValueRow
                key={i}
                id={`s4-${i}`}
                labelBm={`${a.person_name}${a.status === "inactive" ? " (tidak aktif)" : ""}`}
                labelSub={
                  <>
                    {a.appointed_on ?? "—"} · {a.email ?? "—"}
                  </>
                }
                value={(a.name_official ?? "").trim() || a.person_name}
              />
            ))}
            <p className="text-sm text-muted-foreground">
              🪪{" "}
              <Tri
                bm="eROSES minta nombor IC juruaudit — MinitAI tidak menyimpannya (privasi). Taip nombor itu terus di portal."
                zh="eROSES 会要审计员的身份证号码 —— MinitAI 不保存（隐私）。号码直接在 portal 上填。"
                en="eROSES asks for the auditor's IC number — MinitAI does not store it (privacy). Type it straight into the portal."
              />
            </p>
          </>
        )}
      </Step>

      {/* 5 — Penyata Kewangan */}
      <Step
        n={5}
        titleBm="Penyata Kewangan"
        zh="财务报表"
        en="Financial statement"
        describe={
          <Tri
            bm={`Dua halaman kotak RM: Pendapatan 1.1–1.4 dan Perbelanjaan 2.1–2.4; jumlah dikira oleh portal. Peringatan portal: angka mesti daripada penyata yang DISAHKAN dalam AGM (atau oleh juruaudit), dibundarkan ke dua tempat perpuluhan. Nilai di bawah dikira daripada rekod wang anda untuk ${p.fromIso} hingga ${p.toIso} — kotak yang tiada dalam senarai ini biarkan 0.00.`}
            zh={`两页 RM 数字格：收入 1.1–1.4、支出 2.1–2.4，总计 portal 自己算。portal 的提醒：数字要用 AGM 确认过（或审计员签核）的报表，保留两位小数。下面的值是照你们 ${p.fromIso} 至 ${p.toIso} 的钱区记录算出来的 —— 不在下表里的格子填 0.00 就行。`}
            en={`Two pages of RM boxes: income 1.1–1.4 and spending 2.1–2.4; totals are computed by the portal. Its reminder: figures must come from the statement CONFIRMED at the AGM (or by the auditors), rounded to two decimals. The values below are computed from your money records for ${p.fromIso} to ${p.toIso} — boxes not listed here stay 0.00.`}
          />
        }
      >
        {p.penyata === null ? (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Rekod wang tidak dapat dibaca sekarang — cuba muat semula halaman."
              zh="现在读不到钱区记录 —— 请刷新页面再试。"
              en="The money records could not be read just now — reload the page."
            />
          </p>
        ) : (
          <>
            {p.penyata.sections.map((s) => {
              const nonZero = s.cells.filter((c) => c.amountCents !== 0);
              if (nonZero.length === 0) return null;
              return (
                <div key={s.id} className="flex flex-col gap-2">
                  <div className="text-base font-semibold">{s.titleBm}</div>
                  {nonZero.map((c) => (
                    <ValueRow
                      key={c.id}
                      id={`s5-${c.id}`}
                      labelBm={c.labelBm}
                      labelSub={
                        <Tri
                          bm={`${c.rowCount} rekod`}
                          zh={`${c.rowCount} 笔记录加出来的`}
                          en={`summed from ${c.rowCount} record(s)`}
                        />
                      }
                      value={penyataAmount(c.amountCents)}
                      mono
                    />
                  ))}
                </div>
              );
            })}
            {p.penyata.sections.every((s) =>
              s.cells.every((c) => c.amountCents === 0),
            ) && (
              <p className="text-base text-muted-foreground">
                <Tri
                  bm="Tiada rekod wang dalam tempoh ini — semua kotak kekal 0.00."
                  zh="这段时间没有钱区记录 —— 所有格子都填 0.00。"
                  en="No money records in this period — every box stays 0.00."
                />
              </p>
            )}
            <div className="grid gap-3 @xl:grid-cols-2">
              <ValueRow
                id="s5-total-in"
                labelBm="Jumlah Pendapatan (semakan)"
                labelSub={
                  <Tri
                    bm="portal kira sendiri — banding sahaja"
                    zh="portal 会自己算 —— 拿这个对一下"
                    en="the portal computes this — just compare"
                  />
                }
                value={penyataAmount(p.penyata.jumlahPendapatanCents)}
                mono
              />
              <ValueRow
                id="s5-total-out"
                labelBm="Jumlah Perbelanjaan (semakan)"
                labelSub={
                  <Tri
                    bm="portal kira sendiri — banding sahaja"
                    zh="portal 会自己算 —— 拿这个对一下"
                    en="the portal computes this — just compare"
                  />
                }
                value={penyataAmount(p.penyata.jumlahPerbelanjaanCents)}
                mono
              />
            </div>
            {(p.penyata.assumedDermaCount > 0 ||
              p.penyata.inKindCount > 0 ||
              p.penyata.pendingExpenseCount > 0 ||
              p.penyata.undatedCount > 0) && (
              <div className="rounded-md border-2 border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <div className="font-semibold">
                  <Tri bm="Nota kiraan" zh="计算说明" en="Counting notes" />
                </div>
                <ul className="mt-1 list-disc pl-5">
                  {p.penyata.assumedDermaCount > 0 && (
                    <li>
                      <Tri
                        bm={`${p.penyata.assumedDermaCount} rekod tanpa jenis dinyatakan — dikira sebagai Derma (1.1).`}
                        zh={`${p.penyata.assumedDermaCount} 笔没写明类型 —— 按捐款计入 1.1 Derma。`}
                        en={`${p.penyata.assumedDermaCount} record(s) named no type — counted as Derma (1.1).`}
                      />
                    </li>
                  )}
                  {p.penyata.inKindCount > 0 && (
                    <li>
                      <Tri
                        bm={`${p.penyata.inKindCount} derma barangan TIDAK dijumlahkan (barangan bukan ringgit).`}
                        zh={`${p.penyata.inKindCount} 笔实物捐赠不计入金额（实物不是钱）。`}
                        en={`${p.penyata.inKindCount} in-kind donation(s) NOT summed (goods are not ringgit).`}
                      />
                    </li>
                  )}
                  {p.penyata.pendingExpenseCount > 0 && (
                    <li>
                      <Tri
                        bm={`${p.penyata.pendingExpenseCount} tuntutan belum dibayar (RM ${penyataAmount(p.penyata.pendingExpenseCents)}) TIDAK termasuk — wang belum keluar.`}
                        zh={`${p.penyata.pendingExpenseCount} 笔报销还没付款（RM ${penyataAmount(p.penyata.pendingExpenseCents)}）没有算进去 —— 钱还没出去。`}
                        en={`${p.penyata.pendingExpenseCount} claim(s) not yet paid (RM ${penyataAmount(p.penyata.pendingExpenseCents)}) NOT included — the money has not left.`}
                      />
                    </li>
                  )}
                  {p.penyata.undatedCount > 0 && (
                    <li>
                      <Tri
                        bm={`${p.penyata.undatedCount} rekod tanpa tarikh tidak masuk tempoh ini.`}
                        zh={`${p.penyata.undatedCount} 笔没有日期的记录不在这段时间里。`}
                        en={`${p.penyata.undatedCount} undated record(s) fall outside this period.`}
                      />
                    </li>
                  )}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              📎{" "}
              <Tri
                bm="Di bahagian “Muat Naik Penyata Kewangan”, portal mahu penyata yang TELAH DIAUDIT (fail). Templat rasminya ada di pautan “Muat Turun Templat Penyata Kewangan” pada halaman itu sendiri — muat turun di sana, isi, minta juruaudit tandatangan, imbas dan muat naik."
                zh="「Muat Naik Penyata Kewangan」那一格要传「已审计完成」的财务报表文件。官方模板就在那一页的「Muat Turun Templat Penyata Kewangan」链接里 —— 在那里下载、填好、给审计员签、扫描后上传。"
                en="The “Muat Naik Penyata Kewangan” box wants the AUDITED statement as a file. The official template is behind that page's own “Muat Turun Templat Penyata Kewangan” link — download it there, fill it, have the auditors sign, scan and upload."
              />{" "}
              <Link href={`/money/report?dari=${p.fromIso}&hingga=${p.toIso}`} className="underline underline-offset-4">
                <Tri
                  bm="Penyata Minit untuk rujukan"
                  zh="Minit 的财务报表（参考用）"
                  en="Minit's statement for reference"
                />{" "}
                →
              </Link>
            </p>
          </>
        )}
      </Step>

      {/* 6 — Laporan Aktiviti */}
      <Step
        n={6}
        titleBm="Laporan Aktiviti"
        zh="活动报告"
        en="Activity report"
        describe={
          <Tri
            bm="Satu suis “Terdapat rekod aktiviti” dan satu kotak muat naik “Lampiran aktiviti pertubuhan”."
            zh="一页只有两样：「有活动记录」开关，和「机构活动附件」上传格。"
            en="One switch (“there are activity records”) and one upload box (“activity attachment”)."
          />
        }
      >
        <p className="text-base">
          <Tri
            bm="Jana laporan itu daripada kalendar & minit anda, semak, muat turun PDF — kemudian muat naik di kotak itu."
            zh="用你们的日历和会议记录生成报告、核对、下载 PDF —— 然后传进那个格子。"
            en="Generate the report from your calendar & minutes, check it, download the PDF — then upload it in that box."
          />{" "}
          <Link
            href={`/filings/laporan?dari=${p.fromIso}&hingga=${p.toIso}`}
            className="underline underline-offset-4"
          >
            <Tri bm="Jana Laporan Aktiviti" zh="生成活动报告" en="Generate the Laporan Aktiviti" /> →
          </Link>
        </p>
      </Step>

      {/* 7 — Sumbangan Dari/Ke Luar Negara */}
      <Step
        n={7}
        titleBm="Sumbangan Dari/Ke Luar Negara"
        zh="国外捐款往来"
        en="Foreign contributions"
        describe={
          <Tri
            bm="Dua jadual: sumbangan DARI luar negara (pemberi, negara, nilai RM) dan sumbangan KE luar negara (penerima, negara, nilai RM)."
            zh="两张表：从国外收到的捐款（捐赠者/国家/金额），和捐去国外的（受赠者/国家/金额）。"
            en="Two tables: contributions FROM abroad (giver, country, RM) and TO abroad (recipient, country, RM)."
          />
        }
      >
        <p className="text-base">
          <Tri
            bm="Minit tidak merekod kategori ini. Kebanyakan pertubuhan tempatan tiada apa-apa di sini — jadual kekal “Tiada Data”, tekan Seterusnya sahaja. KALAU pertubuhan anda benar-benar menerima atau menghantar wang ke luar negara, isi jadual itu sendiri daripada rekod bank anda."
            zh="Minit 没有这一类记录。本地社团大多数这里是空的 —— 两张表保持「Tiada Data」，直接按 Seterusnya。如果你们真的有收过或捐过国外的钱，请照银行记录自己把表填上。"
            en="Minit does not track this category. Most local societies have nothing here — leave the tables at “Tiada Data” and press Seterusnya. IF your society really did receive or send money abroad, fill the tables yourself from your bank records."
          />
        </p>
      </Step>

      {/* 8 — Paparan */}
      <Step
        n={8}
        titleBm="Paparan"
        zh="预览"
        en="Preview"
        describe={
          <Tri
            bm="Portal menunjukkan keseluruhan penyata dan butang Cetak."
            zh="portal 把整份呈报显示出来，加一颗 Cetak（打印）按钮。"
            en="The portal shows the whole return with a Cetak (print) button."
          />
        }
      >
        <p className="text-base">
          <Tri
            bm="Tekan Cetak dan SIMPAN salinan (PDF pun boleh) sebelum menghantar — itulah rekod pertubuhan anda tentang apa yang difailkan tahun ini."
            zh="送出之前先按 Cetak 存一份（存成 PDF 也行）—— 这就是你们「今年报了什么」的自家存底。"
            en="Press Cetak and KEEP a copy (PDF is fine) before submitting — that is your own record of what was filed this year."
          />
        </p>
      </Step>

      {/* 9 — Pengakuan */}
      <Step
        n={9}
        titleBm="Pengakuan"
        zh="宣誓送出"
        en="Declaration"
        describe={
          <Tri
            bm="Halaman terakhir ialah akuan di bawah Seksyen 54A Akta Pertubuhan 1966: maklumat palsu boleh didenda sehingga RM2,000, dan AJK bertanggungjawab atas semua laporan semasa memegang jawatan."
            zh="最后一页是 1966 年社团法令第 54A 条的宣誓：资料不实可被罚款至 RM2,000，理事在任期内对所有申报负责。"
            en="The last page is the declaration under Section 54A of the Societies Act 1966: false information can be fined up to RM2,000, and the committee is responsible for all reports made while in office."
          />
        }
      >
        <p className="text-base">
          <Tri
            bm="Sebelum menanda: pastikan setiap nilai yang ditampal tadi betul-betul padan dengan rekod pertubuhan. Nilai daripada Minit sentiasa boleh dijejak balik ke rekodnya — kalau ragu-ragu, patah balik ke langkah itu dan semak dahulu. Selepas itu barulah tanda dan Seterusnya."
            zh="勾之前：把刚才贴的每一个值再对一遍，确定跟机构的记录一致。Minit 给的值都能追回到原始记录 —— 有疑问就回到那一步先查清楚。都对了，才勾、才送。"
            en="Before ticking: make sure every value you pasted truly matches the society's records. Every value from Minit traces back to a record — if in doubt, go back to that step and check first. Only then tick and continue."
          />
        </p>
      </Step>
    </div>
  );
}
