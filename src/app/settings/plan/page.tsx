import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSupabase } from "@/db/supabase";
import { getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { isOperatorEmail } from "@/lib/admin-gate";
import { getFenceState } from "@/lib/fence";
import { remainingPct } from "@/lib/quota-display";
import { PLANS, PLAN_ORDER, planById, type Plan, type PlanId } from "@/lib/plans";
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
  // §0-4/§0-5 (102): the quota row reads as a share of the Standard pool —
  // Trial 15% · Standard 100% · Plus 200% — never raw action counts.
  if (key === "quota")
    return `${Math.round((plan.monthlyAiQuota / PLANS.standard.monthlyAiQuota) * 100)}%`;
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

  const [plan, usage, usageByPerson, fenceState, sessionUser] = await Promise.all([
    loadPlan(active.id),
    getUsage(active.id).catch(() => null),
    // K-2's by-member split — lived on the old long /settings page; since the
    // §1-13 split it belongs here with the rest of the usage story.
    loadUsageByPerson(active.id),
    // D44: the free fence's lifetime meters. null = this org is not fenced.
    getFenceState(active).catch(() => null),
    getSessionUser().catch(() => null),
  ]);
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

  // §0-5 (102): the HQ column is tucked away — J opens the branches network
  // by hand for the org that needs it; a village society choosing between
  // three tiers does not need a fourth. Nothing about HQ is deleted: the
  // plan, its features and every HQ org keep working, and an org already ON
  // hq keeps seeing its own column.
  const operator = isOperatorEmail(sessionUser?.email);
  const shownPlans: PlanId[] = PLAN_ORDER.filter(
    (id) => id !== "hq" || operator || plan.id === "hq",
  );
  const showBranchesRow = shownPlans.includes("hq");

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
            // §0-4 (102): percentages, never raw action counts.
            <p className="text-base">
              <span className="font-semibold tabular-nums">{usage.usedPct}%</span>{" "}
              <Tri bm="digunakan" zh="已用" en="used" />
              {" · "}
              <span className="font-semibold tabular-nums">
                {remainingPct(usage.usedPct)}%
              </span>{" "}
              <Tri bm="baki" zh="还剩" en="left" />
              {/* Moved with the §1-13 split: top-up credits were only ever
                  shown on the old long settings page. Shown as a share of
                  this org's own pool, same unit as everything else. */}
              {usage.extraCredits > 0 && usage.monthlyFreeQuota > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold tabular-nums">
                    +{Math.round((usage.extraCredits / usage.monthlyFreeQuota) * 100)}%
                  </span>{" "}
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
              bm={`Akaun awal: kuota pertubuhan ini ${Math.round((usage.monthlyFreeQuota / PLANS.standard.monthlyAiQuota) * 100)}% daripada pelan Biasa — lebih tinggi daripada pelan semasa.`}
              zh={`早期账号：此机构的额度是「标准」方案的 ${Math.round((usage.monthlyFreeQuota / PLANS.standard.monthlyAiQuota) * 100)}%，比当前方案的标准更高。`}
              en={`Early account: this organisation's allowance is ${Math.round((usage.monthlyFreeQuota / PLANS.standard.monthlyAiQuota) * 100)}% of the Standard plan — higher than its current plan's level.`}
            />
          </p>
        )}
        {/* C-1 (拍板⑤) + §0-5 (102, J: 「選了 Standard 卻還是 15 次」的矛盾
            画面): the chosen-but-not-activated state reads as ONE sentence
            with three beats — chosen ✓, activation pending, meanwhile the
            meter above measures the TRIAL pool. The bar filling up is then
            expected, not a contradiction. Activation raises the quota and
            this note disappears by itself. */}
        {plan.id !== "trial" &&
          usage &&
          usage.monthlyFreeQuota <= PLANS.trial.monthlyAiQuota && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm={`Pelan ${plan.name.bm} sudah dipilih ✓ — menunggu pengaktifan manual (selepas harga diumumkan). Sementara menunggu, meter di atas mengukur kuota PERCUBAAN (${Math.round((PLANS.trial.monthlyAiQuota / PLANS.standard.monthlyAiQuota) * 100)}% daripada Biasa), jadi ia boleh penuh lebih awal — itu bukan ralat.`}
                zh={`已选「${plan.name.zh}」方案 ✓ —— 等待人工开通（价格公布后）。开通之前，上面的用量条量的是「试用」额度（标准的 ${Math.round((PLANS.trial.monthlyAiQuota / PLANS.standard.monthlyAiQuota) * 100)}%），所以会比较快用满 —— 这不是出错。`}
                en={`The ${plan.name.en} plan is chosen ✓ — awaiting manual activation (once prices are announced). Until then the meter above measures the TRIAL pool (${Math.round((PLANS.trial.monthlyAiQuota / PLANS.standard.monthlyAiQuota) * 100)}% of Standard), so it can fill up sooner — that is not an error.`}
              />
            </p>
          )}
      </div>

      {/* D44: the free fence's lifetime meters — only for fenced orgs. */}
      {fenceState && (
        <div className="v2-glass flex flex-col gap-3 p-5">
          <p className="text-base font-semibold">
            <Tri
              bm="Had pelan percuma (seumur hidup, tidak reset)"
              zh="免费版额度（终身计算，不会重置）"
              en="Free-plan limits (lifetime, never reset)"
            />
          </p>
          <div className="grid gap-2 text-base @xl:grid-cols-2">
            <p>
              <Tri bm="Dokumen dibuat" zh="已做文件" en="Documents made" />:{" "}
              <span className="font-semibold tabular-nums">
                {fenceState.counters.docsMade} / {fenceState.limits.docsMade}
              </span>
            </p>
            <p>
              <Tri bm="Resit dikeluarkan" zh="已开收据" en="Receipts issued" />:{" "}
              <span className="font-semibold tabular-nums">
                {fenceState.counters.receipts} / {fenceState.limits.receipts}
              </span>
            </p>
            <p>
              <Tri bm="Muka surat dibaca AI" zh="AI 已读页数" en="AI-read pages" />:{" "}
              <span className="font-semibold tabular-nums">
                {fenceState.counters.pagesUploaded} / {fenceState.limits.uploadPages}
              </span>
            </p>
            <p>
              <Tri bm="Muat turun bersih" zh="干净下载" en="Clean downloads" />:{" "}
              <span className="font-semibold tabular-nums">
                {fenceState.counters.cleanDownloads} / {fenceState.limits.cleanDownloads}
              </span>
            </p>
          </div>
          <p className="text-sm text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Paparan dokumen pada pelan percuma bertera air; fail bersih keluar melalui muat turun yang dikira di atas. Resit sentiasa bersih. Memadam dokumen tidak memulangkan kiraan."
              zh="免费版看到的文件都带水印；干净文件走上面计次的下载。收据永远是干净的。删掉东西不会退回次数。"
              en="On the free plan, document views are watermarked; clean files leave through the counted downloads above. Receipts are always clean. Deleting things does not give counts back."
            />
          </p>
        </div>
      )}

      {/* Comparison table */}
      <div className="v2-glass overflow-x-auto p-0">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-left">
              <th className="px-4 py-3" />
              {shownPlans.map((id) => (
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
            {FEATURE_ROWS.filter((r) => r.key !== "branches" || showBranchesRow).map((row) => (
              <tr key={row.key} className="border-b border-[color:var(--v2-border)] last:border-b-0">
                <td className="px-4 py-3 text-[color:var(--v2-text-soft)]">
                  <Tri bm={row.bm} zh={row.zh} en={row.en} />
                </td>
                {shownPlans.map((id) => (
                  <td key={id} className="px-4 py-3 tabular-nums">
                    {featureCell(PLANS[id], row.key)}
                  </td>
                ))}
              </tr>
            ))}
            {/* §0-4: what the quota % is OF, said once under the % row. */}
            <tr className="border-b border-[color:var(--v2-border)]">
              <td className="px-4 py-3" colSpan={shownPlans.length + 1}>
                <span className="text-sm text-[color:var(--v2-text-soft)]">
                  <Tri
                    bm="Kuota AI ditunjukkan sebagai peratus daripada pelan Biasa (Biasa = 100%)."
                    zh="AI 用量以「标准」方案为 100% 来比较。"
                    en="AI quotas are shown as a share of the Standard plan (Standard = 100%)."
                  />
                </span>
              </td>
            </tr>
            {/* D44: the fence rows — what "free vs paid" concretely means. */}
            {(
              [
                {
                  key: "docsMade",
                  bm: "Dokumen (seumur hidup)",
                  zh: "文件数（终身）",
                  en: "Documents (lifetime)",
                },
                {
                  key: "receipts",
                  bm: "Resit bernombor (seumur hidup)",
                  zh: "编号收据（终身）",
                  en: "Numbered receipts (lifetime)",
                },
                {
                  key: "uploadPages",
                  bm: "Muka surat bacaan AI (seumur hidup)",
                  zh: "AI 可读页数（终身）",
                  en: "AI-read pages (lifetime)",
                },
                {
                  key: "cleanDownloads",
                  bm: "Muat turun bersih (seumur hidup)",
                  zh: "干净下载（终身）",
                  en: "Clean downloads (lifetime)",
                },
              ] as const
            ).map((row) => (
              <tr
                key={row.key}
                className="border-b border-[color:var(--v2-border)]"
              >
                <td className="px-4 py-3 text-[color:var(--v2-text-soft)]">
                  <Tri bm={row.bm} zh={row.zh} en={row.en} />
                </td>
                {shownPlans.map((id) => (
                  <td key={id} className="px-4 py-3 tabular-nums">
                    {PLANS[id].fence ? PLANS[id].fence[row.key] : "∞"}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3 text-[color:var(--v2-text-soft)]">
                <Tri bm="Harga" zh="价格" en="Price" />
              </td>
              <td className="px-4 py-3" colSpan={shownPlans.length}>
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
