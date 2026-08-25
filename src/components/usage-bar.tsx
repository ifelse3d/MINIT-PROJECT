// ---------------------------------------------------------------------------
// K-4 (work order 27): THE usage bar — one component, one threshold.
//
// The settings card and /settings/plan each carried their own copy of this
// bar, and "running low" was the magic number 10 written twice. Change one
// and the two meters disagree about when the month is "almost gone" — the
// exact class of bug the shared computeUsageState() already fixed for the
// percentage. Server-renderable (no hooks).
// ---------------------------------------------------------------------------

/** Remaining actions at or below this = "running low" (amber). */
export const LOW_REMAINING_THRESHOLD = 10;

export function usageIsLow(blocked: boolean, totalRemaining: number): boolean {
  return !blocked && totalRemaining <= LOW_REMAINING_THRESHOLD;
}

export function UsageBar({
  usedThisMonth,
  monthlyFreeQuota,
  usedPct,
  blocked,
  totalRemaining,
}: {
  usedThisMonth: number;
  monthlyFreeQuota: number;
  usedPct: number;
  blocked: boolean;
  totalRemaining: number;
}) {
  const low = usageIsLow(blocked, totalRemaining);
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={usedThisMonth}
      aria-valuemin={0}
      aria-valuemax={monthlyFreeQuota}
    >
      <div
        className={`h-full rounded-full transition-all ${
          blocked ? "bg-red-600" : low ? "bg-amber-500" : "bg-green-600"
        }`}
        style={{ width: `${usedPct}%` }}
      />
    </div>
  );
}
