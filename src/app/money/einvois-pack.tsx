"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import {
  buildMonthEndPack,
  consolidatedDeadlineIso,
  EINVOIS_MAX_DOCS_PER_FILE,
} from "@/lib/einvois";
import { formatRm } from "@/lib/minutes-draft";
import { downloadFromApi } from "@/lib/download-file";
import { todayIsoMalaysia } from "@/lib/history";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money/einvois — STEP 4: the month-end tax file.
//
// A once-a-month errand that used to sit at the bottom of the daily page, so
// everybody issuing a single receipt scrolled past it to get there and back.
// On its own page it can also stop pretending to be urgent: its tab in the rail
// is never amber, unlike the StepCard it replaces.
// ---------------------------------------------------------------------------

export function EInvoisPack() {
  const t = useTriText();
  const { donations, documentOrgName, availableMonths, setError } = useRegister();

  const [einvoisMonth, setEinvoisMonth] = useState<string>(() => todayIsoMalaysia().slice(0, 7));
  // Months are derived from the donation dates, so the picker only ever offers
  // months that actually have records.
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(einvoisMonth)) {
      setEinvoisMonth(availableMonths[0]);
    }
  }, [availableMonths, einvoisMonth]);

  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  // buildMonthEndPack throws if a month still has unreceipted donations — we
  // catch it and show a friendly hint instead of hiding the whole screen.
  const einvois = useMemo(() => {
    try {
      const pack = buildMonthEndPack(donations, {
        month: einvoisMonth,
        orgName: documentOrgName,
      });
      return { pack, error: null as string | null };
    } catch (e) {
      return { pack: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [donations, einvoisMonth, documentOrgName]);
  const einvoisPack = einvois.pack;
  /**
   * "There is genuinely a tax file to download."
   *
   * buildMonthEndPack does NOT throw for a month with no donations — it returns
   * a pack with `files: []`. Treating a truthy pack as "ready" made a brand-new
   * install offer an enabled button reading "Download the tax file (0 files)",
   * which 400s. (Found in review, 2026-07-28.)
   */
  const einvoisReady = Boolean(einvoisPack && einvoisPack.files.length > 0);

  async function downloadEInvoisPack() {
    if (downloadBusy) return;
    setError(null);
    setDownloadBusy("einvois");
    try {
      // First request tells us how many ≤100-doc files the month needs.
      // ONLY the month is sent (S0-1): the server reads that month's confirmed
      // donations back from the database, so this device's copy of the register
      // cannot change what goes into a tax submission file.
      const first = await downloadFromApi(
        "/api/einvois-xlsx",
        { month: einvoisMonth, fileIndex: 0 },
        `einvois-${einvoisMonth}.xlsx`
      );
      const count = Number(first.headers.get("X-Einvois-File-Count") ?? "1");
      for (let i = 1; i < count; i++) {
        await downloadFromApi(
          "/api/einvois-xlsx",
          { month: einvoisMonth, fileIndex: i },
          `einvois-${einvoisMonth}-${i + 1}.xlsx`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadBusy(null);
    }
  }

  return (
    <PageSection
      titleBm="Fail cukai hujung bulan (e-Invois)"
      titleZh="月底税务文件（电子发票 e-Invois）"
      titleEn="Month-end tax file (e-Invois)"
      summary={
        <Tri
          bm="Sekali sebulan sahaja. MinitAI gabungkan semua resit bulan itu jadi SATU fail Excel — anda salin angkanya ke dalam templat rasmi LHDN sebelum muat naik."
          zh="一个月只需要做一次。MinitAI 把当月所有收据合并成一个 Excel 文件 —— 您再把里面的数字抄进税务局的官方模板后上传。"
          en="Once a month only. MinitAI combines that month's receipts into ONE Excel file — you copy its figures into LHDN's official template before uploading."
        />
      }
    >
      <p className="text-base text-muted-foreground">
        {/* "e-Invois", "LHDN", "consolidation", "batch upload" and ".xlsx"
            were all shown with no explanation anywhere. (2026-07-28 audit.) */}
        {/* S0-6 honesty fix (2026-08-25): this used to say "upload the file
            there", presenting our spreadsheet AS the official template. Its
            column layout follows LHDN's documentation but has never been
            verified against a real MyInvois upload — so the honest instruction
            is: download the official Batch Upload template from MyInvois, copy
            these figures into it, and upload THAT. */}
        <Tri
          bm="Setiap bulan, semua resit bulan itu digabungkan menjadi SATU fail Excel (.xlsx). Muat turun fail itu di sini, kemudian log masuk ke laman MyInvois LHDN (jabatan cukai), muat turun templat rasmi 'Batch Upload' mereka, salin angka daripada fail MinitAI ke dalam templat itu, dan muat naik templat rasmi tersebut. MinitAI tidak menghantarnya untuk anda."
          zh="每个月，MinitAI 会把当月所有收据合并成一个 Excel 文件（.xlsx）。您在这里下载它，然后登入税务局（LHDN）的 MyInvois 网站，下载他们的官方「Batch Upload」模板，把 MinitAI 文件里的数字抄进官方模板，再上传那份官方模板。MinitAI 不会替您送出。"
          en="Each month all that month's receipts are combined into ONE Excel file (.xlsx). Download it here, then sign in to LHDN's MyInvois site, download their official 'Batch Upload' template, copy the figures from MinitAI's file into that template, and upload the official one. MinitAI does not submit it for you."
        />
      </p>

      <div className="flex flex-col gap-4">
        {/* Month picker — only offers months that actually have records. */}
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="einvois-month" className="text-sm font-medium text-muted-foreground">
            <Tri bm="Bulan" zh="月份" en="Month" />
          </label>
          <select
            id="einvois-month"
            value={einvoisMonth}
            onChange={(e) => setEinvoisMonth(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(availableMonths.length > 0 ? availableMonths : [einvoisMonth]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {einvoisPack && (
            <span className="text-sm text-muted-foreground">
              <Tri bm="Tarikh akhir hantar" zh="申报截止" en="Submit by" />:{" "}
              <span className="font-medium text-foreground">
                {consolidatedDeadlineIso(einvoisMonth)}
              </span>
            </span>
          )}
        </div>

        {einvoisReady && einvoisPack ? (
          <div className="flex flex-col gap-3">
            {/* B-7 (拍板 37): the month at a glance — real layout, not a
                monospace dump pretending to be a report. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="Derma terkumpul (consolidated)"
                    zh="合并申报的捐款"
                    en="Consolidated donations"
                  />
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatRm(einvoisPack.consolidatedTotalCents)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {einvoisPack.consolidated.length}{" "}
                  <Tri bm="resit" zh="张收据" en="receipts" />
                </p>
              </div>
              <div className="rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="Derma individu ≥ RM10,000"
                    zh="≥ RM10,000 的单笔捐款"
                    en="Individual donations ≥ RM10,000"
                  />
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {einvoisPack.individual.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="perlu identiti penderma"
                    zh="每笔要填捐款人身份"
                    en="each needs donor identity"
                  />
                </p>
              </div>
              <div className="rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
                <p className="text-sm text-muted-foreground">
                  <Tri bm="Jumlah besar" zh="本月总额" en="Grand total" />
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatRm(einvoisPack.grandTotalCents)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {einvoisPack.files.length}{" "}
                  <Tri bm="fail muat naik" zh="个上传文件" en="upload file(s)" /> ·{" "}
                  <Tri
                    bm={`maks ${EINVOIS_MAX_DOCS_PER_FILE} dokumen sefail`}
                    zh={`每个最多 ${EINVOIS_MAX_DOCS_PER_FILE} 份文件`}
                    en={`max ${EINVOIS_MAX_DOCS_PER_FILE} docs each`}
                  />
                </p>
              </div>
              <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
                <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
                  <Tri bm="Tarikh akhir hantar" zh="申报截止" en="Submit by" />
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                  {consolidatedDeadlineIso(einvoisMonth)}
                </p>
                <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
                  <Tri
                    bm="7 hari selepas hujung bulan"
                    zh="月底后 7 天内"
                    en="7 days after month-end"
                  />
                </p>
              </div>
            </div>

            {/* B-7 / D21: the steps live HERE, on the page — not inside the
                upload file, where a sheet of prose makes portals choke. */}
            <ol className="flex flex-col gap-2 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-4 text-base dark:bg-white/5">
              <li>
                1️⃣{" "}
                <Tri
                  bm="Muat turun fail .xlsx di bawah."
                  zh="按下面的按钮下载 .xlsx 文件。"
                  en="Download the .xlsx file below."
                />
              </li>
              <li>
                2️⃣{" "}
                <Tri
                  bm="Log masuk MyInvois Portal (myinvois.hasil.gov.my) → Batch Upload, dan muat turun templat rasmi semasa."
                  zh="登入 MyInvois Portal（myinvois.hasil.gov.my）→ Batch Upload，下载官方最新模板。"
                  en="Sign in to the MyInvois Portal (myinvois.hasil.gov.my) → Batch Upload, and download the current official template."
                />
              </li>
              <li>
                3️⃣{" "}
                <Tri
                  bm="Salin nilai dari helaian “Dokumen” ke dalam templat rasmi itu. Bagi derma ≥ RM10,000, isi TIN/MyKad penderma sebenar — ruang itu sengaja kosong, sistem tidak mereka-reka identiti."
                  zh="把「Dokumen」表里的数字抄进官方模板。≥ RM10,000 的捐款要填捐款人真实的 TIN/身份证 —— 那一格特意留空，系统不会编造身份。"
                  en="Copy the values from the “Dokumen” sheet into the official template. For donations ≥ RM10,000 fill in the donor's real TIN/MyKad — that cell is left blank on purpose; the system never invents identity."
                />
              </li>
              <li>
                4️⃣{" "}
                <Tri
                  bm="Semak setiap nilai, kemudian muat naik templat rasmi itu. MinitAI tidak menghantarnya untuk anda."
                  zh="逐项核对后，上传那份官方模板。MinitAI 不会替您送出。"
                  en="Check every value, then upload the official template. MinitAI does not submit it for you."
                />
              </li>
            </ol>
            <Button
              onClick={downloadEInvoisPack}
              size="lg"
              className="self-start"
              disabled={downloadBusy !== null}
            >
              {downloadBusy === "einvois" ? (
                <Tri bm="Sedang menyiapkan fail…" zh="正在准备文件…" en="Preparing the file…" />
              ) : (
                <>
                  <Download className="h-5 w-5" strokeWidth={2} />
                  <Tri
                    bm="Muat turun fail cukai (.xlsx)"
                    zh="下载税务文件（.xlsx）"
                    en="Download the tax file (.xlsx)"
                  />{" "}
                  ({einvoisPack.files.length}{" "}
                  {t("fail", "个文件", `file${einvoisPack.files.length > 1 ? "s" : ""}`)})
                </>
              )}
            </Button>
          </div>
        ) : einvois.error ? (
          /* AUDIT FIX: `einvois.error` was computed and then NEVER rendered,
             so a real failure collapsed the whole section into the innocuous
             "issue receipts first" message even when receipts existed. */
          <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Pek cukai bulan ini tidak dapat disiapkan. Semak jumlah dan nombor resit di halaman Resit, kemudian cuba lagi."
              zh="这个月的税务文件包做不出来。请先到「开收据」那一页检查金额和收据号码，然后再试。"
              en="This month's tax pack could not be prepared. Check the amounts and receipt numbers on the Receipts page, then try again."
            />
            <br />
            <span className="font-mono">{einvois.error}</span>
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Belum ada resit untuk bulan ini. Jana resit di halaman Resit dahulu."
              zh="这个月还没有收据。请先到「开收据」那一页开收据。"
              en="No receipts for this month yet. Issue receipts on the Receipts page first."
            />
          </p>
        )}
      </div>

      <NextStepLink
        href="/money/history"
        back
        labelBm="Lihat sejarah resit"
        labelZh="看收据历史"
        labelEn="See the receipt history"
      />
    </PageSection>
  );
}
