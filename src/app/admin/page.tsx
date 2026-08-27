import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/db/supabase-server";
import { getSupabase } from "@/db/supabase";
import { planById } from "@/lib/plans";
import { formatMytDateTime } from "@/lib/history";
import { isOperatorEmail } from "@/lib/admin-gate";
import { Tri } from "@/components/language-provider";
import { FleetCharts } from "./fleet-charts";
import { GrantCreditsCard } from "./grant-credits-card";

// ---------------------------------------------------------------------------
// /admin — the minimal ops console (S-6, 2026-08-25; J asked twice).
//
// WHO GETS IN: only accounts listed in the ADMIN_EMAILS env variable
// (comma-separated), checked ON THE SERVER. Everyone else — including every
// signed-in customer — gets a plain 404, indistinguishable from the page not
// existing. No env variable set = nobody gets in (fail closed).
//
// 🔴 PDPA (Hard Rule 5): this page NEVER shows document contents, donor names
// or phone numbers — only the aggregates an operator needs: account × usage ×
// cost × errors. That is the minimal shape of every AI company's internal ops
// panel, and nothing more.
//
// P-4 (work order 31): trilingual via <Tri> like every other page — the
// operator is J, and J reads Chinese first. (This overturns the earlier
// "deliberately English-only" note.)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

// P-4: the check moved to src/lib/admin-gate.ts so the sidebar's "Ops console"
// row and this page read the SAME list. The 404 gate below is unchanged.
const isAdmin = isOperatorEmail;

/** P-4: one subtotal line — N calls, their summed cost (TypeScript adds;
 *  Hard Rule 2 applies to our own books too). */
type Subtotal = { label: string; count: number; costMicros: number };

type OrgRow = {
  id: number;
  name: string;
  plan: { bm: string; zh: string; en: string };
  monthlyQuota: number;
  usedThisMonth: number;
  usedPct: number;
  costMicrosTotal: number;
  /** #20: this month's vendor cost for THIS org — who is burning what. */
  costMicrosThisMonth: number;
  /** #20: the plan's monthly price (null while pricing is undecided). */
  priceRm: number | null;
  lastActivity: string | null;
  errors30d: number;
  /** K-2: this month's usage split by member ("?" = pre-migration rows). */
  byPerson: { name: string; count: number }[];
  /** P-4: all-time splits by provider / model / action ("?" = null). */
  byProvider: Subtotal[];
  byModel: Subtotal[];
  byAction: Subtotal[];
};

/** #20: one calendar month of the fleet, for the charts. */
type MonthPoint = { ym: string; actions: number; costMicros: number };

async function loadRows(): Promise<{ rows: OrgRow[]; monthly: MonthPoint[] }> {
  const admin = getSupabase();

  // orgs — plan column may predate migration 20260830000000; retry without.
  let orgs: { id: number; name: string; plan?: string | null; monthly_free_quota: number | null }[] = [];
  {
    const withPlan = await admin
      .from("orgs")
      .select("id, name, plan, monthly_free_quota")
      .order("id");
    if (!withPlan.error && withPlan.data) {
      orgs = withPlan.data as typeof orgs;
    } else {
      const legacy = await admin
        .from("orgs")
        .select("id, name, monthly_free_quota")
        .order("id");
      orgs = (legacy.data ?? []) as typeof orgs;
    }
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // ai_usage: org_id + cost + created_at + refunded_at (+ user_id since
  // migration 25 — K-2; retried without it on an older database). One bounded
  // fetch — the pilot fleet is small; when it is not, this becomes an RPC
  // aggregate.
  type UsageRow = {
    org_id: number;
    cost_micros: number | null;
    created_at: string;
    refunded_at: string | null;
    user_id?: string | null;
    provider?: string | null;
    model?: string | null;
    action?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
  };
  const fetchUsage = (select: string) =>
    admin
      .from("ai_usage")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(20000)
      .returns<UsageRow[]>();
  // P-4: provider/model/action/tokens now come along — the console could say
  // "$0.03" but not WHERE it went. Progressive fallback: user_id arrived with
  // migration 25, so an older database is retried without it (the STATE.md
  // rule — code must outlive a database that is behind, without a blank page).
  let usage = await fetchUsage(
    "org_id, cost_micros, created_at, refunded_at, user_id, provider, model, action, input_tokens, output_tokens",
  );
  if (usage.error) {
    usage = await fetchUsage(
      "org_id, cost_micros, created_at, refunded_at, provider, model, action, input_tokens, output_tokens",
    );
  }
  if (usage.error) {
    usage = await fetchUsage("org_id, cost_micros, created_at, refunded_at");
  }
  const usageRows = usage.data ?? [];

  // Member names for the per-person split (display names, never contents).
  const members = await admin
    .from("members_roles")
    .select("org_id, user_id, name")
    .limit(5000);
  const memberName = new Map<string, string>();
  for (const m of (members.data ?? []) as { org_id: number; user_id: string | null; name: string | null }[]) {
    if (m.user_id) memberName.set(`${m.org_id}:${m.user_id}`, m.name ?? "?");
  }

  // app_errors: absent until migration 20260831000000 — treat as zero.
  const errs = await admin
    .from("app_errors")
    .select("org_id, created_at")
    .gte("created_at", d30)
    .limit(20000);
  const errRows = (errs.data ?? []) as { org_id: number | null }[];

  // #20: the last six calendar months of the whole fleet — actions (charged)
  // and vendor cost, grouped by created_at month. TypeScript sums (Hard
  // Rule 2 applies to our own books too).
  const monthlyMap = new Map<string, { actions: number; costMicros: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthlyMap.set(d.toISOString().slice(0, 7), { actions: 0, costMicros: 0 });
  }
  for (const u of usageRows) {
    const ym = u.created_at.slice(0, 7);
    const bucket = monthlyMap.get(ym);
    if (!bucket) continue;
    if (u.refunded_at === null) bucket.actions += 1;
    bucket.costMicros += u.cost_micros ?? 0;
  }
  const monthly: MonthPoint[] = [...monthlyMap.entries()].map(([ym, v]) => ({
    ym,
    ...v,
  }));

  const rows = orgs.map((o) => {
    const mine = usageRows.filter((u) => u.org_id === o.id);
    const thisMonth = mine.filter(
      (u) => u.created_at >= monthStart.toISOString() && u.refunded_at === null,
    );
    const usedThisMonth = thisMonth.length;
    const quota = o.monthly_free_quota ?? 0;
    const costMicrosTotal = mine.reduce((s, u) => s + (u.cost_micros ?? 0), 0);
    const costMicrosThisMonth = mine
      .filter((u) => u.created_at >= monthStart.toISOString())
      .reduce((s, u) => s + (u.cost_micros ?? 0), 0);
    const lastActivity = mine[0]?.created_at ?? null;
    // K-2: split this month's actions by member. Rows without a user_id
    // (pre-migration, or server-initiated) group under "?".
    const perPerson = new Map<string, number>();
    for (const u of thisMonth) {
      const label = u.user_id ? memberName.get(`${o.id}:${u.user_id}`) ?? "?" : "?";
      perPerson.set(label, (perPerson.get(label) ?? 0) + 1);
    }
    // P-4: all-time splits by provider / model / action, cost summed in
    // TypeScript. "?" = the column was null (e.g. a killed call, or a row from
    // before the columns) — printed, not hidden, because a null provider on a
    // charged row is exactly the id=5 signature an operator needs to SEE.
    const subtotal = (key: (u: UsageRow) => string | null | undefined): Subtotal[] => {
      const map = new Map<string, { count: number; costMicros: number }>();
      for (const u of mine) {
        const label = key(u) ?? "?";
        const cur = map.get(label) ?? { count: 0, costMicros: 0 };
        cur.count += 1;
        cur.costMicros += u.cost_micros ?? 0;
        map.set(label, cur);
      }
      return [...map.entries()]
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.count - a.count);
    };
    return {
      id: o.id,
      name: o.name,
      // §1-1: the display NAME, not the internal id token.
      plan: planById(o.plan).name,
      priceRm: planById(o.plan).priceRm,
      monthlyQuota: quota,
      usedThisMonth,
      usedPct: quota > 0 ? Math.round((usedThisMonth / quota) * 100) : 0,
      costMicrosTotal,
      costMicrosThisMonth,
      lastActivity,
      errors30d: errRows.filter((e) => e.org_id === o.id).length,
      byPerson: [...perPerson.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      byProvider: subtotal((u) => u.provider),
      byModel: subtotal((u) => u.model),
      byAction: subtotal((u) => u.action),
    };
  });
  return { rows, monthly };
}

// P-4: six decimals, because a single cheap call is ~$0.00004 and the old
// toFixed(4) printed "$0.0000" for it — a REAL cost shown as zero, which is
// the one thing an ops console must never do.
function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(6)}`;
}

/** Fixed estimate for at-a-glance reading, and it says so. Same deliberately
 *  weak-ringgit figure as src/lib/unit-economics.ts (usdToMyr: 4.7). */
const USD_TO_MYR_ESTIMATE = 4.7;
function myrApprox(micros: number): string {
  return `≈RM${((micros / 1_000_000) * USD_TO_MYR_ESTIMATE).toFixed(4)}`;
}

/** K-3: is this operator in platform_admins? Service-role read (the table has
 *  RLS with zero policies, on purpose). Table missing / query failed = false —
 *  the UI then explains instead of showing a button that cannot work. */
async function isPlatformAdmin(email: string): Promise<boolean> {
  try {
    const admin = getSupabase();
    const { data, error } = await admin
      .from("platform_admins")
      .select("email")
      .ilike("email", email)
      .maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
  }
}

/** K-1: the feedback inbox — newest 50, all orgs. Aggregate view for the
 *  operator; the message is the user's own words TO us. */
async function loadFeedback(): Promise<
  { id: number; orgName: string; message: string; page: string | null; createdAt: string; status: string }[]
> {
  try {
    const admin = getSupabase();
    const { data, error } = await admin
      .from("feedback")
      .select("id, org_id, message, page, status, created_at, org:orgs (name)")
      .order("id", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as unknown as {
      id: number;
      message: string;
      page: string | null;
      status: string;
      created_at: string;
      org: { name: string } | null;
    }[]).map((r) => ({
      id: r.id,
      orgName: r.org?.name ?? "?",
      message: r.message,
      page: r.page,
      createdAt: r.created_at,
      status: r.status,
    }));
  } catch {
    return [];
  }
}

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!isAdmin(user?.email)) notFound();

  const { rows, monthly } = await loadRows();
  const [platformAdmin, feedback] = await Promise.all([
    isPlatformAdmin(user?.email ?? ""),
    loadFeedback(),
  ]);
  const unattributedErrors = await (async () => {
    const admin = getSupabase();
    const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const r = await admin
      .from("app_errors")
      .select("id", { count: "exact", head: true })
      .is("org_id", null)
      .gte("created_at", d30);
    return r.count ?? 0;
  })();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          <Tri bm="Konsol operasi" zh="管理台" en="Ops console" />
        </h1>
        <p className="mt-1 text-base text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Akaun × penggunaan × kos × ralat. Agregat sahaja — tiada kandungan dokumen, tiada data penderma (Peraturan 5)."
            zh="帐号 × 用量 × 成本 × 错误。只有汇总数字——不含文件内容、不含捐款人资料（硬规则 5）。"
            en="Accounts × usage × cost × errors. Aggregates only — never contents, never donor data (Hard Rule 5)."
          />
        </p>
      </div>

      {/* #20 (launch feedback): the numbers as CHARTS — months of cost,
          this month's usage by org, the totals lined up. */}
      <FleetCharts
        monthly={monthly}
        orgs={rows.map((r) => ({
          id: r.id,
          name: r.name,
          usedThisMonth: r.usedThisMonth,
          costMicrosThisMonth: r.costMicrosThisMonth,
          priceRm: r.priceRm,
        }))}
      />

      <div className="v2-glass overflow-x-auto p-0">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-left text-sm text-[color:var(--v2-text-soft)]">
              <th className="px-4 py-3"><Tri bm="Pertubuhan" zh="机构" en="Org" /></th>
              <th className="px-4 py-3"><Tri bm="Pelan" zh="配套" en="Plan" /></th>
              <th className="px-4 py-3 text-right"><Tri bm="AI bulan ini" zh="本月 AI" en="AI this month" /></th>
              <th className="px-4 py-3 text-right"><Tri bm="Kos (keseluruhan)" zh="成本（累计）" en="Cost (all time)" /></th>
              <th className="px-4 py-3"><Tri bm="Aktiviti terakhir" zh="最后活动" en="Last activity" /></th>
              <th className="px-4 py-3 text-right"><Tri bm="Ralat (30 hari)" zh="错误（30天）" en="Errors (30d)" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
              <tr className="border-b border-[color:var(--v2-border)] last:border-b-0">
                <td className="px-4 py-3 font-medium">
                  {r.name} <span className="text-sm text-[color:var(--v2-text-soft)]">#{r.id}</span>
                </td>
                <td className="px-4 py-3">
                  <Tri bm={r.plan.bm} zh={r.plan.zh} en={r.plan.en} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.usedThisMonth} / {r.monthlyQuota} · {r.usedPct}%
                  {/* K-2: by member (this month). "?" = rows with no person. */}
                  {r.byPerson.length > 0 && (
                    <div className="mt-1 text-xs text-[color:var(--v2-text-soft)]">
                      {r.byPerson.map((p) => `${p.name} ×${p.count}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {/* P-4: 6 decimals + a labelled MYR estimate — "$0.0000" for
                      a call that really cost money is a lie this page told. */}
                  {usd(r.costMicrosTotal)}
                  <div className="mt-1 text-xs text-[color:var(--v2-text-soft)]">
                    {myrApprox(r.costMicrosTotal)}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm tabular-nums">
                  {/* P-3: MYT, and it says so — raw UTC dressed as local time
                      was off by 8 hours for every Malaysian reader. */}
                  {formatMytDateTime(r.lastActivity)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.errors30d > 0 ? "font-semibold text-red-700" : ""}`}>
                  {r.errors30d}
                </td>
              </tr>
              {/* P-4: where the money went — provider / model / action, summed
                  in TypeScript. "?" = null on the row: a charged call with a
                  null provider is the id=5 signature, so it is SHOWN. */}
              {r.byAction.length > 0 && (
                <tr className="border-b border-[color:var(--v2-border)] last:border-b-0">
                  <td colSpan={6} className="px-4 pb-3 pt-0">
                    <details>
                      <summary className="cursor-pointer text-xs text-[color:var(--v2-text-soft)] underline underline-offset-4">
                        <Tri
                          bm="Pecahan: penyedia · model · tindakan"
                          zh="明细：供应商 · 模型 · 动作"
                          en="Breakdown: provider · model · action"
                        />
                      </summary>
                      <div className="mt-2 flex flex-col gap-1 text-xs text-[color:var(--v2-text-soft)]">
                        {([
                          ["provider", { bm: "Penyedia", zh: "供应商", en: "Provider" }, r.byProvider],
                          ["model", { bm: "Model", zh: "模型", en: "Model" }, r.byModel],
                          ["action", { bm: "Tindakan", zh: "动作", en: "Action" }, r.byAction],
                        ] as const).map(([kind, words, subs]) => (
                          <p key={kind}>
                            <span className="font-semibold">
                              <Tri bm={words.bm} zh={words.zh} en={words.en} />
                              :
                            </span>{" "}
                            {subs
                              .map((s) => `${s.label} ×${s.count} (${usd(s.costMicros)})`)
                              .join(" · ")}
                          </p>
                        ))}
                      </div>
                    </details>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[color:var(--v2-text-soft)]">
                  <Tri bm="Belum ada pertubuhan." zh="还没有机构。" en="No organisations yet." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* §1-1: internal plumbing (column names, migration numbers) moved off
          the face of the page into a fold-out for the operator. */}
      <p className="text-sm text-[color:var(--v2-text-soft)]">
        <Tri
          bm={`Ralat tanpa pertubuhan (30 hari): ${unattributedErrors}. Kos dilaporkan oleh vendor dalam USD; RM ialah anggaran tetap 1 USD ≈ RM${USD_TO_MYR_ESTIMATE.toFixed(2)}.`}
          zh={`没有机构归属的错误（30 天）：${unattributedErrors}。成本是供应商报告的美元数；RM 为固定估算 1 USD ≈ RM${USD_TO_MYR_ESTIMATE.toFixed(2)}。`}
          en={`Errors with no organisation (last 30d): ${unattributedErrors}. Cost is vendor-reported USD; RM is a fixed estimate, 1 USD ≈ RM${USD_TO_MYR_ESTIMATE.toFixed(2)}.`}
        />
      </p>
      <details className="text-sm text-[color:var(--v2-text-soft)]">
        <summary className="cursor-pointer underline underline-offset-4">
          <Tri bm="Bagaimana tukar pelan?" zh="怎么改配套？" en="How do I change a plan?" />
        </summary>
        <p className="mt-1">
          <Tri
            bm="Dalam Supabase SQL Editor, jalankan SQL di hujung fail migrasi 20260830000000_orgs_plan.sql."
            zh="在 Supabase 的 SQL Editor 里，跑 migration 档 20260830000000_orgs_plan.sql 末尾附的那段 SQL。"
            en="In the Supabase SQL Editor, run the SQL at the foot of migration file 20260830000000_orgs_plan.sql."
          />
        </p>
      </details>

      {/* K-3: the audited grant path — only when the DATABASE lists you. */}
      {platformAdmin ? (
        <GrantCreditsCard />
      ) : (
        <p className="rounded-md border-2 border-dashed p-4 text-sm text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Borang beri-kredit disembunyikan: akaun ini belum ada dalam senarai pentadbir platform (pangkalan data yang memutuskan, bukan butang). Untuk membukanya, jalankan dalam SQL Editor:"
            zh="加额度的表单被隐藏了：这个账号还不在平台管理员名单里（是数据库在把关，不是按钮）。要开通，在 SQL Editor 跑："
            en="The grant-credits form is hidden: this account is not on the platform-admin list (the database is the gate, not the button). To enable it, run in the SQL Editor:"
          />{" "}
          <code className="rounded bg-muted px-1">
            insert into platform_admins (email) values (&#39;{user?.email}&#39;) on
            conflict (email) do nothing;
          </code>
        </p>
      )}

      {/* K-1: the feedback inbox. */}
      <div className="v2-glass flex flex-col gap-3 p-5">
        <h2 className="text-xl font-semibold">
          <Tri bm="Maklum balas (50 terkini)" zh="反馈（最新 50 条）" en="Feedback (latest 50)" />
        </h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-[color:var(--v2-text-soft)]">
            {/* P-4: migration 25 is applied and live — the parenthesis had
                become a stale excuse. An empty inbox just means no feedback. */}
            <Tri bm="Belum ada maklum balas." zh="还没有反馈。" en="No feedback yet." />
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {feedback.map((f) => (
              <li key={f.id} className="rounded-sm border border-[color:var(--v2-border)] p-3">
                <p className="whitespace-pre-line text-base">{f.message}</p>
                <p className="mt-1 text-xs text-[color:var(--v2-text-soft)]">
                  {f.orgName} · {f.page ?? "—"} · {formatMytDateTime(f.createdAt)} ·{" "}
                  {/* §1-1: the status enum, in words. */}
                  {f.status === "done" ? (
                    <Tri bm="selesai" zh="已处理" en="done" />
                  ) : f.status === "seen" ? (
                    <Tri bm="sudah dibaca" zh="已看" en="seen" />
                  ) : (
                    <Tri bm="baru" zh="新" en="new" />
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
