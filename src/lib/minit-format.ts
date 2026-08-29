import {
  LABELS,
  minutesAuditLine,
  minutesTitle,
  type ItemKind,
  type MinutesLang,
} from "@/lib/minutes-lang";

/** J 28/8 evening item 3: wide enough to sign on. Lives HERE (the format);
 *  minutes-compose re-exports it for its existing importers. */
export const SIGNATURE_LINE = "_".repeat(40);

/** RM from integer sen, no floating-point drift. Lives with the format (it is
 *  how documents PRINT money); minutes-draft re-exports it for its importers.
 *  Hard Rule 2 arithmetic stays wherever the sums are computed. */
export function formatRm(amountCents: number): string {
  const rm = Math.trunc(amountCents / 100);
  const sen = Math.abs(amountCents % 100);
  return `RM${rm.toLocaleString("en-MY")}.${String(sen).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// THE STANDARD MINIT FORMAT — work order 68 (⑦ quality), package G0.
//
// WHY THIS FILE EXISTS. On 2026-08-29 J ran his own society's PRINTED AGM
// minutes (the standard Malaysian society format) through the pipeline and the
// output was a memo-shaped list: agenda table rows double-numbered
// ("1. 1.Ucapan Pengerusi"), the per-agenda prose paragraphs mostly gone, MASA
// and the signature block missing. Nothing in eval measured "does the output
// look like a document a secretary can file" — extraction accuracy was 92.9%
// while the document was unusable. This module IS that missing standard:
//
//   letterhead (org + meeting title line)
//   TARIKH / MASA / TEMPAT block
//   attendance count ("AJK yang hadir : 33 orang")
//   the Agenda summary table
//   one section per agenda item, ORIGINAL numbering, prose paragraphs
//   penangguhan (adjournment)
//   signature block (Disediakan oleh / Disahkan oleh, with roles) + audit line
//
// Modelled on J's real sample A — an actual registered society's format — with
// BM as the filing language and zh/en as reading copies of the SAME layout.
//
// TWO EXPORTS MATTER:
//   renderMinitMd(model)  — the one renderer of the format (used by compose).
//   lintMinitMd(md, ...)  — the RULER: deterministic checks that a produced
//                           document actually has the format. Used by the
//                           quality eval so "looks like a document" is a
//                           number, not an opinion.
//
// This file is PURE: no AI, no I/O, no React. Money stays out of it entirely.
// ---------------------------------------------------------------------------

// --- the model -------------------------------------------------------------

export type MinitSectionItem = {
  /** Perbincangan / Keputusan / Tindakan tag; absent = plain paragraph. */
  kind?: ItemKind;
  /** The paragraph or line, already in the document's language. */
  text: string;
  /** The line's own printed enumerator ("2.1") when the source document had
   *  one — printed as-is, NEVER wrapped in a second layer of numbering. */
  ownNo?: string;
};

export type MinitSection = {
  /** The ORIGINAL printed number ("1", "2") for structured documents; ""
   *  means "we devised this section" and it is numbered by position. */
  no: string;
  title: string;
  items: MinitSectionItem[];
};

export type MinitDocModel = {
  lang: MinutesLang;
  orgName: string;
  /** PPM/ROS registration line content; null/absent prints nothing. */
  ppmNo?: string | null;
  /** "MESYUARAT AGUNG TAHUNAN 2026" — the formal title line under the
   *  letterhead. Empty prints nothing (type unknown = nothing invented). */
  meetingTitleLine?: string;
  /** Printed after the title when the reading copy is not the filing copy. */
  bilYear?: string;
  /** "Jenis mesyuarat: …" — the label is added by the renderer. */
  meetingTypeText?: string;
  tarikh?: string;
  /** MASA, verbatim as written ("8.30 PM – 10.30 PM"). */
  masa?: string;
  tempat?: string;
  /** Verbatim attendance-count line from the document ("AJK yang hadir : 33
   *  orang"). Printed in the header block, exactly as the source wrote it. */
  attendanceCountText?: string;
  /** The named attendance sheet (position beside a name where confirmed). */
  attendees?: { name: string; position?: string }[];
  /** The Agenda summary table, original numbering. Usually rebuilt from
   *  `sections` by the caller — kept separate so a document whose table and
   *  sections genuinely differ can say so. */
  agendaTable?: { no: string; title: string }[];
  sections: MinitSection[];
  figures?: { description: string; amountText: string }[];
  officeBearers?: { position: string; name: string }[];
  unresolved?: string[];
  /** Verbatim adjournment sentence ("Mesyuarat ditangguhkan pada 10.30 PM").
   *  Absent = the language's standard closing line. */
  adjournment?: string;
  preparedBy: { name: string; role?: string };
  /** Endorsement is a labelled blank unless the document names the endorser
   *  (sample A does: Disahkan oleh — PENGERUSI, with the chairperson's name). */
  endorsedBy?: { name?: string; role?: string };
  /** The TUJUAN opening summary (unstructured documents only — a structured
   *  document's agenda table already says what the meeting was about). */
  purpose?: string[];
  /** Hard Rule 8 audit line — printed ONLY when the document is confirmed.
   *  The free live preview of an unconfirmed extraction carries no audit
   *  line (it would claim a confirmation that has not happened). */
  audit?: { confirmedBy: string; dateIso: string };
};

// --- enumerator handling (the double-numbering fix) ------------------------

/**
 * A line that starts with its own list number: "1. x", "1.x", "2.1) x",
 * "4、x". The punctuation separator is REQUIRED — "12 Ogos 2026" and
 * "10.30 PM" lead with digits but are dates and times, not enumerators, and
 * stripping those would corrupt content. (The trailing-digit guard keeps
 * "10.30" — digits on both sides of the dot with nothing after — intact.)
 */
export const OWN_ENUM_PATTERN = /^\s*(\d{1,3}(?:\.\d{1,3})*)\s*[.、．)](?!\d)\s*/;

/** The line's own leading enumerator, or null. */
export function ownEnumeratorOf(text: string): string | null {
  const m = text.match(OWN_ENUM_PATTERN);
  return m ? m[1] : null;
}

/**
 * Strip a leading enumerator — list furniture, not a fact (the same reading
 * checkMergedFacts already applies). Used whenever the RENDERER numbers the
 * line itself: one line, one number, never "1. 1.Ucapan Pengerusi".
 */
export function stripOwnEnumerator(text: string): string {
  return text.replace(OWN_ENUM_PATTERN, "").trim();
}

// --- per-language furniture the base LABELS table does not carry -----------

const FORMAT_LABELS: Record<
  MinutesLang,
  {
    agendaHeading: string;
    /** Structured section heading: "Agenda 1: Ucapan Pengerusi". */
    sectionHeading: (no: string, title: string) => string;
  }
> = {
  bm: {
    agendaHeading: "Agenda",
    sectionHeading: (no, title) => `Agenda ${no}: ${title}`,
  },
  zh: {
    agendaHeading: "议程",
    sectionHeading: (no, title) => `议程 ${no}：${title}`,
  },
  en: {
    agendaHeading: "Agenda",
    sectionHeading: (no, title) => `Agenda ${no}: ${title}`,
  },
};

/**
 * The formal meeting-title line under the letterhead —
 * "MESYUARAT AGUNG TAHUNAN 2026" — from the type LABEL the caller already
 * localised (meetingTypeLabel) and the meeting year. Empty label = "" (an
 * unknown type prints nothing; the format never invents).
 */
export function meetingTitleLine(
  lang: MinutesLang,
  typeLabel: string,
  year?: string,
): string {
  const label = typeLabel.trim().replace(/\s*[（(][A-Z]+[）)]\s*$/, "");
  if (label === "") return "";
  if (lang === "zh") return year ? `${year} 年${label}` : label;
  const upper = label.toUpperCase();
  return year ? `${upper} ${year}` : upper;
}

// --- the renderer ----------------------------------------------------------

/** Cosmetic tidy shared with the old composer — never touches characters. */
function tidy(line: string): string {
  return line
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:?!])/g, "$1")
    .trim();
}

/**
 * THE one renderer of the standard format. Markdown out, minutes-pdf.ts
 * lines-model compatible (`#`, `##`, `---`, plain lines only).
 *
 * Everything here is assembly — judgement (grouping, phrasing) happened
 * upstream, and coverage was already checked by code. This function must
 * never drop an item it was given.
 */
export function renderMinitMd(model: MinitDocModel): string {
  const { lang } = model;
  const L = LABELS[lang];
  const F = FORMAT_LABELS[lang];
  const out: string[] = [];

  // Letterhead. The "# MINIT MESYUARAT — org" line is a machine contract
  // (stampIdentity re-writes it; the PDF centres it; history recognises it)
  // and stays EXACTLY as it was. The formal title line rides under it.
  out.push(minutesTitle(lang, model.orgName));
  const ppm = (model.ppmNo ?? "").trim();
  if (ppm !== "") out.push(`No. Pendaftaran (PPM/ROS): ${ppm}`);
  if (model.meetingTitleLine && model.meetingTitleLine.trim() !== "") {
    out.push(`**${model.meetingTitleLine.trim()}**`);
  }
  if (model.bilYear) out.push(L.bil(model.bilYear));
  if (L.translationNote) out.push("", `[ ${L.translationNote} ]`);
  out.push("");

  // TARIKH / MASA / TEMPAT block — the standard header block of a minit.
  if (model.meetingTypeText) out.push(`${L.meetingType}: ${model.meetingTypeText}`);
  if (model.tarikh) out.push(`${L.date}: ${model.tarikh}`);
  if (model.masa) out.push(`${L.masa}: ${model.masa}`);
  if (model.tempat) out.push(`${L.venue}: ${model.tempat}`);
  // The verbatim headcount line sits with the header block, as in sample A.
  if (model.attendanceCountText) out.push(model.attendanceCountText);
  out.push("");

  // The Agenda summary table — 總表歸總表. Original numbering, one layer.
  const agenda = model.agendaTable ?? [];
  if (agenda.length > 0) {
    out.push(`## ${F.agendaHeading}`, "");
    for (const row of agenda) {
      out.push(`${row.no}. ${tidy(stripOwnEnumerator(row.title))}`);
    }
    out.push("");
  }

  // The TUJUAN opening summary — unstructured documents only; assembled from
  // headings upstream, never free prose (the camping-trip incident).
  const purpose = model.purpose ?? [];
  if (purpose.length > 0) {
    out.push(`## ${L.purpose}`, "", ...purpose, "");
  }

  // The attendance sheet (named list) — after the header, before the body.
  const attendees = model.attendees ?? [];
  if (attendees.length > 0) {
    out.push(`## ${L.attendance}`, "");
    attendees.forEach((a, i) => {
      out.push(`${i + 1}. ${a.name}${a.position ? ` — ${a.position}` : ""}`);
    });
    out.push("", L.attendanceCount(attendees.length), "");
  }

  // Sections — 節歸節. A structured section keeps its ORIGINAL number and the
  // "Agenda N:" heading of the genre; a devised section is numbered by
  // position as before. Items print as prose paragraphs; an item that carries
  // its own enumerator keeps it and never gets a second one.
  const sections = model.sections.filter((s) => s.items.length > 0);
  const structured = sections.some((s) => s.no !== "");
  sections.forEach((s, si) => {
    const heading = s.no !== ""
      ? F.sectionHeading(s.no, tidy(stripOwnEnumerator(s.title)))
      : `${si + 1}. ${tidy(s.title)}`;
    out.push(`## ${heading}`, "");
    s.items.forEach((it, ii) => {
      // zh prints NO mechanical kind prefixes — "2.1 行动：…" was the
      // officialese J named in his test list (work order 68 §1-5). BM/EN keep
      // Perbincangan / Keputusan / Tindakan, the genre's own labels.
      const prefix = it.kind && lang !== "zh" ? `${L.kind[it.kind]}: ` : "";
      const body = tidy(it.text);
      if (structured) {
        // Prose paragraphs. Own enumerator (a sub-numbered line like "2.1")
        // prints as written; everything else is an unnumbered paragraph.
        out.push(it.ownNo ? `${it.ownNo} ${prefix}${stripOwnEnumerator(body)}` : `${prefix}${body}`);
        if (ii < s.items.length - 1) out.push("");
      } else {
        // The list form (whiteboards, free notes): our numbering, so the
        // line's own enumerator is stripped — one line, one number.
        out.push(`${si + 1}.${ii + 1} ${prefix}${stripOwnEnumerator(body)}`);
      }
    });
    out.push("");
  });

  const figures = model.figures ?? [];
  if (figures.length > 0) {
    out.push(`## ${L.money}`, "");
    figures.forEach((f) => out.push(`- ${f.description}: ${f.amountText}`));
    out.push("");
  }

  const bearers = model.officeBearers ?? [];
  if (bearers.length > 0) {
    out.push(`## ${L.officeBearers}`, "");
    bearers.forEach((b) => out.push(`- ${b.position}: ${b.name}`));
    out.push("");
  }

  const unresolved = model.unresolved ?? [];
  if (unresolved.length > 0) {
    out.push(`## ${L.unresolved}`, "");
    unresolved.forEach((t, i) => out.push(`${i + 1}. ${tidy(t)}`));
    out.push("");
  }

  // PENUTUP — the verbatim adjournment sentence when the document has one
  // ("Mesyuarat ditangguhkan pada 10.30 PM"), the standard line otherwise.
  out.push(`## ${L.penutup}`, "", model.adjournment?.trim() || L.closing, "");

  // Signature block. Roles print under the names when known (sample A:
  // SETIAUSAHA under the preparer, PENGERUSI under the endorser); the
  // endorsement name stays a labelled blank when nobody recorded it, and an
  // unconfirmed preview's empty preparer prints as a blank slot, not "(  )".
  out.push(L.preparedBy, "", SIGNATURE_LINE);
  if (model.preparedBy.name.trim() !== "") out.push(`( ${model.preparedBy.name} )`);
  if (model.preparedBy.role) out.push(model.preparedBy.role.toUpperCase());
  out.push("", L.endorsedBy, "", SIGNATURE_LINE);
  const endorseName = model.endorsedBy?.name?.trim();
  out.push(endorseName ? `( ${endorseName} )` : L.chairSlot);
  if (model.endorsedBy?.role) out.push(model.endorsedBy.role.toUpperCase());
  out.push("");

  if (model.audit) {
    out.push("---", minutesAuditLine(lang, model.audit.confirmedBy, model.audit.dateIso));
  }
  return out.join("\n");
}

// --- the ruler -------------------------------------------------------------

export type MinitLintFinding = {
  code:
    | "letterhead_missing"
    | "double_numbering"
    | "signature_block_missing"
    | "closing_missing"
    | "masa_missing"
    | "agenda_table_missing"
    | "attendance_count_missing"
    | "content_lost"
    | "forbidden_content";
  detail: string;
};

export type MinitLintExpectations = {
  /** The document's language (which labels the checks look for). */
  lang: MinutesLang;
  /** The source document had a MASA — the output must carry one. */
  masa?: boolean;
  /** The source was a structured minit — an Agenda summary table must exist. */
  agendaTable?: boolean;
  /** The source recorded a headcount — it must survive. */
  attendanceCount?: boolean;
  /** Strings that must appear (representative phrases per section — the
   *  "prose survived" probes). Checked verbatim. */
  mustContain?: string[];
  /** Strings that must NOT appear (e.g. a heading for something never
   *  discussed). Checked verbatim. */
  mustNotContain?: string[];
};

/**
 * Deterministic format lint — the quality eval's ruler. Every finding is a
 * defect J counted on the real sample; zero findings is the bar.
 */
export function lintMinitMd(
  md: string,
  expect: MinitLintExpectations,
): MinitLintFinding[] {
  const L = LABELS[expect.lang];
  const findings: MinitLintFinding[] = [];
  const lines = md.split("\n");

  if (!lines.some((l) => l.startsWith("# "))) {
    findings.push({ code: "letterhead_missing", detail: "no `# ` letterhead line" });
  }

  // Double numbering: a rendered number immediately followed by the line's own
  // enumerator — "1. 1.Ucapan Pengerusi", "1.1 2. …", "2.1 Keputusan: 3. x".
  const DOUBLE = /^\s*\d{1,3}(?:\.\d{1,3})*[.、．)]?\s+(?:[^\d\n]{0,24}?:\s*)?\d{1,3}[.、．)](?!\d)\s*\S/;
  for (const l of lines) {
    // "Bil.: ____ / 2026" and dates are not enumerations; only flag body lines.
    if (DOUBLE.test(l) && !/^\s*\d{4}-\d{2}-\d{2}/.test(l)) {
      findings.push({ code: "double_numbering", detail: l.trim().slice(0, 80) });
    }
  }

  if (!md.includes(L.preparedBy) || !md.includes(L.endorsedBy)) {
    findings.push({
      code: "signature_block_missing",
      detail: `expected "${L.preparedBy}" and "${L.endorsedBy}"`,
    });
  }
  if (!md.includes(`## ${L.penutup}`)) {
    findings.push({ code: "closing_missing", detail: `no "## ${L.penutup}"` });
  }
  if (expect.masa && !md.includes(`${L.masa}:`)) {
    findings.push({ code: "masa_missing", detail: `no "${L.masa}:" line` });
  }
  if (expect.agendaTable) {
    const heading = `## ${FORMAT_LABELS[expect.lang].agendaHeading}`;
    if (!lines.some((l) => l.trim() === heading)) {
      findings.push({ code: "agenda_table_missing", detail: `no "${heading}"` });
    }
  }
  if (expect.attendanceCount) {
    // Either the verbatim source line or the computed count line will do —
    // what may not happen is the headcount vanishing.
    const hasCount =
      /\b\d+\s*orang\b/.test(md) || /出席人数：\s*\d+/.test(md) || /Total present:\s*\d+/.test(md);
    if (!hasCount) {
      findings.push({ code: "attendance_count_missing", detail: "no headcount anywhere" });
    }
  }
  for (const probe of expect.mustContain ?? []) {
    if (!md.includes(probe)) {
      findings.push({ code: "content_lost", detail: probe.slice(0, 80) });
    }
  }
  for (const probe of expect.mustNotContain ?? []) {
    if (md.includes(probe)) {
      findings.push({ code: "forbidden_content", detail: probe.slice(0, 80) });
    }
  }
  return findings;
}
