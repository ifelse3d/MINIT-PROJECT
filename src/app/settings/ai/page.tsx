import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { QUOTA_BLOCKED_MESSAGE } from "@/lib/ai/usage-core";
import { UsageBar, usageIsLow } from "@/components/usage-bar";
import { loadUsageByPerson } from "../usage-by-person";
import { SettingsBlock, SettingsSection } from "../ui";

// /settings/ai — this month's AI meter + the per-member split (§7.2b).
// K-4: the ONE UsageBar component, same computeUsageState() numbers as the
// plan page — the two can never disagree about "running low".
export const dynamic = "force-dynamic";

export default async function AiUsageSettingsPage() {
  const active = await getActiveOrg();
  const [usage, byPerson] = active
    ? await Promise.all([
        getUsage(active.id).catch(() => null),
        loadUsageByPerson(active.id),
      ])
    : [null, []];

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Penggunaan AI" zh="AI 用量" en="AI usage" />
      </h1>
      {!active || !usage ? (
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      ) : (
        <SettingsSection title={<Tri bm="Bulan ini" zh="本月" en="This month" />}>
          <SettingsBlock>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-semibold">
                <Tri bm="Meter" zh="用量表" en="Meter" />
              </span>
              {usage.blocked ? (
                <Badge className="bg-red-600 text-white hover:bg-red-600">
                  <Tri bm="Kuota habis" zh="配额用完" en="Quota used up" />
                </Badge>
              ) : usageIsLow(usage.blocked, usage.totalRemaining) ? (
                <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                  <Tri bm="Hampir habis" zh="快用完了" en="Running low" />
                </Badge>
              ) : (
                <Badge className="bg-green-600 text-white hover:bg-green-600">
                  <Tri bm="OK" zh="正常" en="OK" />
                </Badge>
              )}
            </div>
            <UsageBar
              usedThisMonth={usage.usedThisMonth}
              monthlyFreeQuota={usage.monthlyFreeQuota}
              usedPct={usage.usedPct}
              blocked={usage.blocked}
              totalRemaining={usage.totalRemaining}
            />
            <p className="text-base">
              <span className="font-semibold tabular-nums">
                {usage.usedThisMonth} / {usage.monthlyFreeQuota}
              </span>{" "}
              <Tri bm="digunakan" zh="已用" en="used" />
              {" · "}
              <span className="font-semibold tabular-nums">{usage.usedPct}%</span>
              {usage.extraCredits > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold tabular-nums">+{usage.extraCredits}</span>{" "}
                  <Tri bm="kredit tambahan" zh="充值额度" en="extra credits" />
                </>
              )}
            </p>
            {/* K-2: who used what this month. Display names only. */}
            {byPerson.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <Tri bm="Mengikut ahli" zh="按成员" en="By member" />
                {": "}
                {byPerson.map((p) => `${p.name} ×${p.count}`).join(" · ")}
              </p>
            )}
            {usage.blocked && (
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                <Tri
                  bm={QUOTA_BLOCKED_MESSAGE.bm}
                  zh={QUOTA_BLOCKED_MESSAGE.zh}
                  en={QUOTA_BLOCKED_MESSAGE.en}
                />
              </p>
            )}
            <p className="text-sm">
              <Link href="/settings/plan" className="font-medium underline underline-offset-4">
                <Tri bm="Lihat pelan & naik taraf" zh="查看方案与升级" en="See plans & upgrade" /> →
              </Link>
            </p>
          </SettingsBlock>
        </SettingsSection>
      )}
    </div>
  );
}
