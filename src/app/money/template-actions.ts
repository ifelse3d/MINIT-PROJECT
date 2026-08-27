"use server";

import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";

// ---------------------------------------------------------------------------
// WORDING TEMPLATES (J's launch feedback #5, 2026-08-27 evening: 「每一個地方
// 用詞不同，能做 template 就方便很多」). Each organisation keeps its own list
// of the phrases it actually uses — income purposes (香油钱, Derma bangunan…)
// and expense descriptions — and picks from them instead of retyping.
//
// Table: org_templates (migration 28). Same graceful-degrade contract as the
// register: on a pre-28 database every action returns ok:false/"db_behind"
// and the UI keeps working off the device's own copy. Outcomes, never throws.
// ---------------------------------------------------------------------------

export type TemplateKind = "income_purpose" | "expense_desc";

export type TemplateOutcome =
  | { ok: true }
  | { ok: false; reason: "no_session" | "no_org" | "permission" | "db_behind" | "db" };

const TABLE = "org_templates";

export async function loadOrgTemplates(kind: TemplateKind): Promise<string[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const active = await getActiveOrg();
  if (!active) return [];
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from(TABLE)
    .select("label")
    .eq("org_id", active.id)
    .eq("kind", kind)
    .order("id", { ascending: true })
    .limit(100);
  if (error || !data) return [];
  return (data as { label: string }[]).map((r) => r.label);
}

export async function saveOrgTemplate(
  kind: TemplateKind,
  label: string,
): Promise<TemplateOutcome> {
  const trimmed = label.trim().slice(0, 120);
  if (trimmed === "") return { ok: false, reason: "db" };
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!can(active.role, "money_collect")) return { ok: false, reason: "permission" };
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { org_id: active.id, kind, label: trimmed },
      { onConflict: "org_id,kind,label", ignoreDuplicates: true },
    );
  if (!error) return { ok: true };
  // Missing table (pre-28) reports as a schema error; anything else is db.
  return {
    ok: false,
    reason: /relation|schema|does not exist|PGRST/i.test(error.message ?? "")
      ? "db_behind"
      : "db",
  };
}

export async function deleteOrgTemplate(
  kind: TemplateKind,
  label: string,
): Promise<TemplateOutcome> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  if (!can(active.role, "money_collect")) return { ok: false, reason: "permission" };
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("org_id", active.id)
    .eq("kind", kind)
    .eq("label", label);
  return error ? { ok: false, reason: "db" } : { ok: true };
}
