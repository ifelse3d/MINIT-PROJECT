"use server";

import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { can } from "@/lib/roles";
import { DEADLINE_KINDS, type DeadlineKind } from "@/lib/deadlines";

// ---------------------------------------------------------------------------
// TICKING OFF A DEADLINE.
//
// J's UX list, root cause B, third of three — and the one whose answer turned
// out to be different from the other two.
//
// The deadlines themselves do NOT need to be written anywhere. They are
// COMPUTED (lib/standard-deadlines.ts): the annual return is the confirmed AGM
// date plus 60 days, the e-Invois deadlines are statutory month-ends. Both
// inputs already live in the database, so every device derives the same list
// from the same facts. Storing the derived rows as well would be a second copy
// that can disagree with the first — worse than not storing them.
//
// What was genuinely missing is the other half. `lib/deadlines.ts` has had a
// "done" urgency since it was written, `deadlines.status` has had a 'done'
// value since the very first migration — and NOTHING in the app ever set it.
// So a treasurer who filed the annual return in June watched Minit keep
// shouting about it, in red, for the rest of the year. The only fix available
// to them was to stop believing the reminders, which is the failure mode a
// compliance product least wants to teach.
//
// So this file stores exactly one thing: the fact that a human says a
// particular deadline is dealt with. The deadline stays computed; the tick is
// recorded.
//
// 🔴 Same rule as the rest of this work: it must survive a database where
// migration 20260825000000 has not been applied. Every function returns an
// outcome and never throws, and a deadline whose tick cannot be saved simply
// shows as still outstanding — which is the safe direction to be wrong about a
// legal filing.
// ---------------------------------------------------------------------------

export type DeadlineOutcome =
  | { ok: true }
  | { ok: false; reason: "no_org" | "no_session" | "db" };

/**
 * The id for one deadline occurrence.
 *
 * Deadlines are computed, so they have no natural key — but `kind` plus the day
 * it falls due identifies one occurrence exactly, and derives the same string
 * on every device. That makes the upsert idempotent for free: ticking the same
 * deadline from a phone and from the office computer writes one row.
 */
function deadlineClientId(kind: DeadlineKind, dueDateIso: string): string {
  return `${kind}:${dueDateIso}`;
}

function isDeadlineKind(value: string): value is DeadlineKind {
  return (DEADLINE_KINDS as readonly string[]).includes(value);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Record that a human says this deadline is dealt with — or take that back.
 *
 * `source` is the sentence explaining where the deadline came from
 * ("AGM minutes confirmed 2026-06-01"). It is stored with the tick so an
 * auditor reading the row later can see WHICH deadline was ticked, not just a
 * kind and a date.
 */
export async function setDeadlineDone(input: {
  kind: string;
  dueDateIso: string;
  source?: string;
  done: boolean;
}): Promise<DeadlineOutcome> {
  const { kind, dueDateIso, source, done } = input;
  if (!isDeadlineKind(kind) || !ISO_DAY.test(dueDateIso)) {
    return { ok: false, reason: "db" };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  // B-4: ticking a deadline is calendar_write — everyone except the auditor.
  if (!can(active.role, "calendar_write")) return { ok: false, reason: "db" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("deadlines").upsert(
    {
      org_id: active.id,
      client_id: deadlineClientId(kind, dueDateIso),
      kind,
      due_date: dueDateIso,
      source: source ?? null,
      // Un-ticking writes 'pending' rather than deleting the row: somebody
      // ticked this once, and the fact that they changed their mind is part of
      // the story. status is what the screens read.
      status: done ? "done" : "pending",
    },
    { onConflict: "org_id,client_id" },
  );
  return error ? { ok: false, reason: "db" } : { ok: true };
}

/**
 * Which deadlines this organisation has ticked off, as `kind:due_date` keys.
 *
 * Returns an empty set for every failure — no organisation, nothing ticked, the
 * migration not applied, the query failed. All four mean "we cannot show any
 * deadline as done", which leaves them outstanding. For a statutory filing,
 * being told something is still due when it is not is a nuisance; being told it
 * is done when it is not is a fine.
 */
export async function loadDoneDeadlines(): Promise<string[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("deadlines")
    .select("kind, due_date, status")
    .eq("org_id", active.id)
    .eq("status", "done")
    .limit(500);

  if (error || !data) return [];
  return data
    .filter((r) => typeof r.kind === "string" && typeof r.due_date === "string")
    .map((r) => `${r.kind}:${r.due_date}`);
}
