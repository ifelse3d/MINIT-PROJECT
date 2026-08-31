// ---------------------------------------------------------------------------
// QUOTA AS PERCENTAGES — the display layer only (work order 102 §0-4).
//
// J's ruling: users see PERCENTAGES, never action counts and never tokens.
// "這份 5 頁，大約用 X%" before the work; "這個動作用了 X%" after it. The
// METERING is untouched — ai_usage still records actions and real vendor
// cost; these helpers only translate an action count into a share of the
// org's own monthly pool for the reader.
// ---------------------------------------------------------------------------

/**
 * What `actions` will cost, as a share of the monthly pool, 0–100.
 *
 * null when the pool is unknown (usage fetch failed) — callers then say
 * nothing rather than guessing. Never rounds a real action down to 0%: a
 * metered action displayed as "0%" reads as free, which is a lie.
 */
export function pctOfQuota(actions: number, quota: number | null | undefined): number | null {
  if (quota == null || quota <= 0 || !Number.isFinite(actions) || actions <= 0) {
    return null;
  }
  return Math.min(100, Math.max(1, Math.round((actions / quota) * 100)));
}

/** What is LEFT of the monthly pool, 0–100, from the spent share. */
export function remainingPct(usedPct: number | null | undefined): number | null {
  if (usedPct == null || !Number.isFinite(usedPct)) return null;
  return Math.min(100, Math.max(0, 100 - usedPct));
}
