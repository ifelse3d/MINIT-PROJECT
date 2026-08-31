import { Tri } from "@/components/language-provider";
import { computeUsageState } from "@/lib/ai/usage-core";
import { remainingPct } from "@/lib/quota-display";

// ---------------------------------------------------------------------------
// AI quota readout — DISPLAY ONLY.
//
// 2026-07-29 (P0-1). This used to be a self-service top-up: the org's own
// hq_admin typed a number and saved it, which defeated the whole metering
// layer. The database now refuses it — migration
// `20260728000000_lock_org_privileged_columns.sql` makes `extra_credits`,
// `monthly_free_quota`, `tax_exempt_status` and `parent_org_id`
// trigger-protected, so no client (a raw browser PATCH included) can change
// them. Credits are granted server-side only, via
// `minit_admin.grant_ai_credits()`.
//
// 2026-07-29 (readability). The numbers used to sit INSIDE each language
// string of <Tri>, so with two languages on you read
// "本月 AI: 0/100 · AI this month: 0/100" — the same figure twice. Labels are
// translated; VALUES are printed once, outside <Tri>.
//
// `extraCredits` and the "contact Minit" hint only render when they say
// something. A row of zeroes on every card is noise, and the pilot orgs all
// sit at 0.
// ---------------------------------------------------------------------------

export function CreditForm({
  extraCredits,
  monthlyFreeQuota,
  usedThisMonth,
}: {
  extraCredits: number;
  monthlyFreeQuota: number;
  usedThisMonth: number;
}) {
  // §5 (104): PERCENTAGES, over the same pool as everywhere else — the
  // month's allowance PLUS any top-up. This card used to print "0/15" beside
  // "Extra credits: 91", which is the "0% left · +607%" contradiction J
  // caught on the Plan page wearing raw counts instead of a percentage.
  const state = computeUsageState({
    usedThisMonth,
    monthlyFreeQuota,
    extraCredits,
  });
  const runningLow = !state.blocked && state.totalRemaining <= monthlyFreeQuota / 5;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span className="text-muted-foreground">
        <Tri bm="AI bulan ini" zh="本月 AI" en="AI this month" />
        {": "}
        <span className="font-medium text-foreground tabular-nums">
          {state.usedPct}%
        </span>{" "}
        <Tri bm="digunakan" zh="已用" en="used" />
        {" · "}
        <span className="font-medium text-foreground tabular-nums">
          {remainingPct(state.usedPct)}%
        </span>{" "}
        <Tri bm="baki" zh="还剩" en="left" />
      </span>

      {runningLow && extraCredits === 0 && (
        <span className="text-xs text-muted-foreground">
          <Tri
            bm="Nak tambah kredit? Hubungi MinitAI."
            zh="需要增加额度，请联络 MinitAI。"
            en="Need more? Contact MinitAI."
          />
        </span>
      )}
    </div>
  );
}
