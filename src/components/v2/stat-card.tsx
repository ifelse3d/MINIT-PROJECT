"use client";

// ---------------------------------------------------------------------------
// Glass statistic card: icon, big number, trend pill, and a tiny chart.
// Used across the overview grid on the home dashboard.
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { MiniBars, Sparkline } from "./charts";
import { IconChip, MotionGlassCard, cn } from "./glass";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  trendLabel,
  series,
  chart = "spark",
  color = "#7c6cf5",
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  value: string;
  hint?: React.ReactNode;
  trend?: number; // percentage, positive/negative
  trendLabel?: React.ReactNode;
  series: number[];
  chart?: "spark" | "bars";
  color?: string;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <MotionGlassCard className="p-5">
      <div className="flex items-start justify-between">
        <IconChip>
          <Icon className="h-5 w-5" strokeWidth={1.6} />
        </IconChip>
        {typeof trend === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-sm font-semibold",
              up
                ? "bg-emerald-400/15 text-emerald-600 dark:text-emerald-300"
                : "bg-rose-400/15 text-rose-600 dark:text-rose-300"
            )}
          >
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-[color:var(--v2-text-soft)]">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-[color:var(--v2-text)]">
          {value}
        </p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-sm text-[color:var(--v2-text-soft)]">
          {hint ?? trendLabel}
        </p>
        {chart === "spark" ? (
          <Sparkline data={series} color={color} width={110} height={36} />
        ) : (
          <MiniBars data={series} color={color} width={110} height={36} />
        )}
      </div>
    </MotionGlassCard>
  );
}
