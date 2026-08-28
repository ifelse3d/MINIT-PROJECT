"use server";

// Save a fully human-confirmed minutes draft to the database (Phase 7
// history). User-scoped client: RLS proves write access to the active org.
// PDPA: contents are stored, never logged.
//
// 2026-07-28 AUDIT FIX (P1: forged audit line).
// This action used to accept `finalMd` (already rendered in the browser) and a
// `confirmedBy` NAME, both from the client. The browser sent the literal string
// "Setiausaha (Demo)" and the fictional sample temple's name, so every minutes
// document saved into a real organisation's audit trail claimed it had been
// confirmed by a person who does not exist, on someone else's letterhead. That
// breaks Hard Rule 8 (the audit line must name the real confirming human) and
// it is the same class of bug the document PDF routes were fixed for.
//
// The action now takes the EXTRACTION and renders the document itself, using
// getDocumentIdentity() — org name and signer read from the signed-in session,
// exactly like the receipt/AGM/bank routes. There is nothing left to forge.
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { indexMinutesDocInBackground } from "@/lib/ai/minutes-index";
import { getActiveOrg } from "@/lib/active-org";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { normaliseMeetingType } from "@/lib/meeting-types";
import { can, permissionError } from "@/lib/roles";
import { isSampleMeetingExtraction } from "@/lib/sample-guard";
import { renderMinutesDraftBm } from "@/lib/minutes-draft";
import { joinUserError, inputProblemError, USER_ERRORS } from "@/lib/user-errors";
import { dayIsoMalaysia } from "@/lib/history";
import { BRAND_NAME } from "@/lib/brand";
import {
  isMinutesLang,
  minutesAuditLine,
  minutesTitle,
  MINUTES_TITLE_PATTERN,
  type MinutesLang,
} from "@/lib/minutes-lang";
import { cleanMinutesTitle } from "@/lib/minutes-title";
import { ppmLine, PPM_LINE_PATTERN } from "@/lib/minutes-compose";
import { countUnreviewed } from "@/lib/extraction-rows";

export type SaveMinutesState = {
  error: string | null;
  ok: boolean;
};

export async function saveConfirmedMinutes(input: {
  /** The reviewed extraction. Validated here; the document is rendered here. */
  extraction: unknown;
  /**
   * OPTIONAL — the document written by the model at step 3
   * (/api/draft-minutes). When absent we fall back to the deterministic
   * template, so saving never depends on the vendor being up.
   *
   * The BODY is accepted from the client on purpose: editing your own minutes
   * before signing them is a legitimate thing to do, and step 3 will grow a
   * text box. What is NOT accepted from the client is WHO signed it and on
   * WHOSE letterhead — the title line and the audit line are re-stamped below
   * from the session, which is exactly the hole the 2026-07-28 audit closed.
   */
  aiDraftMd?: string;
  /** Which language `aiDraftMd` is written in, so the letterhead and audit
   *  line are re-stamped in the same one. Ignored for the template fallback,
   *  which is Bahasa Malaysia. */
  language?: string;
  /**
   * S0-3 (2026-08-25) — idempotency key, one per DOCUMENT. A double tap or a
   * timed-out retry re-sends the same key and the earlier save is returned
   * instead of a duplicate row. The unique (org_id, client_id) constraint is
   * migration 20260828000000; until it is applied the check-then-insert below
   * still stops the common double-tap.
   */
  clientId?: string;
  /**
   * J 28/8 item 3 (migration 30): the society's own name for the document —
   * the person's typed name, else the deterministic type+date suggestion.
   * A LABEL chosen by a human, not a fact about the meeting.
   */
  title?: string;
  /**
   * J 28/8 item 4 (migration 30): uploads-bucket paths of the source photos
   * this document was read from. Validated below to THIS org's folder — a
   * client must not be able to link someone else's files onto its document.
   */
  photoPaths?: string[];
}): Promise<SaveMinutesState> {
  const user = await getSessionUser();
  const active = await getActiveOrg();
  if (!user || !active) {
    return {
      error:
        "Pilih pertubuhan di halaman Pertubuhan dahulu / 请先在「机构」页选择一个机构 / Choose an organisation on the Organisations page first",
      ok: false,
    };
  }
  // B-4: confirming minutes into the audit trail is minutes_write —
  // hq_admin and the secretary (建議①).
  if (!can(active.role, "minutes_write")) {
    return { error: permissionError("minutes_write"), ok: false };
  }

  const parsed = parseMeetingNotesExtraction(input.extraction);
  if (!parsed.success) {
    // 2026-08-20. This used to say "the minutes data is incomplete — reload the
    // page and try again". Reloading cannot help: the value the person typed is
    // what was refused, and it survives the reload. Name the box instead.
    const firstPath = parsed.error.issues[0]?.path?.[0];
    return {
      error: joinUserError(inputProblemError(String(firstPath ?? ""))),
      ok: false,
    };
  }
  const extraction = parsed.data;

  // Stage 0-1: the worked example can never be saved as a real meeting. The
  // client already keys saving off isReal, but the client is not the authority
  // on what enters an organisation's audit trail.
  if (isSampleMeetingExtraction(extraction)) {
    return {
      error:
        "Ini contoh sahaja — ia tidak boleh disimpan sebagai mesyuarat sebenar. Ambil gambar nota anda sendiri dahulu / 这是示范内容，不能保存成真实会议记录。请先拍您自己的笔记 / This is the worked example — it cannot be saved as a real meeting. Photograph your own notes first",
      ok: false,
    };
  }

  // Hard Rule 8: the audit line names the real signed-in human, resolved on the
  // server. Never the browser's idea of who confirmed it.
  const identity = await getDocumentIdentity();
  if (!identity) {
    return {
      error:
        "Sila log masuk semula / 请重新登入 / Please sign in again",
      ok: false,
    };
  }

  // A document is only saved as "confirmed" when every field has actually been
  // reviewed. The client also blocks the button, but the client is not the
  // authority on this.
  const unreviewed = countUnreviewed(extraction);
  if (unreviewed > 0) {
    return {
      error:
        "Masih ada medan belum disemak — sahkan semuanya dahulu / 还有栏位没核对 —— 请先全部确认 / Some fields have not been reviewed yet — confirm them all first",
      ok: false,
    };
  }

  // D30 (2026-08-28, J #33): a confirmed set of minutes with NOBODY recorded
  // as attending would flow a zero into the eROSES annual return's "Bilangan
  // Ahli Hadir". The client blocks this too; this is the authority.
  const hasAttendee = extraction.attendees.some(
    (a) => a.name.value.trim() !== "",
  );
  if (!hasAttendee) {
    return {
      error:
        "Kehadiran masih kosong — rekod sekurang-kurangnya seorang hadir dahulu / 出席名单还是空的 —— 请先记至少一个出席者 / Attendance is empty — record at least one attendee first",
      ok: false,
    };
  }

  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const aiDraft = (input.aiDraftMd ?? "").trim();
  const lang: MinutesLang = isMinutesLang(input.language ?? "")
    ? (input.language as MinutesLang)
    : "bm";
  const finalMd =
    aiDraft !== "" && aiDraft.length <= MAX_DRAFT_CHARS
      ? stampIdentity(aiDraft, {
          orgName: identity.orgName,
          confirmedBy: identity.confirmedBy,
          dateIso: todayIso,
          lang,
          // C-1: the PPM/ROS number under the letterhead when the admin
          // entered one — a reader can check it against the public register.
          ppmNo: identity.ppmNo,
        })
      : // D-1 (2026-08-25): the plain fallback goes through the SAME stamp.
        // Before this it skipped stampIdentity, so a document saved without
        // ever pressing the AI button carried no PPM/ROS line — the Stage C
        // anti-impersonation mark existed on one path and not the other.
        stampIdentity(
          renderMinutesDraftBm(extraction, {
            orgName: identity.orgName,
            confirmedBy: { name: identity.confirmedBy, dateIso: todayIso },
          }),
          {
            orgName: identity.orgName,
            confirmedBy: identity.confirmedBy,
            dateIso: todayIso,
            lang: "bm",
            ppmNo: identity.ppmNo,
          },
        );

  if (!finalMd.trim()) {
    return {
      error: "Draf kosong / 草稿是空的 / The draft is empty",
      ok: false,
    };
  }

  const meetingDateIso = extraction.meeting_date.value ?? "";

  const supabase = await getSupabaseServer();

  // Idempotency: has THIS confirmation already been stored? (check-then-insert;
  // the unique constraint in migration 20260828000000 closes the remaining
  // race). If the client_id column does not exist yet the select errors — that
  // is treated as "not found" and the save proceeds exactly as before.
  const clientId = (input.clientId ?? "").trim().slice(0, 64);
  if (clientId !== "") {
    const { data: existing, error: existingErr } = await supabase
      .from("minutes_docs")
      .select("id")
      .eq("org_id", active.id)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!existingErr && existing?.id) {
      return { error: null, ok: true };
    }
  }

  const customLabel = (extraction.meeting_type_label ?? "").trim();
  const row: Record<string, unknown> = {
    org_id: active.id,
    meeting_type: normaliseMeetingType(String(extraction.meeting_type.value ?? "")),
    meeting_date: /^\d{4}-\d{2}-\d{2}$/.test(meetingDateIso)
      ? meetingDateIso
      : null,
    final_md: finalMd,
    status: "confirmed",
    confirmed_by: identity.confirmedBy,
    confirmed_at: new Date().toISOString(),
    // S0-5: the reviewed extraction is stored WITH the confirmation, so
    // /filings can build the eROSES paste-pack from a signed document on the
    // server instead of from this browser's half-checked draft. The column
    // exists since migration 20260820000000 (applied).
    extraction,
  };
  // meeting_type_label only exists from migration 20260820000000. Sending a
  // column PostgREST does not know about fails the whole INSERT, so it is only
  // sent when the person actually wrote one — which they can only have done by
  // choosing "other", which that same migration is what allows. Every save that
  // worked yesterday still sends exactly the columns it sent yesterday.
  if (customLabel !== "") row.meeting_type_label = customLabel;
  if (clientId !== "") row.client_id = clientId;

  // Migration 30 columns — both optional, both validated, both stripped by
  // the ladder below when the database has not caught up yet.
  const title = cleanMinutesTitle(String(input.title ?? ""));
  if (title !== "") row.title = title;
  const photoPaths = (Array.isArray(input.photoPaths) ? input.photoPaths : [])
    .filter(
      (p): p is string =>
        typeof p === "string" &&
        p.length > 0 &&
        p.length <= 300 &&
        // Hard Rule 5: only THIS org's folder in the uploads bucket may be
        // linked. Anything else is discarded, not stored.
        p.startsWith(`${active.id}/`),
    )
    .slice(0, 12);
  if (photoPaths.length > 0) row.photo_paths = photoPaths;

  // The database is allowed to be OLDER than the code (D8: J applies
  // migrations by hand). PostgREST fails the WHOLE insert over one unknown
  // column, so each optional column the error names is stripped and the
  // insert retried — newest schema stores everything, an older one stores
  // what it knows. client_id was the first of these; now it is a ladder.
  const optionalColumns = ["client_id", "title", "photo_paths"] as const;
  let saved: { id: number } | null = null;
  let error: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
    const res = await supabase
      .from("minutes_docs")
      .insert(row)
      .select("id")
      .maybeSingle();
    saved = res.data;
    error = res.error;
    if (!error) break;
    const named = optionalColumns.find(
      (col) => col in row && new RegExp(col, "i").test(error?.message ?? ""),
    );
    if (!named) break;
    delete row[named];
  }

  // 23505 on (org_id, client_id): a concurrent duplicate of THIS save won the
  // race — which means the document IS stored. That is success, not an error.
  if (error && error.code === "23505" && clientId !== "") {
    return { error: null, ok: true };
  }

  if (error) {
    // The CHECK on meeting_type is the one failure here with a specific, fast
    // fix, and it is ours, not theirs: the code allows six types and the
    // database still allows three. Telling that person to "try again" would
    // have them trying forever. (Postgres 23514 = check_violation; PostgREST
    // 42703 = undefined_column, for the label above.)
    const behind =
      error.code === "23514" ||
      error.code === "42703" ||
      /meeting_type/i.test(error.message ?? "");
    return {
      error: behind
        ? joinUserError(USER_ERRORS.databaseBehind)
        : "Tidak berjaya disimpan — cuba lagi / 没有保存成功 —— 请再试一次 / Could not save — try again",
      ok: false,
    };
  }
  // 2026-08-22 — the moment this record becomes searchable.
  //
  // This is what makes "我記得有一次開會說了什麼，你幫我找出來" answerable:
  // the assistant searches minutes_embeddings, and a document only gets there
  // when a human has confirmed it (docs/助手重做-设计.md §3).
  //
  // Deliberately NOT awaited and deliberately unable to fail the save. The
  // person just confirmed a legal record and is waiting for a page; an
  // embedding vendor having a bad minute must not turn that into "could not
  // save". Anything missed here has embedded_at = NULL and is picked up by
  // `npm run embed:backfill`.
  if (saved?.id) indexMinutesDocInBackground(Number(saved.id));

  return { error: null, ok: true };
}

// countUnreviewed moved to src/lib/extraction-rows.ts (K-4) — one copy for
// this save gate AND /api/draft-minutes, instead of two "keep in sync" twins.

/** A saved minutes document is a page or two of text; anything far past that
 *  is not a document someone typed, so it is not stored. */
const MAX_DRAFT_CHARS = 50_000;

/**
 * Force the two identity-bearing lines of a document to match the session:
 * the letterhead and the Hard Rule 8 audit line. Any version of either that
 * arrived with the body is discarded first, so a client cannot keep a stale —
 * or invented — org name or signer by sending it back.
 */
function stampIdentity(
  markdown: string,
  identity: {
    orgName: string;
    confirmedBy: string;
    dateIso: string;
    lang: MinutesLang;
    /** C-1: printed under the letterhead when present; null prints nothing. */
    ppmNo?: string | null;
  },
): string {
  let body = markdown.replace(/\r\n/g, "\n").trim();

  // Drop a trailing audit block, however many the body happens to carry.
  while (true) {
    const cut = body.lastIndexOf("\n---\n");
    if (cut === -1) break;
    if (!body.slice(cut).includes(`Disediakan oleh ${BRAND_NAME}`)) break;
    body = body.slice(0, cut).trimEnd();
  }

  // Replace (or add) the letterhead, in whichever language it was written.
  // C-1: the registration line rides with the title — it is identity, so the
  // client's version of it is discarded and re-stamped like the title itself.
  // I-5: ppmLine()/PPM_LINE_PATTERN are the ONE format, shared with compose.
  const ppm = (identity.ppmNo ?? "").trim();
  const title =
    minutesTitle(identity.lang, identity.orgName) +
    (ppm !== "" ? `\n${ppmLine(ppm)}` : "");
  const lines = body.split("\n");
  // Drop a pre-existing registration line (re-stamp, never duplicate).
  const cleaned = lines.filter((l) => !PPM_LINE_PATTERN.test(l.trim()));
  const firstContent = cleaned.findIndex((l) => l.trim() !== "");
  if (
    firstContent !== -1 &&
    MINUTES_TITLE_PATTERN.test(cleaned[firstContent].trim())
  ) {
    cleaned[firstContent] = title;
    body = cleaned.join("\n").trim();
  } else {
    body = `${title}\n\n${cleaned.join("\n")}`.trim();
  }

  const audit = minutesAuditLine(
    identity.lang,
    identity.confirmedBy,
    identity.dateIso,
  );
  return `${body}\n\n---\n${audit}`;
}
