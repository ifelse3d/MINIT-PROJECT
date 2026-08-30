"use client";

// ---------------------------------------------------------------------------
// v3 APP SHELL — violet redesign (J 8/27 下午: 「design 換差不多這樣，但功能
// 還是用我們自己的」). Meta-style ICON RAIL + sticky glass top bar.
//
// ≥1024px: a fixed left rail — 68px collapsed (icons + tooltips), 248px
//   expanded (icons + labels + uppercase group headings). State lives in
//   localStorage ("minit.rail.collapsed"); a boot script in layout.tsx sets
//   the .minit-rail-expanded class on <html> BEFORE first paint, and CSS
//   owns label visibility, so the first paint is never wrong. `[` toggles.
// <1024px: the rail hides; the top bar grows a hamburger that opens the
//   same nav as an overlay drawer (always label-visible — that is how touch
//   users get what hover gives mouse users). The phone keeps its four-tab
//   bottom bar (<768px) untouched — J's 拍板④.
//
// The nav CONTENT stays OURS (拍板④'s groups, amended §1-9): the spec
// restyles the shell, it does not re-decide J's grouping. Settings pins to
// the rail bottom (§3.2); the settings pages live in SETTINGS_NAV (§7).
//
// /login and the legal pages render bare: just the language chips.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Wrench,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { LanguageSwitcher, Tri, useTriText } from "@/components/language-provider";
import { FirstRunFlow } from "@/components/first-run-flow";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND_NAME } from "@/lib/brand";
import { AppTooltipProvider, IconTip } from "@/components/ui/tooltip";
import {
  PRIMARY_NAV,
  SIDEBAR_NAV,
  groupHasActiveChild,
  isActivePath,
  visibleGroupChildren,
  type EinvoisGate,
  type NavEntry,
  type NavItem,
} from "@/components/nav-items";
import { EinvoisBetaBadge } from "@/components/einvois-beta-badge";
import { useEinvoisOperator, useEinvoisVisible } from "@/lib/einvois-pref";
import { cn } from "./surfaces";
import { TopBar } from "./top-bar";
import { AIDock, useAIDock } from "./ai-dock";

/** Routes rendered without nav/search/theme chrome. C-7 (work order 31, 客①):
 *  the legal pages joined — a Terms page inside the app shell, with a sidebar
 *  and a search bar, read like an app screen instead of a document. They keep
 *  their own "back to sign in" link (legal-document.tsx). */
const BARE_ROUTES = [
  "/login",
  "/reset-password",
  "/terms",
  "/privacy",
  // 87 ①: a donor scanning a receipt QR has no account — no app chrome.
  "/verify/resit",
];

function isBareRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

const RAIL_KEY = "minit.rail.collapsed";
/** J's launch feedback #2 (2026-08-27 evening): the sidebar groups are
 *  DROPDOWNS, closed by default — only the group holding the current page
 *  opens itself. A person's own toggles are remembered per device. */
const GROUPS_KEY = "minit.nav.groups.v1";

/** G3-3 (work order 68, J #7): unfinished cloud-draft count for the
 *  "New minutes" nav badge. Context, not prop-drilling — RailItem sits three
 *  layers under AppShell and only the /minutes row cares. */
const DraftsCountContext = createContext<number | null>(null);

export function AppShell({
  children,
  showAiLauncher,
  aiRemaining,
  aiUsedPct,
  aiBlocked,
  showAdmin = false,
  minutesDraftsCount = null,
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
  /** G3-3: unfinished workspace drafts (null = unknown → no badge). */
  minutesDraftsCount?: number | null;
}) {
  const pathname = usePathname();
  // Hooks must run on every render, including the bare /login branch below.
  const dock = useAIDock();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer closes on route change (§3.4). setTimeout(0): the eslint
  // baseline forbids synchronous setState in an effect (STATE §6).
  useEffect(() => {
    const id = setTimeout(() => setDrawerOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

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

  // J's launch feedback #12: inside /settings the MAIN rail hides — two
  // sidebars side by side read as clutter. The settings sub-sidebar becomes
  // THE left column, with its own "back to the app" row (settings-nav.tsx).
  const inSettings = (pathname ?? "").startsWith("/settings");

  return (
    <AppTooltipProvider>
      <DraftsCountContext.Provider value={minutesDraftsCount}>
      <div className="v2-root v2-safe min-h-screen">
        {/* Desktop icon rail — fixed, full height, ≥1024px. */}
        {!inSettings && <Rail pathname={pathname ?? "/"} showAdmin={showAdmin} />}

        {/* Overlay drawer for <1024px — the expanded rail, floating. */}
        {drawerOpen && (
          <NavDrawer
            pathname={pathname ?? "/"}
            showAdmin={showAdmin}
            onClose={() => setDrawerOpen(false)}
          />
        )}

        {/* One animated offset: the wrapper follows --rail-w (§3.1). */}
        <div className={cn("rail-anim", !inSettings && "lg:ml-[var(--rail-w)]")}>
          {/* §5.2: the bar is the first child of the offset wrapper — sticky,
              full width of the content column. The docked assistant pushes
              only the CONTENT below (the inner div): the bar keeps the whole
              column and the dock opens under its bottom edge (46 §0-2, J's
              red pen — the panel must never cover Home/search/EN/moon/avatar). */}
          <TopBar pathname={pathname ?? "/"} onOpenDrawer={() => setDrawerOpen(true)} />
          {/* F-1 (2026-08-25): the shell is the widest bound (7xl); each
              page's own container decides its real width.
              @container (2026-08-28, J #1 "14寸 LAPTOP 不好看"): the rail
              takes 248px and the AI dock up to 640px off this column, so
              viewport breakpoints lie about the room actually available —
              a 14" laptop with the assistant open showed FOUR card columns
              in phone-width space. Width-sensitive grids below use
              container variants (@md:/@3xl:/…), which measure THIS column. */}
          <div
            className={cn(dock.dragging ? "" : "transition-[padding] duration-300 ease-out")}
            style={{ paddingRight: dock.push || undefined }}
          >
            <main className="@container mx-auto w-full max-w-7xl px-4 pb-24 pt-4 sm:px-6 md:pb-10 md:pt-6">
              {children}
            </main>
          </div>
        </div>

        {/* Phone tab bar — the same four entries as ever (拍板④). */}
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
      </DraftsCountContext.Provider>
    </AppTooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// The nav list — shared verbatim by the rail (collapsible) and the drawer
// (always expanded). `collapsed` only controls tooltips: label VISIBILITY is
// CSS-driven off the <html> class, so hydration can never disagree with the
// boot script.
// ---------------------------------------------------------------------------

function railEntryChildren(entry: NavEntry, einvois: EinvoisGate): NavItem[] {
  // E-2: rail-only steps (attendance, the document) are navigated by the
  // section's own tab rail; the menu lists the jobs.
  return visibleGroupChildren(entry, einvois);
}

function RailItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const t = useTriText();
  const active = isActivePath(pathname, item.href, item.exact);
  const draftsCount = useContext(DraftsCountContext);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rail-item relative flex min-h-10 items-center gap-3 rounded-sm px-3 text-base transition-colors",
        active
          ? "bg-[color:var(--v2-primary-soft)] font-medium text-[color:var(--v2-primary)]"
          : "text-[color:var(--v2-text)] hover:bg-[color:var(--v2-card-nested)]",
      )}
    >
      {/* §3.2: the 3px accent edge bar, flush to the rail's left edge. */}
      {active && (
        <span
          aria-hidden
          className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-[2px] bg-[color:var(--v2-accent)]"
        />
      )}
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
      {/* #13 (J review 27-evening): wrap, never "Spending & cl…" — a label
          the person cannot read is not a label. */}
      <span className="rail-label min-w-0 break-words py-1 leading-snug">
        <Tri bm={item.bm} zh={item.zh} en={item.en} />
      </span>
      {/* D49: e-Invois entries wear the BETA pill (operator-only surface). */}
      {item.beta && (
        <span className="rail-label ml-auto">
          <EinvoisBetaBadge />
        </span>
      )}
      {/* G3-3 (J #7): "you started something" — the unfinished-drafts count
          on the New minutes row. Amber like every other waiting-for-you
          marker; absent when zero or unknown. */}
      {item.href === "/minutes" && draftsCount !== null && draftsCount > 0 && (
        <span
          className="rail-label ml-auto rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white dark:bg-amber-400 dark:text-black"
          title={t(
            `${draftsCount} minit belum siap`,
            `${draftsCount} 份没写完`,
            `${draftsCount} unfinished`,
          )}
        >
          {draftsCount}
        </span>
      )}
    </Link>
  );
  // §4.3: every collapsed rail icon shows its full label on hover/focus.
  return collapsed ? (
    <IconTip label={t(item.bm, item.zh, item.en)} side="right">
      {link}
    </IconTip>
  ) : (
    link
  );
}

function RailNav({
  pathname,
  collapsed,
}: {
  pathname: string;
  /** true = icons only (tooltips on); the drawer always passes false. */
  collapsed: boolean;
}) {
  const [einvoisVisible] = useEinvoisVisible();
  const einvoisOperator = useEinvoisOperator();
  // #2: which groups the person has opened/closed BY HAND on this device.
  // null until read — before that, only the active group is open, which is
  // also what the server renders, so hydration always agrees.
  const [chosen, setChosen] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    // External mailbox read, deferred a tick (frozen eslint baseline).
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem(GROUPS_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
        setChosen(typeof parsed === "object" && parsed !== null ? parsed : {});
      } catch {
        setChosen({});
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function toggleGroup(id: string, isOpen: boolean) {
    setChosen((prev) => {
      const next = { ...(prev ?? {}), [id]: !isOpen };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* storage disabled: the session still works, it just forgets */
      }
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {SIDEBAR_NAV.map((entry) => {
        if (entry.kind === "item") {
          return (
            <li key={entry.item.href}>
              <RailItem item={entry.item} pathname={pathname} collapsed={collapsed} />
            </li>
          );
        }
        const children = railEntryChildren(entry, {
          visible: einvoisVisible,
          operator: einvoisOperator,
        });
        const groupActive = groupHasActiveChild(entry, pathname);
        // Closed by default; the active group opens itself; a hand toggle
        // (remembered) wins. In icon-rail mode there is no room for a
        // dropdown — every icon stays visible, as before.
        const isOpen =
          collapsed || (chosen?.[entry.id] ?? groupActive);
        return (
          <li key={entry.id} className="mt-1.5">
            {/* Expanded: a dropdown header. Collapsed: a 1px divider —
                never truncated initials (§3.2). Both stay in the DOM; CSS
                decides which shows. */}
            <button
              type="button"
              onClick={() => toggleGroup(entry.id, isOpen)}
              aria-expanded={isOpen}
              className={cn(
                // #15 (J review 27-evening): 11px group headers were unreadably
                // small next to 16px items, worst in Chinese. One size up.
                "rail-group-label flex w-full items-center justify-between rounded-sm px-3 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors hover:bg-[color:var(--v2-card-nested)]",
                groupActive
                  ? "text-[color:var(--v2-primary)]"
                  : "text-[color:var(--v2-text-soft)]",
              )}
            >
              <Tri bm={entry.bm} zh={entry.zh} en={entry.en} />
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  isOpen ? "" : "-rotate-90",
                )}
                strokeWidth={2.2}
              />
            </button>
            <div
              aria-hidden
              className="rail-group-divider mx-2 my-2 border-t border-[color:var(--v2-border)]"
            />
            {isOpen && (
              <ul className="flex flex-col gap-0.5">
                {children.map((child) => (
                  <li key={child.href}>
                    <RailItem item={child} pathname={pathname} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The bottom block: Ops console (operators only) + pinned Settings +
 *  collapse toggle (rail only). */
function RailFoot({
  pathname,
  showAdmin,
  collapsed,
  onToggle,
}: {
  pathname: string;
  showAdmin: boolean;
  collapsed: boolean;
  onToggle?: () => void;
}) {
  const t = useTriText();
  return (
    <div className="border-t border-[color:var(--v2-border)] px-3 py-2">
      <ul className="flex flex-col gap-0.5">
        {showAdmin && (
          <li>
            <RailItem
              item={{
                href: "/admin",
                icon: Wrench,
                bm: "Konsol operasi",
                zh: "管理台",
                en: "Ops console",
              }}
              pathname={pathname}
              collapsed={collapsed}
            />
          </li>
        )}
        {/* §3.2: Settings pinned to the rail bottom — always one click away,
            out of the records list. The settings pages open with their own
            sub-sidebar (§7). */}
        <li>
          <RailItem
            item={SETTINGS_ITEM}
            pathname={pathname}
            collapsed={collapsed}
          />
        </li>
        {onToggle && (
          <li>
            <IconTip
              label={`${collapsed ? t("Kembangkan", "展开", "Expand") : t("Runtuhkan", "收起", "Collapse")}  [`}
              side="right"
            >
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-label={collapsed ? t("Kembangkan", "展开", "Expand") : t("Runtuhkan", "收起", "Collapse")}
                className="rail-item flex min-h-10 w-full items-center gap-3 rounded-sm px-3 text-base text-[color:var(--v2-text-soft)] transition-colors hover:bg-[color:var(--v2-card-nested)]"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                ) : (
                  <PanelLeftClose className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                )}
                <span className="rail-label">
                  {collapsed ? (
                    <Tri bm="Kembangkan" zh="展开" en="Expand" />
                  ) : (
                    <Tri bm="Runtuhkan" zh="收起" en="Collapse" />
                  )}
                </span>
              </button>
            </IconTip>
          </li>
        )}
      </ul>
    </div>
  );
}

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  icon: SettingsIcon,
  bm: "Tetapan",
  zh: "设置",
  en: "Settings",
};

function Rail({ pathname, showAdmin }: { pathname: string; showAdmin: boolean }) {
  // Mirrors the <html> class AFTER mount — the class (set pre-paint by the
  // boot script) is the truth; this state only drives tooltips + the toggle
  // icon. Until mount we assume collapsed, which merely means tooltips are
  // armed a beat early.
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    // Reading an external mailbox (the <html> class the boot script set):
    // deferred a tick, per the frozen eslint baseline (STATE §6).
    const id = setTimeout(
      () =>
        setCollapsed(
          !document.documentElement.classList.contains("minit-rail-expanded"),
        ),
      0,
    );
    return () => clearTimeout(id);
  }, []);

  const toggle = () => {
    const nowCollapsed = document.documentElement.classList.toggle("minit-rail-expanded")
      ? false
      : true;
    setCollapsed(nowCollapsed);
    // §3.1 rule 3: written only when the user toggles — never on resize.
    try {
      localStorage.setItem(RAIL_KEY, nowCollapsed ? "1" : "0");
    } catch {
      /* storage disabled: the session still works, it just forgets */
    }
  };

  // `[` toggles the rail (§3.3) — outside inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "[" && !typing) toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      className="rail-anim rail-collapsible fixed inset-y-0 left-0 z-30 hidden w-[var(--rail-w)] flex-col border-r border-[color:var(--v2-border)] bg-[color:var(--v2-card)] lg:flex"
      aria-label="Navigation"
    >
      <div className="rail-item flex items-center gap-2.5 px-3 pb-3 pt-4">
        <Link href="/" aria-label={BRAND_NAME} className="flex items-center gap-2.5">
          <BrandLogo size={32} className="h-8 w-8 shrink-0" />
          <span className="rail-label text-lg font-semibold tracking-tight">
            {BRAND_NAME}
          </span>
        </Link>
      </div>

      <nav className="v2-scroll flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
        <RailNav pathname={pathname} collapsed={collapsed} />
      </nav>

      <RailFoot
        pathname={pathname}
        showAdmin={showAdmin}
        collapsed={collapsed}
        onToggle={toggle}
      />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// The <1024px drawer (§3.4): the expanded rail as an overlay. Label-visible
// always — that is how touch users get what hover gives mouse users.
// ---------------------------------------------------------------------------

function NavDrawer({
  pathname,
  showAdmin,
  onClose,
}: {
  pathname: string;
  showAdmin: boolean;
  onClose: () => void;
}) {
  const t = useTriText();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(21,18,31,0.45)] lg:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Menu", "菜单", "Menu")}
        className="flex h-full w-[280px] flex-col bg-[color:var(--v2-card)] shadow-[var(--v2-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-4">
          <span className="flex items-center gap-2.5">
            <BrandLogo size={32} className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">{BRAND_NAME}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Tutup", "关闭", "Close")}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-[color:var(--v2-text-soft)] hover:bg-[color:var(--v2-card-nested)]"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <nav className="v2-scroll flex-1 overflow-y-auto px-3 pb-2">
          <RailNav pathname={pathname} collapsed={false} />
        </nav>
        <RailFoot pathname={pathname} showAdmin={showAdmin} collapsed={false} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone tab bar — untouched (拍板④: 4 tabs).
// ---------------------------------------------------------------------------

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
