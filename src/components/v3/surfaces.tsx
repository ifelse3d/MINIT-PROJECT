"use client";

// ---------------------------------------------------------------------------
// v3 surfaces — the solid primitives of the "clean ledger" design (Stage R,
// 2026-08-25). One brand accent, solid cards, thin borders, no blur, no
// gradients, no hover theatrics. Tokens live in globals.css and only there.
//
// Export names deliberately match the old v2/glass.tsx so a caller migrates by
// changing one import path.
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

/** A solid card. (`strong` kept for call-site compatibility; both are solid.) */
export function GlassCard({
  children,
  className,
  // Kept for call-site compatibility; both strengths are the same solid card.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  strong: _strong = false,
  hover = false,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  hover?: boolean;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <As
      className={cn(
        "v2-glass",
        hover && "transition-shadow duration-150 hover:shadow-md",
        className
      )}
    >
      {children}
    </As>
  );
}

type PillProps = {
  children: ReactNode;
  variant?: "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  href?: string;
} & ComponentPropsWithoutRef<"button">;

const sizeMap = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-7 py-3.5 text-base",
};

/** Primary/ghost button. Renders a link if href. */
export function PillButton({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  ...rest
}: PillProps) {
  const classes = cn(
    "v2-pill inline-flex items-center justify-center gap-2 whitespace-nowrap",
    variant === "primary" ? "v2-pill-primary" : "v2-pill-ghost",
    sizeMap[size],
    className
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

type Tone = "confirmed" | "check" | "missing" | "info" | "neutral";

// Aligns with CLAUDE.md rule 9: confirmed=green, check=amber, missing=red.
// The text steps are the audited ones (-800 light / -300 dark, all ≥ 4.5:1 on
// their tinted panels — docs/无障碍对比度审查.md §2). Do not lighten them.
const toneMap: Record<Tone, string> = {
  confirmed: "bg-emerald-400/15 text-emerald-800 dark:text-emerald-300 ring-emerald-400/30",
  check: "bg-amber-400/15 text-amber-800 dark:text-amber-300 ring-amber-400/30",
  missing: "bg-rose-400/15 text-rose-800 dark:text-rose-300 ring-rose-400/30",
  info: "bg-sky-400/15 text-sky-800 dark:text-sky-300 ring-sky-400/30",
  neutral: "bg-slate-400/15 text-slate-800 dark:text-slate-300 ring-slate-400/30",
};

export function GlassBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset",
        toneMap[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Small icon chip used on cards and list rows. `gradient` fills with accent. */
export function IconChip({
  children,
  gradient = false,
  className,
}: {
  children: ReactNode;
  gradient?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-xl",
        gradient
          ? "bg-[color:var(--v2-primary-fill)] text-white"
          : "bg-[color:var(--v2-primary-soft)] text-[color:var(--v2-primary)]",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Page/section heading with light supporting text. */
export function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[color:var(--v2-text)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[color:var(--v2-text-soft)]">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export { cn };
