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
import { ChevronDown, Wrench } from "lucide-react";
import { usePathname } from "next/navigation";
import { LanguageSwitcher, Tri } from "@/components/language-provider";
import { FirstRunFlow } from "@/components/first-run-flow";
import { usePersistentState } from "@/lib/use-persistent-state";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND_NAME } from "@/lib/brand";
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

/** Routes rendered without nav/search/theme chrome. C-7 (work order 31, 客①):
 *  the legal pages joined — a Terms page inside the app shell, with a sidebar
 *  and a search bar, read like an app screen instead of a document. They keep
 *  their own "back to sign in" link (legal-document.tsx). */
const BARE_ROUTES = ["/login", "/reset-password", "/terms", "/privacy"];

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
  showAdmin = false,
}: {
  children: React.ReactNode;
  showAiLauncher: boolean;
  aiRemaining: number | null;
  /** Share of the monthly free quota already spent, 0–100. null = unknown. */
  aiUsedPct: number | null;
  aiBlocked: boolean;
  /** P-4: server-decided "may this session see the Ops console row?". A
   *  boolean only — the operator list itself never reaches the client, and
   *  /admin keeps its own fail-closed 404 whatever this says. */
  showAdmin?: boolean;
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
      <Rail pathname={pathname ?? "/"} showAdmin={showAdmin} />

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
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 md:pb-10">
          {/* B-2 (work order 32 §2B, avocado): the top bar STAYS while you
              scroll — search, language, theme and the account menu used to
              vanish two lines down the page. Solid card background, no
              backdrop-filter (the blur was killed deliberately — Stage R). */}
          <div className="sticky top-0 z-30 -mx-4 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-card)] px-4 py-2.5 sm:-mx-6 sm:px-6 md:py-3">
            {/* Phone-only top bar; search for md+ */}
            <MobileTopBar />
            <div className="hidden md:block">
              <TopSearch />
            </div>
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

/**
 * C-1 (拍板 30): which sidebar groups this DEVICE has folded shut. Groups are
 * OPEN unless the person closed them (`true` = closed), so a brand-new group
 * added later starts open without a migration of anybody's stored blob.
 * A device preference like text size — deliberately not org-scoped.
 */
const CLOSED_GROUPS_KEY = "minit.sidebar.closed.v1";
const isClosedMap = (parsed: unknown): boolean =>
  typeof parsed === "object" &&
  parsed !== null &&
  !Array.isArray(parsed) &&
  Object.values(parsed as Record<string, unknown>).every(
    (v) => typeof v === "boolean",
  );

function Rail({ pathname, showAdmin }: { pathname: string; showAdmin: boolean }) {
  const [einvoisVisible] = useEinvoisVisible();
  const [closed, setClosed] = usePersistentState<Record<string, boolean>>(
    CLOSED_GROUPS_KEY,
    {},
    isClosedMap,
  );
  const toggleGroup = (id: string) =>
    setClosed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[color:var(--v2-border)] bg-[color:var(--v2-card)] md:flex"
      aria-label="Navigation"
    >
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        {/* P1 (拍板 0-8): the green "two people = M" logo replaces the
            letter tile. The PNG carries its own rounded corners. */}
        <BrandLogo size={36} className="h-9 w-9" />
        <span className="text-xl font-semibold tracking-tight">{BRAND_NAME}</span>
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
                      "flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium transition-colors",
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
            const isOpen = !closed[entry.id];
            return (
              <li key={entry.id} className="mt-2">
                {/* C-1 (拍板 30, amending 拍板④'s "組名不可點"): the heading is
                    a FOLD control now — never a navigation link. Default open;
                    this device remembers what was closed. */}
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-sm px-3 text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-[color:var(--v2-primary-soft)]",
                    groupActive
                      ? "text-[color:var(--v2-primary)]"
                      : "text-[color:var(--v2-text-soft)]",
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <Tri bm={entry.bm} zh={entry.zh} en={entry.en} />
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0 transition-transform",
                      isOpen ? "" : "-rotate-90",
                    )}
                    strokeWidth={2}
                  />
                </button>
                {/* Folded away is folded away — but the header above keeps its
                    active colour, so a closed group never goes silent about
                    holding the page you are on. */}
                <ul className={cn("flex flex-col gap-0.5", isOpen ? "" : "hidden")}>
                  {children.map((child) => {
                    const active = isActivePath(pathname, child.href, child.exact);
                    const ChildIcon = child.icon;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={cn(
                            "flex min-h-10 items-center gap-3 rounded-md px-3 pl-5 text-[0.95rem] transition-colors",
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

      {/* P-4: the operator's door — only rendered when the SERVER said so.
          Not part of SIDEBAR_NAV: it is not a customer page, and the nav
          tests rightly insist every listed page is for everyone. */}
      {showAdmin && (
        <div className="border-t border-[color:var(--v2-border)] px-3 py-2">
          <Link
            href="/admin"
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-md px-3 text-[0.95rem] transition-colors",
              isActivePath(pathname, "/admin", true)
                ? "bg-[color:var(--v2-primary-fill)] font-medium text-white"
                : "text-[color:var(--v2-text)] hover:bg-[color:var(--v2-primary-soft)]",
            )}
          >
            <Wrench className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} />
            <Tri bm="Konsol operasi" zh="管理台" en="Ops console" />
          </Link>
        </div>
      )}

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
        <BrandLogo size={32} className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight">{BRAND_NAME}</span>
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
