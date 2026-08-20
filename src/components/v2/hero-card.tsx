"use client";

// ---------------------------------------------------------------------------
// Large "front door" action card for the home screen. Each one leads with a
// verb (scan / scan / ask) — one clear action per glance. Glass surface, a
// soft coloured glow, big glyph, short description and a gradient pill.
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { motion } from "./motion";

export function HeroCard({
  href,
  emoji,
  icon: Icon,
  title,
  description,
  cta,
  glow,
  accent,
}: {
  href: string;
  emoji: string;
  icon: LucideIcon;
  title: React.ReactNode;
  description: React.ReactNode;
  cta: React.ReactNode;
  glow: string; // rgba glow colour
  accent: string; // gradient css
}) {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 240, damping: 20 }}
      className="v2-glass group relative overflow-hidden rounded-[28px] p-6"
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-90"
        style={{ background: glow }}
      />

      <Link href={href} className="relative flex h-full flex-col">
        <div className="flex items-center gap-3">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[0_12px_30px_-12px_rgba(15,23,42,0.4)]"
            style={{ background: accent }}
          >
            <span className="drop-shadow-sm">{emoji}</span>
          </span>
          <Icon className="h-5 w-5 text-[color:var(--v2-text-soft)]" strokeWidth={1.6} />
        </div>

        <h3 className="mt-5 text-lg font-semibold tracking-tight text-[color:var(--v2-text)]">
          {title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-[color:var(--v2-text-soft)]">
          {description}
        </p>

        <span
          className="v2-pill mt-5 inline-flex w-fit items-center gap-2 px-5 py-2.5 text-base font-semibold text-white"
          style={{ background: accent, boxShadow: `0 14px 34px -14px ${glow}` }}
        >
          {cta}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.2} />
        </span>
      </Link>
    </motion.div>
  );
}
