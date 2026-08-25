"use server";

// 0-4 (2026-08-25): the e-Invois switch is the ORGANISATION's, not the
// device's. Migration 20260829000000 (orgs.needs_einvois) is applied; this
// action is the write half of the wiring. The read half is in
// src/lib/einvois-server.ts; the client provider falls back to the old
// device preference whenever the organisation value cannot be read, so a
// database that is behind the code degrades instead of blanking pages.
//
// RLS: orgs_update allows hq_admin only, so the user-scoped client enforces
// the same rule this action states out loud.
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";

export type EinvoisSaveState = { ok: boolean; error: string | null };

export async function saveNeedsEinvois(value: boolean): Promise<EinvoisSaveState> {
  const active = await getActiveOrg();
  if (!active) {
    return {
      ok: false,
      error:
        "Pilih pertubuhan dahulu / 请先选择机构 / Choose an organisation first",
    };
  }
  if (!can(active.role, "manage_org")) {
    return {
      ok: false,
      error:
        "Hanya pentadbir boleh mengubah tetapan ini — minta pentadbir pertubuhan anda / 只有管理员能改这个设置，请找机构管理员 / Only an administrator can change this — ask your organisation's administrator",
    };
  }
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("orgs")
    .update({ needs_einvois: value })
    .eq("id", active.id);
  if (error) {
    // Also reached when the column does not exist yet (database behind the
    // code): the toggle stays a device preference and says so.
    return {
      ok: false,
      error:
        "Tidak berjaya disimpan untuk pertubuhan — pilihan ini kekal pada peranti ini sahaja buat masa ini / 没能保存到机构，这个选择暂时只在这台设备上生效 / Could not save for the organisation — for now this choice lives on this device only",
    };
  }
  return { ok: true, error: null };
}
