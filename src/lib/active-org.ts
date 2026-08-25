// Server helpers for "which organisation am I working in right now?"
//
// The active org is a plain cookie holding an org id. It is NOT a security
// boundary — RLS is. Even if someone edits the cookie to another org's id,
// every query still goes through the user-scoped client, and the database
// returns nothing they are not entitled to see.
import "server-only";

import { cookies } from "next/headers";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";

/** Not httpOnly on purpose: it only holds an org id (no secret), and client
 *  components (e.g. the header) read it to show the current org. */
export const ACTIVE_ORG_COOKIE = "minit_active_org";

/**
 * K-4 (work order 27): setting the cookie, ONE copy. It was written verbatim
 * in orgs/actions.ts and orgs/join/actions.ts — change the options in one and
 * the two entrances hand out cookies with different lifetimes.
 */
export async function setActiveOrgCookie(orgId: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, String(orgId), {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // holds only an org id; the header reads it client-side
    maxAge: 60 * 60 * 24 * 365,
  });
}

export type Membership = {
  role: string;
  org: { id: number; name: string; parent_org_id: number | null; is_demo: boolean };
};

export type ActiveOrg = {
  id: number;
  name: string;
  isDemo: boolean;
  /** Direct role in this org, or the role inherited from an ancestor org. */
  role: string;
  parentOrgId: number | null;
  taxExemptStatus: string;
};

/** All orgs where the user holds a DIRECT members_roles row. */
export async function getMemberships(): Promise<Membership[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await getSupabaseServer();
  // Ordered so "the first membership" is the SAME org on every machine —
  // useActiveOrg() in org-chip.tsx runs this exact fallback client-side, and
  // the two must never disagree about which org that is.
  const { data } = await supabase
    .from("members_roles")
    .select("role, org:orgs (id, name, parent_org_id, is_demo)")
    .eq("user_id", user.id)
    .order("org_id");
  return (
    (data as unknown as (Membership & { org: Membership["org"] | null })[]) ??
    []
  ).filter((m): m is Membership => m.org !== null);
}

/**
 * The org the user is currently working in.
 * Order: cookie value (if still accessible) → first direct membership → null.
 */
export async function getActiveOrg(): Promise<ActiveOrg | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await getSupabaseServer();

  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const cookieId = raw && /^\d+$/.test(raw) ? Number(raw) : null;

  if (cookieId !== null) {
    // RLS: this returns a row only if the user can actually see this org.
    const { data: org } = await supabase
      .from("orgs")
      .select("id, name, parent_org_id, is_demo, tax_exempt_status")
      .eq("id", cookieId)
      .maybeSingle();
    if (org) {
      return {
        id: org.id,
        name: org.name,
        isDemo: org.is_demo,
        parentOrgId: org.parent_org_id,
        taxExemptStatus: org.tax_exempt_status,
        role: await roleForOrg(org.id, org.parent_org_id),
      };
    }
  }

  // Fallback: the first org the user directly belongs to.
  const memberships = await getMemberships();
  const first = memberships[0];
  if (!first) return null;
  const { data: org } = await supabase
    .from("orgs")
    .select("id, name, parent_org_id, is_demo, tax_exempt_status")
    .eq("id", first.org.id)
    .maybeSingle();
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    isDemo: org.is_demo,
    parentOrgId: org.parent_org_id,
    taxExemptStatus: org.tax_exempt_status,
    role: first.role,
  };
}

/** Direct role in the org, else the role held on the nearest ancestor
 *  (an HQ hq_admin "inherits" into every branch below). */
async function roleForOrg(
  orgId: number,
  parentOrgId: number | null,
): Promise<string> {
  const user = await getSessionUser();
  if (!user) return "";
  const supabase = await getSupabaseServer();

  let currentId: number | null = orgId;
  let currentParent: number | null = parentOrgId;
  // Walk up the tree (bounded: org trees are shallow — HQ → branches).
  for (let depth = 0; depth < 10 && currentId !== null; depth++) {
    const { data: row } = await supabase
      .from("members_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", currentId)
      .maybeSingle();
    if (row?.role) return row.role;
    if (currentParent === null) break;
    const { data: parent } = await supabase
      .from("orgs")
      .select("id, parent_org_id")
      .eq("id", currentParent)
      .maybeSingle();
    if (!parent) break;
    currentId = parent.id;
    currentParent = parent.parent_org_id;
  }
  return "";
}
