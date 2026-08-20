import { fetchMonthActivity } from "@/db/activity";
import { getActiveOrg } from "@/lib/active-org";
import { assertYearMonth, dayIsoMalaysia, type ActivityRecord } from "@/lib/history";
import { getLatestConfirmedAgm } from "@/db/agm";
import { CalendarShell } from "./calendar-shell";

// /calendar — ONE full-width page: month grid + "Upcoming" sidebar (the old
// Deadlines/Activity tabs are gone; recorded history moved to /history as a
// feed, but the grid still shows both history dots and future items). This
// server component fetches ONE month of activity for the active org via the
// shared query module src/db/activity.ts (also used by /history).
export const dynamic = "force-dynamic";

type Search = { month?: string };

export default async function CalendarPage({
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
  // The annual-return deadline must come from THIS org's confirmed AGM, not
  // from the fictional sample minutes it used to be derived from.
  const agm = await getLatestConfirmedAgm();

  return (
    <CalendarShell
      records={records}
      month={month}
      todayIso={todayIso}
      orgName={active?.name ?? null}
      agm={agm}
    />
  );
}
