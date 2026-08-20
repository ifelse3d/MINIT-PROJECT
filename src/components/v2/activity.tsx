"use client";

// ---------------------------------------------------------------------------
// A modern rounded-card timeline (no tables). Each row is a glass row with a
// gradient node, title, meta, and a status badge.
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import { GlassBadge, IconChip } from "./glass";
import { StaggerItem } from "./motion";

export type ActivityStatus = "confirmed" | "check" | "missing" | "info";

export function ActivityTimeline({
  items,
}: {
  items: {
    id: string;
    icon: LucideIcon;
    title: React.ReactNode;
    meta: React.ReactNode;
    time: string;
    status: ActivityStatus;
    statusLabel: React.ReactNode;
  }[];
}) {
  return (
    <div className="relative flex flex-col gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <StaggerItem key={it.id}>
            <div className="group v2-glass flex items-center gap-4 rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5">
              <IconChip gradient>
                <Icon className="h-5 w-5" strokeWidth={1.7} />
              </IconChip>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-[color:var(--v2-text)]">
                  {it.title}
                </p>
                <p className="truncate text-sm text-[color:var(--v2-text-soft)]">{it.meta}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <GlassBadge tone={it.status}>{it.statusLabel}</GlassBadge>
                <span className="text-sm text-[color:var(--v2-text-soft)]">{it.time}</span>
              </div>
            </div>
          </StaggerItem>
        );
      })}
    </div>
  );
}
