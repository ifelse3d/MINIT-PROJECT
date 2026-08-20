"use client";

// ---------------------------------------------------------------------------
// Floating glass sidebar. Three bands, in this order:
//
//   1. brand      Minit + the collapse toggle
//   2. nav        Home · Minutes · Money · Calendar · History · Documents▾
//   3. footer     the active organisation (which org every record belongs to)
//
// The panel is sized to its CONTENT, not to the viewport, so it ends just below
// the last row instead of leaving a tall empty box. "Documents" collapses
// (Filings / AGM / Constitution / Uploads) because those are occasional, while
// Minutes, Money and History are daily. Organisations and Settings live in the
// account menu in the top bar. (2026-07-28: History moved INTO the sidebar and
// the "Choose org" button became a label — see nav-items.ts and org-chip.tsx.)
//
// The whole sidebar collapses to a 68px icon rail; that choice is remembered on
// the device. Hidden below md — MobileTopBar takes over there. Destinations come
// from the ONE nav source of truth (nav-items.ts).
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import {
  SIDEBAR_NAV,
  groupHasActiveChild,
  isActivePath,
  type NavItem,
} from "@/components/nav-items";
import { usePersistentState } from "@/lib/use-persistent-state";
import { OrgChip } from "./org-chip";
import { cn } from "./glass";

const COLLAPSE_KEY = "minit.sidebar.collapsed";

const HAIRLINE = "border-[color:var(--v2-text-soft)]/15";

const rowBase =
  "group flex w-full items-center rounded-xl transition-all duration-200";
const rowActive =
  "bg-gradient-to-r from-[#5b4bd6]/90 to-[#6f5ef2]/90 text-white shadow-[0_10px_24px_-12px_rgba(124,108,245,0.8)]";
const rowIdle =
  "text-[color:var(--v2-text-soft)] hover:bg-white/50 hover:text-[color:var(--v2-text)] dark:hover:bg-white/10";

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const t = useTriText();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      // The rail has no visible labels, so the tooltip carries them — and it
      // follows the language switcher like every other label.
      title={t(item.bm, item.zh, item.en)}
      className={cn(
        rowBase,
        // Roomy rows on purpose: the people using this are often elderly
        // volunteers (CLAUDE.md), and 5 generous rows fill the panel better than
        // 5 cramped ones.
        collapsed
          ? "flex-col justify-center gap-1 px-1 py-2.5"
          : "gap-3 px-3 py-3",
        active ? rowActive : rowIdle,
      )}
    >
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.7} />
      {collapsed ? (
        // 2026-07-28 audit: the collapsed rail used to be icon-only with the
        // label available ONLY as a hover `title`. On a touch tablet (>=768px,
        // so the sidebar shows) that left the navigation completely unlabelled.
        // A short visible caption is worth the pixels.
        <span className="w-full truncate text-center text-[0.68rem] leading-tight font-medium">
          <Tri bm={item.bm} zh={item.zh} en={item.en} />
        </span>
      ) : (
        <span className="truncate text-base font-medium leading-tight">
          <Tri bm={item.bm} zh={item.zh} en={item.en} />
        </span>
      )}
    </Link>
  );
}

function GroupRow({
  icon: Icon,
  label,
  open,
  active,
  collapsed,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  open: boolean;
  active: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={label}
      className={cn(
        rowBase,
        collapsed
          ? "flex-col justify-center gap-1 px-1 py-2.5"
          : "gap-3 px-3 py-3",
        // While the group is open its children carry the highlight, so the
        // parent row stays quiet — two highlights at once reads as a glitch.
        active && !open ? rowActive : rowIdle,
      )}
    >
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.7} />
      {collapsed ? (
        <span className="w-full truncate text-center text-[0.68rem] leading-tight font-medium">
          {label}
        </span>
      ) : (
        <>
          <span className="truncate text-base font-medium leading-tight">
            {label}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.9}
          />
        </>
      )}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useTriText();
  const [collapsed, setCollapsed] = usePersistentState<boolean>(
    COLLAPSE_KEY,
    false,
  );
  // Only groups the user has explicitly toggled are tracked; everything else
  // follows the current route, so the group you are inside is always open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const toggleLabel = collapsed
    ? t("Buka bar sisi", "展开侧栏", "Expand sidebar")
    : t("Tutup bar sisi", "收起侧栏", "Collapse sidebar");

  return (
    <aside
      className={cn(
        // Tall panel (min-h) with the org chip pinned to its bottom edge, so the
        // height reads as deliberate rather than as leftover space. Capped at the
        // viewport and scrollable on short screens.
        "sticky top-6 hidden min-h-[72vh] max-h-[calc(100vh-3rem)] shrink-0 flex-col items-stretch overflow-y-auto overflow-x-hidden rounded-[24px] py-4 transition-[width] duration-300 ease-out md:flex v2-glass v2-scroll",
        // Collapsed rail widened from 72px to 92px so the icons can carry a
        // visible caption instead of a hover-only tooltip (2026-07-28 audit).
        collapsed ? "w-[92px] px-2" : "w-64 px-3.5",
      )}
    >
      {/* 1 — Brand + collapse toggle */}
      <div
        className={cn(
          "flex items-center pb-3",
          collapsed ? "flex-col gap-2" : "justify-between gap-2",
        )}
      >
        <Link
          href="/"
          title="Minit"
          className="flex min-w-0 items-center gap-2.5 px-1"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5b4bd6] to-[#6f5ef2] text-white shadow-[0_8px_22px_-10px_rgba(124,108,245,0.8)]">
            <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
          {!collapsed && (
            <span className="truncate text-lg font-semibold tracking-tight">
              Minit
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--v2-text-soft)] transition-colors hover:bg-white/50 hover:text-[color:var(--v2-text)] dark:hover:bg-white/10"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.7} />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.7} />
          )}
        </button>
      </div>

      {/* 2 — Navigation */}
      <nav
        className={cn(
          "flex w-full flex-col items-stretch gap-1 border-t py-3",
          HAIRLINE,
        )}
      >
        {SIDEBAR_NAV.map((entry) => {
          if (entry.kind === "item") {
            return (
              <NavLink
                key={entry.item.href}
                item={entry.item}
                active={isActivePath(pathname, entry.item.href)}
                collapsed={collapsed}
              />
            );
          }

          const childActive = groupHasActiveChild(entry, pathname);
          const open = toggled[entry.id] ?? childActive;
          return (
            <div key={entry.id} className="flex flex-col gap-1">
              <GroupRow
                icon={entry.icon}
                label={t(entry.bm, entry.zh, entry.en)}
                open={open && !collapsed}
                active={childActive}
                collapsed={collapsed}
                onToggle={() => {
                  // On the rail there is no room for children, so opening the
                  // group opens the sidebar with it.
                  if (collapsed) {
                    setCollapsed(false);
                    setToggled((prev) => ({ ...prev, [entry.id]: true }));
                    return;
                  }
                  setToggled((prev) => ({ ...prev, [entry.id]: !open }));
                }}
              />
              {open && !collapsed && (
                // Guide line so the three children read as one subtree
                <div
                  className={cn(
                    "ml-[21px] flex flex-col gap-1 border-l pl-2",
                    HAIRLINE,
                  )}
                >
                  {entry.children.map((child) => (
                    <NavLink
                      key={child.href}
                      item={child}
                      active={isActivePath(pathname, child.href)}
                      collapsed={false}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 3 — Which organisation everything you record belongs to. mt-auto pins it
             to the bottom edge of the panel. */}
      <div className={cn("mt-auto border-t pt-3", HAIRLINE)}>
        <OrgChip compact={collapsed} className={collapsed ? "mx-auto" : "w-full"} />
      </div>
    </aside>
  );
}
