import { getLatestConfirmedAgm, getLatestConfirmedExtraction } from "@/db/agm";
import { getActiveOrg } from "@/lib/active-org";
import { readOrgTypeFlags } from "@/lib/org-flags";
import { buildFinancialStatement } from "@/lib/financial-statement";
import { dayIsoMalaysia } from "@/lib/history";
import { loadStatementRows } from "@/app/money/report/data";
import { loadFilingRoster } from "@/app/minutes/roster-actions";
import { FilingsView, type FilingsFinance } from "./filings-view";

// ---------------------------------------------------------------------------
// /filings — thin server wrapper.
//
// 2026-07-28 audit: this page presented the ROS annual-return deadline under
// the caption "Computed by the system, not the AI" while the date was actually
// derived from a FICTIONAL sample AGM, complete with a fictional secretary
// named as its provenance — and unlike /calendar and the home dashboard it
// carried no "sample data" badge. The real confirmed AGM (if any) is resolved
// here and handed to the view; when there is none, the view says so.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function FilingsPage() {
  // S0-5 (2026-08-25): the paste-pack is built from the latest CONFIRMED
  // minutes in the database — a signed document — never from this browser's
  // half-checked draft. Different devices now see the same pack.
  const [agm, confirmed, active, filingRoster] = await Promise.all([
    getLatestConfirmedAgm(),
    getLatestConfirmedExtraction(),
    getActiveOrg().catch(() => null),
    // G-1: the paste-pack's committee field files from the REAL roster.
    loadFilingRoster(),
  ]);
  // B-5: an internal committee gets no eROSES/annual-return nagging.
  const { orgType } = active
    ? await readOrgTypeFlags(active.id)
    : { orgType: null };

  // F-3 (work order 27): the annual return's financial figures, COMPUTED —
  // this year's statement totals from the database, a table lookup with AI
  // involved nowhere. null (no org / unreadable DB) simply hides the block.
  let finance: FilingsFinance | null = null;
  if (active) {
    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const year = todayIso.slice(0, 4);
    const period = { fromIso: `${year}-01-01`, toIso: todayIso };
    const rows = await loadStatementRows(active.id, period);
    if (rows) {
      const s = buildFinancialStatement(rows, period);
      finance = {
        year,
        toIso: todayIso,
        incomeTotalCents: s.incomeTotalCents,
        paymentsTotalCents: s.paymentsTotalCents,
        netCents: s.netCents,
      };
    }
  }

  return (
    <FilingsView
      agm={agm}
      confirmed={confirmed}
      orgType={orgType}
      finance={finance}
      filingRoster={filingRoster}
    />
  );
}
