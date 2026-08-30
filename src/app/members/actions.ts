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
//
// B-1 (work order 51, 拍板 5): "term end" is GONE. A committee change is a
// Mesyuarat Agung decision, not a date field quietly expiring people — the
// later AI-suggestion work picks that up. What stays is the appointment date
// (term_start), because eROSES asks for it. The term_end COLUMN stays in the
// database (old rows keep their history); nothing writes or reads it any more.
import { revalidatePath } from "next/cache";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can, permissionError } from "@/lib/roles";
import { describeBadLines, parseCommitteePaste } from "@/lib/bulk-paste";
import { toIsoDate } from "@/lib/date-input";
import { xlsxToPasteText } from "@/lib/roster-xlsx";
import {
  erosesCommitteeRefusal,
  missingErosesCommitteeFields,
  type ErosesCommitteeField,
} from "@/lib/eroses-committee";

export type MemberActionState = {
  error: string | null;
  ok: boolean;
  /** B-2: which form box the error is about — the client turns THAT box red
   *  instead of leaving the person to guess. */
  field?: "position" | "personName" | "nameOfficial" | "state" | "termStart" | "email" | null;
  /** D48 (⑦, work order 89): EVERY eROSES box still empty — the client turns
   *  each of them red, not just the first. */
  missingEroses?: ErosesCommitteeField[];
  /**
   * B-6 (拍板 6): somebody with the SAME name is already on the roster but
   * with a DIFFERENT IC name — that is probably a second person, so the form
   * asks ("already have 陈小明 (IC: TAN X M) — is this another one?") instead
   * of blocking or silently duplicating. The client re-submits with
   * confirmSameName=1 once the person answers yes.
   */
  askSameName?: { name: string; official: string } | null;
};

// B-2: three LINES (the joinUserError shape), so useLocalizedError shows only
// the reader's language. The old " / " single line showed all three at once.
const ERR = {
  login: "Sila log masuk semula\n请重新登入\nPlease log in again",
  noOrg: "Pilih pertubuhan dahulu\n请先选择一个机构\nChoose an organisation first",
  needPosition:
    "Isi jawatan dahulu\n请先填上职位\nFill in the position first",
  needName: "Isi nama dahulu\n请先填上姓名\nFill in the name first",
  // #8 (launch feedback): the format is OUR job — this only fires when the
  // typing cannot be read as a date at all, and it shows working examples.
  badDate:
    "Tarikh tidak difahami — contoh yang boleh: 2026-01-01, 1/1/2026, 20260101\n日期看不懂 —— 可以这样写：2026-01-01、1/1/2026、20260101\nThat date was not understood — examples that work: 2026-01-01, 1/1/2026, 20260101",
  // H1 (work order 69): only refuses what cannot BE an email — a missing @.
  // The column is optional, so empty is always fine.
  badEmail:
    "E-mel itu tidak nampak betul (tiada @) — semak semula, atau biarkan kosong\n这个电邮好像不对（没有 @）—— 请检查一下，或先留空\nThat email does not look right (no @) — check it, or leave it blank",
  // B-6: SAME name AND same IC name = the same person typed twice.
  duplicatePerson:
    "Orang ini sudah ada dalam senarai (nama dan nama IC sama). Kalau ini orang LAIN yang kebetulan sama nama, isi nama IC yang berbeza atau tambah nota.\n这个人已经在名单里了（姓名和身份证名字都一样）。如果是另一位同名的人，请填不一样的身份证名字，或加个备注。\nThis person is already on the list (same name and same IC name). If this is a DIFFERENT person with the same name, give their own IC name or add a note.",
  failed:
    "Tidak berjaya — cuba lagi\n没有成功 —— 请再试一次\nSomething went wrong — please try again",
};

const BULK_ERR = {
  empty: "Tampal senarai anda dahulu\n请先贴上您的名单\nPaste your list first",
  tooMany:
    "Terlalu banyak baris sekali gus (maksimum 200)\n一次太多行了（最多 200）\nToo many lines at once (200 maximum)",
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Good enough to catch a typo, loose enough to never refuse a real one. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Insert/update with the optional-column ladder (D8): the database may be
 * older than the code, and PostgREST fails the WHOLE write over one unknown
 * column — so each named column is stripped and the write retried.
 * Migration 32 gave note/honorific; migration 37 gives email/state.
 */
const OPTIONAL_COLUMNS = ["note", "honorific", "email", "state", "phone"] as const;

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
  const honorific = String(formData.get("honorific") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const termStartRaw = String(formData.get("termStart") ?? "").trim();
  const confirmSameName = String(formData.get("confirmSameName") ?? "") === "1";

  if (position === "") return { error: ERR.needPosition, ok: false, field: "position" };
  if (personName === "") return { error: ERR.needName, ok: false, field: "personName" };
  if (email !== "" && !EMAIL_SHAPE.test(email)) {
    return { error: ERR.badEmail, ok: false, field: "email" };
  }
  // #8: normalise whatever was typed (20260101, 1/1/2026, …) instead of
  // demanding dashes. Only genuinely unreadable input is refused.
  const termStart = termStartRaw === "" ? "" : (toIsoDate(termStartRaw) ?? null);
  if (termStart === null) {
    return { error: ERR.badDate, ok: false, field: "termStart" };
  }

  // D48 (⑦, work order 89 — J 8/30 night, 「都要」): the FORM is a hard gate
  // now. A row going into eROSES saves only when every eROSES-required box
  // is filled; the refusal names the boxes in plain words. (This reverses
  // the 2026-08-19 "bite at the filing, not the adding" ruling — the risk it
  // guarded, people inventing a romanisation on the spot, is noted in D48
  // and answered by the never-transliterate warning beside the box.)
  // Photo-import / bulk-import / seeded rows are NOT this form — old and
  // imported gaps survive, flagged amber on the table.
  const gaps = missingErosesCommitteeFields({
    person_name: personName,
    name_official: nameOfficial,
    state,
    term_start: termStart,
  });
  if (gaps.length > 0) {
    return {
      error: erosesCommitteeRefusal(gaps),
      ok: false,
      field: gaps[0],
      missingEroses: gaps,
    };
  }

  const supabase = await getSupabaseServer();

  // B-6 (拍板 6): same name + same IC name = the same person typed twice —
  // refuse. Same name + DIFFERENT IC name = probably a second person — ask
  // once, then allow. A roster is ≤200 rows, so comparing in code is cheap
  // and avoids ilike-escaping games.
  const { data: existingRows } = await supabase
    .from("committee_roster")
    .select("person_name, name_official")
    .eq("org_id", active.id);
  const sameName = (existingRows ?? []).filter(
    (r) => norm(r.person_name) === norm(personName),
  );
  if (sameName.some((r) => norm(r.name_official) === norm(nameOfficial))) {
    return { error: ERR.duplicatePerson, ok: false, field: "personName" };
  }
  if (sameName.length > 0 && !confirmSameName) {
    const first = sameName[0];
    return {
      error: null,
      ok: false,
      askSameName: {
        name: first.person_name,
        official: (first.name_official ?? "").trim(),
      },
    };
  }

  // Optional columns ride the strip-and-retry ladder (OPTIONAL_COLUMNS, D8).
  const row: Record<string, unknown> = {
    org_id: active.id,
    position: position.slice(0, 120),
    person_name: personName.slice(0, 120),
    name_official: nameOfficial === "" ? null : nameOfficial.slice(0, 160),
    term_start: termStart === "" ? null : termStart,
  };
  if (note !== "") row.note = note.slice(0, 120);
  if (honorific !== "") row.honorific = honorific.slice(0, 60);
  if (email !== "") row.email = email.slice(0, 160);
  if (state !== "") row.state = state.slice(0, 60);

  const error = await writeWithColumnLadder((r) =>
    supabase.from("committee_roster").insert(r),
  )(row);
  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/members");
  return { error: null, ok: true };
}

/** The ladder itself, shared by add / edit / seed: strip whichever optional
 *  column the error names, retry, until the write lands or the error is real. */
function writeWithColumnLadder(
  write: (row: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>,
) {
  return async (row: Record<string, unknown>) => {
    let error: { message?: string } | null = null;
    for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
      const res = await write(row);
      error = res.error;
      if (!error) break;
      const named = OPTIONAL_COLUMNS.find(
        (col) => col in row && new RegExp(col, "i").test(error?.message ?? ""),
      );
      if (!named) break;
      delete row[named];
    }
    return error;
  };
}

/**
 * Edit one roster row in place (H1, work order 69 §1-3 — J: the row said
 * "not filled in" and offered no way to fill it). Every column is editable;
 * the same-name interrogation is NOT re-run here, because correcting an
 * existing person is not adding a possible second one.
 */
export async function updateCommitteeMember(
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

  const position = String(formData.get("position") ?? "").trim();
  const personName = String(formData.get("personName") ?? "").trim();
  const nameOfficial = String(formData.get("nameOfficial") ?? "").trim();
  const honorific = String(formData.get("honorific") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  // Migration 41 (100 §0-4): contact phone — optional, rides the ladder.
  const phone = String(formData.get("phone") ?? "").trim();
  const termStartRaw = String(formData.get("termStart") ?? "").trim();

  if (position === "") return { error: ERR.needPosition, ok: false, field: "position" };
  if (email !== "" && !EMAIL_SHAPE.test(email)) {
    return { error: ERR.badEmail, ok: false, field: "email" };
  }
  const termStart = termStartRaw === "" ? "" : (toIsoDate(termStartRaw) ?? null);
  if (termStart === null) {
    return { error: ERR.badDate, ok: false, field: "termStart" };
  }

  // D48 (⑦): editing is the same hard gate as adding — a seeded row's Edit
  // now completes the row in one sitting (name, IC name, state, date), and
  // the refusal names whatever is still empty. The gaps themselves are not
  // deleted from history: a row nobody touches keeps them, flagged amber.
  const gaps = missingErosesCommitteeFields({
    person_name: personName,
    name_official: nameOfficial,
    state,
    term_start: termStart,
  });
  if (gaps.length > 0) {
    return {
      error: erosesCommitteeRefusal(gaps),
      ok: false,
      field: gaps[0],
      missingEroses: gaps,
    };
  }

  const supabase = await getSupabaseServer();
  const row: Record<string, unknown> = {
    position: position.slice(0, 120),
    person_name: personName.slice(0, 120),
    name_official: nameOfficial === "" ? null : nameOfficial.slice(0, 160),
    term_start: termStart === "" ? null : termStart,
    note: note === "" ? null : note.slice(0, 120),
    honorific: honorific === "" ? null : honorific.slice(0, 60),
    email: email === "" ? null : email.slice(0, 160),
    state: state === "" ? null : state.slice(0, 60),
    phone: phone === "" ? null : phone.slice(0, 40),
  };

  const error = await writeWithColumnLadder((r) =>
    supabase
      .from("committee_roster")
      .update(r)
      .eq("id", id)
      .eq("org_id", active.id),
  )(row);
  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/members");
  return { error: null, ok: true };
}

/**
 * Fill a row's remaining eROSES gaps from inside the penyata flow (⑦/D48,
 * work order 89 — H2's "fill ONE missing IC name" road, widened to every
 * eROSES-required column). Only the fields the little form sent move;
 * everything else on the row stays untouched. `state` rides the optional-
 * column ladder — behind migration 37 the value is quietly dropped rather
 * than failing the whole write (D8), and the flow's gap list will not have
 * asked for it in the first place.
 */
export async function fillCommitteeErosesGaps(
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

  const personName = String(formData.get("personName") ?? "").trim();
  const nameOfficial = String(formData.get("nameOfficial") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const termStartRaw = String(formData.get("termStart") ?? "").trim();
  const termStart = termStartRaw === "" ? "" : (toIsoDate(termStartRaw) ?? null);
  if (termStart === null) {
    return { error: ERR.badDate, ok: false, field: "termStart" };
  }

  const row: Record<string, unknown> = {};
  if (personName !== "") row.person_name = personName.slice(0, 120);
  if (nameOfficial !== "") row.name_official = nameOfficial.slice(0, 160);
  if (state !== "") row.state = state.slice(0, 60);
  if (termStart !== "") row.term_start = termStart;
  if (Object.keys(row).length === 0) return { error: ERR.failed, ok: false };

  const supabase = await getSupabaseServer();
  const error = await writeWithColumnLadder((r) =>
    supabase
      .from("committee_roster")
      .update(r)
      .eq("id", id)
      .eq("org_id", active.id),
  )(row);
  if (error) return { error: ERR.failed, ok: false };

  revalidatePath("/members");
  return { error: null, ok: true };
}

/**
 * "加常見職位" — one tap gives the roster its standard skeleton so the
 * society only fills in names (H1, work order 69 §1-5, J's decision).
 *
 * Rows are created with an EMPTY person_name; the roster pickers already
 * skip empty names (roster-actions), and the table shows "belum diisi" in
 * amber where the name goes — which is exactly the row the new Edit button
 * exists for. Positions the roster already has (matched loosely, either
 * language) are not duplicated. When the constitution has been read, ITS
 * composition seeds the counts instead of the default set.
 *
 * Pemeriksa Kira-kira is deliberately NOT seeded here: since migration 34
 * the auditors have their own card and their own eROSES step — putting them
 * into the AJK list would be the false-filing this page warns about.
 */
export async function seedCommonPositions(
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

  // From the constitution when the page read one, otherwise the default set.
  // The client sends what it showed the person — no hidden extra rows.
  let wanted: { position: string; count: number }[];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("positions") ?? ""));
    wanted = Array.isArray(parsed)
      ? parsed
          .filter(
            (p): p is { position: string; count: number } =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as { position?: unknown }).position === "string" &&
              typeof (p as { count?: unknown }).count === "number",
          )
          .map((p) => ({
            position: p.position.slice(0, 120),
            count: Math.max(1, Math.min(30, Math.floor(p.count))),
          }))
          .slice(0, 20)
      : [];
  } catch {
    wanted = [];
  }
  if (wanted.length === 0) return { error: ERR.failed, ok: false };

  const supabase = await getSupabaseServer();
  const { data: existingRows, error: readError } = await supabase
    .from("committee_roster")
    .select("position")
    .eq("org_id", active.id);
  if (readError) return { error: ERR.failed, ok: false };
  const existing = (existingRows ?? []).map((r) => norm(r.position));

  // "Pengerusi / 主席" covers a roster row that says just "Pengerusi" or just
  // "主席" — but ONLY by whole segments, because a substring test would let a
  // "Pengerusi" row cover "Naib Pengerusi" too.
  const segments = (p: string) =>
    p
      .split("/")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== "");
  const toInsert: Record<string, unknown>[] = [];
  for (const w of wanted) {
    const seedSegs = new Set(segments(w.position));
    const already = existing.filter(
      (e) => e !== "" && segments(e).some((s) => seedSegs.has(s)),
    ).length;
    for (let i = already; i < w.count; i++) {
      toInsert.push({
        org_id: active.id,
        position: w.position,
        person_name: "",
        name_official: null,
        term_start: null,
      });
    }
  }
  if (toInsert.length === 0) {
    // Everything asked for is already there — that is a success, said plainly.
    revalidatePath("/members");
    return { error: null, ok: true };
  }

  const { error } = await supabase.from("committee_roster").insert(toInsert);
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
      // B-2 shape: three lines, then a blank line, then the detail —
      // useLocalizedError keeps the reader's line and the details.
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
  // Every row carries the SAME keys (PostgREST refuses a batch whose objects
  // differ — PGRST102), optional columns as null where the line left them out.
  // B-1: term_end is parsed for old files' sake but no longer stored.
  // H1: the template's optional columns come along; when the database is
  // behind a migration (D8), the batch ladder strips the named column from
  // EVERY row and retries — all-or-nothing either way.
  let batch = rows.map((r) => ({
    org_id: active.id,
    position: r.row.position,
    person_name: r.row.personName,
    name_official: r.row.nameOfficial,
    term_start: r.row.termStart,
    honorific: r.row.honorific,
    note: r.row.note,
    email: r.row.email,
    state: r.row.state,
  })) as Record<string, unknown>[];

  let error: { message?: string } | null = null;
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const res = await supabase.from("committee_roster").insert(batch);
    error = res.error;
    if (!error) break;
    const named = OPTIONAL_COLUMNS.find(
      (col) => col in (batch[0] ?? {}) && new RegExp(col, "i").test(error?.message ?? ""),
    );
    if (!named) break;
    batch = batch.map((r) => {
      const copy = { ...r };
      delete copy[named];
      return copy;
    });
  }
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
