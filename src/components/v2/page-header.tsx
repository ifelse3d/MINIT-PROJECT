"use client";

// Shared page header for the v2 feature routes: eyebrow, big gradient title,
// supporting line and an optional primary action pill.

import type { LucideIcon } from "lucide-react";
import { BlurIn } from "./motion";
import { PillButton } from "./glass";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  actionIcon: ActionIcon,
  actionHref,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actionLabel?: React.ReactNode;
  actionIcon?: LucideIcon;
  actionHref?: string;
}) {
  return (
    <BlurIn>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-sm font-medium text-[color:var(--v2-text-soft)]">{eyebrow}</p>
          )}
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="v2-gradient-text">{title}</span>
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-2xl text-[color:var(--v2-text-soft)]">{subtitle}</p>
          )}
        </div>
        {actionLabel && (
          <PillButton size="lg" href={actionHref}>
            {ActionIcon && <ActionIcon className="h-4 w-4" strokeWidth={2} />}
            {actionLabel}
          </PillButton>
        )}
      </div>
    </BlurIn>
  );
}
