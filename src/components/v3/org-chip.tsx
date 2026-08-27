"use client";

// ---------------------------------------------------------------------------
// Account chrome for the Studio shell: the active-org chip (tap to switch on
// /orgs, with DEMO badge) and the settings/sign-out controls. Renders nothing
// while logged out (e.g. on /login). The active-org cookie holds only an org
// id; the org NAME is fetched through the RLS-protected browser client, so a
// tampered cookie shows nothing.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { NAV_ITEMS, isActivePath, type NavItem } from "@/components/nav-items";

// The two account rows this popover offers. They also live under More in the
// primary nav; this popover is the shortcut version next to the org name.
const ACCOUNT_ROWS: NavItem[] = ["/orgs", "/settings"].map((href) => {
  const found = NAV_ITEMS.find((i) => i.href === href);
  if (!found) throw new Error(`No NavItem for ${href}`);
  return found;
});
import { getSupabaseBrowser } from "@/db/supabase-browser";
import { SignOutConfirm } from "@/components/sign-out-confirm";
import { cn } from "./surfaces";

function readActiveOrgId(): number | null {
  const match = document.cookie.match(/(?:^|;\s*)minit_active_org=(\d+)/);
  return match ? Number(match[1]) : null;
}

/** The signed-in user's email, kept fresh across auth changes. */
export function useAuthEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setEmail(user?.email ?? null);
    }
    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
  return email;
}

// signOutToLogin moved to ./sign-out.ts (B-1: the confirm dialog needed to
// import it without a circular import). Sign-out buttons open SignOutConfirm.

/** Active org name + DEMO badge, kept fresh across auth changes. */
export function useActiveOrg(): {
  email: string | null;
  org: { name: string; is_demo: boolean } | null;
  /**
   * How many organisations this person can reach, counted no higher than 2 —
   * the only question anyone asks of it is "one, or more than one". `null`
   * until it is known, so nothing is decided on a guess.
   */
  orgCount: number | null;
} {
  const email = useAuthEmail();
  const [org, setOrg] = useState<{ name: string; is_demo: boolean } | null>(
    null,
  );
  const [orgCount, setOrgCount] = useState<number | null>(null);

  useEffect(() => {
    if (!email) {
      setOrg(null);
      setOrgCount(null);
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseBrowser();
    const orgId = readActiveOrgId();

    // RLS decides what is visible, so this counts exactly what the person may
    // actually reach. `limit(2)` because the answer is a yes/no dressed up as
    // a number, and an unbounded count on every page load is not free.
    supabase
      .from("orgs")
      .select("id")
      .limit(2)
      .then(({ data }) => {
        if (!cancelled && data) setOrgCount(data.length);
      });

    // Same resolution order as the server's getActiveOrg(): cookie value (if
    // it still points at a reachable org) → first direct membership → null.
    // A fresh browser session has no cookie yet the server still resolves an
    // org, so stopping at the cookie made this chip say "name your
    // organisation" right next to a header printing the org's name.
    async function loadOrg() {
      if (orgId !== null) {
        const { data } = await supabase
          .from("orgs")
          .select("name, is_demo")
          .eq("id", orgId)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setOrg(data as { name: string; is_demo: boolean });
          return;
        }
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setOrg(null);
        return;
      }
      // members_roles is org-visible under RLS, so filter to OUR rows —
      // exactly what the server's getMemberships() does. Ordered by org_id to
      // match its "first membership" (see active-org.ts), and — also like it —
      // skipping orphan rows whose org was deleted (the join returns null), so
      // both sides land on the same first REACHABLE org. No limit: a person's
      // own memberships are a handful of rows, and the server reads them all.
      const { data: rows } = await supabase
        .from("members_roles")
        .select("org:orgs (name, is_demo)")
        .eq("user_id", user.id)
        .order("org_id");
      if (cancelled) return;
      const first = (
        rows as { org: { name: string; is_demo: boolean } | null }[] | null
      )?.find((r) => r.org !== null);
      setOrg(first?.org ?? null);
    }
    loadOrg();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return { email, org, orgCount };
}

/**
 * Which organisation everything you record belongs to.
 *
 * 2026-07-28, user: "choose org 就不需要放在 sidebar，为什么会有 choose org 呢？"
 * The old version was a pill reading "Choose org" — which reads as a task you
 * have to do, sitting under the navigation, forever. It is not a task: it is a
 * FACT the person needs to see ("am I recording into HQ or into the branch?").
 * So it now shows the name with a label, and only asks you to choose when there
 * genuinely is no organisation yet. Switching lives in the gear menu with the
 * other account actions.
 *
 * `compact` renders a single-initial avatar instead, for the collapsed sidebar
 * rail where there is no room for a name.
 */
export function OrgChip({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { email, org } = useActiveOrg();
  const t = useTriText();
  if (!email) return null;

  if (compact) {
    const initial = org?.name?.trim().charAt(0).toUpperCase() ?? "?";
    return (
      <Link
        href="/orgs"
        title={org ? `${org.name}${org.is_demo ? " · DEMO" : ""}` : t("Pilih pertubuhan", "选择组织", "Choose org")}
        aria-label={org?.name ?? t("Pilih pertubuhan", "选择组织", "Choose org")}
        className={cn(
          "v2-glass relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-[color:var(--v2-text)] transition-transform hover:scale-105",
          className,
        )}
      >
        {initial}
        {org?.is_demo && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-black/40"
          />
        )}
      </Link>
    );
  }

  // No organisation yet: this IS a task, so it stays a button.
  if (!org) {
    return (
      <Link
        href="/orgs"
        className={cn(
          "flex min-h-12 items-center justify-center rounded-md border-2 border-[#a855f7]/50 bg-white/80 px-4 text-base font-semibold text-[color:var(--v2-text)] dark:bg-white/10",
          className,
        )}
      >
        <Tri
          bm="Namakan pertubuhan anda"
          zh="填写您的机构名称"
          en="Name your organisation"
        />
      </Link>
    );
  }

  // There IS an organisation: show it — and let it be TAPPED. A-5 (work
  // order 31, J #1): the old card was a dead label reading 「您正在记录的机构
  // J」; the one thing someone wants at that moment is to go manage/switch it,
  // and the card refused the tap. Now: "当前机构：J · 切换 →", a link to /orgs.
  return (
    <Link
      href="/orgs"
      className={cn(
        "block rounded-md bg-white/60 px-3.5 py-2.5 transition-colors hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/20",
        className,
      )}
    >
      <p className="text-sm text-[color:var(--v2-text-soft)]">
        <Tri bm="Pertubuhan semasa" zh="当前机构" en="Current organisation" />
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-[color:var(--v2-text)]">
          {org.name}
        </span>
        {org.is_demo && (
          <span className="rounded-xs bg-amber-500 px-2 py-0.5 text-sm font-bold text-white">
            DEMO
          </span>
        )}
        <span className="text-sm text-[color:var(--v2-text-soft)]">
          <Tri bm="Tukar" zh="切换" en="Switch" /> →
        </span>
      </p>
    </Link>
  );
}

/**
 * The account menu: one gear button that opens History / Organisations /
 * Settings / Sign out. These used to be sidebar rows (and Settings was in BOTH
 * places) — moving them here keeps the sidebar to the six pages you work in.
 * Hidden while logged out.
 */
export function AccountControls({ className }: { className?: string }) {
  const { email, org, orgCount } = useActiveOrg();
  const t = useTriText();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // B-1 (work order 32): sign-out asks first — it clears local data.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — a plain popover, no extra dependency.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!email) return null;

  /**
   * 2026-08-19, user: "organisation 那边为什么是 switch".
   *
   * Because a secretary can run the head office and a branch at once — but for
   * everyone who cannot, "Switch organisation" is a control offering a choice
   * that does not exist, sitting in the menu forever. So when there is exactly
   * one, the row goes back to being the page's own name and the organisation
   * is simply NAMED above it, which is the fact the person wanted anyway.
   *
   * The row is not removed. It is the only way to reach /orgs/new, so hiding
   * it would mean nobody with one society could ever add their branch — and
   * `menusCoverAllItems()` guards against a page falling out of every menu.
   */
  const soleOrg = orgCount !== null && orgCount <= 1;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("Akaun", "账户", "Account")}
        className="v2-glass flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--v2-text)] transition-transform hover:scale-105"
      >
        <Settings className="h-5 w-5" strokeWidth={1.7} />
      </button>

      {open && (
        <div
          role="menu"
          className="v2-glass absolute right-0 top-13 z-50 w-56 overflow-hidden rounded-md p-1.5 shadow-[0_24px_60px_-20px_rgba(33,31,51,0.45)]"
        >
          <p className="truncate px-3 pt-2 text-base text-[color:var(--v2-text-soft)]">
            {email}
          </p>
          {soleOrg && org && (
            <p className="truncate px-3 pb-2 text-base font-semibold text-[color:var(--v2-text)]">
              {org.name}
            </p>
          )}
          {!soleOrg && <div className="pb-2" />}
          {ACCOUNT_ROWS.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors",
                  active
                    ? "bg-[color:var(--v2-primary-fill)] text-white"
                    : "text-[color:var(--v2-text)] hover:bg-white/60 dark:hover:bg-white/10",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                {item.href === "/orgs" && !soleOrg ? (
                  // Spelled out: from here you SWITCH which organisation you are
                  // recording into, which is what people actually come here for.
                  // Only when there IS more than one — see `soleOrg` above.
                  <Tri
                    bm="Tukar pertubuhan"
                    zh="切换机构"
                    en="Switch organisation"
                  />
                ) : (
                  <Tri bm={item.bm} zh={item.zh} en={item.en} />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirmSignOut(true);
            }}
            className="mt-1 flex w-full items-center gap-3 rounded-md border-t border-white/40 px-3 py-2.5 text-sm font-medium text-[color:var(--v2-text-soft)] transition-colors hover:bg-white/60 dark:border-white/10 dark:hover:bg-white/10"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <Tri bm="Keluar" zh="退出" en="Sign out" />
          </button>
        </div>
      )}
      <SignOutConfirm open={confirmSignOut} onClose={() => setConfirmSignOut(false)} />
    </div>
  );
}
