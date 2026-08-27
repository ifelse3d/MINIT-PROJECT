import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSupabase } from "@/db/supabase";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { PLANS, PLAN_ORDER, planById, type Plan } from "@/lib/plans";
import { UsageBar } from "@/components/usage-bar";
import { loadUsageByPerson } from "../usage-by-person";

// ---------------------------------------------------------------------------
// /settings/plan — which tier this organisation is on (S-4, 2026-08-25).
//
// Structure tonight, numbers later: prices are DELIBERATELY absent ("等系统
// 做好、量出真实成本再定" — J, decision #2), and there is NO checkout of any
// kind. Real payments wait for three things that do not exist yet: real
// prices, a legal entity, and lawyer-reviewed terms (docs/DECISIONS.md D12).
// Until then, upgrading = talking to a human.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

/** The org's plan, surviving a database that predates migration 20260830000000. */
async function loadPlan(orgId: number): Promise<Plan> {
  const admin = getSupabase();
  const { data, error } = await admin
    .from("orgs")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return planById(null); // column absent → trial (fail closed)
  return planById(data.plan as string);
}

const FEATURE_ROWS: {
  key: "quota" | "orgs" | "branches";
  bm: string;
  zh: string;
  en: string;
}[] = [
  { key: "quota", bm: "Bantuan AI sebulan", zh: "每月 AI 用量", en: "Monthly AI allowance" },
  { key: "orgs", bm: "Pertubuhan induk", zh: "总机构数", en: "Top-level organisations" },
  { key: "branches", bm: "Cawangan (HQ)", zh: "分会（总部）", en: "Branches (HQ)" },
];

function featureCell(plan: Plan, key: "quota" | "orgs" | "branches"): string {
  if (key === "quota") return `${plan.monthlyAiQuota}`;
  if (key === "orgs") return `${plan.maxRootOrgs}`;
  return plan.maxBranches === null ? "—" : `${plan.maxBranches}`;
}

export default async function PlanPage() {
  const active = await getActiveOrg();
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-2xl pb-10">
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
      </div>
    );
  }

  const [plan, usage, usageByPerson] = await Promise.all([
    loadPlan(active.id),
    getUsage(active.id).catch(() => null),
    // K-2's by-member split — lived on the old long /settings page; since the
    // §1-13 split it belongs here with the rest of the usage story.
    loadUsageByPerson(active.id),
  ]);
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          <Tri bm="Pelan langganan" zh="订阅方案" en="Subscription plan" />
        </h1>
        <p className="mt-1 text-base text-[color:var(--v2-text-soft)]">{active.name}</p>
      </div>

      {/* Current plan + the meter. F-2 (2026-08-25): the same BAR the
          settings page shows, from the same computeUsageState() numbers — a
          percentage in prose made the reader do the arithmetic the bar
          exists to do. Still no prices, still no checkout (decision #2 /
          D12): upgrading remains a conversation with a human. */}
      <div className="v2-glass flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-base text-[color:var(--v2-text-soft)]">
              <Tri bm="Pelan semasa" zh="当前方案" en="Current plan" />
            </p>
            <p className="text-2xl font-semibold">
              <Tri {...plan.name} />
            </p>
          </div>
          {usage && (
            <p className="text-base">
              <span className="font-semibold tabular-nums">
                {usage.usedThisMonth} / {usage.monthlyFreeQuota}
              </span>{" "}
              <Tri bm="digunakan" zh="已用" en="used" />
              {" · "}
              <span className="font-semibold tabular-nums">{usage.usedPct}%</span>
              {/* Moved with the §1-13 split: top-up credits were only ever
                  shown on the old long settings page. */}
              {usage.extraCredits > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold tabular-nums">+{usage.extraCredits}</span>{" "}
                  <Tri bm="kredit tambahan" zh="充值额度" en="extra credits" />
                </>
              )}
            </p>
          )}
        </div>
        {usage && (
          // K-4: the ONE usage bar (components/usage-bar) — this page and the
          // settings card can no longer disagree about "running low".
          <UsageBar
            usedThisMonth={usage.usedThisMonth}
            monthlyFreeQuota={usage.monthlyFreeQuota}
            usedPct={usage.usedPct}
            blocked={usage.blocked}
            totalRemaining={usage.totalRemaining}
          />
        )}
        {/* K-2: who used what this month. Display names only, never contents.
            "?" = actions from before per-person metering existed. */}
        {usageByPerson.length > 0 && (
          <p className="text-sm text-[color:var(--v2-text-soft)]">
            <Tri bm="Mengikut ahli" zh="按成员" en="By member" />
            {": "}
            {usageByPerson.map((p) => `${p.name} ×${p.count}`).join(" · ")}
          </p>
        )}
        {/* F-1 (work order 31, 拍板 40): an organisation whose metered quota is
            HIGHER than its plan's standard (J's org: 100 vs trial 15) is an
            early account, and the two numbers must not look like a bug. Say
            which is which, in one line, only when they differ this way. */}
        {usage && usage.monthlyFreeQuota > plan.monthlyAiQuota && (
          <p className="text-sm text-[color:var(--v2-text-soft)]">
            <Tri
              bm={`Kuota pertubuhan ini ialah ${usage.monthlyFreeQuota}/bulan (akaun awal); standard untuk pertubuhan baharu ialah ${plan.monthlyAiQuota}/bulan.`}
              zh={`您这个机构的额度是 ${usage.monthlyFreeQuota}/月（早期账号）；新机构标准为 ${plan.monthlyAiQuota}/月。`}
              en={`This organisation's allowance is ${usage.monthlyFreeQuota}/month (early account); the standard for new organisations is ${plan.monthlyAiQuota}/month.`}
            />
          </p>
        )}
        {/* C-1 (拍板⑤): a chosen-but-not-activated plan is said out loud.
            The tell is honest arithmetic: the plan says standard/hq but the
            metered quota is still at the trial level — activation (J's admin
            SQL) raises the quota, and this note disappears by itself. */}
        {plan.id !== "trial" &&
          usage &&
          usage.monthlyFreeQuota <= PLANS.trial.monthlyAiQuota && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm={`Pelan ${plan.name.bm} sudah dipilih — kami mengaktifkannya secara manual selepas harga diumumkan. Sehingga itu, kuota AI kekal pada tahap percubaan (${PLANS.trial.monthlyAiQuota} sebulan).`}
                zh={`已选「${plan.name.zh}」配套 —— 价格公布后由我们人工开通。开通之前，AI 用量照试用（每月 ${PLANS.trial.monthlyAiQuota} 次）。`}
                en={`The ${plan.name.en} plan is selected — we activate it by hand once prices are announced. Until then the AI allowance stays at the trial level (${PLANS.trial.monthlyAiQuota}/month).`}
              />
            </p>
          )}
      </div>

      {/* Comparison table */}
      <div className="v2-glass overflow-x-auto p-0">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-left">
              <th className="px-4 py-3" />
              {PLAN_ORDER.map((id) => (
                <th
                  key={id}
                  className={`px-4 py-3 font-semibold ${
                    id === plan.id ? "text-[color:var(--v2-primary)]" : ""
                  }`}
                >
                  <Tri {...PLANS[id].name} />
                  {id === plan.id && (
                    <span className="ml-1 text-sm font-normal">
                      (<Tri bm="anda" zh="当前" en="you" />)
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_ROWS.map((row) => (
              <tr key={row.key} className="border-b border-[color:var(--v2-border)] last:border-b-0">
                <td className="px-4 py-3 text-[color:var(--v2-text-soft)]">
                  <Tri bm={row.bm} zh={row.zh} en={row.en} />
                </td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="px-4 py-3 tabular-nums">
                    {featureCell(PLANS[id], row.key)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3 text-[color:var(--v2-text-soft)]">
                <Tri bm="Harga" zh="价格" en="Price" />
              </td>
              <td className="px-4 py-3" colSpan={PLAN_ORDER.length}>
                <Tri
                  bm="Harga akan diumumkan selepas kos sebenar diukur. Sehingga itu, hubungi kami untuk menaik taraf."
                  zh="价格会在量出真实成本之后公布。公布之前，升级请联络我们。"
                  en="Prices will be announced once real costs are measured. Until then, contact us to upgrade."
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Contact — a human, never a checkout (D12). */}
      <div className="flex flex-wrap items-center gap-3">
        {contactEmail !== "" ? (
          <a
            href={`mailto:${contactEmail}?subject=MinitAI%20plan%20upgrade%20-%20${encodeURIComponent(active.name)}`}
            className="inline-flex min-h-11 items-center rounded-md bg-[color:var(--v2-primary-fill)] px-5 text-base font-semibold text-white"
          >
            <Tri bm="Hubungi kami" zh="联络我们" en="Contact us" />
          </a>
        ) : (
          <p className="text-base text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Untuk menaik taraf, hubungi orang yang memasang MinitAI untuk pertubuhan anda."
              zh="想升级，请联系帮您安装 MinitAI 的人。"
              en="To upgrade, contact whoever set MinitAI up for your organisation."
            />
          </p>
        )}
        <Link href="/settings" className="text-base underline underline-offset-4">
          ← <Tri bm="Kembali ke Tetapan" zh="返回设置" en="Back to Settings" />
        </Link>
      </div>
    </div>
  );
}
