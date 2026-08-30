import type { MeetingNotesExtraction } from "@/lib/extraction";
import { meetingTypeLabel } from "@/lib/meeting-types";
import { draftedByLine } from "@/lib/brand";
import { formatRm } from "@/lib/minit-format";
import { composeStructuredMinutesMd, minutesStructure } from "@/lib/minutes-compose";
import { normalizeFullwidth } from "@/lib/bm-guard";

// ---------------------------------------------------------------------------
// DETERMINISTIC BM minutes renderer (template fill, no LLM).
//
// Why this exists: the live pipeline drafts minutes with the LLM (see
// /src/prompts/draft-minutes.ts). But the review screen needs an instant,
// zero-cost preview that updates as the human confirms/edits fields — and it
// doubles as the demo before the API key is connected. Same unbreakable rule
// as the prompt: a fact that is not in the extraction does NOT appear here.
// Only non-missing fields are rendered; unconfirmed ("check") values are kept
// but the document stays watermarked as a draft until everything is resolved.
// ---------------------------------------------------------------------------

export const DRAFT_WATERMARK = "DRAF — sila semak sebelum guna / DRAFT — review before use";

// Moved to minit-format.ts (the format owns how money prints); re-exported
// unchanged for this file's many importers.
export { formatRm };

export type MinutesDraftOptions = {
  orgName: string;
  /** When set, the audit line is rendered (Hard Rule 8). */
  confirmedBy?: { name: string; dateIso: string };
};

export function renderMinutesDraftBm(
  e: MeetingNotesExtraction,
  opts: MinutesDraftOptions
): string {
  // 97 §2: this renderer only ever produces the BM document, so fullwidth
  // keyboard residue (＃ － 。 fullwidth space) is normalized away here —
  // deterministic, zero AI. The registered org name and the signer print
  // verbatim, fullwidth marks included.
  const preserve = [opts.orgName, opts.confirmedBy?.name ?? ""];
  const bm = (md: string) => normalizeFullwidth(md, preserve);
  return bm(renderMinutesDraftBmRaw(e, opts));
}

function renderMinutesDraftBmRaw(
  e: MeetingNotesExtraction,
  opts: MinutesDraftOptions
): string {
  // G2 (work order 68 §4): a STRUCTURED document (a printed formal minit read
  // by G1) previews through the SAME standard-format composer that produces
  // the final document — J judges the product by this preview, so a preview
  // in a different layout than the finished document is a lie about the
  // product. Deterministic, zero AI, paragraphs verbatim.
  if (minutesStructure(e)) {
    const md = composeStructuredMinutesMd(e, {
      orgName: opts.orgName,
      confirmedBy: opts.confirmedBy?.name ?? "",
      dateIso: opts.confirmedBy?.dateIso ?? "",
      lang: "bm",
      unconfirmedPreview: !opts.confirmedBy,
    });
    return opts.confirmedBy ? md : `[${DRAFT_WATERMARK}]\n\n${md}`;
  }

  const lines: string[] = [];

  if (!opts.confirmedBy) lines.push(`[${DRAFT_WATERMARK}]`, "");

  lines.push(`# MINIT MESYUARAT — ${opts.orgName}`, "");

  const type = e.meeting_type;
  if (type.confidence !== "missing" && type.value !== "") {
    lines.push(
      `Jenis mesyuarat: ${meetingTypeLabel(type.value, "bm", e.meeting_type_label)}`
    );
  }
  if (e.meeting_date.confidence !== "missing" && e.meeting_date.value !== "") {
    lines.push(`Tarikh: ${e.meeting_date.value}`);
  }
  if (e.meeting_venue.confidence !== "missing" && e.meeting_venue.value !== "") {
    lines.push(`Tempat: ${e.meeting_venue.value}`);
  }
  lines.push("");

  const attendees = e.attendees.filter(
    (a) => a.name.confidence !== "missing" && a.name.value !== ""
  );
  if (attendees.length > 0) {
    lines.push("## KEHADIRAN", "");
    attendees.forEach((a, i) => lines.push(`${i + 1}. ${a.name.value}`));
    // 28/8 formality pass — the same count line composeMinutesMd prints, so
    // the free preview matches the formal document. Counted by code.
    lines.push("", `Jumlah hadir: ${attendees.length} orang`, "");
  }

  const resolutions = e.resolutions.filter(
    (r) => r.text.confidence !== "missing" && r.text.value !== ""
  );
  if (resolutions.length > 0) {
    lines.push("## PERKARA DIBINCANGKAN DAN KEPUTUSAN", "");
    // J 28/8 evening item 4: a note line that CARRIES its own list number
    // ("1. 宏道 10位") used to print as "2. 1. 宏道 10位" — the double
    // numbering he circled. A line with its own enumerator prints verbatim;
    // only unnumbered lines get numbered by us.
    resolutions.forEach((r, i) => {
      const own = /^\s*\d{1,3}[.、．)]\s/.test(r.text.value);
      lines.push(own ? r.text.value : `${i + 1}. ${r.text.value}`);
    });
    lines.push("");
  }

  const figures = e.figures.filter(
    (f) =>
      f.description.confidence !== "missing" &&
      f.amount_cents.confidence !== "missing" &&
      f.amount_cents.value !== null
  );
  if (figures.length > 0) {
    lines.push("## KEWANGAN", "");
    figures.forEach((f) =>
      lines.push(`- ${f.description.value}: ${formatRm(f.amount_cents.value as number)}`)
    );
    lines.push("");
  }

  const bearers = e.office_bearers.filter(
    (b) =>
      b.position.confidence !== "missing" &&
      b.person_name.confidence !== "missing" &&
      b.person_name.value !== ""
  );
  if (bearers.length > 0) {
    lines.push("## PEMEGANG JAWATAN", "");
    bearers.forEach((b) => lines.push(`- ${b.position.value}: ${b.person_name.value}`));
    lines.push("");
  }

  if (opts.confirmedBy) {
    lines.push(
      "---",
      draftedByLine.bm(opts.confirmedBy.name, opts.confirmedBy.dateIso) +
        " / " +
        draftedByLine.en(opts.confirmedBy.name, opts.confirmedBy.dateIso)
    );
  }

  return lines.join("\n");
}
