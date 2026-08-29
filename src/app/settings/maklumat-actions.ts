"use server";

// The eROSES Maklumat Am fields (D2-2, work order 56): society phone,
// financial year start, member counts, and the bank-account table.
//
// RLS does the real gatekeeping: orgs_update allows hq_admin only, and
// org_bank_accounts writes go through accessible_orgs_writable(). The can()
// checks here exist so the refusal is a sentence, not a silent no-op.
//
// FAIL-OPEN (D8): migration 35 may not be applied. Writes then answer a
// plain-language "not stored yet" line; the page's read already falls back.

import { revalidatePath } from "next/cache";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { toIsoDate } from "@/lib/date-input";

export type MaklumatActionState = { ok: boolean; error: string | null };

const ERR = {
  login: "Sila log masuk semula\n请重新登入\nPlease log in again",
  noOrg: "Pilih pertubuhan dahulu\n请先选择一个机构\nChoose an organisation first",
  badDate:
    "Tarikh tidak difahami — contoh yang boleh: 2026-01-01, 1/1/2026, 20260101\n日期看不懂 —— 可以这样写：2026-01-01、1/1/2026、20260101\nThat date was not understood — examples that work: 2026-01-01, 1/1/2026, 20260101",
  badNumber:
    "Bilangan mesti nombor bulat 0 atau lebih\n人数要是 0 或以上的整数\nA count must be a whole number, 0 or more",
  needBank:
    "Isi nama bank dan nombor akaun\n请填上银行名称和账号\nFill in the bank name and account number",
  dbBehind:
    "Bahagian ini belum dibuka di pangkalan data (migration 35). Beritahu pentadbir sistem.\n这部分的数据库还没开通（migration 35），请告诉系统管理员。\nThis section is not enabled in the database yet (migration 35) — tell the system administrator.",
  failed:
    "Tidak berjaya — cuba lagi\n没有成功 —— 请再试一次\nSomething went wrong — please try again",
};

function isDbBehind(message: string | undefined): boolean {
  return /phone|financial_year_start|members_registered|members_voting|org_bank_accounts|schema cache|column/i.test(
    message ?? "",
  );
}

/** "" stays null; a non-negative integer parses; everything else refuses. */
function parseCount(raw: string): number | null | "bad" {
  const s = raw.trim();
  if (s === "") return null;
  if (!/^\d{1,7}$/.test(s)) return "bad";
  return Number(s);
}

export async function saveMaklumatAm(
  _prev: MaklumatActionState,
  formData: FormData,
): Promise<MaklumatActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: ERR.login };
  const active = await getActiveOrg();
  if (!active) return { ok: false, error: ERR.noOrg };
  if (!can(active.role, "manage_org")) {
    return { ok: false, error: permissionError("manage_org") };
  }

  const phone = String(formData.get("phone") ?? "").trim().slice(0, 32);
  const fyRaw = String(formData.get("financialYearStart") ?? "").trim();
  const fy = fyRaw === "" ? null : (toIsoDate(fyRaw) ?? "bad");
  if (fy === "bad") return { ok: false, error: ERR.badDate };
  const registered = parseCount(String(formData.get("membersRegistered") ?? ""));
  const voting = parseCount(String(formData.get("membersVoting") ?? ""));
  if (registered === "bad" || voting === "bad") {
    return { ok: false, error: ERR.badNumber };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("orgs")
    .update({
      phone: phone || null,
      financial_year_start: fy,
      members_registered: registered,
      members_voting: voting,
    })
    .eq("id", active.id);
  if (error) {
    return { ok: false, error: isDbBehind(error.message) ? ERR.dbBehind : ERR.failed };
  }
  revalidatePath("/settings/general");
  return { ok: true, error: null };
}

export async function addBankAccount(
  _prev: MaklumatActionState,
  formData: FormData,
): Promise<MaklumatActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: ERR.login };
  const active = await getActiveOrg();
  if (!active) return { ok: false, error: ERR.noOrg };
  if (!can(active.role, "manage_org")) {
    return { ok: false, error: permissionError("manage_org") };
  }

  const bankName = String(formData.get("bankName") ?? "").trim().slice(0, 120);
  const accountNo = String(formData.get("accountNo") ?? "").trim().slice(0, 40);
  if (bankName === "" || accountNo === "") return { ok: false, error: ERR.needBank };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("org_bank_accounts").insert({
    org_id: active.id,
    bank_name: bankName,
    account_no: accountNo,
  });
  if (error) {
    return { ok: false, error: isDbBehind(error.message) ? ERR.dbBehind : ERR.failed };
  }
  revalidatePath("/settings/general");
  return { ok: true, error: null };
}

export async function deleteBankAccount(id: number): Promise<MaklumatActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: ERR.login };
  const active = await getActiveOrg();
  if (!active) return { ok: false, error: ERR.noOrg };
  if (!can(active.role, "manage_org")) {
    return { ok: false, error: permissionError("manage_org") };
  }
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("org_bank_accounts")
    .delete()
    .eq("org_id", active.id)
    .eq("id", id);
  if (error) {
    return { ok: false, error: isDbBehind(error.message) ? ERR.dbBehind : ERR.failed };
  }
  revalidatePath("/settings/general");
  return { ok: true, error: null };
}
