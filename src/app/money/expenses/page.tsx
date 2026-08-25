import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";

// ---------------------------------------------------------------------------
// /money/expenses — record spending, and the claim/reimbursement flow.
//
// HONEST STUB until Stage E of work order 27 builds it (CLAUDE.md #13: a step
// that cannot be done yet is still a real page that says what unlocks it).
// The /money/report stub links here, so this address must not be a dead end.
// ---------------------------------------------------------------------------

export default function MoneyExpensesPage() {
  return (
    <PageSection
      titleBm="Rekod perbelanjaan"
      titleZh="记开支与报销"
      titleEn="Record spending & claims"
      summary={
        <Tri
          bm="Perbelanjaan pertubuhan dan tuntutan ahli (claim), dengan kelulusan bendahari."
          zh="社团的开支，以及成员报销（交 → 批 → 付）。"
          en="The society's spending, and member claims (submit → approve → pay)."
        />
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Bahagian ini sedang disiapkan. Buat masa ini, wang MASUK sudah boleh direkodkan sepenuhnya — lejar, resit bernombor dan serahan wang semuanya berfungsi."
            zh="这一区还在建。目前收入那边已经全部可用 —— 账页、连号收据、交现金都能用。"
            en="This part is being built. For now, INCOME is fully working — the ledger, numbered receipts and cash hand-over are all live."
          />
        </p>
        <Button asChild size="lg">
          <Link href="/money">
            🧾{" "}
            <Tri
              bm="Pergi ke rekod wang masuk"
              zh="去记收入"
              en="Go to income records"
            />
          </Link>
        </Button>
      </div>
    </PageSection>
  );
}
