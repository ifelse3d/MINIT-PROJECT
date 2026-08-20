"use server";

// Delete-organisation server action (Phase 7, CLAUDE.md Hard Rule 5).
//
// Safety gates, in order:
//   1. Caller must be logged in.
//   2. Caller must be hq_admin over the org (asked of the DATABASE via the
//      same accessible_orgs_admin() function the RLS policies use).
//   3. The typed confirmation must match the org name EXACTLY.
//   4. An org with branches cannot be deleted (delete branches first) —
//      mirrors the ON DELETE RESTRICT in the schema.
//   5. Storage objects are wiped first; if that fails, the rows are left
//      untouched so nothing is ever orphaned.
// Irreversible. Nothing is logged (PDPA).
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabase } from "@/db/supabase";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";
import { deleteOrgStorage } from "@/lib/org-delete";

export type DeleteOrgState = { error: string | null; ok: boolean };

const ERR = {
  login: "Sila log masuk semula / 请重新登入 / Please log in again",
  notAdmin:
    "Hanya pentadbir boleh memadam pertubuhan / 只有管理员才能删除机构 / Only an hq_admin can delete an organisation",
  nameMismatch:
    "Nama yang ditaip tidak sepadan — tiada apa yang dipadam / The typed name does not match — nothing was deleted",
  hasBranches:
    "Pertubuhan ini masih ada cawangan. Padam setiap cawangan dahulu / This organisation still has branches. Delete each branch first",
  storage:
    "Gambar dan fail yang dimuat naik tidak dapat dipadam sepenuhnya, jadi TIADA apa-apa yang dipadam — pertubuhan anda masih ada. Cuba sekali lagi. / 上传的照片和文件没能全部删除，所以什么都没有删 —— 您的机构还在。请再试一次。/ The uploaded photos and files could not all be removed, so NOTHING was deleted — your organisation is still there. Please try again.",
  failed: "Tidak berjaya — cuba lagi / 没有成功 —— 请再试一次 / Something went wrong — please try again",
};

export async function deleteOrg(
  _prev: DeleteOrgState,
  formData: FormData,
): Promise<DeleteOrgState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };

  const rawId = String(formData.get("orgId") ?? "");
  const typedName = String(formData.get("confirmName") ?? "").trim();
  if (!/^\d+$/.test(rawId)) return { error: ERR.failed, ok: false };
  const orgId = Number(rawId);

  // Gate 2: hq_admin over this org?
  const userClient = await getSupabaseServer();
  const { data: adminOrgs, error: rpcError } = await userClient.rpc(
    "accessible_orgs_admin",
  );
  const adminIds = new Set(
    ((adminOrgs as unknown[]) ?? []).map((v) =>
      typeof v === "number"
        ? v
        : Number(Object.values(v as Record<string, unknown>)[0]),
    ),
  );
  if (rpcError || !adminIds.has(orgId)) {
    return { error: ERR.notAdmin, ok: false };
  }

  const admin = getSupabase(); // service role: needs storage + row delete

  // Gate 3: typed name must match exactly.
  const { data: org } = await admin
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { error: ERR.failed, ok: false };
  if (typedName !== org.name) return { error: ERR.nameMismatch, ok: false };

  // Gate 4: no branches may remain.
  const { count: branchCount } = await admin
    .from("orgs")
    .select("id", { count: "exact", head: true })
    .eq("parent_org_id", orgId);
  if ((branchCount ?? 0) > 0) return { error: ERR.hasBranches, ok: false };

  // Gate 5: storage first; rows only if storage is fully clear.
  const storageCleared = await deleteOrgStorage(admin, orgId);
  if (!storageCleared) return { error: ERR.storage, ok: false };

  const { error: deleteError } = await admin
    .from("orgs")
    .delete()
    .eq("id", orgId);
  if (deleteError) return { error: ERR.failed, ok: false };

  // If the deleted org was the active one, clear the cookie.
  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ORG_COOKIE)?.value === String(orgId)) {
    cookieStore.delete(ACTIVE_ORG_COOKIE);
  }

  revalidatePath("/", "layout");
  return { error: null, ok: true };
}
