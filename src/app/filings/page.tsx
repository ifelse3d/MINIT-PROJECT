import { getLatestConfirmedAgm } from "@/db/agm";
import {
  getConfirmedMinutesDoc,
  listConfirmedMinutes,
} from "@/db/minutes-list";
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
// 2026-08-28 REDESIGN (J review item 6: 「申报那边怪怪就是没说申报什么…没有说
// 给选哪一年，然后出来那些会议记录，要报什么，然后才给详细资料」+ his 12 eROSES
// screenshots). The page now follows the portal's own shape:
//   pick a YEAR → pick one of that year's CONFIRMED meetings → see exactly
//   what to do with it on eROSES (register the meeting + upload the PDF), and
//   the Annual Return section says plainly it is a separate, once-a-year job.
//
// ?doc=<id> selects the meeting (server-fetched so the paste values come from
// the SIGNED row in the database — S0-5 unchanged: a filing never builds from
// a browser draft).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function FilingsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string | string[] }>;
}) {
  const sp = await searchParams;
  const docRaw = Array.isArray(sp.doc) ? sp.doc[0] : sp.doc;
  const docId = Number(docRaw ?? "");

  const [agm, meetings, active, filingRoster] = await Promise.all([
    getLatestConfirmedAgm(),
    listConfirmedMinutes(),
    getActiveOrg().catch(() => null),
    // G-1: the Annual Return's committee field files from the REAL roster.
    loadFilingRoster(),
  ]);

  // The chosen meeting — or the newest confirmed one, which is what the old
  // page always showed. An id that is not this org's resolves to null and the
  // view says "pick a meeting" instead of guessing.
  const selectedId =
    Number.isInteger(docId) && docId > 0
      ? docId
      : meetings.length > 0
        ? meetings[0].id
        : null;
  const selected =
    selectedId !== null ? await getConfirmedMinutesDoc(selectedId) : null;

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
      meetings={meetings}
      selected={selected}
      orgType={orgType}
      finance={finance}
      filingRoster={filingRoster}
    />
  );
}
