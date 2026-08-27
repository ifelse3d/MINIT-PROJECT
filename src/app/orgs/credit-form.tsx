import { Tri } from "@/components/language-provider";

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
  const freeLeft = Math.max(0, monthlyFreeQuota - usedThisMonth);
  const runningLow = freeLeft === 0 || freeLeft <= monthlyFreeQuota / 5;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span className="text-muted-foreground">
        <Tri bm="AI bulan ini" zh="本月 AI" en="AI this month" />
        {": "}
        <span className="font-medium text-foreground tabular-nums">
          {usedThisMonth}/{monthlyFreeQuota}
        </span>
      </span>

      {extraCredits > 0 && (
        <span className="text-muted-foreground">
          <Tri bm="Kredit tambahan" zh="充值额度" en="Extra credits" />
          {": "}
          <span className="font-medium text-foreground tabular-nums">
            {extraCredits}
          </span>
        </span>
      )}

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
