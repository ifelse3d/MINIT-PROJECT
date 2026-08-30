import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { can } from "@/lib/roles";
import { buildPastePack, type PastePackRow } from "@/lib/paste-pack";
import { loadFilingRoster } from "@/app/minutes/roster-actions";
import { loadStatementRows } from "@/app/money/report/data";
import {
  buildPenyataKewangan,
  penyataAmount,
  type PenyataExpenseInput,
  type PenyataKewangan,
} from "@/lib/eroses-penyata";
import { PortalSketch } from "../../../portal-sketch";
import { flowQuery, loadFlowBase, loadFlowMaklumat, resolveRange } from "../../../flow-data";
import { LANGKAH } from "../../langkah-meta";
import {
  AuditorInlineForm,
  BankInlineForm,
  ErosesGapInlineRow,
  MaklumatInlineForm,
  StepNav,
  ValueRow,
} from "../../flow-ui";
import {
  erosesGapList,
  missingErosesCommitteeFields,
  type ErosesCommitteeField,
} from "@/lib/eroses-committee";

// ---------------------------------------------------------------------------
// ONE PORTAL STEP PER PAGE (H2, work order 69 — Hard Rule 13; J: 「不是所有
// 都擠在一個」). Each page: the sketch of what the portal shows there
// (§1-15b), Minit's matching values with COPY, and — §1-2 — a small form
// wherever a value is missing, writing to the SAME table the Settings and
// Members pages write to. Nobody leaves the flow to hunt for a field.
//
// Server component: every value is read HERE under RLS and computed by
// TypeScript (Hard Rule 2). J's screenshots are the curriculum and are NOT
// shipped — the sketches carry fictional data only.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type Sp = { doc?: string | string[]; dari?: string; hingga?: string };

function goFix(href: string, bm: string, zh: string, en: string) {
  return (
    <span>
      <Tri bm={bm} zh={zh} en={en} />{" "}
      <Link href={href} className="underline underline-offset-4">
        <Tri bm="Pergi ke sana" zh="去补" en="Go there" /> →
      </Link>
    </span>
  );
}

function dbBehindLine(migration: number) {
  return (
    <p className="rounded-md border-2 border-amber-300 bg-amber-50/80 p-3 text-sm font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
      <Tri
        bm={`Bahagian ini belum dibuka di pangkalan data (migration ${migration}) — beritahu pentadbir sistem, kemudian isi nilainya dahulu di tapak eROSES sendiri.`}
        zh={`这部分的数据库还没开通（migration ${migration}）—— 请告诉系统管理员；这一步先直接在 eROSES 上手填。`}
        en={`This section is not enabled in the database yet (migration ${migration}) — tell the system administrator; fill this eROSES step by hand for now.`}
      />
    </p>
  );
}

/** The step's card frame: number + the portal's own BM title + gloss. */
function StepFrame({
  n,
  describe,
  children,
}: {
  n: number;
  describe: React.ReactNode;
  children: React.ReactNode;
}) {
  const meta = LANGKAH[n - 1];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {n} · {meta.bm}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              <Tri bm="" zh={meta.zh} en={meta.en} />
            </span>
          </CardTitle>
          <CardDescription>{describe}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PortalSketch step={String(n)} />
          {children}
        </CardContent>
      </Card>
      <Suspense fallback={null}>
        <StepNav n={n} />
      </Suspense>
    </div>
  );
}

export default async function LangkahPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<Sp>;
}) {
  const { n: nRaw } = await params;
  const sp = await searchParams;
  const n = Number(nRaw);
  if (!Number.isInteger(n) || n < 1 || n > 9) {
    redirect(`/filings/eroses/penyata${flowQuery(sp)}`);
  }

  const base = await loadFlowBase(sp.doc);
  // The gates live on the start page — a step without its context goes back.
  if (!base.active || base.orgType === "committee" || base.meetings.length === 0) {
    redirect(`/filings/eroses/penyata${flowQuery(sp)}`);
  }
  const canManage = can(base.active.role, "manage_org");
  const canWrite = can(base.active.role, "minutes_write");
  // D44 (work order 78): a fenced org sees every value but copies none —
  // ValueRow's real lock, the same treatment the old /filings page had.
  const locked = base.fence !== null;
  const q = flowQuery({ ...sp, doc: String(base.selectedId ?? "") });

  // ---- Step 1 · Mesyuarat --------------------------------------------------
  if (n === 1) {
    const filingRoster = await loadFilingRoster();
    const pastePack: PastePackRow[] | null = base.selected?.extraction
      ? buildPastePack(base.selected.extraction, filingRoster)
      : null;
    const packRow = (field: string) =>
      pastePack?.find((r) => r.erosesField === field) ?? null;
    return (
      <StepFrame
        n={1}
        describe={
          <Tri
            bm="Halaman pertama minta maklumat mesyuarat pembentangan penyata: pilih mesyuarat dari senarai, kaedah & platform, tujuan, tarikh & masa, alamat tempat, JUMLAH KEHADIRAN, dan MUAT NAIK fail minit."
            zh="第一页要填呈报所依据的那场会议：从下拉选会议、开会方式与平台、目的、日期与时间、地点整套、出席人数，以及上传会议记录文件。"
            en="The first page asks about the meeting the return rests on: pick it from the dropdown, method & platform, purpose, date & time, the venue block, the ATTENDANCE COUNT, and the minutes file upload."
          />
        }
      >
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          🔑{" "}
          <Tri
            bm="Senarai Mesyuarat di eROSES hanya menunjukkan mesyuarat yang SUDAH didaftarkan. Kalau mesyuarat anda tiada dalam dropdown itu, ikut panduan pendaftaran dahulu —"
            zh="eROSES 的会议下拉只列「已登记」的会议。下拉里找不到你们那场会？先照登记引导做 ——"
            en="The eROSES meeting dropdown only lists REGISTERED meetings. If yours is not there, follow the registration guide first —"
          />{" "}
          <Link href={`/filings/eroses/mesyuarat${q}`} className="underline underline-offset-4">
            <Tri bm="Daftar mesyuarat" zh="登记会议引导" en="Register the meeting" /> →
          </Link>
        </p>
        {(
          ["Jenis Mesyuarat", "Tarikh Mesyuarat Agung", "Tempat Mesyuarat", "Bilangan Ahli Hadir"] as const
        ).map((f) => {
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
              locked={locked}
              fix={goFix(
                "/minutes",
                "Nilai ini datang daripada minit yang disahkan.",
                "这个值来自已确认的会议记录。",
                "This value comes from the confirmed minutes.",
              )}
            />
          );
        })}
        <ValueRow
          id="s1-upload"
          labelBm="Muat Naik Minit Mesyuarat"
          labelSub={<Tri bm="fail PDF minit BM" zh="上传马来文会议记录 PDF" en="the BM minutes PDF" />}
          value={null}
          fix={
            base.selectedId !== null ? (
              <span>
                <Tri
                  bm="Muat turun PDF minit BM dari halaman dokumen siap (PDF, bawah 25MB; pelan percuma: guna butang muat turun BERSIH di sana), kemudian muat naik di sini."
                  zh="到成品页下载马来文版 PDF（PDF、25MB 以内；免费版请用那边的「干净下载」按钮），再传到 eROSES 这一格。"
                  en="Download the BM minutes PDF from the finished-document page (PDF, under 25MB; free plan: use the CLEAN download button there), then upload it here."
                />{" "}
                <Link
                  href={`/minutes/history/${base.selectedId}`}
                  className="underline underline-offset-4"
                >
                  <Tri bm="Buka dokumen" zh="打开成品页" en="Open the document" /> →
                </Link>
              </span>
            ) : undefined
          }
        />
      </StepFrame>
    );
  }

  // ---- Step 2 · Maklumat Am ------------------------------------------------
  if (n === 2) {
    const maklumat = await loadFlowMaklumat(base.active.id);
    const supabase = await getSupabaseServer();
    const [branchesRead, filingRoster] = await Promise.all([
      supabase
        .from("orgs")
        .select("id", { count: "exact", head: true })
        .eq("parent_org_id", base.active.id),
      loadFilingRoster(),
    ]);
    const branchCount = branchesRead.count ?? 0;
    const committeeCount = filingRoster.length;
    const missing =
      maklumat !== null &&
      (maklumat.phone === null ||
        maklumat.financialYearStart === null ||
        maklumat.membersRegistered === null ||
        maklumat.membersVoting === null);
    return (
      <StepFrame
        n={2}
        describe={
          <Tri
            bm="Kategori pertubuhan sudah diisi oleh portal. Yang perlu anda isi: no. telefon, tahun kewangan bermula, BILANGAN AHLI BERDAFTAR*, BILANGAN PEMEGANG JAWATAN*, BILANGAN AHLI LAYAK MENGUNDI*, bilangan cawangan, gabungan, dan jadual akaun bank."
            zh="机构类别 portal 会自己带出。要你填的是：电话、财政年度开始日、注册会员数*、职位数*、有投票权人数*、分会数、联盟，以及银行户口表。"
            en="The category is pre-filled by the portal. You fill: phone, financial year start, REGISTERED MEMBERS*, OFFICE BEARERS*, VOTING MEMBERS*, branches, affiliation, and the bank-account table."
          />
        }
      >
        {maklumat === null ? (
          dbBehindLine(35)
        ) : (
          <>
            <ValueRow
              id="s2-phone"
              labelBm="No. telefon Pertubuhan"
              value={maklumat.phone}
              locked={locked}
            />
            <ValueRow
              id="s2-fy"
              labelBm="Tahun kewangan bermula"
              value={maklumat.financialYearStart}
              locked={locked}
            />
            <ValueRow
              id="s2-reg"
              labelBm="Bilangan ahli yang berdaftar"
              value={maklumat.membersRegistered === null ? null : String(maklumat.membersRegistered)}
              locked={locked}
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
              value={committeeCount > 0 ? String(committeeCount) : null}
              locked={locked}
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
              value={maklumat.membersVoting === null ? null : String(maklumat.membersVoting)}
              locked={locked}
            />
            <ValueRow
              id="s2-branches"
              labelBm="Bilangan cawangan Pertubuhan"
              labelSub={<Tri bm="dikira daripada pokok pertubuhan" zh="照机构树自动数的" en="counted from the org tree" />}
              value={String(branchCount)}
              locked={locked}
            />
            <div className="flex flex-col gap-2 rounded-sm border border-[color:var(--v2-border)] p-3">
              <div className="font-medium">Maklumat akaun bank pertubuhan</div>
              {maklumat.banks.length === 0 ? (
                <p className="text-base text-amber-900 dark:text-amber-100">
                  <Tri
                    bm="Belum ada akaun direkodkan — tambah terus di bawah."
                    zh="还没记录任何户口 —— 直接在下面加。"
                    en="No accounts recorded — add one right below."
                  />
                </p>
              ) : (
                maklumat.banks.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-3">
                    <span>{b.bankName}</span>
                    <span className="font-mono">{b.accountNo}</span>
                  </div>
                ))
              )}
              {canManage && <BankInlineForm />}
            </div>
            {canManage ? (
              <MaklumatInlineForm
                phone={maklumat.phone}
                financialYearStart={maklumat.financialYearStart}
                membersRegistered={maklumat.membersRegistered}
                membersVoting={maklumat.membersVoting}
              />
            ) : missing ? (
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Nilai yang kosong hanya boleh diisi oleh pentadbir pertubuhan (hq_admin)."
                  zh="缺的值要机构管理员（hq_admin）才能填。"
                  en="The missing values can only be filled by an organisation admin (hq_admin)."
                />
              </p>
            ) : null}
          </>
        )}
      </StepFrame>
    );
  }

  // ---- Step 3 · Maklumat AJK ----------------------------------------------
  if (n === 3) {
    const filingRoster = await loadFilingRoster();
    const pastePack: PastePackRow[] | null = base.selected?.extraction
      ? buildPastePack(base.selected.extraction, filingRoster)
      : null;
    const row = pastePack?.find((r) => r.erosesField === "Senarai Ahli Jawatankuasa") ?? null;
    // D48 (⑦, work order 89): the SHIPPING gate. Every roster row is read
    // with the columns eROSES requires; while any row has a gap the
    // copy-pack above stays locked and the gaps are fillable RIGHT HERE
    // (H2's "fill one box" road, widened). Ladder per D8: behind migration
    // 37 the state column does not exist — then it cannot gate either.
    const supabase = await getSupabaseServer();
    type RosterRow = {
      id: number;
      position: string;
      person_name: string;
      name_official: string | null;
      state?: string | null;
      term_start?: string | null;
    };
    let rosterRows: RosterRow[] = [];
    let checkable: ErosesCommitteeField[] = ["personName", "nameOfficial", "termStart"];
    {
      const with37 = await supabase
        .from("committee_roster")
        .select("id, position, person_name, name_official, state, term_start")
        .eq("org_id", base.active.id)
        .order("id", { ascending: true })
        .limit(500);
      if (!with37.error && with37.data) {
        rosterRows = with37.data as RosterRow[];
        checkable = ["personName", "nameOfficial", "state", "termStart"];
      } else {
        const legacy = await supabase
          .from("committee_roster")
          .select("id, position, person_name, name_official, term_start")
          .eq("org_id", base.active.id)
          .order("id", { ascending: true })
          .limit(500);
        rosterRows = (legacy.data ?? []) as RosterRow[];
      }
    }
    const gapped = rosterRows
      .map((r) => ({
        row: r,
        gaps: missingErosesCommitteeFields(r, checkable),
      }))
      .filter((g) => g.gaps.length > 0);
    const blockedNode =
      gapped.length > 0 ? (
        <div
          className="mt-2 flex flex-col gap-2 rounded-md border-2 border-amber-300 bg-amber-50/80 p-3 dark:border-amber-400/30 dark:bg-amber-400/10"
          data-probe="ajk-gaps"
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            🛑{" "}
            <Tri
              bm={`eROSES tidak akan menerima senarai ini lagi: ${gapped.length} baris belum lengkap. Isi DI SINI — salin nama IC daripada kad pengenalan, jangan terjemah sendiri.`}
              zh={`这份名单现在还交不进 eROSES：${gapped.length} 行没填齐。就在这里补 —— 身份证名字照 IC 抄，不要自己音译。`}
              en={`eROSES will not take this list yet: ${gapped.length} row(s) incomplete. Fill them RIGHT HERE — copy IC names from the identity card, never transliterate.`}
            />
          </p>
          {gapped.slice(0, 15).map(({ row: r, gaps }) =>
            canWrite ? (
              <ErosesGapInlineRow
                key={r.id}
                id={r.id}
                personName={r.person_name}
                position={r.position}
                missing={gaps}
              />
            ) : (
              <p key={r.id} className="text-sm text-amber-900 dark:text-amber-100">
                {r.person_name.trim() !== "" ? r.person_name : "—"} ·{" "}
                <Tri
                  bm={`kurang: ${erosesGapList(gaps, "bm")}`}
                  zh={`缺：${erosesGapList(gaps, "zh")}`}
                  en={`missing: ${erosesGapList(gaps, "en")}`}
                />
              </p>
            ),
          )}
          {!canWrite && (
            <p className="text-sm text-muted-foreground">
              <Tri
                bm="Hanya akaun dengan hak menulis minit boleh mengisinya."
                zh="要有会议记录编辑权限的帐号才能补。"
                en="Only an account with minutes-write rights can fill these."
              />
            </p>
          )}
        </div>
      ) : undefined;
    return (
      <StepFrame
        n={3}
        describe={
          <Tri
            bm="Portal menunjukkan Senarai AJK yang sedia ada (jawatan, nama, e-mel, negeri), minta TARIKH PERLANTIKAN AJK, mengingatkan bilangan AJK mesti ikut perlembagaan, dan ada kotak pengesahan Seksyen 9A untuk ditanda."
            zh="这一页显示已登记的理事名单（职位/姓名/电邮/州属），要填「理事任命日期」，提醒理事人数要照章程，最后有一个 Seksyen 9A 的宣誓勾选框。"
            en="The portal shows its existing committee list (position, name, e-mail, state), asks for the APPOINTMENT DATE, reminds you the count must follow the constitution, and has a Seksyen 9A confirmation checkbox."
          />
        }
      >
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
          locked={locked}
          copyBlocked={gapped.length > 0}
          fix={goFix(
            "/members",
            "Senarai AJK belum ada dalam sistem.",
            "理事名单还没进系统。",
            "The committee roster is not in the system yet.",
          )}
        />
        {/* D48: rendered BESIDE the value row, not inside it — the gaps must
            be fillable here even when the paste value itself is missing
            (a meeting whose minutes named no office bearers). */}
        {blockedNode}
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
      </StepFrame>
    );
  }

  // ---- Step 4 · Maklumat Juruaudit ----------------------------------------
  if (n === 4) {
    const supabase = await getSupabaseServer();
    const auditorsRead = await supabase
      .from("auditors")
      .select("person_name, name_official, email, appointed_on, status")
      .eq("org_id", base.active.id)
      .order("id", { ascending: true });
    const auditors = auditorsRead.error
      ? null
      : ((auditorsRead.data ?? []) as {
          person_name: string;
          name_official: string | null;
          email: string | null;
          appointed_on: string | null;
          status: "active" | "inactive";
        }[]);
    return (
      <StepFrame
        n={4}
        describe={
          <Tri
            bm="Portal menunjukkan senarai juruaudit (nama, no. pengenalan, e-mel, tarikh lantik, status) dan minta TARIKH PELANTIKAN JURUAUDIT. Peringatannya: bilangan juruaudit AKTIF mesti ikut perlembagaan."
            zh="这一页显示审计员名单（姓名/身份证号/电邮/任命日期/状态），要填「审计员任命日期」。它的提醒是：现任审计员人数要照章程。"
            en="The portal shows the auditors list (name, ID number, e-mail, appointment date, status) and asks for the APPOINTMENT DATE. Its warning: the ACTIVE auditor count must follow the constitution."
          />
        }
      >
        {auditors === null ? (
          dbBehindLine(34)
        ) : (
          <>
            {auditors.length === 0 && (
              <p className="text-base text-amber-900 dark:text-amber-100">
                <Tri
                  bm="Belum ada juruaudit direkodkan — tambah terus di bawah."
                  zh="还没记录审计员 —— 直接在下面加。"
                  en="No auditors recorded yet — add one right below."
                />
              </p>
            )}
            {auditors.map((a, i) => (
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
                locked={locked}
              />
            ))}
            {canWrite && <AuditorInlineForm />}
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
      </StepFrame>
    );
  }

  // ---- Step 5 · Penyata Kewangan ------------------------------------------
  if (n === 5) {
    const maklumat = await loadFlowMaklumat(base.active.id);
    const { fromIso, toIso } = resolveRange(
      base.todayIso,
      maklumat?.financialYearStart ?? null,
      sp.dari,
      sp.hingga,
    );
    let penyata: PenyataKewangan | null = null;
    const rows = await loadStatementRows(base.active.id, { fromIso, toIso });
    if (rows) {
      const KNOWN = new Set(["recorded", "submitted", "approved", "paid", "rejected"]);
      penyata = buildPenyataKewangan({
        donations: rows.donations.map((d) => ({
          amountCents: d.amountCents,
          purpose: d.purpose,
          donatedAtIso: d.donatedAtIso,
          kind: d.kind === "in_kind" ? "in_kind" : "cash",
        })),
        expenses: rows.expenses.map((e) => ({
          amountCents: e.amountCents,
          category: e.category,
          spentAtIso: e.spentAtIso,
          status: (KNOWN.has(e.status ?? "") ? e.status : "recorded") as PenyataExpenseInput["status"],
        })),
        from: fromIso,
        to: toIso,
      });
    }
    return (
      <StepFrame
        n={5}
        describe={
          <Tri
            bm={`Dua halaman kotak RM: Pendapatan 1.1–1.4 dan Perbelanjaan 2.1–2.4; jumlah dikira oleh portal. Peringatan portal: angka mesti daripada penyata yang DISAHKAN dalam AGM (atau oleh juruaudit). Nilai di bawah dikira daripada rekod wang anda untuk ${fromIso} hingga ${toIso} — kotak yang tiada dalam senarai ini biarkan 0.00.`}
            zh={`两页 RM 数字格：收入 1.1–1.4、支出 2.1–2.4，总计 portal 自己算。portal 的提醒：数字要用 AGM 确认过（或审计员签核）的报表。下面的值是照你们 ${fromIso} 至 ${toIso} 的钱区记录算出来的 —— 不在下表里的格子填 0.00 就行。`}
            en={`Two pages of RM boxes: income 1.1–1.4 and spending 2.1–2.4; totals are computed by the portal. Its reminder: figures must come from the statement CONFIRMED at the AGM (or by the auditors). The values below are computed from your money records for ${fromIso} to ${toIso} — boxes not listed here stay 0.00.`}
          />
        }
      >
        {penyata === null ? (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Rekod wang tidak dapat dibaca sekarang — cuba muat semula halaman."
              zh="现在读不到钱区记录 —— 请刷新页面再试。"
              en="The money records could not be read just now — reload the page."
            />
          </p>
        ) : (
          <>
            {penyata.sections.map((s) => {
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
                      locked={locked}
                      mono
                    />
                  ))}
                </div>
              );
            })}
            {penyata.sections.every((s) => s.cells.every((c) => c.amountCents === 0)) && (
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
                  <Tri bm="portal kira sendiri — banding sahaja" zh="portal 会自己算 —— 拿这个对一下" en="the portal computes this — just compare" />
                }
                value={penyataAmount(penyata.jumlahPendapatanCents)}
                locked={locked}
                mono
              />
              <ValueRow
                id="s5-total-out"
                labelBm="Jumlah Perbelanjaan (semakan)"
                labelSub={
                  <Tri bm="portal kira sendiri — banding sahaja" zh="portal 会自己算 —— 拿这个对一下" en="the portal computes this — just compare" />
                }
                value={penyataAmount(penyata.jumlahPerbelanjaanCents)}
                locked={locked}
                mono
              />
              {/* Kept from the retired /filings page's F-3 card: the net —
                  computed by TypeScript from the same two totals. */}
              <ValueRow
                id="s5-net"
                labelBm="Lebihan / Kurangan (bersih)"
                labelSub={
                  <Tri
                    bm="pendapatan tolak perbelanjaan — untuk semakan sendiri"
                    zh="收入减支出的结余 —— 自己对账用"
                    en="income minus spending — for your own check"
                  />
                }
                value={
                  (penyata.jumlahPendapatanCents - penyata.jumlahPerbelanjaanCents < 0 ? "-" : "") +
                  penyataAmount(Math.abs(penyata.jumlahPendapatanCents - penyata.jumlahPerbelanjaanCents))
                }
                locked={locked}
                mono
              />
            </div>
            {/* Kept from the retired /filings page's paste-pack: the money
                figures the MINUTES themselves recorded — a cross-check
                against the computed boxes above (the portal's reminder:
                figures must match what the AGM confirmed). */}
            {(() => {
              const minitRow = base.selected?.extraction
                ? buildPastePack(base.selected.extraction, []).find(
                    (r) => r.erosesField === "Maklumat Kewangan (ringkasan)",
                  )
                : null;
              if (!minitRow || minitRow.value === "—") return null;
              return (
                <ValueRow
                  id="s5-minit-figures"
                  labelBm="Angka kewangan dalam minit (semakan silang)"
                  labelSub={
                    <span className="flex items-center gap-2">
                      <Tri
                        bm="apa yang minit mesyuarat sendiri catatkan — banding dengan kotak di atas"
                        zh="会议记录里自己写的钱数 —— 拿来和上面的格子对一对"
                        en="what the minutes themselves recorded — compare with the boxes above"
                      />{" "}
                      <ConfidenceBadge level={minitRow.confidence} />
                    </span>
                  }
                  value={minitRow.value}
                  locked={locked}
                />
              );
            })()}
            {(penyata.assumedDermaCount > 0 ||
              penyata.inKindCount > 0 ||
              penyata.pendingExpenseCount > 0 ||
              penyata.undatedCount > 0) && (
              <div className="rounded-md border-2 border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <div className="font-semibold">
                  <Tri bm="Nota kiraan" zh="计算说明" en="Counting notes" />
                </div>
                <ul className="mt-1 list-disc pl-5">
                  {penyata.assumedDermaCount > 0 && (
                    <li>
                      <Tri
                        bm={`${penyata.assumedDermaCount} rekod tanpa jenis dinyatakan — dikira sebagai Derma (1.1).`}
                        zh={`${penyata.assumedDermaCount} 笔没写明类型 —— 按捐款计入 1.1 Derma。`}
                        en={`${penyata.assumedDermaCount} record(s) named no type — counted as Derma (1.1).`}
                      />
                    </li>
                  )}
                  {penyata.inKindCount > 0 && (
                    <li>
                      <Tri
                        bm={`${penyata.inKindCount} derma barangan TIDAK dijumlahkan (barangan bukan ringgit).`}
                        zh={`${penyata.inKindCount} 笔实物捐赠不计入金额（实物不是钱）。`}
                        en={`${penyata.inKindCount} in-kind donation(s) NOT summed (goods are not ringgit).`}
                      />
                    </li>
                  )}
                  {penyata.pendingExpenseCount > 0 && (
                    <li>
                      <Tri
                        bm={`${penyata.pendingExpenseCount} tuntutan belum dibayar (RM ${penyataAmount(penyata.pendingExpenseCents)}) TIDAK termasuk — wang belum keluar.`}
                        zh={`${penyata.pendingExpenseCount} 笔报销还没付款（RM ${penyataAmount(penyata.pendingExpenseCents)}）没有算进去 —— 钱还没出去。`}
                        en={`${penyata.pendingExpenseCount} claim(s) not yet paid (RM ${penyataAmount(penyata.pendingExpenseCents)}) NOT included — the money has not left.`}
                      />
                    </li>
                  )}
                  {penyata.undatedCount > 0 && (
                    <li>
                      <Tri
                        bm={`${penyata.undatedCount} rekod tanpa tarikh tidak masuk tempoh ini.`}
                        zh={`${penyata.undatedCount} 笔没有日期的记录不在这段时间里。`}
                        en={`${penyata.undatedCount} undated record(s) fall outside this period.`}
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
              <Link href={`/money/report?dari=${fromIso}&hingga=${toIso}`} className="underline underline-offset-4">
                <Tri bm="Penyata Minit untuk rujukan" zh="Minit 的财务报表（参考用）" en="Minit's statement for reference" /> →
              </Link>
            </p>
          </>
        )}
      </StepFrame>
    );
  }

  // ---- Step 6 · Laporan Aktiviti ------------------------------------------
  if (n === 6) {
    const maklumat = await loadFlowMaklumat(base.active.id);
    const { fromIso, toIso } = resolveRange(
      base.todayIso,
      maklumat?.financialYearStart ?? null,
      sp.dari,
      sp.hingga,
    );
    return (
      <StepFrame
        n={6}
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
          <Link href={`/filings/laporan?dari=${fromIso}&hingga=${toIso}`} className="underline underline-offset-4">
            <Tri bm="Jana Laporan Aktiviti" zh="生成活动报告" en="Generate the Laporan Aktiviti" /> →
          </Link>
        </p>
      </StepFrame>
    );
  }

  // ---- Step 7 · Sumbangan Dari/Ke Luar Negara ------------------------------
  if (n === 7) {
    return (
      <StepFrame
        n={7}
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
      </StepFrame>
    );
  }

  // ---- Step 8 · Paparan ----------------------------------------------------
  if (n === 8) {
    return (
      <StepFrame
        n={8}
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
      </StepFrame>
    );
  }

  // ---- Step 9 · Pengakuan --------------------------------------------------
  return (
    <StepFrame
      n={9}
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
    </StepFrame>
  );
}
