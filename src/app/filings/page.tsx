import { permanentRedirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /filings — the FRONT DOOR is the card entry now (work order 78, J 8/30:
// the sidebar pointed here while the H2 card entry lived one segment deeper,
// so nobody ever saw it). This address permanently forwards to
// /filings/eroses, carrying ?doc so every saved "file this meeting?" link
// keeps its chosen meeting.
//
// The old one-long-page guide that lived here was retired the same day; its
// jobs live in the flow now (inventory in 报告 80):
//   pick meeting        → FlowMeetingPicker (penyata start / mesyuarat)
//   register meeting    → /filings/eroses/mesyuarat
//   annual-return pack  → /filings/eroses/penyata/langkah/1…9
//   financial figures   → langkah/5 (income / spending / net + minutes check)
//   laporan link        → langkah/6 + the entry page's footer line
//   deadlines           → /filings/eroses/tarikh
//
// The nav keeps href="/filings": prefix matching lights the whole family
// (/filings/eroses/*, /filings/laporan) without touching nav-items.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function FilingsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string | string[] }>;
}) {
  const sp = await searchParams;
  const docRaw = Array.isArray(sp.doc) ? sp.doc[0] : sp.doc;
  permanentRedirect(
    docRaw && /^\d+$/.test(docRaw)
      ? `/filings/eroses?doc=${docRaw}`
      : "/filings/eroses",
  );
}
