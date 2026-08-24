import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSupabase } from "@/db/supabase";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { PLANS, PLAN_ORDER, planById, type Plan } from "@/lib/plans";

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

  const [plan, usage] = await Promise.all([
    loadPlan(active.id),
    getUsage(active.id).catch(() => null),
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

      {/* Current plan + the meter */}
      <div className="v2-glass flex flex-col gap-2 p-5">
        <p className="text-base text-[color:var(--v2-text-soft)]">
          <Tri bm="Pelan semasa" zh="当前方案" en="Current plan" />
        </p>
        <p className="text-2xl font-semibold">
          <Tri {...plan.name} />
        </p>
        {usage && (
          <p className="text-base">
            <Tri
              bm={`Bulan ini sudah guna ${usage.usedPct}% daripada penggunaan AI.`}
              zh={`本月 AI 用量已用 ${usage.usedPct}%。`}
              en={`${usage.usedPct}% of this month's AI allowance used.`}
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
            href={`mailto:${contactEmail}?subject=Minit%20plan%20upgrade%20-%20${encodeURIComponent(active.name)}`}
            className="inline-flex min-h-11 items-center rounded-xl bg-[color:var(--v2-primary)] px-5 text-base font-semibold text-white"
          >
            <Tri bm="Hubungi kami" zh="联络我们" en="Contact us" />
          </a>
        ) : (
          <p className="text-base text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Untuk menaik taraf, hubungi orang yang memasang Minit untuk pertubuhan anda."
              zh="想升级，请联系帮您安装 Minit 的人。"
              en="To upgrade, contact whoever set Minit up for your organisation."
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
