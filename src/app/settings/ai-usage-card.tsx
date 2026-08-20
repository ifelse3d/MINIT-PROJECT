import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { QUOTA_BLOCKED_MESSAGE, type UsageState } from "@/lib/ai/usage-core";

// ---------------------------------------------------------------------------
// Settings → AI usage meter (Phase 7.5a). Server-rendered from getUsage().
// Badge colours follow CLAUDE.md rule 9: green = plenty left, amber = check
// (low), red = blocked. Top-up is manual — no payment flow anywhere.
// ---------------------------------------------------------------------------

export function AiUsageCard({ usage }: { usage: UsageState }) {
  const pct =
    usage.monthlyFreeQuota > 0
      ? Math.min(100, Math.round((usage.usedThisMonth / usage.monthlyFreeQuota) * 100))
      : 100;
  const low = !usage.blocked && usage.totalRemaining <= 10;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            <Tri bm="Penggunaan AI" zh="AI 使用量" en="AI usage" />
          </CardTitle>
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
        <CardDescription>
          {/* 2026-07-29 — the figures used to sit inside each language string,
              so with two languages on you read the same "3 / 100" twice.
              Translate the LABEL, print the VALUE once. */}
          <Tri
            bm="Tindakan AI bulan ini"
            zh="本月 AI 操作"
            en="AI actions this month"
          />
          {": "}
          <span className="font-medium text-foreground tabular-nums">
            {usage.usedThisMonth} / {usage.monthlyFreeQuota}
          </span>{" "}
          <Tri bm="percuma" zh="免费" en="free" />
          {usage.extraCredits > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground tabular-nums">
                +{usage.extraCredits}
              </span>{" "}
              <Tri bm="kredit" zh="充值额度" en="credits" />
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
        {usage.blocked ? (
          <p className="text-sm font-medium text-red-700">
            <Tri
              bm={QUOTA_BLOCKED_MESSAGE.bm}
              zh={QUOTA_BLOCKED_MESSAGE.zh}
              en={QUOTA_BLOCKED_MESSAGE.en}
            />
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Tri
              bm={`Baki: ${usage.totalRemaining} tindakan. Setiap pengekstrakan gambar atau carian AI mengguna 1–2 tindakan.`}
              zh={`剩余 ${usage.totalRemaining} 次。每次照片提取或 AI 搜索用 1–2 次。`}
              en={`${usage.totalRemaining} actions left. Each photo extraction or AI search uses 1–2 actions.`}
            />
          </p>
        )}
      </CardContent>
    </Card>
  );
}
