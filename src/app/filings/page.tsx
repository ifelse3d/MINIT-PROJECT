import { getLatestConfirmedAgm, getLatestConfirmedExtraction } from "@/db/agm";
import { getActiveOrg } from "@/lib/active-org";
import { readOrgTypeFlags } from "@/lib/org-flags";
import { FilingsView } from "./filings-view";

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
  const [agm, confirmed, active] = await Promise.all([
    getLatestConfirmedAgm(),
    getLatestConfirmedExtraction(),
    getActiveOrg().catch(() => null),
  ]);
  // B-5: an internal committee gets no eROSES/annual-return nagging.
  const { orgType } = active
    ? await readOrgTypeFlags(active.id)
    : { orgType: null };
  return <FilingsView agm={agm} confirmed={confirmed} orgType={orgType} />;
}
