import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// #20 (launch feedback, 2026-08-27 evening): the ops console gets CHARTS —
// cost over the months, who is using what this month, and the totals lined
// up. Pure SVG, server-rendered, TypeScript sums only (Hard Rule 2 applies
// to our own books too).
//
// 🔴 "赚多少" (revenue / margin): every plan's priceRm is deliberately null —
// J's standing decision is prices are set AFTER costs are measured. So the
// revenue column SAYS "waiting for pricing" instead of inventing a number;
// the moment plans carry real prices, the margin line lights up by itself.
// ---------------------------------------------------------------------------

export type FleetMonth = { ym: string; actions: number; costMicros: number };
export type FleetOrg = {
  id: number;
  name: string;
  usedThisMonth: number;
  costMicrosThisMonth: number;
  priceRm: number | null;
};

const USD_TO_MYR_ESTIMATE = 4.7;

function myr(micros: number): string {
  return `RM${((micros / 1_000_000) * USD_TO_MYR_ESTIMATE).toFixed(2)}`;
}
function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function FleetCharts({
  monthly,
  orgs,
}: {
  monthly: FleetMonth[];
  orgs: FleetOrg[];
}) {
  const thisMonth = monthly[monthly.length - 1];
  const totalActions = thisMonth?.actions ?? 0;
  const totalCost = thisMonth?.costMicros ?? 0;
  const pricedOrgs = orgs.filter((o) => o.priceRm !== null);
  const revenueRm = pricedOrgs.reduce((s, o) => s + (o.priceRm ?? 0), 0);
  const costRmNumber = (totalCost / 1_000_000) * USD_TO_MYR_ESTIMATE;

  const maxCost = Math.max(1, ...monthly.map((m) => m.costMicros));
  const topOrgs = [...orgs]
    .sort((a, b) => b.usedThisMonth - a.usedThisMonth)
    .slice(0, 8);
  const maxOrgUse = Math.max(1, ...topOrgs.map((o) => o.usedThisMonth));

  return (
    <div className="flex flex-col gap-4">
      {/* The totals, lined up. */}
      <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
        <StatCard
          label={<Tri bm="Pertubuhan" zh="机构数" en="Organisations" />}
          value={String(orgs.length)}
        />
        <StatCard
          label={<Tri bm="Tindakan AI bulan ini" zh="本月 AI 用量" en="AI actions this month" />}
          value={String(totalActions)}
        />
        <StatCard
          label={<Tri bm="Kos vendor bulan ini" zh="本月 AI 成本" en="Vendor cost this month" />}
          value={`≈${myr(totalCost)}`}
          sub={usd(totalCost)}
        />
        {pricedOrgs.length > 0 ? (
          <StatCard
            label={<Tri bm="Hasil / margin bulanan" zh="月收入 / 毛利" en="Monthly revenue / margin" />}
            value={`RM${revenueRm.toFixed(2)}`}
            sub={`margin ≈RM${(revenueRm - costRmNumber).toFixed(2)}`}
          />
        ) : (
          <StatCard
            label={<Tri bm="Hasil / margin" zh="收入 / 毛利" en="Revenue / margin" />}
            value="—"
            sub={
              <Tri
                bm="Menunggu harga pelan (keputusan: ukur kos dahulu). Bila pelan ada harga, margin terpapar sendiri."
                zh="等配套定价（拍板：先量成本再定价）。配套有价后，这里会自动算毛利。"
                en="Waiting for plan pricing (decision: measure costs first). Once plans carry prices, margin appears by itself."
              />
            }
          />
        )}
      </div>

      {/* Six months of vendor cost, with the action counts underneath. */}
      <div className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4">
        <p className="text-base font-semibold">
          <Tri bm="Kos vendor · 6 bulan" zh="AI 成本 · 最近 6 个月" en="Vendor cost · 6 months" />
        </p>
        <div className="mt-3 grid grid-cols-6 items-end gap-2">
          {monthly.map((m) => {
            const h = Math.max(4, Math.round((m.costMicros / maxCost) * 96));
            return (
              <div key={m.ym} className="flex flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {m.costMicros > 0 ? `≈${myr(m.costMicros)}` : "—"}
                </span>
                <svg
                  width="100%"
                  height="100"
                  viewBox="0 0 40 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <rect
                    x="4"
                    y={100 - h}
                    width="32"
                    height={h}
                    rx="3"
                    fill="var(--v2-primary-fill)"
                    opacity={m.costMicros > 0 ? 1 : 0.15}
                  />
                </svg>
                <span className="text-xs font-medium tabular-nums">{m.ym.slice(2)}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {m.actions} <Tri bm="tindakan" zh="次" en="acts" />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Who is using what this month — bars per organisation. */}
      <div className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4">
        <p className="text-base font-semibold">
          <Tri
            bm="Penggunaan bulan ini, mengikut pertubuhan"
            zh="本月用量 · 按机构"
            en="This month's usage, by organisation"
          />
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {topOrgs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              <Tri bm="Tiada penggunaan lagi" zh="本月还没有用量" en="No usage yet" />
            </p>
          )}
          {topOrgs.map((o) => (
            <div key={o.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm">{o.name}</span>
              <div className="h-5 flex-1 rounded-xs bg-[color:var(--v2-card-nested)]">
                <div
                  className="h-5 rounded-xs bg-[color:var(--v2-primary-fill)]"
                  style={{
                    width: `${Math.max(2, Math.round((o.usedThisMonth / maxOrgUse) * 100))}%`,
                  }}
                />
              </div>
              <span className="w-32 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {o.usedThisMonth} · ≈{myr(o.costMicrosThisMonth)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
