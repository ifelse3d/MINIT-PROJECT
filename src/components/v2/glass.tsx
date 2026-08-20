"use client";

// ---------------------------------------------------------------------------
// Core glass surfaces & controls for the v2 UI. Depth comes from frosted
// layers + soft shadows, never hard borders. Pills, badges and headings all
// share one accent gradient (blue -> purple -> mint).
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { motion } from "framer-motion";

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Frosted floating card. `hover` adds a gentle lift + glow. */
export function GlassCard({
  children,
  className,
  strong = false,
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
        strong ? "v2-glass-strong" : "v2-glass",
        hover &&
          "transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_28px_70px_-24px_rgba(124,108,245,0.45)]",
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

/** Rounded pill button with Apple-style hover scale. Renders a link if href. */
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
//
// The light-mode text step used to be `-600`, which measured 2.82–3.89:1 on the
// tinted panel — all four coloured tones failed WCAG AA (4.5:1). `check` was the
// worst at 2.82:1, and `check` is precisely the badge that has to be noticed:
// it is the one saying "the AI is unsure, look at this". `-800` clears it with
// room to spare (6.28–6.65:1) at the same hue. The `dark:` half already used
// `-300`, which measures 5.7–7.0:1 on the dark surface and is left alone.
// (docs/无障碍对比度审查.md §2)
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
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset backdrop-blur",
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
        "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
        gradient
          ? "bg-gradient-to-br from-[#5b4bd6] to-[#6f5ef2] text-white shadow-[0_10px_30px_-10px_rgba(124,108,245,0.7)]"
          : "bg-white/50 text-slate-700 ring-1 ring-white/60 backdrop-blur dark:bg-white/10 dark:text-slate-200",
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

/** Motion-enabled glass card for grids that need per-item interaction. */
export function MotionGlassCard({
  children,
  className,
  strong,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={cn(strong ? "v2-glass-strong" : "v2-glass", className)}
    >
      {children}
    </motion.div>
  );
}

export { cn };
