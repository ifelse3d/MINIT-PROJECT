import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";

// ---------------------------------------------------------------------------
// /money/report — the financial statement (Penyata Penerimaan dan Pembayaran).
//
// A-1 (work order 27): the home page's card ③ lands here. Until Stage F
// builds the real statement this is an HONEST STUB — CLAUDE.md #13: a step
// that cannot be done yet is still a real page with a real address, and the
// page says what unlocks it. No fake numbers, no CONTOH.
// ---------------------------------------------------------------------------

export default function MoneyReportPage() {
  return (
    <PageSection
      titleBm="Penyata kewangan"
      titleZh="财报"
      titleEn="Financial statement"
      summary={
        <Tri
          bm="Penyata masuk & keluar mengikut bulan atau tahun, dikira oleh Minit daripada rekod yang sudah disahkan."
          zh="按月或按年的收支表，由 Minit 从已确认的记录算出来。"
          en="Income & spending by month or year, computed from your confirmed records."
        />
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Penyata dibina daripada apa yang sudah direkodkan. Rekodkan wang masuk dan wang keluar dahulu — penyata akan muncul di sini."
            zh="财报是从已经记下的账算出来的。先把收入和开支记进来，财报就会出现在这里。"
            en="The statement is built from what has been recorded. Record income and spending first — the statement appears here."
          />
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/money">
              🧾{" "}
              <Tri
                bm="Rekod wang masuk (derma & resit)"
                zh="去记收入（捐款与收据）"
                en="Record income (donations & receipts)"
              />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/money/expenses">
              💸{" "}
              <Tri
                bm="Rekod wang keluar (perbelanjaan)"
                zh="去记开支"
                en="Record spending (expenses)"
              />
            </Link>
          </Button>
        </div>
      </div>
    </PageSection>
  );
}
