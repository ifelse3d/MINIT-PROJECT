"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import {
  buildMonthEndPack,
  consolidatedDeadlineIso,
  monthEndSummary,
} from "@/lib/einvois";
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
      const first = await downloadFromApi(
        "/api/einvois-xlsx",
        // orgName comes from the server session, not from here.
        { donations, month: einvoisMonth, fileIndex: 0 },
        `einvois-${einvoisMonth}.xlsx`
      );
      const count = Number(first.headers.get("X-Einvois-File-Count") ?? "1");
      for (let i = 1; i < count; i++) {
        await downloadFromApi(
          "/api/einvois-xlsx",
          { donations, month: einvoisMonth, fileIndex: i },
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
      step={4}
      titleBm="Fail cukai hujung bulan (e-Invois)"
      titleZh="月底税务文件（电子发票 e-Invois）"
      titleEn="Month-end tax file (e-Invois)"
      summary={
        <Tri
          bm="Sekali sebulan sahaja. Minit gabungkan semua resit bulan itu jadi SATU fail Excel untuk anda muat naik ke laman LHDN."
          zh="一个月只需要做一次。Minit 把当月所有收据合并成一个 Excel 文件，让您上传到税务局的网站。"
          en="Once a month only. Minit combines that month's receipts into ONE Excel file for you to upload to the tax office's site."
        />
      }
    >
      <p className="text-base text-muted-foreground">
        {/* "e-Invois", "LHDN", "consolidation", "batch upload" and ".xlsx"
            were all shown with no explanation anywhere. (2026-07-28 audit.) */}
        <Tri
          bm="Setiap bulan, semua resit bulan itu digabungkan menjadi SATU fail Excel (.xlsx). Anda muat turun fail itu di sini, kemudian log masuk ke laman MyInvois LHDN (Lembaga Hasil Dalam Negeri — jabatan cukai) dan muat naik fail itu di sana. Minit tidak menghantarnya untuk anda."
          zh="每个月，Minit 会把当月所有收据合并成一个 Excel 文件（.xlsx）。您在这里下载这个文件，然后登入税务局（LHDN）的 MyInvois 网站，把文件上传上去。Minit 不会替您送出。"
          en="Each month all that month's receipts are combined into ONE Excel file (.xlsx). You download it here, then sign in to the tax office's (LHDN) MyInvois website and upload the file there. Minit does not submit it for you."
        />
        <br />⚠{" "}
        <Tri
          bm="Semak templat dengan LHDN sebelum guna."
          zh="使用前请对照税务局的官方模板核对。"
          en="Check the template against LHDN's official one before use."
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
            <pre className="rounded-md border bg-muted/40 p-4 text-base whitespace-pre-wrap">
              {monthEndSummary(einvoisPack, documentOrgName)}
            </pre>
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
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
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
