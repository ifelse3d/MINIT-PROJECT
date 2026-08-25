import { notFound } from "next/navigation";
import { getSessionUser } from "@/db/supabase-server";
import { getSupabase } from "@/db/supabase";
import { planById } from "@/lib/plans";
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
// Deliberately English-only: this is the OPERATOR's page (J's), not a
// customer surface, and the operator reads the codebase's language.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

type OrgRow = {
  id: number;
  name: string;
  plan: string;
  monthlyQuota: number;
  usedThisMonth: number;
  usedPct: number;
  costMicrosTotal: number;
  lastActivity: string | null;
  errors30d: number;
  /** K-2: this month's usage split by member ("?" = pre-migration rows). */
  byPerson: { name: string; count: number }[];
};

async function loadRows(): Promise<OrgRow[]> {
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
  };
  const fetchUsage = (select: string) =>
    admin
      .from("ai_usage")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(20000)
      .returns<UsageRow[]>();
  let usage = await fetchUsage("org_id, cost_micros, created_at, refunded_at, user_id");
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

  return orgs.map((o) => {
    const mine = usageRows.filter((u) => u.org_id === o.id);
    const thisMonth = mine.filter(
      (u) => u.created_at >= monthStart.toISOString() && u.refunded_at === null,
    );
    const usedThisMonth = thisMonth.length;
    const quota = o.monthly_free_quota ?? 0;
    const costMicrosTotal = mine.reduce((s, u) => s + (u.cost_micros ?? 0), 0);
    const lastActivity = mine[0]?.created_at ?? null;
    // K-2: split this month's actions by member. Rows without a user_id
    // (pre-migration, or server-initiated) group under "?".
    const perPerson = new Map<string, number>();
    for (const u of thisMonth) {
      const label = u.user_id ? memberName.get(`${o.id}:${u.user_id}`) ?? "?" : "?";
      perPerson.set(label, (perPerson.get(label) ?? 0) + 1);
    }
    return {
      id: o.id,
      name: o.name,
      plan: planById(o.plan).id,
      monthlyQuota: quota,
      usedThisMonth,
      usedPct: quota > 0 ? Math.round((usedThisMonth / quota) * 100) : 0,
      costMicrosTotal,
      lastActivity,
      errors30d: errRows.filter((e) => e.org_id === o.id).length,
      byPerson: [...perPerson.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
}

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
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

  const rows = await loadRows();
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
        <h1 className="text-3xl font-semibold tracking-tight">Ops console</h1>
        <p className="mt-1 text-base text-[color:var(--v2-text-soft)]">
          Accounts × usage × cost × errors. Aggregates only — never contents,
          never donor data (Hard Rule 5).
        </p>
      </div>

      <div className="v2-glass overflow-x-auto p-0">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-left text-sm text-[color:var(--v2-text-soft)]">
              <th className="px-4 py-3">Org</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">AI this month</th>
              <th className="px-4 py-3 text-right">Cost (all time)</th>
              <th className="px-4 py-3">Last activity</th>
              <th className="px-4 py-3 text-right">Errors (30d)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--v2-border)] last:border-b-0">
                <td className="px-4 py-3 font-medium">
                  {r.name} <span className="text-sm text-[color:var(--v2-text-soft)]">#{r.id}</span>
                </td>
                <td className="px-4 py-3">{r.plan}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.usedThisMonth} / {r.monthlyQuota} · {r.usedPct}%
                  {/* K-2: by member (this month). "?" = rows with no person. */}
                  {r.byPerson.length > 0 && (
                    <div className="mt-1 text-xs text-[color:var(--v2-text-soft)]">
                      {r.byPerson.map((p) => `${p.name} ×${p.count}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{usd(r.costMicrosTotal)}</td>
                <td className="px-4 py-3 text-sm tabular-nums">
                  {r.lastActivity ? r.lastActivity.slice(0, 16).replace("T", " ") : "—"}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.errors30d > 0 ? "font-semibold text-red-700" : ""}`}>
                  {r.errors30d}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[color:var(--v2-text-soft)]">
                  No organisations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-[color:var(--v2-text-soft)]">
        Errors with no organisation (last 30d): {unattributedErrors}. Cost is
        the sum of ai_usage.cost_micros (vendor-reported, USD). Plan changes:
        run the SQL at the foot of migration 20260830000000 in the SQL Editor.
      </p>

      {/* K-3: the audited grant path — only when the DATABASE lists you. */}
      {platformAdmin ? (
        <GrantCreditsCard />
      ) : (
        <p className="rounded-xl border-2 border-dashed p-4 text-sm text-[color:var(--v2-text-soft)]">
          Grant-credits is hidden: this account is not in platform_admins (or
          migration 25 has not been applied). To enable it, run in the SQL
          Editor:{" "}
          <code className="rounded bg-muted px-1">
            insert into platform_admins (email) values (&#39;{user?.email}&#39;) on
            conflict (email) do nothing;
          </code>{" "}
          The database enforces this list on every call — the button is a
          convenience, not the gate.
        </p>
      )}

      {/* K-1: the feedback inbox. */}
      <div className="v2-glass flex flex-col gap-3 p-5">
        <h2 className="text-xl font-semibold">Feedback (latest 50)</h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-[color:var(--v2-text-soft)]">
            Nothing yet (or migration 25 not applied).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {feedback.map((f) => (
              <li key={f.id} className="rounded-lg border border-[color:var(--v2-border)] p-3">
                <p className="whitespace-pre-line text-base">{f.message}</p>
                <p className="mt-1 text-xs text-[color:var(--v2-text-soft)]">
                  {f.orgName} · {f.page ?? "—"} · {f.createdAt.slice(0, 16).replace("T", " ")} · {f.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
