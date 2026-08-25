import { z } from "zod";
import { MEETING_TYPES } from "@/lib/meeting-types";

// Re-exported so the many existing importers of `MEETING_TYPES` from this file
// keep working; @/lib/meeting-types is the single source of truth.
export { MEETING_TYPES } from "@/lib/meeting-types";
export type { MeetingType } from "@/lib/meeting-types";

// ---------------------------------------------------------------------------
// The DATA CONTRACT for everything the AI extracts (CLAUDE.md Hard Rule 1).
//
// Every extracted field carries:
//   - value       : the normalised value ("" or null when missing)
//   - confidence  : confirmed | check | missing
//   - source_ref  : WHERE in the photo/notes it came from + the ORIGINAL
//                   snippet as written (may be Malay / 中文 / English)
//
// Rules enforced by the schema itself:
//   - confidence "missing"  => value must be empty AND source_ref null
//     (the AI never invents; a gap is a gap)
//   - confidence non-missing => source_ref is REQUIRED
//     (every claim must cite its evidence)
// ---------------------------------------------------------------------------

export const CONFIDENCE_LEVELS = ["confirmed", "check", "missing"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const sourceRefSchema = z.object({
  /** Where in the input, e.g. "photo 1, line 3" or "page 2, top-right" */
  location: z.string().min(1),
  /** The original handwriting/text EXACTLY as written (any language) */
  snippet: z.string().min(1),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

const confidenceSchema = z.enum(CONFIDENCE_LEVELS);

/**
 * Builds a field schema around a value schema, enforcing Hard Rule 1.
 * `isEmpty` defines what "no value" looks like for that value type.
 */
function extractedField<V extends z.ZodType>(
  valueSchema: V,
  isEmpty: (value: z.output<V>) => boolean
) {
  return z
    .object({
      value: valueSchema,
      confidence: confidenceSchema,
      source_ref: sourceRefSchema.nullable(),
    })
    .superRefine((raw, ctx) => {
      // zod v4 cannot name this generic object type; the shape is guaranteed
      // by the z.object() above, so a local cast is safe.
      const field = raw as unknown as {
        value: z.output<V>;
        confidence: Confidence;
        source_ref: SourceRef | null;
      };
      {
        if (field.confidence === "missing") {
          if (!isEmpty(field.value)) {
            ctx.addIssue({
              code: "custom",
              message:
                "Hard Rule 1: a 'missing' field must have an empty value — the AI never invents.",
            });
          }
        } else if (field.source_ref === null) {
          ctx.addIssue({
            code: "custom",
            message:
              "Hard Rule 1: every non-missing field must carry a source_ref.",
          });
        }
      }
    });
}

/** Free text; "" when missing. */
export const textFieldSchema = extractedField(z.string(), (v) => v === "");
export type TextField = z.infer<typeof textFieldSchema>;

/** ISO date YYYY-MM-DD; "" when missing. */
export const dateFieldSchema = extractedField(
  z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "Date must be YYYY-MM-DD, or empty when missing.",
    }),
  (v) => v === ""
);
export type DateField = z.infer<typeof dateFieldSchema>;

/**
 * Meeting type; "" when missing.
 *
 * The list lives in @/lib/meeting-types — one place, read by this schema, the
 * review screen, both document renderers, the eROSES pack and the history page,
 * so a type cannot exist on one screen and not another. Widened 2026-08-20;
 * the reasoning, and why the extraction PROMPT was deliberately left alone, is
 * written at the top of that file.
 */
export const meetingTypeFieldSchema = extractedField(
  z.enum([...MEETING_TYPES, ""] as const),
  (v) => v === ""
);
export type MeetingTypeField = z.infer<typeof meetingTypeFieldSchema>;

/**
 * Money as INTEGER SEN (cents); null when missing.
 * The LLM only extracts the number it SEES. All sums and consolidation are
 * deterministic TypeScript (CLAUDE.md Hard Rule 2).
 */
export const amountCentsFieldSchema = extractedField(
  z.number().int().nonnegative().nullable(),
  (v) => v === null
);
export type AmountCentsField = z.infer<typeof amountCentsFieldSchema>;

// ---------------------------------------------------------------------------
// Pipeline step 1 — classification result (cheap model)
// ---------------------------------------------------------------------------

export const UPLOAD_KINDS = [
  "meeting_notes",
  "ledger_page",
  "constitution",
  "attendance_sheet",
  "expense",
  "other",
] as const;

export const classificationSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  language_detected: z.enum(["ms", "zh", "en", "mixed"]),
});
export type Classification = z.infer<typeof classificationSchema>;

// ---------------------------------------------------------------------------
// Pipeline step 2 — meeting-notes extraction (vision model)
// Shape per BUILD_PLAN.md Section 2.
// ---------------------------------------------------------------------------

export const attendeeSchema = z.object({
  name: textFieldSchema,
});

export const resolutionSchema = z.object({
  /** The decision, normalised to BM/English; original stays in source_ref */
  text: textFieldSchema,
});

export const figureSchema = z.object({
  description: textFieldSchema,
  amount_cents: amountCentsFieldSchema,
});

export const officeBearerSchema = z.object({
  /** e.g. "Pengerusi", "Setiausaha", "Bendahari" */
  position: textFieldSchema,
  person_name: textFieldSchema,
});

export const meetingNotesExtractionSchema = z.object({
  meeting_type: meetingTypeFieldSchema,
  /**
   * The society's OWN name for this meeting ("周会", "Mesyuarat Ranting Muda"),
   * typed by a person when they choose "other". 2026-08-20, J: "meeting type
   * 可以给 user 选或者自己 type 比较好".
   *
   * Deliberately NOT an extracted field: it carries no confidence and no
   * source_ref because the AI never produces it — a human wrote it. Optional so
   * that every document, prompt output and fixture written before today still
   * parses unchanged. It never reaches eROSES.
   */
  meeting_type_label: z.string().max(120).optional(),
  meeting_date: dateFieldSchema,
  meeting_venue: textFieldSchema,
  attendees: z.array(attendeeSchema),
  resolutions: z.array(resolutionSchema),
  figures: z.array(figureSchema),
  office_bearers: z.array(officeBearerSchema),
});
export type MeetingNotesExtraction = z.infer<
  typeof meetingNotesExtractionSchema
>;

/**
 * A meeting-notes extraction with nothing in it — the honest starting state for
 * /minutes before a photo has been read.
 *
 * WHY IT EXISTS (2026-07-28): /minutes used to open on `sampleMeetingExtraction`
 * — a complete FICTIONAL committee meeting for a fictional temple — which then
 * needed a badge, a subtitle suffix, a yellow banner and a warning inside step 3
 * all shouting "this is not your data". People still read it as theirs. Starting
 * empty removes the misunderstanding and the four warnings with it.
 *
 * Every field is `missing` with an empty value and no source_ref, which is
 * exactly what Hard Rule 1 requires of a fact the AI has not seen.
 */
export const emptyMeetingNotesExtraction: MeetingNotesExtraction = {
  meeting_type: { value: "", confidence: "missing", source_ref: null },
  meeting_date: { value: "", confidence: "missing", source_ref: null },
  meeting_venue: { value: "", confidence: "missing", source_ref: null },
  attendees: [],
  resolutions: [],
  figures: [],
  office_bearers: [],
};

/**
 * Validates raw LLM output against the contract.
 * The retry-once-with-error flow from CLAUDE.md rule 7 wires in here when
 * the live API call is connected.
 */
export function parseMeetingNotesExtraction(raw: unknown) {
  return meetingNotesExtractionSchema.safeParse(raw);
}

// ---------------------------------------------------------------------------
// Pipeline step 2 — LEDGER PAGE extraction (Phase 2, vision model)
// One row per donation line the model can SEE. Same contract as above:
// every field carries value + confidence + source_ref; the model never
// totals anything (Hard Rule 2) — sums happen in /src/lib code.
// ---------------------------------------------------------------------------

export const donationRowExtractionSchema = z.object({
  donor_name: textFieldSchema,
  /** Phone as written (often absent in paper ledgers) */
  donor_phone: textFieldSchema,
  amount_cents: amountCentsFieldSchema,
  /** e.g. "derma bulanan", "香油钱", "tabung bumbung" */
  purpose: textFieldSchema,
  donated_at: dateFieldSchema,
});
export type DonationRowExtraction = z.infer<typeof donationRowExtractionSchema>;

export const ledgerExtractionSchema = z.object({
  /** The page header if one is written, e.g. "Buku Derma Jun 2026" */
  page_title: textFieldSchema,
  rows: z.array(donationRowExtractionSchema),
});
export type LedgerExtraction = z.infer<typeof ledgerExtractionSchema>;

/**
 * A ledger page with nothing read off it — the starting state for /money.
 * Same reasoning as emptyMeetingNotesExtraction: the page used to open on a
 * fictional donation book, which then needed labelling everywhere.
 */
export const emptyLedgerExtraction: LedgerExtraction = {
  page_title: { value: "", confidence: "missing", source_ref: null },
  rows: [],
};

export function parseLedgerExtraction(raw: unknown) {
  return ledgerExtractionSchema.safeParse(raw);
}

// ---------------------------------------------------------------------------
// Pipeline step 2 — EXPENSE receipt/invoice extraction (Stage E, work order
// 27). One shop receipt or invoice → what was bought, from whom, how much,
// when. Same Hard Rule 1 contract as everything else; the human confirms
// every field before anything enters the books.
// ---------------------------------------------------------------------------

export const expenseExtractionSchema = z.object({
  /** Who was paid — the shop/supplier name as printed. */
  vendor: textFieldSchema,
  /** What was bought, verbatim ("Cat dinding 5L x 2"). */
  description: textFieldSchema,
  /** The TOTAL paid, integer sen. The model reads the printed total only —
   *  it never sums line items (Hard Rule 2). */
  amount_cents: amountCentsFieldSchema,
  /** Receipt/invoice date, YYYY-MM-DD. */
  spent_at: dateFieldSchema,
});
export type ExpenseExtraction = z.infer<typeof expenseExtractionSchema>;

export function parseExpenseExtraction(raw: unknown) {
  return expenseExtractionSchema.safeParse(raw);
}

// ---------------------------------------------------------------------------
// Pipeline step 2 — CONSTITUTION extraction (Phase 5, vision model)
// One entry per clause the model can SEE in the document. Clause text is
// copied VERBATIM (any language) — summarising a legal clause is inventing.
// Matches the `constitutions.clauses_json` shape in the migration:
// {clause_no, heading, text, page_ref}, wrapped in the Hard Rule 1 contract.
// ---------------------------------------------------------------------------

export const clauseExtractionSchema = z.object({
  /** As printed, e.g. "Fasal 12" or "12.1" */
  clause_no: textFieldSchema,
  /** Clause heading if printed, e.g. "Mesyuarat Agung Tahunan" */
  heading: textFieldSchema,
  /** VERBATIM clause body — never paraphrased */
  text: textFieldSchema,
  /** Where it sits, e.g. "muka surat 4" */
  page_ref: textFieldSchema,
});
export type ClauseExtraction = z.infer<typeof clauseExtractionSchema>;

export const constitutionExtractionSchema = z.object({
  /** Document title if printed, e.g. "Undang-Undang Tubuh Persatuan ..." */
  document_title: textFieldSchema,
  clauses: z.array(clauseExtractionSchema),
});
export type ConstitutionExtraction = z.infer<typeof constitutionExtractionSchema>;

export function parseConstitutionExtraction(raw: unknown) {
  return constitutionExtractionSchema.safeParse(raw);
}

// ---------------------------------------------------------------------------
// EVENT PLAN extraction (text model) — the admin pastes free text after a
// meeting ("AGM 30 Ogos, makan malam 12 Sept 7.30pm, gotong-royong Okt...")
// and the AI proposes calendar events. Human ticks to confirm each one.
// Same contract: never invent a date that is not in the text.
// ---------------------------------------------------------------------------

export const eventExtractionSchema = z.object({
  /** Short event name, e.g. "Makan malam tahunan" */
  title: textFieldSchema,
  date: dateFieldSchema,
  /** Time as written, e.g. "7:30 malam"; missing if not stated */
  time: textFieldSchema,
});
export type EventExtraction = z.infer<typeof eventExtractionSchema>;

export const eventsExtractionSchema = z.object({
  events: z.array(eventExtractionSchema),
});
export type EventsExtraction = z.infer<typeof eventsExtractionSchema>;

export function parseEventsExtraction(raw: unknown) {
  return eventsExtractionSchema.safeParse(raw);
}
