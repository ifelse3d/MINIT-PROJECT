"use server";

import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";

// ---------------------------------------------------------------------------
// THE COMMITTEE LIST, FOR TICKING OFF ON THE ATTENDANCE PAGE.
//
// J's UX list, item 3: 「出席名单没有要求，不然都不知道谁开会 ⋯⋯ 选了之后出名单
// 可以 tick」. Typing a hundred names is not a thing anybody does twice; ticking
// them off a list they already keep is.
//
// This is READ ONLY, deliberately. `committee_roster` is a GOVERNMENT FILING —
// the society's "Senarai Ahli Jawatankuasa" as it goes to the Registry — and
// the attendance screen has no business editing it. Somebody who was at the
// meeting but is not on the committee gets added as an attendee by hand
// (row-controls.tsx), which is the honest thing: attending a meeting does not
// make somebody an office bearer.
//
// User-scoped client: RLS decides which organisation's roster is visible
// (Hard Rule 5). ic_masked is not selected — a committee member's IC has no
// business being on an attendance screen even in masked form.
// ---------------------------------------------------------------------------

export type RosterName = {
  /** As recorded on the committee list. */
  name: string;
  /** e.g. "Bendahari" — shown so two people with the same name can be told apart. */
  position: string;
};

/**
 * The people on this organisation's committee list.
 *
 * Returns [] for "no organisation", "no roster recorded yet" and "the query
 * failed" alike. All three mean the same thing to the caller — there is nobody
 * to offer — and the attendance page then simply does not show the picker,
 * rather than showing an empty one that looks broken.
 */
/**
 * G-1 (work order 27): the roster AS THE FILING NEEDS IT — position, recorded
 * name, and the official (IC) name. Read-only like everything else here.
 * Returns [] for "no org / no roster / query failed" alike; the paste-pack
 * then shows its honest "no roster in the system yet" note.
 */
export async function loadFilingRoster(): Promise<
  { name: string; position: string; nameOfficial: string | null }[]
> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("committee_roster")
    .select("person_name, position, name_official")
    .eq("org_id", active.id)
    .order("id", { ascending: true })
    .limit(500);
  if (error || !data) return [];

  return data.flatMap((row) => {
    const name = typeof row.person_name === "string" ? row.person_name.trim() : "";
    if (name === "") return [];
    return [
      {
        name,
        position: typeof row.position === "string" ? row.position : "",
        nameOfficial:
          typeof row.name_official === "string" && row.name_official.trim() !== ""
            ? row.name_official.trim()
            : null,
      },
    ];
  });
}

export async function loadRosterNames(): Promise<RosterName[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("committee_roster")
    .select("person_name, position")
    .eq("org_id", active.id)
    .order("id", { ascending: true })
    .limit(500);

  if (error || !data) return [];

  const seen = new Set<string>();
  const out: RosterName[] = [];
  for (const row of data) {
    const name = typeof row.person_name === "string" ? row.person_name.trim() : "";
    if (name === "") continue;
    // One person holding two positions is one person to tick. The first
    // position wins, which is the one recorded first.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      position: typeof row.position === "string" ? row.position : "",
    });
  }
  return out;
}
