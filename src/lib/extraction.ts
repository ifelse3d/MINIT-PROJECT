import { z } from "zod";
import { plausibleAttendeeName } from "@/lib/attendee-sanity";
import { parseHeadcount } from "@/lib/headcount";
import { signatoriesFromLines } from "@/lib/signatories";
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
  /**
   * I4 (work order 81): the society's tell-apart note（大）（小）— carried
   * ONLY when the person was ticked off the roster, where name+note is the
   * identity (B-6). The AI is never asked for it and old saved data simply
   * has no key here; both parse fine. In the schema so a saved document's
   * round-trip keeps it (zod strips unknown keys).
   */
  note: z.string().max(120).optional(),
});

/**
 * D-7 / J review 27-evening #30 (2026-08-28, D29 unfreeze): what KIND of line
 * this is, so the review can group decisions, tasks and duty assignments
 * instead of printing one flat wall of transcription.
 *
 *   decision  something the meeting decided or agreed
 *   task      something to be done/prepared/brought (may name who)
 *   duty      a one-off duty ASSIGNMENT pairing a role with people
 *             (班主持/带队/司仪 for one activity — NEVER office_bearers,
 *             which is a government filing)
 *   info      a fact recorded without an action (times, programme notes)
 *
 * Same failure posture as D16's compose kinds: a bad or missing kind only
 * costs the grouping — the line itself always survives (catch → undefined).
 */
export const resolutionKindSchema = z.enum(["decision", "task", "duty", "info"]);
export type ResolutionKind = z.infer<typeof resolutionKindSchema>;

export const resolutionSchema = z.object({
  /** The decision, normalised to BM/English; original stays in source_ref */
  text: textFieldSchema,
  /** Optional so every document and fixture written before today parses. */
  kind: resolutionKindSchema.optional().catch(undefined),
  /**
   * G1 (work order 68, 2026-08-29): DOCUMENT STRUCTURE, so a printed formal
   * minit survives the pipeline with its shape intact instead of being
   * crushed into one flat list (§1-2 of the work order — J's real sample).
   *
   * These are structural MARKERS, not extracted facts in their own right —
   * the fact (the paragraph) lives in `text` with its own source_ref; these
   * say where on the page it sat. Same failure posture as `kind`
   * (catch → undefined): a malformed marker only costs the grouping, never
   * the line.
   *
   *   section_no     the agenda section's printed number ("1", "2")
   *   section_title  the section heading as printed ("Ucapan Pengerusi")
   *   own_no         the line's OWN printed enumerator ("2.1") — downstream
   *                  renderers print it as-is and never add a second layer
   */
  section_no: z.string().max(20).optional().catch(undefined),
  section_title: z.string().max(200).optional().catch(undefined),
  own_no: z.string().max(20).optional().catch(undefined),
  /**
   * 118 §3: a person looked at a line that can be read two ways (see
   * src/lib/minutes-ambiguity.ts) and said "keep it as written". Never set
   * by the model — the ask-back card sets it; the document then carries the
   * line verbatim and stops asking. Optional + catch: old data has no key.
   */
  as_written: z.boolean().optional().catch(undefined),
});

/** 125 §4: what a figure IS in the treasurer's arithmetic. The reader
 *  labels; code sums (src/lib/financial-reconcile.ts). Absent = "other". */
export const figureRoleSchema = z.enum(["opening", "income", "expense", "closing", "other"]);

export const figureSchema = z.object({
  description: textFieldSchema,
  amount_cents: amountCentsFieldSchema,
  /** Optional + catch: every fixture and saved document before today parses
   *  unchanged; a bad label only costs the reconciliation, never the figure. */
  role: figureRoleSchema.optional().catch(undefined),
});

/**
 * A resolution that APPROVES MONEY TO BE PAID OUT — the start of the e-Invois
 * trail (work order 94, T5 governance slice).
 *
 * Deliberately three plain extracted facts and nothing more. The model copies
 * what is written on the page: who is being paid, how much, what for. It is
 * NOT asked whether the payee is a registered business, whether SST applies,
 * or whether an e-invoice is required — those are legal determinations that
 * are not visible in a photograph, and asking a vision model for them would
 * break Hard Rule 1 as surely as asking it to add up a column would break
 * Hard Rule 2. Every such judgement is made afterwards, deterministically, in
 * `src/lib/einvois-governance.ts`, from values a human has confirmed.
 *
 * Distinct from `figures`: a figure is any amount SEEN on the page (a balance,
 * a collection, a budget line). A financial resolution is an amount the
 * meeting DECIDED TO SPEND, with a payee.
 */
export const financialResolutionSchema = z.object({
  /** The payee exactly as written; "" + missing when the page does not say. */
  vendor_name: textFieldSchema,
  /** Integer sen. The LLM only copies the number it sees (Hard Rule 2). */
  approved_amount_cents: amountCentsFieldSchema,
  /** What the money is for, in the original language. */
  purpose: textFieldSchema,
});
export type FinancialResolution = z.infer<typeof financialResolutionSchema>;

export const officeBearerSchema = z.object({
  /** e.g. "Pengerusi", "Setiausaha", "Bendahari" */
  position: textFieldSchema,
  person_name: textFieldSchema,
  /**
   * §4-④ (work order 100): when a printed appointment carries the person's
   * particulars (真件 B prints No. Kad Pengenalan / Alamat / Pekerjaan under
   * each new appointment), they are copied verbatim so the add-member card
   * can pre-fill instead of making the secretary re-type what the document
   * already says. All OPTIONAL + .catch(undefined): every document saved
   * before today parses unchanged, and a malformed extra only costs itself.
   * The model is told to copy exactly or omit — Hard Rule 1 as ever.
   */
  ic_no: textFieldSchema.optional().catch(undefined),
  address: textFieldSchema.optional().catch(undefined),
  occupation: textFieldSchema.optional().catch(undefined),
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
  /**
   * G1 (work order 68): the rest of the standard minit header and closing —
   * MASA, the verbatim headcount line ("AJK yang hadir : 33 orang"), the
   * verbatim adjournment sentence, and the signature block's two names.
   *
   * All OPTIONAL, and parseMeetingNotesExtraction PRUNES any of them the
   * model marked `missing`: a whiteboard photo or a typed meeting must not
   * grow three extra "not in the notes" taps for fields the page never had.
   * When present they carry the full Hard Rule 1 contract and count as
   * reviewable leaves like every other field.
   */
  meeting_time: textFieldSchema.optional(),
  attendance_count: textFieldSchema.optional(),
  adjournment: textFieldSchema.optional(),
  prepared_by: officeBearerSchema.optional(),
  endorsed_by: officeBearerSchema.optional(),
  attendees: z.array(attendeeSchema),
  /**
   * 125 §2: the people recorded as ON LEAVE / absent (请假 / 缺席 / tidak
   * hadir / apologies) — never attendees. Optional + .catch([]): every
   * document saved before today parses unchanged, a malformed array costs
   * only itself. Filled by the reader from the page, and by parse from the
   * bracketed names of the headcount line (src/lib/headcount.ts).
   */
  apologies: z.array(attendeeSchema).optional().catch([]),
  /**
   * 125 §2: the headcount a PERSON confirmed on the attendance step — the
   * number the document prints and eROSES receives when the page recorded
   * its attendance as a line (「理事12人,请假2人,会员40人」) rather than a
   * list. NEVER set by the model: code counts the line, a person agrees or
   * types the number (Hard Rule 2 for people). Optional + catch: old data.
   */
  attendance_confirmed: z.number().int().positive().optional().catch(undefined),
  resolutions: z.array(resolutionSchema),
  figures: z.array(figureSchema),
  /**
   * 125 §4-3: a person looked at figures that do not add up and said "the
   * numbers are right, the page really says so". Set only by the review
   * step's card, never by the model; the document then carries one note
   * line. No figure is ever changed by anybody but the person.
   */
  figures_mismatch_noted: z.boolean().optional().catch(undefined),
  /**
   * Money the meeting approved TO BE PAID OUT (work order 94). Optional, and
   * `.catch(undefined)` for the same reason `kind` carries it: every document
   * and fixture saved before this field existed must still parse unchanged,
   * and a malformed array must cost only the e-Invois panel — never the whole
   * document (rule 7: never crash a batch).
   */
  financial_resolutions: z
    .array(financialResolutionSchema)
    .optional()
    .catch(undefined),
  /**
   * §4-② (work order 100): other meetings spotted on the same paper. Same
   * failure posture as financial_resolutions — optional, .catch(undefined),
   * a malformed array only costs the "which meeting?" card.
   */
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
 * G3-8 (work order 68 §1-8, the REAL root cause of "The AI took too long"):
 * gemini-3.5-flash-lite routinely fills a field's `value` while labelling it
 * `missing` (an "I saw something but I'm not sure" tic). The contract rightly
 * rejects that — but a rejection burns the WHOLE first read, and the rule-7
 * retry then cannot fit inside the route's 50s budget, so an 8-page
 * constitution came back as a timeout, twice, on J's own test.
 *
 * The fix is arithmetic, not begging the prompt: BELIEVE THE LABEL. A field
 * that says `missing` has its value and source_ref DISCARDED before
 * validation — the gap stays a gap. Nothing is ever promoted (that would be
 * inventing); we only erase, which is exactly what Hard Rule 1 demands of a
 * missing field. Recursive, shape-agnostic: any {value, confidence:"missing"}
 * object anywhere in any extraction gets the same treatment.
 */
export function coerceMissingFieldsEmpty(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    for (const item of raw) coerceMissingFieldsEmpty(item);
    return raw;
  }
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.confidence === "missing" && "value" in obj) {
    // Numbers empty to null (amount fields); everything else empties to ""
    // (text/date/enum fields). Never the other way around.
    obj.value = typeof obj.value === "number" || obj.value === null ? null : "";
    obj.source_ref = null;
    return raw;
  }
  for (const v of Object.values(obj)) coerceMissingFieldsEmpty(v);
  return raw;
}

/**
 * Validates raw LLM output against the contract.
 * The retry-once-with-error flow from CLAUDE.md rule 7 wires in here when
 * the live API call is connected.
 *
 * G1: the optional header/closing fields are PRUNED when `missing` — a field
 * the page never had must not appear on the review screen demanding a "not in
 * the notes" tap. A present-but-empty CONFIRMED field (a human pressed "not
 * written down") is kept: that is a review verdict, not an absence.
 */
export function parseMeetingNotesExtraction(raw: unknown) {
  const parsed = meetingNotesExtractionSchema.safeParse(coerceMissingFieldsEmpty(raw));
  if (!parsed.success) return parsed;
  const e = parsed.data;
  for (const key of ["meeting_time", "attendance_count", "adjournment"] as const) {
    const f = e[key];
    if (f && f.confidence === "missing" && f.source_ref === null) delete e[key];
  }
  for (const key of ["prepared_by", "endorsed_by"] as const) {
    const b = e[key];
    if (
      b &&
      b.position.confidence === "missing" &&
      b.person_name.confidence === "missing"
    ) {
      delete e[key];
    }
  }
  // 118 §5-2: an attendee the reader made of a scrap ("as") is erased, so a
  // page with no attendance list comes out with NONE — the honest answer,
  // and the one the attendance page already knows how to ask about. Human
  // rows (a typed name, a ticked roster entry) always pass this test.
  e.attendees = e.attendees.filter(
    (a) => a.name.confidence === "missing" || plausibleAttendeeName(a.name.value),
  );
  // 125 §2: ON LEAVE IS NOT PRESENT — by code, not by prompt. On 8/31 the
  // reader listed the two people in the headcount line's 请假 bracket as
  // the ONLY two attendees. The bracketed names of a leave count go to
  // `apologies`, and anybody in `apologies` is struck from `attendees`.
  // Erasing and moving what the page itself says; nothing promoted.
  const apologies = (e.apologies ?? []).filter(
    (a) => a.name.confidence === "missing" || plausibleAttendeeName(a.name.value),
  );
  const line = e.attendance_count;
  const counted =
    line && line.confidence !== "missing" && line.value !== "" ? parseHeadcount(line.value) : null;
  for (const name of counted?.names ?? []) {
    if (apologies.some((a) => a.name.value.trim() === name)) continue;
    apologies.push({
      name: {
        value: name,
        confidence: "check",
        source_ref: {
          location: line?.source_ref?.location ?? "attendance_count",
          snippet: line?.value ?? name,
        },
      },
    });
  }
  const onLeave = new Set(apologies.map((a) => a.name.value.trim()).filter((n) => n !== ""));
  if (onLeave.size > 0) {
    e.attendees = e.attendees.filter((a) => !onLeave.has(a.name.value.trim()));
  }
  if (apologies.length > 0 || e.apologies !== undefined) e.apologies = apologies;
  // 125 §3: a header line 「主席：甲　记录：乙」 names the signatories when the
  // page has no signature block — read by code from the page's own lines
  // (src/lib/signatories.ts), marked "check" for a person to glance at,
  // sourced to the line. Never overwrites what the reader found; never the
  // signed-in user's name.
  if (!e.prepared_by || !e.endorsed_by) {
    const lines: { text: string; location: string }[] = [];
    for (const r of e.resolutions) {
      if (r.text.confidence === "missing" || r.text.value === "") continue;
      const location = r.text.source_ref?.location ?? "photo";
      lines.push({ text: r.text.value, location });
      if (r.text.source_ref?.snippet) lines.push({ text: r.text.source_ref.snippet, location });
    }
    const found = signatoriesFromLines(lines.map((l) => l.text));
    const bearer = (s: { name: string; role: string; line: string }) => {
      const location = lines.find((l) => l.text.trim() === s.line)?.location ?? "photo";
      const ref = (snippet: string) => ({ location, snippet });
      return {
        position: { value: s.role, confidence: "check" as const, source_ref: ref(s.line) },
        person_name: { value: s.name, confidence: "check" as const, source_ref: ref(s.line) },
      };
    };
    if (!e.endorsed_by && found.chair) e.endorsed_by = bearer(found.chair);
    if (!e.prepared_by && found.secretary) e.prepared_by = bearer(found.secretary);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Pipeline step 2 — LEDGER PAGE extraction (Phase 2, vision model)
// One row per donation line the model can SEE. Same contract as above:
// every field carries value + confidence + source_ref; the model never
// totals anything (Hard Rule 2) — sums happen in /src/lib code.
// ---------------------------------------------------------------------------

/**
 * 136 (J 9/9, live site — 135 §B, decided): WHAT a ledger line IS. J
 * photographed the AGM's KEWANGAN block into "Record income" and got seven
 * "donations" — last year's balance, the hall rent, the dinner's cost, the
 * bank balance — all offered a receipt. The reader now labels every line:
 *
 *   income  — money actually RECEIVED from someone (derma, yuran, 香油钱,
 *             the dinner's takings)
 *   expense — money PAID OUT (sewa dewan, kos, perbelanjaan, 开销)
 *   balance — a STATE, not a movement (结存 / baki / bank / b/f / c/f)
 *   total   — a column total (jumlah / 合计 / total) — output, so the review
 *             does not look like it skipped a line, and hidden by code
 *   ""      — the reader did not say (confidence "missing")
 *
 * It is a LABEL only: the model still computes nothing (Hard Rule 2), and a
 * label it cannot decide is "check" with the reason in the snippet — never a
 * default to income. Optional + .catch(undefined): every ledger saved before
 * today parses unchanged, and a malformed label costs only itself. Code never
 * fills a missing kind in (parseLedgerExtraction leaves it empty); the review
 * falls back to the 135 word-list hint (src/lib/ledger-hints.ts).
 */
export const LEDGER_ROW_KINDS = ["income", "expense", "balance", "total"] as const;
export type LedgerRowKind = (typeof LEDGER_ROW_KINDS)[number];

export const ledgerRowKindFieldSchema = extractedField(
  z.enum([...LEDGER_ROW_KINDS, ""] as const),
  (v) => v === ""
);
export type LedgerRowKindField = z.infer<typeof ledgerRowKindFieldSchema>;

export const donationRowExtractionSchema = z.object({
  donor_name: textFieldSchema,
  /** Phone as written (often absent in paper ledgers) */
  donor_phone: textFieldSchema,
  amount_cents: amountCentsFieldSchema,
  /** e.g. "derma bulanan", "香油钱", "tabung bumbung" */
  purpose: textFieldSchema,
  donated_at: dateFieldSchema,
  /** 136: income / expense / balance / total — see LEDGER_ROW_KINDS. */
  kind: ledgerRowKindFieldSchema.optional().catch(undefined),
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

/**
 * 136: `kind` is left exactly as the reader gave it. A row without one (an
 * old reading, a model that did not answer) stays WITHOUT one — code never
 * promotes an unlabelled line to income; the review shows no badge and the
 * receipt gate treats it as "unknown, and not a balance" (receipts.ts). A
 * label the model marked "missing" is dropped so it reads the same as absent.
 */
export function parseLedgerExtraction(raw: unknown) {
  const parsed = ledgerExtractionSchema.safeParse(coerceMissingFieldsEmpty(raw));
  if (!parsed.success) return parsed;
  for (const row of parsed.data.rows) {
    if (row.kind && (row.kind.confidence === "missing" || row.kind.value === "")) {
      delete row.kind;
    }
  }
  return parsed;
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
  return expenseExtractionSchema.safeParse(coerceMissingFieldsEmpty(raw));
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

/**
 * §2 (work order 104, J 2026-08-31 evening: 「名字讀出來的很智障，寫好好的也被
 * 他讀到很爛」). WHAT THE SOCIETY IS, read out of its own constitution in the
 * SAME call that reads the clauses — no second request, no second charge.
 *
 * 🔴 WHY THIS IS A FIELD AND NOT A REGEX. It always was a regex
 * (src/lib/constitution-identity.ts), and the regex cut the name at the first
 * newline — which in a real PDF is usually in the middle of it, so
 * "PERTUBUHAN PENGAJIAN TAO (HONG TAO) KANGAR, PERLIS" arrived as
 * "Persatuan". A model that is already looking at the page can hand the whole
 * string over; the regex stays as the FALLBACK for a document read before
 * today (and for a model that answers `missing`).
 *
 * The verbatim rule still holds — these are copied character for character,
 * joined across line breaks, never rewritten. OPTIONAL and `.catch(undefined)`
 * so every constitution saved or fixtured before today parses unchanged, and a
 * malformed block costs only the identity panel, never the clauses
 * (CLAUDE.md rule 7).
 */
export const constitutionOrganisationSchema = z.object({
  /** The registered name as printed in the NAMA clause, joined across lines. */
  registered_name: textFieldSchema,
  /** The registered address / tempat urusan, joined across lines. */
  registered_address: textFieldSchema,
  /** The PPM/ROS registration number as printed, e.g. "PPM-012-02-01011990". */
  registration_no: textFieldSchema,
});
export type ConstitutionOrganisation = z.infer<
  typeof constitutionOrganisationSchema
>;

export const constitutionExtractionSchema = z.object({
  /** Document title if printed, e.g. "Undang-Undang Tubuh Persatuan ..." */
  document_title: textFieldSchema,
  /** §2 (104): the society's own name / address / registration number. */
  organisation: constitutionOrganisationSchema.optional().catch(undefined),
  clauses: z.array(clauseExtractionSchema),
});
export type ConstitutionExtraction = z.infer<typeof constitutionExtractionSchema>;

export function parseConstitutionExtraction(raw: unknown) {
  return constitutionExtractionSchema.safeParse(coerceMissingFieldsEmpty(raw));
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
  return eventsExtractionSchema.safeParse(coerceMissingFieldsEmpty(raw));
}
