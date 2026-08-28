"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Tri } from "@/components/language-provider";
import { BRAND_NAME } from "@/lib/brand";
import { SETTINGS_SUBNAV, isActivePath } from "@/components/nav-items";
import { cn } from "@/components/v3/surfaces";

// ---------------------------------------------------------------------------
// The settings sub-sidebar (violet redesign §7.3; reshaped 2026-08-27 evening
// for J's launch feedback #12): inside /settings the MAIN rail is hidden by
// the shell, so this 240px column is the ONLY sidebar. Its first row is the
// way back to the app. On <1024px it stays a horizontal tab strip.
//
// #11: `showSystem` (decided server-side in layout.tsx from manage_org) hides
// the System check entry from ordinary members — /health itself keeps its own
// server-side gate whatever this renders.
// ---------------------------------------------------------------------------

export function SettingsNav({ showSystem }: { showSystem: boolean }) {
  const pathname = usePathname() ?? "/settings";
  const groups = SETTINGS_SUBNAV.map((group) => ({
    ...group,
    children: group.children.filter(
      (item) => showSystem || item.href !== "/settings/system",
    ),
  })).filter((group) => group.children.length > 0);

  return (
    <>
      {/* Wide content column: the one settings column. @4xl (not lg:) — the
          column must answer to the room actually left (AI dock open = less),
          not the window (work order 46 §1). */}
      <nav
        aria-label="Settings"
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[var(--subnav-w)] shrink-0 overflow-y-auto border-r border-[color:var(--v2-border)] bg-[color:var(--v2-card)] px-3 pb-6 @4xl:block"
      >
        {/* #12: the way back — the main rail is hidden inside settings. */}
        <Link
          href="/"
          className="mt-3 flex min-h-9 items-center gap-2.5 rounded-sm px-3 text-base text-[color:var(--v2-text)] transition-colors hover:bg-[color:var(--v2-card-nested)]"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
          <Tri
            bm={`Kembali ke ${BRAND_NAME}`}
            zh={`返回 ${BRAND_NAME}`}
            en={`Back to ${BRAND_NAME}`}
          />
        </Link>
        <p className="px-3 pb-2 pt-3 text-lg font-semibold">
          <Tri bm="Tetapan" zh="设置" en="Settings" />
        </p>
        <div className="mb-2 border-t border-[color:var(--v2-border)]" />
        {groups.map((group) => (
          <div key={group.id} className="mb-2">
            <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--v2-text-soft)]">
              <Tri bm={group.bm} zh={group.zh} en={group.en} />
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.children.map((item) => {
                const active = isActivePath(pathname, item.href, item.exact);
                const danger = item.href === "/settings/danger";
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-9 items-center gap-2.5 rounded-sm px-3 text-base transition-colors",
                        active && danger
                          ? "bg-[#fef2f2] font-medium text-[#dc2626]"
                          : active
                            ? "bg-[color:var(--v2-primary-soft)] font-medium text-[color:var(--v2-primary)]"
                            : "text-[color:var(--v2-text)] hover:bg-[color:var(--v2-card-nested)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <Tri bm={item.bm} zh={item.zh} en={item.en} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Narrow content column: a scrolling tab strip pinned under the top
          bar (container-measured, same rule as above). */}
      <nav
        aria-label="Settings"
        className="v2-scroll sticky top-14 z-30 -mx-4 flex gap-1 overflow-x-auto border-b border-[color:var(--v2-border)] bg-[color:var(--v2-card)] px-4 py-2 sm:-mx-6 sm:px-6 @4xl:hidden"
      >
        {groups.flatMap((g) => g.children).map((item) => {
          const active = isActivePath(pathname, item.href, item.exact);
          const danger = item.href === "/settings/danger";
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-xs border-b-2 px-3 py-1.5 text-sm font-medium",
                active && danger
                  ? "border-[#dc2626] text-[#dc2626]"
                  : active
                    ? "border-[color:var(--v2-primary)] text-[color:var(--v2-primary)]"
                    : "border-transparent text-[color:var(--v2-text-soft)]",
              )}
            >
              <Tri bm={item.bm} zh={item.zh} en={item.en} />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
