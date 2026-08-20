"use server";

// The organisation's own vocabulary — add and remove entries.
//
// User-scoped client throughout: RLS (org_glossary_insert / _delete, which use
// accessible_orgs_writable()) is what decides whether this person may change
// this org's list, so an auditor account is refused by the database and not by
// a check here that could drift out of step with it.
//
// PDPA (Hard Rule 5): these rows may contain members' names — that is their
// purpose. Nothing here is logged.
import { revalidatePath } from "next/cache";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { describeBadLines, parseGlossaryPaste } from "@/lib/bulk-paste";
import { xlsxToPasteText } from "@/lib/roster-xlsx";

export type GlossaryActionState = { error: string | null; ok: boolean };

const ERR = {
  login: "Sila log masuk semula / 请重新登入 / Please log in again",
  noOrg:
    "Pilih pertubuhan dahulu / 请先选择一个机构 / Choose an organisation first",
  readOnly:
    "Akaun auditor hanya boleh membaca / 审计账号只能查看 / Auditor accounts are read-only",
  emptyTerm:
    "Taip perkataan itu dahulu / 请先填上那个词 / Type the word first",
  needTranslation:
    "Anda memilih “terjemah” — jadi tulis juga cara ia patut ditulis / 您选了「翻译成」—— 请也写上要翻成什么 / You chose “translate” — so write what it should become",
  duplicate:
    "Perkataan ini sudah ada dalam senarai. Padam yang lama dahulu jika mahu menukarnya / 这个词已经在列表里了。要改的话，请先删掉旧的那一条 / This word is already in the list. Delete the old entry first if you want to change it",
  failed:
    "Tidak berjaya — cuba lagi / 没有成功 —— 请再试一次 / Something went wrong — please try again",
};

export async function addGlossaryTerm(
  _prev: GlossaryActionState,
  formData: FormData,
): Promise<GlossaryActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (active.role === "auditor_readonly") {
    return { error: ERR.readOnly, ok: false };
  }

  const term = String(formData.get("term") ?? "").trim();
  const action = String(formData.get("action") ?? "keep");
  const translation = String(formData.get("translation") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (term === "") return { error: ERR.emptyTerm, ok: false };
  if (action !== "keep" && action !== "translate") {
    return { error: ERR.failed, ok: false };
  }
  if (action === "translate" && translation === "") {
    return { error: ERR.needTranslation, ok: false };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("org_glossary").insert({
    org_id: active.id,
    term: term.slice(0, 80),
    action,
    translation: action === "translate" ? translation.slice(0, 160) : null,
    note: note === "" ? null : note.slice(0, 200),
  });

  if (error) {
    // 23505 = unique_violation (org_glossary_unique_term).
    if (error.code === "23505") return { error: ERR.duplicate, ok: false };
    return { error: ERR.failed, ok: false };
  }

  revalidatePath("/glossary");
  return { error: null, ok: true };
}

export async function deleteGlossaryTerm(
  _prev: GlossaryActionState,
  formData: FormData,
): Promise<GlossaryActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: ERR.failed, ok: false };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("org_glossary")
    .delete()
    .eq("id", id)
    .eq("org_id", active.id);

  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/glossary");
  return { error: null, ok: true };
}


/**
 * Import a whole glossary at once. All-or-nothing, for the same reason as the
 * committee import: a partial success nobody can audit is not a success.
 *
 * Terms already in the list are reported rather than silently skipped or
 * silently overwritten — the person decides which ruling stands.
 */
export async function importGlossary(
  _prev: GlossaryActionState,
  formData: FormData,
): Promise<GlossaryActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  if (active.role === "auditor_readonly") return { error: ERR.readOnly, ok: false };

  const text = await readPastedOrFile(formData);
  if (text.trim() === "") {
    return {
      error: "Tampal senarai anda dahulu / 请先贴上您的清单 / Paste your list first",
      ok: false,
    };
  }

  const { rows, bad } = parseGlossaryPaste(text);
  if (bad.length > 0) {
    return { error: describeBadLines(bad), ok: false };
  }
  if (rows.length === 0 || rows.length > 300) {
    return {
      error:
        "Antara 1 dan 300 baris / 一次 1 到 300 行 / Between 1 and 300 lines",
      ok: false,
    };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("org_glossary").insert(
    rows.map((r) => ({
      org_id: active.id,
      term: r.row.term,
      action: r.row.action,
      translation: r.row.translation,
      note: r.row.note,
    })),
  );
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "Ada perkataan dalam senarai ini yang sudah wujud, jadi TIADA apa-apa yang ditambah. Buang yang berulang dan cuba lagi.\n" +
          "里面有些词已经在词库里了，所以什么都没有加进去。把重复的拿掉再试一次。\n" +
          "Some of these words are already in the glossary, so NOTHING was added. Remove the duplicates and try again.",
        ok: false,
      };
    }
    return { error: ERR.failed, ok: false };
  }

  revalidatePath("/glossary");
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
