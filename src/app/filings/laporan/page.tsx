import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getFenceState } from "@/lib/fence";
import { dayIsoMalaysia } from "@/lib/history";
import { LaporanView } from "./laporan-view";

// ---------------------------------------------------------------------------
// /filings/laporan — the Laporan Aktiviti generator (D2-3, work order 56).
// eROSES Penyata Tahunan step 6 asks the society to upload an activity
// report; this page drafts one FROM THE ORG'S OWN RECORDS (events + confirmed
// minutes), lets the person edit every sentence, and renders the PDF.
// Thin server wrapper: org check + fence state; the flow is client-side.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function LaporanPage() {
  const active = await getActiveOrg().catch(() => null);
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
  // D44: null = paid org, no fence talk anywhere on the page.
  const fenceState = await getFenceState(active);
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  return (
    <LaporanView
      todayIso={todayIso}
      fence={
        fenceState
          ? {
              downloadsRemaining: fenceState.remaining.downloads,
              docsRemaining: fenceState.remaining.docs,
            }
          : null
      }
    />
  );
}
