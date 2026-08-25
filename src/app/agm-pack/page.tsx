import { getLatestConfirmedExtraction } from "@/db/agm";
import { loadFilingRoster } from "@/app/minutes/roster-actions";
import { AgmPackReview } from "./agm-pack-review";

// ---------------------------------------------------------------------------
// /agm-pack (G-2/G-4, work order 27 — J 8/26 #5 "不要再一直 CONTOH 了").
// The REAL path is the page: the committee roster from the database, the
// meeting facts from the person announcing the AGM, no CONTOH anywhere. The
// worked example is a separate, clearly-labelled entrance (?contoh=1) built
// on the fictional society's own name.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function AgmPackPage({
  searchParams,
}: {
  searchParams: Promise<{ contoh?: string }>;
}) {
  const sp = await searchParams;
  const [roster, confirmed] = await Promise.all([
    loadFilingRoster(),
    getLatestConfirmedExtraction(),
  ]);
  const resolutions =
    confirmed?.extraction.resolutions
      .map((r) => r.text.value.trim())
      .filter((r) => r !== "") ?? null;
  return (
    <AgmPackReview
      mode={sp.contoh === "1" ? "sample" : "real"}
      roster={roster.map((m) => ({ position: m.position, personName: m.name }))}
      confirmedResolutions={resolutions}
    />
  );
}
