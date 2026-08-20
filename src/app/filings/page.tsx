import { getLatestConfirmedAgm } from "@/db/agm";
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
  const agm = await getLatestConfirmedAgm();
  return <FilingsView agm={agm} />;
}
