"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tri } from "@/components/language-provider";
import { SETTINGS_SUBNAV, isActivePath } from "@/components/nav-items";
import { cn } from "@/components/v3/surfaces";

// ---------------------------------------------------------------------------
// The settings sub-sidebar (violet redesign §7.3): a 240px second column on
// ≥1024px, a horizontally scrolling tab strip below. Active item = tint +
// violet (NO edge bar — that belongs to the main rail; keeping it exclusive
// is what makes the two nav levels readable as different levels). The one
// exception: Danger zone's active colour is red on a red tint.
// ---------------------------------------------------------------------------

export function SettingsNav() {
  const pathname = usePathname() ?? "/settings";

  return (
    <>
      {/* ≥1024px: the second column. */}
      <nav
        aria-label="Settings"
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[var(--subnav-w)] shrink-0 overflow-y-auto border-r border-[color:var(--v2-border)] bg-[color:var(--v2-card)] px-3 pb-6 lg:block"
      >
        <p className="px-3 pb-2 pt-5 text-lg font-semibold">
          <Tri bm="Tetapan" zh="设置" en="Settings" />
        </p>
        <div className="mb-2 border-t border-[color:var(--v2-border)]" />
        {SETTINGS_SUBNAV.map((group) => (
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

      {/* <1024px: a scrolling tab strip pinned under the top bar. */}
      <nav
        aria-label="Settings"
        className="v2-scroll sticky top-14 z-30 -mx-4 flex gap-1 overflow-x-auto border-b border-[color:var(--v2-border)] bg-[color:var(--v2-card)] px-4 py-2 sm:-mx-6 sm:px-6 lg:hidden"
      >
        {SETTINGS_SUBNAV.flatMap((g) => g.children).map((item) => {
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
