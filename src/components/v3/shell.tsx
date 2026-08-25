"use client";

// ---------------------------------------------------------------------------
// v3 APP SHELL (Stage R, 2026-08-25) — "clean ledger".
//
// Desktop (md+): a FIXED left rail with the four primary entries (Home /
// Minutes / Money / More), the active flow's steps listed under its group,
// the organisation you are recording for at the bottom. Content sits in a
// centred, width-limited column.
//
// Phone: a bottom tab bar with the SAME four entries (More is its own page,
// /more) and a slim top bar naming the app and the organisation. One column.
//
// /login renders bare: no nav to pages you cannot reach, just the language
// chips.
//
// J's brief (2026-08-24): 手机 19 格砍成 4；桌面主力，手机第二，两个都要能用.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher, Tri } from "@/components/language-provider";
import { FirstRunFlow } from "@/components/first-run-flow";
import {
  PRIMARY_NAV,
  SIDEBAR_NAV,
  groupHasActiveChild,
  isActivePath,
  visibleGroupChildren,
  type NavEntry,
  type NavItem,
} from "@/components/nav-items";
import { useEinvoisVisible } from "@/lib/einvois-pref";
import { cn } from "./surfaces";
import { OrgChip, useActiveOrg } from "./org-chip";
import { TopSearch } from "./top-search";
import { AIDock, useAIDock } from "./ai-dock";

/** Routes rendered without nav/search/theme chrome. */
const BARE_ROUTES = ["/login", "/reset-password"];

function isBareRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function AppShell({
  children,
  showAiLauncher,
  aiRemaining,
  aiUsedPct,
  aiBlocked,
}: {
  children: React.ReactNode;
  showAiLauncher: boolean;
  aiRemaining: number | null;
  /** Share of the monthly free quota already spent, 0–100. null = unknown. */
  aiUsedPct: number | null;
  aiBlocked: boolean;
}) {
  const pathname = usePathname();
  // Hooks must run on every render, including the bare /login branch below.
  const dock = useAIDock();

  if (isBareRoute(pathname)) {
    return (
      <div className="v2-root v2-safe relative min-h-screen">
        <div className="absolute right-4 top-4 z-20 sm:right-8 sm:top-7">
          <LanguageSwitcher />
        </div>
        <main className="relative z-10">{children}</main>
        <FirstRunFlow />
      </div>
    );
  }

  return (
    <div className="v2-root v2-safe min-h-screen">
      {/* Desktop rail — fixed, full height. */}
      <Rail pathname={pathname ?? "/"} />

      {/* The docked assistant takes real width off the right; hand it over so
          no card hides behind it. 0 on phones and when collapsed. */}
      <div
        className={cn(
          "md:pl-64",
          dock.dragging ? "" : "transition-[padding] duration-300 ease-out",
        )}
        style={{ paddingRight: dock.push || undefined }}
      >
        {/* F-1 (2026-08-25, J #15 #8): max-w-4xl here silently capped EVERY
            page at 896px — the money chrome asks for 5xl, the calendar for
            7xl, and both were being squeezed without anyone's page saying so.
            The shell is now the widest bound (7xl); each page's own container
            decides its real width, which is where that decision belongs. */}
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-4 sm:px-6 md:pb-10 md:pt-6">
          {/* Phone-only top bar; search for md+ */}
          <MobileTopBar />
          <div className="hidden md:block">
            <TopSearch />
          </div>
          <div className="mt-4 md:mt-6">{children}</div>
        </main>
      </div>

      {/* Phone tab bar — the same four entries as the rail. */}
      <TabBar pathname={pathname ?? "/"} />

      {showAiLauncher && (
        <AIDock
          dock={dock}
          initialRemaining={aiRemaining}
          initialUsedPct={aiUsedPct}
          blocked={aiBlocked}
        />
      )}
      <FirstRunFlow />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop rail
// ---------------------------------------------------------------------------

function railEntryChildren(entry: NavEntry, einvoisVisible: boolean): NavItem[] {
  // E-2: rail-only steps (attendance, the document, receipts, custody) are
  // navigated by the section's own tab rail; the menu lists the jobs. The
  // shared filter lives in nav-items.ts so /more cannot disagree.
  return visibleGroupChildren(entry, einvoisVisible);
}

function Rail({ pathname }: { pathname: string }) {
  const [einvoisVisible] = useEinvoisVisible();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[color:var(--v2-border)] bg-[color:var(--v2-card)] md:flex"
      aria-label="Navigation"
    >
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--v2-primary-fill)] text-lg font-bold text-white">
          M
        </span>
        <span className="text-xl font-semibold tracking-tight">Minit</span>
      </div>

      <nav className="v2-scroll flex-1 overflow-y-auto px-3">
        {/* B-1 (J 8/26 #3, 拍板④): SEVEN groups, spread out. Group names are
            HEADINGS — not clickable, always expanded. No "More" drawer. */}
        <ul className="flex flex-col gap-1">
          {SIDEBAR_NAV.map((entry) => {
            if (entry.kind === "item") {
              const active = isActivePath(pathname, entry.item.href, entry.item.exact);
              const Icon = entry.item.icon;
              return (
                <li key={entry.item.href}>
                  <Link
                    href={entry.item.href}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors",
                      active
                        ? "bg-[color:var(--v2-primary-fill)] text-white"
                        : "text-[color:var(--v2-text)] hover:bg-[color:var(--v2-primary-soft)]",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                    <Tri bm={entry.item.bm} zh={entry.item.zh} en={entry.item.en} />
                  </Link>
                </li>
              );
            }

            const children = railEntryChildren(entry, einvoisVisible);
            const GroupIcon = entry.icon;
            // Lights while you are ANYWHERE inside the group — including the
            // rail-only steps (/minutes/attendance …) that render no row here,
            // so the sidebar never goes silent about where you are.
            const groupActive = groupHasActiveChild(entry, pathname);
            return (
              <li key={entry.id} className="mt-2">
                {/* A heading, deliberately NOT a link (拍板④ "組名不可點"):
                    every destination is one of the rows right below it, so a
                    clickable header would be a second door to the same room. */}
                <div
                  className={cn(
                    "flex min-h-8 items-center gap-2 px-3 text-sm font-semibold uppercase tracking-wide",
                    groupActive
                      ? "text-[color:var(--v2-primary)]"
                      : "text-[color:var(--v2-text-soft)]",
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <Tri bm={entry.bm} zh={entry.zh} en={entry.en} />
                </div>
                {/* Always expanded — a group that hides its rows until you are
                    inside it is a junk drawer with extra steps. */}
                <ul className="flex flex-col gap-0.5">
                  {children.map((child) => {
                    const active = isActivePath(pathname, child.href, child.exact);
                    const ChildIcon = child.icon;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={cn(
                            "flex min-h-10 items-center gap-3 rounded-xl px-3 pl-5 text-[0.95rem] transition-colors",
                            active
                              ? "bg-[color:var(--v2-primary-fill)] font-medium text-white"
                              : "text-[color:var(--v2-text)] hover:bg-[color:var(--v2-primary-soft)]",
                          )}
                        >
                          <ChildIcon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} />
                          <Tri bm={child.bm} zh={child.zh} en={child.en} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[color:var(--v2-border)] p-3">
        <OrgChip />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Phone chrome
// ---------------------------------------------------------------------------

function MobileTopBar() {
  const { org } = useActiveOrg();
  return (
    <header className="flex items-center justify-between gap-3 md:hidden">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--v2-primary-fill)] text-base font-bold text-white">
          M
        </span>
        <span className="text-lg font-semibold tracking-tight">Minit</span>
      </div>
      {org && (
        <span className="max-w-[55%] truncate text-sm text-[color:var(--v2-text-soft)]">
          {org.name}
          {org.is_demo && (
            <span className="ml-1 rounded bg-amber-500 px-1 text-xs font-bold text-white">
              DEMO
            </span>
          )}
        </span>
      )}
    </header>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-card)] pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navigation"
    >
      <ul className="grid grid-cols-4">
        {PRIMARY_NAV.map((entry) => {
          const isItem = entry.kind === "item";
          const href = isItem
            ? entry.item.href
            : entry.id === "more"
              ? "/more"
              : entry.children[0].href;
          const Icon = isItem ? entry.item.icon : entry.icon;
          const words = isItem
            ? { bm: entry.item.bm, zh: entry.item.zh, en: entry.item.en }
            : { bm: entry.bm, zh: entry.zh, en: entry.en };
          const active = isItem
            ? isActivePath(pathname, entry.item.href, entry.item.exact)
            : entry.id === "more"
              ? pathname === "/more" || groupHasActiveChild(entry, pathname)
              : groupHasActiveChild(entry, pathname);
          return (
            <li key={isItem ? entry.item.href : entry.id}>
              <Link
                href={href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active
                    ? "text-[color:var(--v2-primary)]"
                    : "text-[color:var(--v2-text-soft)]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                <Tri bm={words.bm} zh={words.zh} en={words.en} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
