// ---------------------------------------------------------------------------
// "TANYA MINIT" — pure logic (Phase 7.5b): zod schemas for both LLM calls
// and the deterministic money math. NOT a chatbot (Hard Rule 10): one
// question → one classified intent → one answer. Totals are computed HERE
// in TypeScript — the summarise model RECEIVES them, it never computes them
// (Hard Rule 2).
// ---------------------------------------------------------------------------
import { z } from "zod";
import { ASK_ROUTE_KEYS } from "./ask-routes";

export const ASK_INTENTS = [
  "record_search",
  "constitution_question",
  "navigation_help",
  "out_of_scope",
] as const;
export type AskIntent = (typeof ASK_INTENTS)[number];

export const RECORD_KINDS = [
  "donations",
  "receipts",
  "minutes",
  "events",
  "deadlines",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

/** Output schema of the classify call (prompts/ask-intent.ts). */
export const askClassificationSchema = z.object({
  intent: z.enum(ASK_INTENTS),
  record_kinds: z.array(z.enum(RECORD_KINDS)).default([]),
  date_from: isoDate,
  date_to: isoDate,
  /** Free-text filter (a name or topic) — matched against MASKED donor
   *  names / purposes / titles only; never used to unmask anything. */
  text_filter: z.string().max(80).nullable().optional(),
  /** For navigation_help only: which page answers the question. */
  route: z
    .string()
    .refine((v): v is (typeof ASK_ROUTE_KEYS)[number] =>
      (ASK_ROUTE_KEYS as readonly string[]).includes(v),
    )
    .nullable()
    .optional(),
});
export type AskClassification = z.infer<typeof askClassificationSchema>;

export function parseAskClassification(raw: unknown) {
  return askClassificationSchema.safeParse(raw);
}

/** Output schema of the summarise call (prompts/ask-summarise.ts).
 *
 *  2026-08-21: summary_zh was missing here, in the prompt, and in the route,
 *  so /api/ask answered a Chinese-only treasurer in Malay. Three languages is
 *  not a feature of this route -- docs/方案与权益设计.md section 4 lists
 *  trilingual documents under what is FREE FOREVER, "the core of the product
 *  direction, and it costs nothing". Every other user-facing string in the app
 *  already had all three. This one path quietly dropped one. */
export const askSummarySchema = z.object({
  summary_bm: z.string().min(1).max(600),
  summary_zh: z.string().min(1).max(600),
  summary_en: z.string().min(1).max(600),
});
export type AskSummary = z.infer<typeof askSummarySchema>;

export function parseAskSummary(raw: unknown) {
  return askSummarySchema.safeParse(raw);
}

// --- deterministic math (Hard Rule 2) ---------------------------------------

export type DonationLike = { amount_cents: number | null };

export function sumAmountCents(rows: DonationLike[]): number {
  let total = 0;
  for (const r of rows) total += r.amount_cents ?? 0;
  return total;
}

/** 123456 → "RM 1,234.56" (deterministic, no locale surprises). */
export function formatRinggit(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}RM ${whole}.${frac}`;
}

/** Which page a record search should link to, given what was searched. */
export function recordSearchHref(kinds: RecordKind[]): string {
  if (kinds.includes("donations") || kinds.includes("receipts")) return "/money";
  if (kinds.includes("minutes")) return "/minutes";
  if (kinds.includes("events") || kinds.includes("deadlines")) return "/calendar";
  return "/history";
}
