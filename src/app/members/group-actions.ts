"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";

// ---------------------------------------------------------------------------
// THE SOCIETY'S OWN GROUPS — 青年团 · 小天使 · Kumpulan Wanita.
//
// J's UX list, item 3: 「之后要能选群体（AJK、青年、小天使），可单选可多选，
// 社团自己建 category，选了之后出名单可以 tick」.
//
// 🔴 A SEPARATE TABLE FROM committee_roster, and this is the whole design.
// committee_roster IS a government filing — the "Senarai Ahli Jawatankuasa"
// that goes to the Registry of Societies. Putting "小天使组" in it would mix an
// internal grouping into a statutory return. Same reason roster-actions.ts
// reads that table and never writes it.
//
// 🔴 Also: one row per MEMBERSHIP, not a column on a person. Somebody is
// routinely in several groups at once — a committee member who is also in the
// youth wing. A `group` column would force a second row for the same person,
// and that second row would carry an invented POSITION, which then goes out
// with the filing.
//
// User-scoped client throughout: RLS decides which organisation's groups are
// visible and writable (Hard Rule 5).
//
// 🔴 EVERY FUNCTION HERE SURVIVES AN UNAPPLIED MIGRATION. J applies migrations
// by hand (D8), so there is always a window where this code is ahead of the
// database — and asking PostgREST for a table that does not exist fails the
// whole query. Reads come back empty and writes report a failure the UI states
// plainly; nothing throws, and the Members page keeps working without groups.
// ---------------------------------------------------------------------------

export type GroupMember = { group: string; name: string };

export type GroupOutcome =
  | { ok: true }
  | { ok: false; reason: "no_org" | "no_session" | "invalid" | "db" };

/** Same bounds as the CHECK constraints, so the refusal happens here with a
 *  message rather than at the database with a 400. */
const MAX_GROUP = 60;
const MAX_NAME = 120;

/**
 * Every group membership this organisation has recorded.
 *
 * Returns [] for "no organisation", "nothing recorded", "the migration has not
 * been applied" and "the query failed" alike. All four mean the same thing to
 * every caller — there are no groups to offer — and the screens then simply do
 * not show a group picker, rather than showing an empty one that looks broken.
 */
export async function loadMemberGroups(): Promise<GroupMember[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("member_groups")
    .select("group_name, person_name")
    .eq("org_id", active.id)
    .order("group_name", { ascending: true })
    .order("person_name", { ascending: true })
    .limit(2000);

  if (error || !data) return [];
  return data.flatMap((r) => {
    const group = typeof r.group_name === "string" ? r.group_name.trim() : "";
    const name = typeof r.person_name === "string" ? r.person_name.trim() : "";
    return group && name ? [{ group, name }] : [];
  });
}

/**
 * Put somebody in a group. Creates the group by naming it — there is no
 * separate "create a group" step, because a group with nobody in it is a thing
 * somebody has to remember to come back and finish.
 *
 * Re-adding the same person to the same group is a slip, not an instruction to
 * record them twice, and the unique constraint makes it harmless.
 */
export async function addToGroup(input: {
  group: string;
  name: string;
}): Promise<GroupOutcome> {
  const group = (input?.group ?? "").trim();
  const name = (input?.name ?? "").trim();
  if (group === "" || name === "" || group.length > MAX_GROUP || name.length > MAX_NAME) {
    return { ok: false, reason: "invalid" };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("member_groups")
    .upsert(
      { org_id: active.id, group_name: group, person_name: name },
      { onConflict: "org_id,group_name,person_name" },
    );
  if (error) return { ok: false, reason: "db" };
  revalidatePath("/members");
  return { ok: true };
}

/**
 * Put SEVERAL people in a group at once (launch feedback #9, 2026-08-27
 * evening: 「沒有一個地方讓選名單然後 POPUP 出來讓 USER 可以一次過選」).
 * One statement, all-or-nothing — a half-added selection is the kind of
 * silent partial success nobody can see.
 */
export async function addManyToGroup(input: {
  group: string;
  names: string[];
}): Promise<GroupOutcome> {
  const group = (input?.group ?? "").trim();
  const names = Array.from(
    new Set(
      (input?.names ?? [])
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter((n) => n !== "" && n.length <= MAX_NAME),
    ),
  );
  if (group === "" || group.length > MAX_GROUP || names.length === 0 || names.length > 200) {
    return { ok: false, reason: "invalid" };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("member_groups")
    .upsert(
      names.map((name) => ({
        org_id: active.id,
        group_name: group,
        person_name: name,
      })),
      { onConflict: "org_id,group_name,person_name" },
    );
  if (error) return { ok: false, reason: "db" };
  revalidatePath("/members");
  return { ok: true };
}

/** Take somebody out of a group. The group disappears when its last member does. */
export async function removeFromGroup(input: {
  group: string;
  name: string;
}): Promise<GroupOutcome> {
  const group = (input?.group ?? "").trim();
  const name = (input?.name ?? "").trim();
  if (group === "" || name === "") return { ok: false, reason: "invalid" };

  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("member_groups")
    .delete()
    .eq("org_id", active.id)
    .eq("group_name", group)
    .eq("person_name", name);
  if (error) return { ok: false, reason: "db" };
  revalidatePath("/members");
  return { ok: true };
}
