// ---------------------------------------------------------------------------
// F-1 (2026-08-25): AI usage is shown as a PERCENTAGE of the month, everywhere
// (J's decision #4, asked since 8/20). "每问一次用掉 1 次" became "本月 AI 用量
// 已用 X%" — one mental model, one source. This is the ONE place the
// action→percent arithmetic lives, so every screen rounds the same way.
//
// The billing UNIT stays "actions" internally (usage.ts, ai_usage rows) —
// switching the unit itself to cost is D1-L2 and waits for two weeks of real
// usage data (docs/DECISIONS.md D9). This file only changes what people READ.
// ---------------------------------------------------------------------------

/** The default monthly free quota, used only when the real quota is unknown
 *  on a static screen. Matches DEFAULT_MONTHLY_QUOTA in the usage gate. */
const FALLBACK_QUOTA = 100;

/**
 * What `actions` actions cost, as a whole percentage of the month's quota.
 * Never rounds to 0 — a paid action must never read as free.
 */
export function pctOfQuota(
  actions: number,
  quota?: number | null,
): number {
  const q = quota && quota > 0 ? quota : FALLBACK_QUOTA;
  return Math.max(1, Math.round((actions / q) * 100));
}
