"use server";

// ---------------------------------------------------------------------------
// CONSTITUTION PERSISTENCE — Phase B, first slice (2026-08-05).
//
// WHY THIS FILE EXISTS
// --------------------
// Until now the constitution lived ONLY in this device's localStorage
// (`minit.constitution.v1`). The `constitutions` table has existed since the
// init migration and had never been written to by any code path, so:
//
//   * a secretary who photographed the constitution on her phone opened the
//     laptop and the organisation had no constitution at all;
//   * clearing the browser destroyed it with no copy anywhere;
//   * and the clause-cited Q&A — which the one-pager describes as a shipped
//     feature — silently had nothing to answer from.
//
// This closes that for the constitution only. It deliberately does NOT touch
// custody, the register or the calendar: those need schema changes that only J
// can apply (see STATE.md), whereas this one fits the table exactly as it was
// designed. `ConfirmedClause` was written to match `clauses_json` from the
// start (see the comment on the type).
//
// WHAT IS STORED, AND WHAT IS NOT
// -------------------------------
// `clauses_json` holds the ARRAY of clauses, exactly the shape the migration
// documents. The title and the source filename stay on the device: they are
// presentation metadata, and inventing columns for them would need a migration
// (D8: schema first, and only J applies migrations). On a second device the UI
// says the clauses came from the organisation's records, which is both true and
// more useful than another device's filename.
//
// PDPA (Hard Rule 5): clause text is never logged, and every query is scoped by
// org_id through the user-scoped client, so RLS is the real boundary.
// ---------------------------------------------------------------------------

import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import {
  isConfirmedClauseArray,
  type ConfirmedClause,
} from "@/lib/constitution";

export type SaveConstitutionState = {
  error: string | null;
  ok: boolean;
};

/**
 * The most clauses we will accept in one save.
 *
 * A Malaysian society constitution runs to tens of clauses; a few hundred is
 * already implausible. The cap is here so a runaway client loop cannot push an
 * unbounded jsonb blob into the row (the whole document is rewritten on every
 * page upload).
 */
const MAX_CLAUSES = 500;

/**
 * Save the organisation's confirmed constitution clauses.
 *
 * Called after a successful read, with the FULL merged set — the same array the
 * page is showing. One row per organisation: we update the existing row when
 * there is one rather than accumulating a new row per photographed page.
 *
 * Failure is never fatal to the user's work: the page keeps its localStorage
 * copy, so a save that does not land costs durability, not data.
 */
export async function saveConstitutionClauses(input: {
  clauses: unknown;
}): Promise<SaveConstitutionState> {
  const user = await getSessionUser();
  const active = await getActiveOrg();
  if (!user || !active) {
    return {
      error:
        "Pilih pertubuhan di halaman Pertubuhan dahulu / 请先在「机构」页选择一个机构 / Choose an organisation on the Organisations page first",
      ok: false,
    };
  }
  // B-4: storing the organisation's constitution is minutes_write —
  // hq_admin and the secretary (建議①).
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  // The client is not the authority on shape. A malformed blob here would end
  // up quoted back to the user as a "verbatim" clause.
  if (!isConfirmedClauseArray(input.clauses)) {
    return {
      error:
        "Data perlembagaan tidak sah / 章程资料格式不对 / The constitution data is not in the expected form",
      ok: false,
    };
  }
  const clauses: ConfirmedClause[] = input.clauses;

  // Saving an empty set would WIPE a constitution that is already stored, which
  // is the one outcome nobody could recover from here. Deleting is a separate,
  // deliberate action ("start again"), not a side effect of a failed read.
  if (clauses.length === 0) {
    return {
      error:
        "Tiada fasal untuk disimpan / 没有条文可以保存 / There are no clauses to save",
      ok: false,
    };
  }
  if (clauses.length > MAX_CLAUSES) {
    return {
      error:
        "Terlalu banyak fasal dalam satu simpanan / 一次保存的条文太多 / Too many clauses in a single save",
      ok: false,
    };
  }

  const supabase = await getSupabaseServer();

  // One row per org. `constitutions` has no unique constraint on org_id (and
  // adding one is a migration), so we look first and update in place. Read then
  // write is safe enough here: a single secretary uploads pages one at a time,
  // and the worst case of a genuine race is one extra row, not lost clauses.
  const { data: existing, error: readError } = await supabase
    .from("constitutions")
    .select("id")
    .eq("org_id", active.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    return {
      error:
        "Tidak berjaya disimpan — cuba lagi / 没有保存成功 —— 请再试一次 / Could not save — try again",
      ok: false,
    };
  }

  const { error: writeError } = existing
    ? await supabase
        .from("constitutions")
        .update({ clauses_json: clauses })
        .eq("id", existing.id)
        .eq("org_id", active.id)
    : await supabase
        .from("constitutions")
        .insert({ org_id: active.id, clauses_json: clauses });

  if (writeError) {
    return {
      error:
        "Tidak berjaya disimpan — cuba lagi / 没有保存成功 —— 请再试一次 / Could not save — try again",
      ok: false,
    };
  }

  return { error: null, ok: true };
}

/**
 * The organisation's stored clauses, for seeding a device that has none.
 *
 * Returns an empty array for "no organisation chosen", "nothing stored yet" and
 * "the stored blob is not the shape we expect" alike: every one of those means
 * the page must show its empty state rather than answer questions from
 * something it cannot vouch for (Hard Rule 1).
 */
export async function loadConstitutionClauses(): Promise<ConfirmedClause[]> {
  const user = await getSessionUser();
  const active = await getActiveOrg();
  if (!user || !active) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("constitutions")
    .select("clauses_json")
    .eq("org_id", active.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return [];
  const parsed: unknown = data.clauses_json;
  return isConfirmedClauseArray(parsed) ? parsed : [];
}
