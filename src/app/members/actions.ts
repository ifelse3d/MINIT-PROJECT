"use server";

// The committee list — add and remove entries in committee_roster.
//
// ⚠ THIS IS A GOVERNMENT FILING. committee_roster is the society's "Senarai
// Ahli Jawatankuasa": the committee registered with the Registrar of Societies
// and copied into the eROSES Annual Return. A one-off duty for one event is
// NOT a committee position, and putting one here is a false filing — the same
// rule src/prompts/eroses-map.ts and the extraction prompt already enforce on
// the AI side. The page says so in plain language above the form.
//
// User-scoped client: RLS (committee_roster_insert / _delete via
// accessible_orgs_writable()) decides who may change it, so an auditor account
// is refused by the database rather than by a check here that could drift.
//
// PDPA (Hard Rule 5): names only. No IC numbers — the column exists and is
// masked-only by design, and this form does not collect one at all.
import { revalidatePath } from "next/cache";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { describeBadLines, parseCommitteePaste } from "@/lib/bulk-paste";
import { toIsoDate } from "@/lib/date-input";
import { xlsxToPasteText } from "@/lib/roster-xlsx";

export type MemberActionState = { error: string | null; ok: boolean };

const ERR = {
  login: "Sila log masuk semula / 请重新登入 / Please log in again",
  noOrg: "Pilih pertubuhan dahulu / 请先选择一个机构 / Choose an organisation first",
  readOnly:
    "Akaun auditor hanya boleh membaca / 审计账号只能查看 / Auditor accounts are read-only",
  needFields:
    "Isi jawatan dan nama dahulu / 请先填上职位和姓名 / Fill in the position and the name first",
  // #8 (launch feedback): the format is OUR job — this only fires when the
  // typing cannot be read as a date at all, and it shows working examples.
  badDate:
    "Tarikh tidak difahami — contoh yang boleh: 2026-01-01, 1/1/2026, 20260101 / 日期看不懂 —— 可以这样写：2026-01-01、1/1/2026、20260101 / That date was not understood — examples that work: 2026-01-01, 1/1/2026, 20260101",
  failed:
    "Tidak berjaya — cuba lagi / 没有成功 —— 请再试一次 / Something went wrong — please try again",
};

const BULK_ERR = {
  empty: "Tampal senarai anda dahulu / 请先贴上您的名单 / Paste your list first",
  tooMany:
    "Terlalu banyak baris sekali gus (maksimum 200) / 一次太多行了（最多 200）/ Too many lines at once (200 maximum)",
};

export async function addCommitteeMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  const position = String(formData.get("position") ?? "").trim();
  const personName = String(formData.get("personName") ?? "").trim();
  const nameOfficial = String(formData.get("nameOfficial") ?? "").trim();
  const termStartRaw = String(formData.get("termStart") ?? "").trim();
  const termEndRaw = String(formData.get("termEnd") ?? "").trim();

  if (position === "" || personName === "") {
    return { error: ERR.needFields, ok: false };
  }
  // #8: normalise whatever was typed (20260101, 1/1/2026, …) instead of
  // demanding dashes. Only genuinely unreadable input is refused.
  const termStart = termStartRaw === "" ? "" : (toIsoDate(termStartRaw) ?? null);
  const termEnd = termEndRaw === "" ? "" : (toIsoDate(termEndRaw) ?? null);
  if (termStart === null || termEnd === null) {
    return { error: ERR.badDate, ok: false };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("committee_roster").insert({
    org_id: active.id,
    position: position.slice(0, 120),
    person_name: personName.slice(0, 120),
    name_official: nameOfficial === "" ? null : nameOfficial.slice(0, 160),
    term_start: termStart === "" ? null : termStart,
    term_end: termEnd === "" ? null : termEnd,
  });
  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/members");
  return { error: null, ok: true };
}

export async function removeCommitteeMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: ERR.failed, ok: false };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("committee_roster")
    .delete()
    .eq("id", id)
    .eq("org_id", active.id);
  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/members");
  return { error: null, ok: true };
}


/**
 * Import a whole committee at once.
 *
 * Nothing is written unless EVERY line parsed. A partial import is the worst
 * outcome available here: the person sees "added" and has no way to tell which
 * three of their twenty are missing, and re-pasting duplicates the rest.
 */
export async function importCommittee(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  const text = await readPastedOrFile(formData);
  if (text.trim() === "") return { error: BULK_ERR.empty, ok: false };

  const { rows, bad } = parseCommitteePaste(text);
  if (bad.length > 0) {
    return {
      error:
        "Baris ini tidak difahami, jadi TIADA apa-apa yang ditambah. Betulkan dan cuba lagi — setiap baris perlu jawatan DAN nama.\n" +
        "这几行看不懂，所以什么都没有加进去。改好再试一次 —— 每一行都要有职位和姓名。\n" +
        "These lines were not understood, so NOTHING was added. Fix them and try again — every line needs a position AND a name.\n\n" +
        describeBadLines(bad),
      ok: false,
    };
  }
  if (rows.length === 0) return { error: BULK_ERR.empty, ok: false };
  if (rows.length > 200) return { error: BULK_ERR.tooMany, ok: false };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("committee_roster").insert(
    rows.map((r) => ({
      org_id: active.id,
      position: r.row.position,
      person_name: r.row.personName,
      name_official: r.row.nameOfficial,
      term_start: r.row.termStart,
      term_end: r.row.termEnd,
    })),
  );
  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/members");
  return { error: null, ok: true };
}


/**
 * Whatever the person actually gave us, as text.
 *
 * A spreadsheet is read here, by a parser, not by a model: which column holds
 * the name is arithmetic, and sending a list of members' names to a vendor to
 * work that out would spend the org's quota to do it worse (Hard Rule 5).
 * Everything ends up as the same tab-separated text, so one parser and one set
 * of refusal rules covers paste, .csv and .xlsx alike.
 */
async function readPastedOrFile(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 4 * 1024 * 1024) return "";
    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type.includes("spreadsheetml");
    if (isXlsx) {
      try {
        return await xlsxToPasteText(await file.arrayBuffer());
      } catch {
        return "";
      }
    }
    return await file.text();
  }
  return String(formData.get("pasted") ?? "");
}
