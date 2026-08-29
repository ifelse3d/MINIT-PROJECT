"use server";

// The Juruaudit roster — add, retire and remove entries in `auditors`.
// (D2-1, work order 56 — eROSES Penyata Tahunan step 4: Maklumat Juruaudit.)
//
// Mirrors ./actions.ts (the committee list) deliberately: same permission,
// same three-line error strings, same "IC NAME, never IC number" stance
// (PDPA, Hard Rule 5 — eROSES asks for the IC number on its own form; the
// person types it THERE).
//
// FAIL-OPEN (D8): migration 34 may not be applied yet. Every write answers a
// plain-language "not stored yet" error instead of throwing; the page's read
// already falls back to an empty list.

import { revalidatePath } from "next/cache";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { toIsoDate } from "@/lib/date-input";

export type AuditorActionState = {
  error: string | null;
  ok: boolean;
  field?: "personName" | "appointedOn" | null;
};

const ERR = {
  login: "Sila log masuk semula\n请重新登入\nPlease log in again",
  noOrg: "Pilih pertubuhan dahulu\n请先选择一个机构\nChoose an organisation first",
  needName: "Isi nama dahulu\n请先填上姓名\nFill in the name first",
  badDate:
    "Tarikh tidak difahami — contoh yang boleh: 2026-01-01, 1/1/2026, 20260101\n日期看不懂 —— 可以这样写：2026-01-01、1/1/2026、20260101\nThat date was not understood — examples that work: 2026-01-01, 1/1/2026, 20260101",
  dbBehind:
    "Bahagian juruaudit belum dibuka di pangkalan data (migration 34). Beritahu pentadbir sistem.\n审计员这部分的数据库还没开通（migration 34），请告诉系统管理员。\nThe auditors section is not enabled in the database yet (migration 34) — tell the system administrator.",
  failed:
    "Tidak berjaya — cuba lagi\n没有成功 —— 请再试一次\nSomething went wrong — please try again",
};

function isMissingTable(message: string | undefined): boolean {
  return /auditors|schema cache/i.test(message ?? "");
}

export async function addAuditor(
  _prev: AuditorActionState,
  formData: FormData,
): Promise<AuditorActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  const personName = String(formData.get("personName") ?? "").trim();
  const nameOfficial = String(formData.get("nameOfficial") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const appointedRaw = String(formData.get("appointedOn") ?? "").trim();

  if (personName === "") return { error: ERR.needName, ok: false, field: "personName" };
  const appointedOn = appointedRaw === "" ? "" : (toIsoDate(appointedRaw) ?? null);
  if (appointedOn === null) {
    return { error: ERR.badDate, ok: false, field: "appointedOn" };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("auditors").insert({
    org_id: active.id,
    person_name: personName,
    name_official: nameOfficial || null,
    email: email || null,
    appointed_on: appointedOn || null,
  });
  if (error) {
    return {
      error: isMissingTable(error.message) ? ERR.dbBehind : ERR.failed,
      ok: false,
    };
  }
  revalidatePath("/members");
  return { error: null, ok: true };
}

/** Aktif ⇄ Tidak aktif. eROSES cares about the ACTIVE count (constitution). */
export async function setAuditorStatus(
  id: number,
  status: "active" | "inactive",
): Promise<AuditorActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("auditors")
    .update({ status })
    .eq("org_id", active.id)
    .eq("id", id);
  if (error) {
    return {
      error: isMissingTable(error.message) ? ERR.dbBehind : ERR.failed,
      ok: false,
    };
  }
  revalidatePath("/members");
  return { error: null, ok: true };
}

export async function deleteAuditor(id: number): Promise<AuditorActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("auditors")
    .delete()
    .eq("org_id", active.id)
    .eq("id", id);
  if (error) {
    return {
      error: isMissingTable(error.message) ? ERR.dbBehind : ERR.failed,
      ok: false,
    };
  }
  revalidatePath("/members");
  return { error: null, ok: true };
}
