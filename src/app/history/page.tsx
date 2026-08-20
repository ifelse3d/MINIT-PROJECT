import { fetchMonthActivity } from "@/db/activity";
import { getActiveOrg } from "@/lib/active-org";
import { assertYearMonth, dayIsoMalaysia, type ActivityRecord } from "@/lib/history";
import { HistoryFeed } from "./history-feed";

// /history — Sejarah: a read-only, newest-first feed of EVERYTHING done in
// the org (minutes confirmed, receipts issued, money recorded, uploads
// processed, filings generated, AGMs and other meetings held, constitutions
// ingested). Constitution Q&A is deliberately NOT here — see
// HISTORY_CATEGORIES in lib/history.ts. Month-
// scoped via ?month=, reusing the SAME query module as /calendar
// (src/db/activity.ts) — the two pages can never disagree. PDPA (Hard Rule
// 5): only masked donor values and committee member names reach the feed.
export const dynamic = "force-dynamic";

type Search = { month?: string };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;

  let month = todayIso.slice(0, 7);
  try {
    if (params.month) {
      assertYearMonth(params.month);
      month = params.month;
    }
  } catch {
    // malformed ?month= — fall back to the current month
  }

  const active = await getActiveOrg();
  const records: ActivityRecord[] = active ? await fetchMonthActivity(active.id, month) : [];

  return (
    <HistoryFeed
      records={records}
      month={month}
      todayIso={todayIso}
      orgName={active?.name ?? null}
    />
  );
}
