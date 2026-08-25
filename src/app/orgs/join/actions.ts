"use server";

// ---------------------------------------------------------------------------
// JOIN WITH AN INVITE CODE (B-2, 2026-08-25, 建議①).
//
// The redeemer is NOT yet a member, so RLS (correctly) shows them nothing —
// redemption therefore runs on the service-role client, exactly like
// createOrg: the server verifies the session first, validates the code, and
// does the two writes itself. What the service key does here is bounded:
// look up ONE code, insert ONE membership, mark ONE invite used.
//
// A code is one person: used_by/used_at are set in the same update that
// claims it, guarded by `is null` conditions, so two people racing the same
// code cannot both join.
// ---------------------------------------------------------------------------
import { getSupabase } from "@/db/supabase";
import { getSessionUser } from "@/db/supabase-server";
import { setActiveOrgCookie } from "@/lib/active-org";
import { isRole } from "@/lib/roles";

export type JoinState = { error: string | null; ok: boolean; orgName?: string };

const ERR = {
  login:
    "Sila log masuk atau daftar dahulu / 请先登录或注册 / Please sign in or create an account first",
  needCode: "Isikan kod jemputan / 请填写邀请码 / Enter the invite code",
  needName:
    "Isikan nama anda — ia dicetak pada dokumen yang anda sahkan / 请填写您的姓名 —— 确认文件时会印这个名字 / Enter your name — it is printed on documents you confirm",
  badCode:
    "Kod ini tidak dijumpai. Semak semula dengan orang yang memberikannya / 找不到这个邀请码，请跟给您码的人核对一下 / This code was not found. Check it with the person who gave it to you",
  usedCode:
    "Kod ini sudah digunakan — setiap kod untuk seorang sahaja. Minta kod baharu / 这个邀请码已经被用过了 —— 一码一人，请再要一个新的 / This code has already been used — one code per person. Ask for a new one",
  revokedCode:
    "Kod ini telah dibatalkan oleh pentadbir. Minta kod baharu / 这个邀请码已被管理员撤销，请再要一个新的 / This code was revoked by the administrator. Ask for a new one",
  expiredCode:
    "Kod ini sudah luput. Minta kod baharu / 这个邀请码已经过期，请再要一个新的 / This code has expired. Ask for a new one",
  already:
    "Anda sudah menjadi ahli pertubuhan ini / 您已经是这个机构的成员了 / You are already a member of this organisation",
  failed:
    "Tidak berjaya — cuba lagi / 没有成功 —— 请再试一次 / Something went wrong — please try again",
};

export async function joinWithInvite(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase()
    // People type codes with or without the dash and with stray spaces.
    .replace(/[^A-Z0-9-]/g, "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (code === "") return { error: ERR.needCode, ok: false };
  if (name === "") return { error: ERR.needName, ok: false };

  const admin = getSupabase();

  // Also try the dashless form: "ABCD-EFGH" and "ABCDEFGH" are the same code.
  const dashless = code.replace(/-/g, "");
  const withDash =
    dashless.length === 8 ? `${dashless.slice(0, 4)}-${dashless.slice(4)}` : code;
  const { data: invite, error: lookupError } = await admin
    .from("invites")
    .select("id, org_id, role, expires_at, used_by, revoked_at")
    .in("code", [code, withDash, dashless])
    .maybeSingle();
  if (lookupError) return { error: ERR.failed, ok: false };
  if (!invite) return { error: ERR.badCode, ok: false };
  if (invite.revoked_at) return { error: ERR.revokedCode, ok: false };
  if (invite.used_by) return { error: ERR.usedCode, ok: false };
  if (invite.expires_at && new Date(invite.expires_at as string) < new Date()) {
    return { error: ERR.expiredCode, ok: false };
  }
  const role = String(invite.role);
  if (!isRole(role)) return { error: ERR.failed, ok: false };

  // Already a member? Joining twice would create a second row with possibly a
  // different role — say so instead.
  const { data: existing } = await admin
    .from("members_roles")
    .select("id")
    .eq("org_id", invite.org_id as number)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { error: ERR.already, ok: false };

  // Claim the code FIRST, atomically: the update only succeeds while used_by
  // and revoked_at are still null, so a raced second redeem gets 0 rows.
  const { data: claimed, error: claimError } = await admin
    .from("invites")
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq("id", invite.id as number)
    .is("used_by", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return { error: ERR.usedCode, ok: false };

  const { error: memberError } = await admin.from("members_roles").insert({
    org_id: invite.org_id as number,
    user_id: user.id,
    name,
    role,
  });
  if (memberError) {
    // Give the code back — the membership was not created.
    await admin
      .from("invites")
      .update({ used_by: null, used_at: null })
      .eq("id", invite.id as number)
      .eq("used_by", user.id);
    return { error: ERR.failed, ok: false };
  }

  const { data: org } = await admin
    .from("orgs")
    .select("name")
    .eq("id", invite.org_id as number)
    .maybeSingle();

  // K-4: one shared cookie-setter (lib/active-org.ts), same options as the
  // switch-org path by construction.
  await setActiveOrgCookie(invite.org_id as number);

  return { error: null, ok: true, orgName: (org?.name as string) ?? undefined };
}
