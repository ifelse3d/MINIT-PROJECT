"use server";

// ---------------------------------------------------------------------------
// MEMBERS & INVITES — the admin's door (B-3, 2026-08-25, 建議①).
//
// The database designed six roles on day one; this file is the missing way IN:
// an hq_admin generates an invite code (role + optional expiry), the new
// member enters it at /orgs/join, and joins with that role. Also here: change
// a member's role, remove a member, revoke a code.
//
// Every write is B-4 guarded (manage_org) AND runs on the USER-scoped client —
// the invites/members_roles RLS policies (migration 20260902000000, phase 7)
// prove the same thing server-side, so a forged call cannot outrun the check.
//
// Until migration 24 is applied the invites table does not exist; every
// invite call then returns the honest "database behind the code" message
// instead of a crash (STATE §6 — code is always newer than the DB for a
// while).
//
// PDPA: names and roles only — no emails, no phone numbers leave here.
// ---------------------------------------------------------------------------
import { revalidatePath } from "next/cache";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can, isRole, permissionError } from "@/lib/roles";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";

export type MemberAdminState = {
  error: string | null;
  ok: boolean;
  /** Set by createInvite so the code can be shown ONCE, big, with a copy
   *  button — it is also visible in the list until used/revoked. */
  code?: string;
};

const ERR = {
  login: "Sila log masuk semula / 请重新登入 / Please sign in again",
  noOrg:
    "Pilih pertubuhan dahulu / 请先选择机构 / Choose an organisation first",
  failed:
    "Tidak berjaya — cuba lagi / 没有成功 —— 请再试一次 / Something went wrong — please try again",
  lastAdmin:
    "Ini pentadbir terakhir — lantik pentadbir lain dahulu sebelum menukarnya / 这是最后一个管理员，要先任命另一个管理员才能改 / This is the last administrator — appoint another one first",
};

/** Unambiguous alphabet: no I, L, O, 0, 1. Format XXXX-XXXX. */
function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** The invites table only exists from migration 20260902000000. */
function isMissingTable(message: string | undefined): boolean {
  return /invites|42P01|schema cache/i.test(message ?? "");
}

async function requireAdmin(): Promise<
  | { ok: true; orgId: number; userId: string }
  | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: ERR.login };
  const active = await getActiveOrg();
  if (!active) return { ok: false, error: ERR.noOrg };
  if (!can(active.role, "manage_org")) {
    return { ok: false, error: permissionError("manage_org") };
  }
  return { ok: true, orgId: active.id, userId: user.id };
}

// --- invites ----------------------------------------------------------------

export async function createInvite(
  _prev: MemberAdminState,
  formData: FormData,
): Promise<MemberAdminState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, ok: false };

  const role = String(formData.get("role") ?? "");
  if (!isRole(role)) return { error: ERR.failed, ok: false };
  // Expiry is a coarse product choice, not a date box (eROSES test): 7 days,
  // 30 days, or no expiry.
  const expiresDays = Number(formData.get("expiresDays"));
  const expiresAt =
    expiresDays === 7 || expiresDays === 30
      ? new Date(Date.now() + expiresDays * 24 * 3600 * 1000).toISOString()
      : null;

  const code = generateInviteCode();
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("invites").insert({
    org_id: gate.orgId,
    code,
    role,
    created_by: gate.userId,
    expires_at: expiresAt,
  });
  if (error) {
    return {
      error: isMissingTable(error.message)
        ? joinUserError(USER_ERRORS.databaseBehind)
        : ERR.failed,
      ok: false,
    };
  }
  revalidatePath("/settings");
  return { error: null, ok: true, code };
}

export async function revokeInvite(
  _prev: MemberAdminState,
  formData: FormData,
): Promise<MemberAdminState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, ok: false };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: ERR.failed, ok: false };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", gate.orgId);
  if (error) return { error: ERR.failed, ok: false };
  revalidatePath("/settings");
  return { error: null, ok: true };
}

export type InviteRow = {
  id: number;
  code: string;
  role: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
};

/** Invites for the settings card. [] also covers "table not applied yet" —
 *  the create button will say so the moment it is pressed. */
export async function listInvites(orgId: number): Promise<InviteRow[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("invites")
    .select("id, code, role, created_at, expires_at, used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    role: r.role as string,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
    usedAt: (r.used_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
  }));
}

// --- members ----------------------------------------------------------------

export type MemberRow = {
  id: number;
  name: string;
  role: string;
  isSelf: boolean;
};

export async function listMembers(orgId: number): Promise<MemberRow[]> {
  const user = await getSessionUser();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("members_roles")
    .select("id, name, role, user_id")
    .eq("org_id", orgId)
    .order("id", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    role: r.role as string,
    isSelf: r.user_id === user?.id,
  }));
}

/** True when this members_roles row is the org's LAST hq_admin — the one
 *  person who can still manage members. Demoting or removing them would
 *  leave the organisation with no door. */
async function isLastAdmin(orgId: number, rowId: number): Promise<boolean> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("members_roles")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("role", "hq_admin");
  const admins = data ?? [];
  return admins.length <= 1 && admins.some((a) => a.id === rowId);
}

export async function changeMemberRole(
  _prev: MemberAdminState,
  formData: FormData,
): Promise<MemberAdminState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, ok: false };
  const id = Number(formData.get("id"));
  const role = String(formData.get("role") ?? "");
  if (!Number.isInteger(id) || !isRole(role)) return { error: ERR.failed, ok: false };

  if (role !== "hq_admin" && (await isLastAdmin(gate.orgId, id))) {
    return { error: ERR.lastAdmin, ok: false };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("members_roles")
    .update({ role })
    .eq("id", id)
    .eq("org_id", gate.orgId);
  if (error) return { error: ERR.failed, ok: false };
  revalidatePath("/settings");
  return { error: null, ok: true };
}

export async function removeMember(
  _prev: MemberAdminState,
  formData: FormData,
): Promise<MemberAdminState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, ok: false };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: ERR.failed, ok: false };

  if (await isLastAdmin(gate.orgId, id)) {
    return { error: ERR.lastAdmin, ok: false };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("members_roles")
    .delete()
    .eq("id", id)
    .eq("org_id", gate.orgId);
  if (error) return { error: ERR.failed, ok: false };
  revalidatePath("/settings");
  return { error: null, ok: true };
}
