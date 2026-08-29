import { z } from "zod";

// ---------------------------------------------------------------------------
// LAPORAN AKTIVITI — the activity report eROSES Penyata Tahunan step 6 asks
// the society to upload (D2-3, work order 56).
//
// Division of labour, per the hard rules:
//   * WHAT HAPPENED comes from the org's own records — events_meetings rows
//     and confirmed minutes — assembled by the route, never invented.
//   * The AI's only job is WORDING: a short BM introduction and one or two
//     plain sentences per activity, from the given fields alone (Hard Rule
//     1: a fact not in the input must not appear in the output).
//   * The person EDITS and confirms every sentence before the PDF exists
//     (Hard Rule 8: audit line with the confirmer's name; a document that
//     was not confirmed carries the DRAFT watermark).
//
// This file is pure: the zod contract for what the model returns, and the
// deterministic text layout the PDF renders. No I/O, fully unit-tested.
// ---------------------------------------------------------------------------

/** One activity as loaded from the org's records (route-side). */
export type ActivitySource = {
  /** YYYY-MM-DD ("" when the record has no date). */
  dateIso: string;
  title: string;
  /** events_meetings.kind (agm/committee/activity/class) or "mesyuarat". */
  kind: string;
  venue?: string | null;
  note?: string | null;
};

export const laporanDraftSchema = z.object({
  /** 2–3 BM sentences introducing the year's activities. */
  pengenalan: z.string().min(1).max(1500),
  aktiviti: z
    .array(
      z.object({
        tarikh: z.string().max(40),
        nama: z.string().min(1).max(200),
        penerangan: z.string().max(800),
      }),
    )
    .max(120),
});

export type LaporanDraft = z.infer<typeof laporanDraftSchema>;

export function parseLaporanDraft(raw: unknown) {
  return laporanDraftSchema.safeParse(raw);
}

/**
 * The finished document as plain text, rendered by the same A4 layout the
 * AGM pack uses (agm-pdf.ts renderTextDoc: first block = centred letterhead,
 * ALL-CAPS lines = bold section titles).
 */
export function buildLaporanText(p: {
  orgName: string;
  /** e.g. "PPM-005-10-01012020", printed under the name when present. */
  orgRegistrationNo?: string | null;
  /** e.g. "2026" or "2026-01-01 hingga 2026-12-31". */
  periodLabel: string;
  pengenalan: string;
  aktiviti: { tarikh: string; nama: string; penerangan: string }[];
  /** Hard Rule 8. Null = not confirmed yet → the caller watermarks DRAFT. */
  confirmedBy: string | null;
  confirmedOnIso: string;
}): string {
  const head = [
    p.orgName,
    ...(p.orgRegistrationNo ? [`No. Pendaftaran: ${p.orgRegistrationNo}`] : []),
    "",
  ];
  const rows = p.aktiviti.flatMap((a, i) => {
    const line = `${i + 1}. ${a.tarikh ? `[${a.tarikh}] ` : ""}${a.nama}`;
    return a.penerangan.trim() === ""
      ? [line, ""]
      : [line, `   ${a.penerangan.trim()}`, ""];
  });
  return [
    ...head,
    "LAPORAN AKTIVITI PERTUBUHAN",
    `Tempoh: ${p.periodLabel}`,
    "",
    p.pengenalan.trim(),
    "",
    "SENARAI AKTIVITI",
    "",
    ...rows,
    "",
    // The audit line (Hard Rule 8) — same wording family as the other
    // generated documents.
    p.confirmedBy
      ? `Disediakan oleh MinitAI, disahkan oleh ${p.confirmedBy} pada ${p.confirmedOnIso}.`
      : `Draf disediakan oleh MinitAI pada ${p.confirmedOnIso} — DRAF, semak sebelum guna.`,
  ].join("\n");
}
