import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { buildFinancialStatement } from "@/lib/financial-statement";
import { dayIsoMalaysia } from "@/lib/history";
import { loadStatementRows } from "../report/data";
import { BalanceView } from "./balance-view";

// ---------------------------------------------------------------------------
// /money/balance — "现在还有多少钱" (D31; J review 27-evening #24, 2026-08-28).
//
// The one number the treasurer could not see anywhere: money in minus money
// out, over every record the organisation has. Cash-basis, summed by
// lib/financial-statement.ts (Hard Rule 2) from DATABASE rows only — the
// same arithmetic as the statement, over an all-time period. The amount is
// hidden behind an eye by default (J: not everyone standing behind the
// laptop should read the society's balance off the screen), and this page is
// the ONLY place the running balance appears — deliberately not on the home
// page, not in the statement.
//
// Who may look: the money roles (treasurer / hq_admin — can "money_write").
// Everyone else gets told whose job it is, not a blank page.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

/** Before the society's first possible record — "all time" as a date. */
const BEGINNING_ISO = "2000-01-01";

export default async function MoneyBalancePage() {
  const active = await getActiveOrg();
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />
          </Link>
        </p>
      </div>
    );
  }

  if (!can(active.role, "money_write")) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Tri
            bm="Baki semasa hanya untuk bendahari dan pentadbir HQ."
            zh="现有资金只给财政和总会管理员看。"
            en="The current funds page is for the treasurer and HQ admins only."
          />
        </p>
      </div>
    );
  }

  const rows = await loadStatementRows(active.id, {
    fromIso: BEGINNING_ISO,
    toIso: todayIso,
  });

  if (rows === null) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Tri
            bm="Rekod tidak dapat dibaca sekarang. Muat semula halaman ini."
            zh="现在读不到记录。请重新载入这一页。"
            en="The records could not be read just now. Reload this page."
          />
        </p>
      </div>
    );
  }

  const statement = buildFinancialStatement(rows, {
    fromIso: BEGINNING_ISO,
    toIso: todayIso,
  });

  return (
    <BalanceView
      incomeTotalCents={statement.incomeTotalCents}
      paymentsTotalCents={statement.paymentsTotalCents}
      asOfIso={todayIso}
    />
  );
}
