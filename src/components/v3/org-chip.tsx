"use client";

// ---------------------------------------------------------------------------
// The signed-in identity hooks (useAuthEmail / useActiveOrg). The active-org
// cookie holds only an org id; the org NAME is fetched through the
// RLS-protected browser client, so a tampered cookie shows nothing. The
// OrgChip and gear-menu components that used to live here were retired by
// the violet redesign (§5.2–5.4) — see profile-menu.tsx.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/db/supabase-browser";

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

// OrgChip and the gear AccountControls were retired by the violet redesign
// (§5.2-5.4): the org context lives in the profile avatar's dropdown
// (profile-menu.tsx), which is what allowed the rail-footer org block and
// the top-bar gear to go. The hooks above are their surviving, shared part.
