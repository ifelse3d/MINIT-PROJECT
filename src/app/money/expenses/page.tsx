import { getActiveOrg } from "@/lib/active-org";
import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { ExpensesView } from "./expenses-view";

// ---------------------------------------------------------------------------
// /money/expenses — the society's spending, and the claim flow (Stage E,
// work order 27; J 8/26 拍板②: expenses + submit→approve→pay, "做最好的").
// The role is resolved on the SERVER and drives which controls exist at all;
// the server actions enforce it again (B-4: the check lives in the action).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function MoneyExpensesPage() {
  const active = await getActiveOrg();
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      </div>
    );
  }
  return <ExpensesView role={active.role} />;
}
