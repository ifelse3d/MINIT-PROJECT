import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { QUOTA_BLOCKED_MESSAGE, type UsageState } from "@/lib/ai/usage-core";
import { SettingsBlock } from "./ui";

// ---------------------------------------------------------------------------
// Settings → AI usage meter (Phase 7.5a). Server-rendered from getUsage().
// Badge colours follow CLAUDE.md rule 9: green = plenty left, amber = check
// (low), red = blocked. Top-up is manual — no payment flow anywhere.
//
// 2026-08-22: was a <Card>, now a block inside the page's "Bantuan AI" section
// (see ./ui.tsx). The meter itself is unchanged; what went is the second copy
// of the numbers that used to sit in the card description above the bar.
// ---------------------------------------------------------------------------

export function AiUsageRows({ usage }: { usage: UsageState }) {
  // 2026-08-22: this used to recompute the percentage inline. It now reads the
  // one computeUsageState() produces, so the bar here and the badge anywhere
  // else can never disagree about how full the month is.
  const pct = usage.usedPct;
  const low = !usage.blocked && usage.totalRemaining <= 10;

  return (
    <SettingsBlock>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold">
          <Tri bm="Bulan ini" zh="本月" en="This month" />
        </span>
        {usage.blocked ? (
          <Badge className="bg-red-600 text-white hover:bg-red-600">
            <Tri bm="Kuota habis" zh="配额用完" en="Quota used up" />
          </Badge>
        ) : low ? (
          <Badge className="bg-amber-500 text-white hover:bg-amber-500">
            <Tri bm="Hampir habis" zh="快用完了" en="Running low" />
          </Badge>
        ) : (
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            <Tri bm="OK" zh="正常" en="OK" />
          </Badge>
        )}
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={usage.usedThisMonth}
        aria-valuemin={0}
        aria-valuemax={usage.monthlyFreeQuota}
      >
        <div
          className={`h-full rounded-full transition-all ${
            usage.blocked ? "bg-red-600" : low ? "bg-amber-500" : "bg-green-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 2026-07-29 — the figures used to sit inside each language string, so
          with two languages on you read the same "3 / 100" twice. Translate the
          LABEL, print the VALUE once. */}
      <p className="text-base">
        <span className="font-semibold tabular-nums">
          {usage.usedThisMonth} / {usage.monthlyFreeQuota}
        </span>{" "}
        <Tri bm="digunakan" zh="已用" en="used" />
        {" · "}
        <span className="font-semibold tabular-nums">{pct}%</span>
        {usage.extraCredits > 0 && (
          <>
            {" · "}
            <span className="font-semibold tabular-nums">
              +{usage.extraCredits}
            </span>{" "}
            <Tri bm="kredit tambahan" zh="充值额度" en="extra credits" />
          </>
        )}
      </p>

      {usage.blocked ? (
        <p className="text-sm font-medium text-red-700 dark:text-red-300">
          <Tri
            bm={QUOTA_BLOCKED_MESSAGE.bm}
            zh={QUOTA_BLOCKED_MESSAGE.zh}
            en={QUOTA_BLOCKED_MESSAGE.en}
          />
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {/* 0-2: the meter is the ONE number; no per-action "about X%". */}
          <Tri
            bm={`Sudah guna ${pct}% bulan ini.`}
            zh={`本月 AI 用量已用 ${pct}%。`}
            en={`${pct}% used this month.`}
          />
        </p>
      )}
    </SettingsBlock>
  );
}
