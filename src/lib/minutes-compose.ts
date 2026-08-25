import { z } from "zod";
import type { MeetingNotesExtraction } from "@/lib/extraction";
import { formatRm } from "@/lib/minutes-draft";
import { meetingTypeLabel } from "@/lib/meeting-types";
import {
  ITEM_KINDS,
  LABELS,
  minutesAuditLine,
  minutesTitle,
  type MinutesLang,
} from "@/lib/minutes-lang";

// ---------------------------------------------------------------------------
// STEP 3, THE DETERMINISTIC HALF.
//
// The model decides the arrangement (which items belong together, in what
// order, phrased how). Everything that can be checked by counting is checked
// here, and the Markdown is assembled here — so an omission cannot reach a
// document that a society signs and files.
//
// Why this split: on 2026-08-19 the model, asked for the finished document,
// returned well-organised BM sections that quietly lost 5 of 17 items. Nothing
// in the output flagged it. `invented = 0` does not protect against that; a
// coverage check does. Same principle as the money paths — judgement to the
// model, arithmetic to the code.
// ---------------------------------------------------------------------------

export const minutesPlanSchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string().min(1),
      items: z.array(
        z.object({
          source: z.number().int(),
          text: z.string().min(1),
          // D-1 (2026-08-25): the ONE extra thing the model does for the formal
          // template — say whether a line records a discussion, a decision, or
          // an assigned action. `.catch(undefined)`: a made-up kind is dropped,
          // never fatal. Coverage stays the only check that can reject a plan;
          // a misfiled label cannot cost anyone their document.
          kind: z.enum(ITEM_KINDS).optional().catch(undefined),
        }),
      ),
    }),
  ),
  unresolved: z
    .array(z.object({ source: z.number().int(), text: z.string().min(1) }))
    .default([]),
});

export type MinutesPlan = z.infer<typeof minutesPlanSchema>;

export type CoverageReport = {
  ok: boolean;
  /** Indices the model never used — the dangerous case. */
  missing: number[];
  /** Indices it used more than once. */
  duplicated: number[];
  /** Indices that do not exist in the input at all. */
  unknown: number[];
};

/**
 * Every confirmed item must be placed exactly once. This is the guarantee that
 * makes it safe to let a model arrange a legal-ish document.
 */
export function checkCoverage(plan: MinutesPlan, itemCount: number): CoverageReport {
  const used = new Map<number, number>();
  for (const s of plan.sections) {
    for (const it of s.items) used.set(it.source, (used.get(it.source) ?? 0) + 1);
  }
  for (const it of plan.unresolved) {
    used.set(it.source, (used.get(it.source) ?? 0) + 1);
  }

  const missing: number[] = [];
  for (let i = 0; i < itemCount; i++) if (!used.has(i)) missing.push(i);

  const duplicated: number[] = [];
  const unknown: number[] = [];
  for (const [index, times] of used) {
    if (index < 0 || index >= itemCount) unknown.push(index);
    else if (times > 1) duplicated.push(index);
  }

  return {
    ok: missing.length === 0 && duplicated.length === 0 && unknown.length === 0,
    missing,
    duplicated: duplicated.sort((a, b) => a - b),
    unknown: unknown.sort((a, b) => a - b),
  };
}

/** Cosmetic only. Models leave a stray space before terminal punctuation when
 *  a line ends on a name they were told to copy verbatim; that is a rendering
 *  artefact, not a fact, so it is cleaned here rather than begged for in the
 *  prompt. Never touches the characters themselves. */
function tidy(line: string): string {
  return line
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:?!])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

/**
 * Any run of Chinese characters in the model's phrasing must be a run that
 * actually appears in the item it came from.
 *
 * Why this is a check and not an instruction: on 2026-08-19 the model, told
 * plainly to copy names character for character, rendered the class 小小班 as
 * 小小小班. One character. In a document that names who is responsible for
 * what, a name the meeting did not write is the same kind of defect as a
 * decision the meeting did not make — and it is the failure the extraction
 * prompt already guards against upstream ("do not correct unusual names"), so
 * it would be strange to let it back in at the drafting step.
 */
export function checkNames(
  plan: MinutesPlan,
  sourceTexts: string[],
  /** Terms the organisation itself put in its glossary. A glossary ruling may
   *  legitimately introduce characters the note did not contain (the society's
   *  preferred spelling of its own word), so those are allowed too — but only
   *  those, and only exactly. */
  allowedRuns: string[] = [],
  /**
   * WHEN THIS CHECK CAN RUN AT ALL.
   *
   * It works by asking "where did this Chinese come from?", so it only means
   * anything when the document itself is NOT written in Chinese: in a Malay or
   * English document, every Chinese character on the page is a copied name, so
   * one that came from nowhere is a corrupted name.
   *
   * In a Chinese document the page is full of Chinese the note never
   * contained, and there is no reliable way to tell a rewritten sentence from
   * a rewritten name by comparing strings — a near-miss rule was tried on
   * 2026-08-19 and flagged "小小班的主持" (a correct rewording) as readily as
   * "小小小班" (a corrupted label). A check that cries wolf on good documents
   * is worse than no check, so the caller SKIPS this for Chinese output and
   * the limitation is stated on screen rather than papered over.
   */
): { ok: boolean; altered: number[] } {
  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
  const altered = new Set<number>();
  const allowed = allowedRuns.join("\u0000");

  const inspect = (item: { source: number; text: string }) => {
    const source = sourceTexts[item.source];
    if (source === undefined) return;
    for (const run of item.text.match(CJK) ?? []) {
      if (!source.includes(run) && !allowed.includes(run)) altered.add(item.source);
    }
  };

  for (const section of plan.sections) section.items.forEach(inspect);
  plan.unresolved.forEach(inspect);

  return { ok: altered.size === 0, altered: [...altered].sort((a, b) => a - b) };
}

/**
 * The opening summary — assembled from the section headings, not written.
 *
 * 2026-08-19: the model was originally asked for a "purpose" sentence, and on
 * the very first real run it produced a fluent one describing a camping trip
 * and a family day. Neither was anywhere in the notes. That is the one thing
 * this whole pipeline exists to prevent, and it happened in the single place
 * free prose was allowed — so free prose is no longer allowed. The headings
 * are the model's judgement and every heading is anchored to items it actually
 * covered; stringing them together is assembly, which the code does.
 */
function summariseSections(plan: MinutesPlan, lang: MinutesLang): string[] {
  const headings = plan.sections
    .filter((s) => s.items.length > 0)
    // Headings are left exactly as written. Lower-casing the first letter to
    // make the sentence flow produced "pembahagian Tugas Pengendalian Kelas",
    // because the rest of the heading is title case — worse than just quoting.
    .map((s) => tidy(s.heading));
  if (headings.length === 0) return [];

  const L = LABELS[lang];
  const lines = [L.discussed(headings.join("; "))];
  if (plan.unresolved.length > 0) {
    lines.push("", L.stillOpen(plan.unresolved.length, L.unresolved));
  }
  return lines;
}

export type ComposeOptions = {
  orgName: string;
  confirmedBy: string;
  dateIso: string;
  /** Defaults to Bahasa Malaysia — what eROSES needs, and what every document
   *  produced before this option existed was written in. */
  lang?: MinutesLang;
  /** C-1 / D-1: the admin-entered PPM/ROS registration number, printed under
   *  the letterhead so a reader can check the document against the public
   *  register. null/absent prints nothing. The save action re-stamps this line
   *  from the org record (actions.ts stampIdentity), so a client cannot keep a
   *  stale or invented number by sending it back. */
  ppmNo?: string | null;
};

// ---------------------------------------------------------------------------
// I-5 (work order 27): the PPM registration line, ONE source. It used to be
// hand-copied in three places (compose here, the save action's re-stamp, and
// the re-stamp's recognition regex) — change any one of them alone and a
// saved document grows a second registration line, or the re-stamp stops
// recognising the old one. Same treatment the letterhead title already has.
// ---------------------------------------------------------------------------

/** The exact label the registration line starts with, everywhere. */
export const PPM_LINE_PREFIX = "No. Pendaftaran (PPM/ROS):";

/** The full registration line for a document. */
export function ppmLine(ppm: string): string {
  return `${PPM_LINE_PREFIX} ${ppm}`;
}

/** Recognises a registration line — DERIVED from the prefix, so the three
 *  users cannot drift apart again. */
export const PPM_LINE_PATTERN = new RegExp(
  `^${PPM_LINE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  "i",
);

/**
 * Assemble the document. The model's contribution is headings, phrasing and
 * order; attendance, money and office bearers are rendered straight from the
 * confirmed extraction and never pass through the model at all — the same
 * reason receipts are computed and not generated.
 */
export function composeMinutesMd(
  plan: MinutesPlan,
  extraction: MeetingNotesExtraction,
  opts: ComposeOptions,
): string {
  const lang = opts.lang ?? "bm";
  const L = LABELS[lang];
  const out: string[] = [];
  out.push(minutesTitle(lang, opts.orgName));

  // C-1: the registration number rides directly under the letterhead —
  // ppmLine() is the ONE format (I-5), shared with the save action's re-stamp.
  const ppm = (opts.ppmNo ?? "").trim();
  if (ppm !== "") out.push(ppmLine(ppm));

  // D-1: "Bil. ____ / 2026". The year is read off the confirmed meeting date;
  // the running number is a blank for the society to fill in (nobody told
  // Minit which meeting of the year this was, and Hard Rule 1 says a gap
  // stays a gap — the document is editable before saving). No date, no line.
  const dateValue = extraction.meeting_date.value;
  if (
    extraction.meeting_date.confidence !== "missing" &&
    /^\d{4}-/.test(dateValue)
  ) {
    out.push(L.bil(dateValue.slice(0, 4)));
  }

  // D-2: a reading copy must say it is one. BM has no note — it IS the filing
  // language.
  if (L.translationNote) out.push("", `[ ${L.translationNote} ]`);
  out.push("");

  const type = extraction.meeting_type;
  if (type.confidence !== "missing" && type.value !== "") {
    out.push(
      `${L.meetingType}: ${meetingTypeLabel(type.value, lang, extraction.meeting_type_label)}`,
    );
  }
  if (extraction.meeting_date.confidence !== "missing" && extraction.meeting_date.value !== "") {
    out.push(`${L.date}: ${extraction.meeting_date.value}`);
  }
  if (extraction.meeting_venue.confidence !== "missing" && extraction.meeting_venue.value !== "") {
    out.push(`${L.venue}: ${extraction.meeting_venue.value}`);
  }
  out.push("");

  const purpose = summariseSections(plan, lang);
  if (purpose.length > 0) out.push(`## ${L.purpose}`, "", ...purpose, "");

  // D-1: the attendance sheet. When a confirmed office bearer has exactly the
  // same confirmed name as an attendee, their position is printed beside the
  // name — a plain string join of two facts the person already confirmed, not
  // an inference. Anything less than an exact match prints nothing.
  const positionByName = new Map<string, string>();
  for (const b of extraction.office_bearers) {
    if (
      b.position.confidence !== "missing" &&
      b.person_name.confidence !== "missing" &&
      b.person_name.value !== ""
    ) {
      positionByName.set(b.person_name.value.trim(), b.position.value);
    }
  }
  const attendees = extraction.attendees.filter(
    (a) => a.name.confidence !== "missing" && a.name.value !== "",
  );
  if (attendees.length > 0) {
    out.push(`## ${L.attendance}`, "");
    attendees.forEach((a, i) => {
      const position = positionByName.get(a.name.value.trim());
      out.push(
        `${i + 1}. ${a.name.value}${position ? ` — ${position}` : ""}`,
      );
    });
    out.push("");
  }

  // Sections that came back empty are dropped rather than printed as a bare
  // heading with nothing under it. D-1: an item the model tagged gets its
  // Perbincangan / Keputusan / Tindakan prefix — the label is printed by code
  // from a fixed table, so a wrong TAG can misfile a line, but no tag can ever
  // change what the line says. An untagged item prints exactly as before.
  const sections = plan.sections.filter((s) => s.items.length > 0);
  sections.forEach((s, si) => {
    out.push(`## ${si + 1}. ${tidy(s.heading)}`, "");
    s.items.forEach((it, ii) => {
      const prefix = it.kind ? `${L.kind[it.kind]}: ` : "";
      out.push(`${si + 1}.${ii + 1} ${prefix}${tidy(it.text)}`);
    });
    out.push("");
  });

  const figures = extraction.figures.filter(
    (f) =>
      f.description.confidence !== "missing" &&
      f.amount_cents.confidence !== "missing" &&
      f.amount_cents.value !== null,
  );
  if (figures.length > 0) {
    out.push(`## ${L.money}`, "");
    figures.forEach((f) =>
      out.push(`- ${f.description.value}: ${formatRm(f.amount_cents.value as number)}`),
    );
    out.push("");
  }

  const bearers = extraction.office_bearers.filter(
    (b) =>
      b.position.confidence !== "missing" &&
      b.person_name.confidence !== "missing" &&
      b.person_name.value !== "",
  );
  if (bearers.length > 0) {
    out.push(`## ${L.officeBearers}`, "");
    bearers.forEach((b) => out.push(`- ${b.position.value}: ${b.person_name.value}`));
    out.push("");
  }

  if (plan.unresolved.length > 0) {
    out.push(`## ${L.unresolved}`, "");
    plan.unresolved.forEach((it, i) => out.push(`${i + 1}. ${tidy(it.text)}`));
    out.push("");
  }

  // D-1: the closing and the signature block. All boilerplate structure of the
  // genre — the one factual claim ("the meeting ended") is entailed by the
  // minutes existing at all. The preparer line names the person the session
  // says confirmed this document (Hard Rule 8); the endorsement line is a
  // labelled blank for the chairperson to sign at the next meeting — Minit
  // does not know who that is, so it names nobody.
  out.push(`## ${L.penutup}`, "", L.closing, "");
  out.push(
    L.preparedBy,
    "",
    "____________________",
    `( ${opts.confirmedBy} )`,
    "",
    L.endorsedBy,
    "",
    "____________________",
    L.chairSlot,
    "",
  );

  out.push("---", minutesAuditLine(lang, opts.confirmedBy, opts.dateIso));

  return out.join("\n");
}
