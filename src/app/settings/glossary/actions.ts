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
import { can, permissionError } from "@/lib/roles";
import { describeBadLines, parseGlossaryPaste } from "@/lib/bulk-paste";
import { xlsxToPasteText } from "@/lib/roster-xlsx";

export type GlossaryActionState = { error: string | null; ok: boolean };

// B-2 (work order 51): three LINES (the joinUserError shape), so
// useLocalizedError shows only the reader's language.
const ERR = {
  login: "Sila log masuk semula\n请重新登入\nPlease log in again",
  noOrg:
    "Pilih pertubuhan dahulu\n请先选择一个机构\nChoose an organisation first",
  readOnly:
    "Akaun auditor hanya boleh membaca\n审计账号只能查看\nAuditor accounts are read-only",
  emptyTerm:
    "Taip perkataan itu dahulu\n请先填上那个词\nType the word first",
  needTranslation:
    "Anda memilih “terjemah” — jadi tulis juga cara ia patut ditulis\n您选了「翻译成」—— 请也写上要翻成什么\nYou chose “translate” — so write what it should become",
  duplicate:
    "Perkataan ini sudah ada dalam senarai. Padam yang lama dahulu jika mahu menukarnya\n这个词已经在列表里了。要改的话，请先删掉旧的那一条\nThis word is already in the list. Delete the old entry first if you want to change it",
  failed:
    "Tidak berjaya — cuba lagi\n没有成功 —— 请再试一次\nSomething went wrong — please try again",
};

export async function addGlossaryTerm(
  _prev: GlossaryActionState,
  formData: FormData,
): Promise<GlossaryActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };
  const active = await getActiveOrg();
  if (!active) return { error: ERR.noOrg, ok: false };
  // B-4: the glossary teaches the reader how this society writes — the
  // secretary's desk (minutes_write).
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  // #10 (launch feedback, 2026-08-27 evening): an entry is the ORIGINAL word,
  // WHICH language it is, and how the other two languages write it — any
  // language can be the original. All renders empty = keep the word exactly.
  const term = String(formData.get("term") ?? "").trim();
  const langRaw = String(formData.get("lang") ?? "zh");
  const lang = langRaw === "bm" || langRaw === "en" ? langRaw : "zh";
  const renders: Record<"bm" | "zh" | "en", string | null> = {
    bm: cleanRender(formData.get("renderBm")),
    zh: cleanRender(formData.get("renderZh")),
    en: cleanRender(formData.get("renderEn")),
  };
  // The original slot renders as itself — never stored twice.
  renders[lang] = null;
  const note = String(formData.get("note") ?? "").trim();

  if (term === "") return { error: ERR.emptyTerm, ok: false };

  // Legacy columns still drive the MODEL (the writing prompt renders BM
  // documents): a BM render means "always write it as this" — exactly the
  // old 'translate'; no BM render means the word is copied exactly ('keep').
  // Prompts and their measurements stay untouched.
  const bmRender = lang === "bm" ? null : renders.bm;
  const action = bmRender ? "translate" : "keep";

  const supabase = await getSupabaseServer();
  const base = {
    org_id: active.id,
    term: term.slice(0, 80),
    action,
    translation: bmRender,
    note: note === "" ? null : note.slice(0, 200),
  };
  const { error } = await supabase.from("org_glossary").insert({
    ...base,
    lang,
    render_bm: renders.bm,
    render_zh: renders.zh,
    render_en: renders.en,
  });

  if (error) {
    // 23505 = unique_violation (org_glossary_unique_term).
    if (error.code === "23505") return { error: ERR.duplicate, ok: false };
    // Pre-28 database: the trilingual columns do not exist yet — save the
    // legacy shape so nothing typed is lost, and the page says what is
    // missing until migration 28 lands.
    const retry = await supabase.from("org_glossary").insert(base);
    if (retry.error) {
      if (retry.error.code === "23505") return { error: ERR.duplicate, ok: false };
      return { error: ERR.failed, ok: false };
    }
  }

  revalidatePath("/settings/glossary");
  return { error: null, ok: true };
}

function cleanRender(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, 160);
}

export async function deleteGlossaryTerm(
  _prev: GlossaryActionState,
  formData: FormData,
): Promise<GlossaryActionState> {
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
    .from("org_glossary")
    .delete()
    .eq("id", id)
    .eq("org_id", active.id);

  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/settings/glossary");
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
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  const text = await readPastedOrFile(formData);
  if (text.trim() === "") {
    return {
      error: "Tampal senarai anda dahulu\n请先贴上您的清单\nPaste your list first",
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
        "Antara 1 dan 300 baris\n一次 1 到 300 行\nBetween 1 and 300 lines",
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

  revalidatePath("/settings/glossary");
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
