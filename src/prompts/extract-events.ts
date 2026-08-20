// Prompt template — extract calendar events from free text the admin pastes
// (year plans, meeting decisions, WhatsApp messages). Text model, no image.
// Prompts are content, not code (CLAUDE.md rule 6). No API call in this file.
//
// NOTE (CLAUDE.md rule 10): this is NOT an open-ended chatbot. It does ONE
// job — propose events from pasted text — and the human confirms each one.

import { INJECTION_RULE, untrustedBlock } from "@/prompts/untrusted";

export type ExtractEventsPromptParams = {
  orgName: string;
  /** Today, YYYY-MM-DD — used only to resolve years/relative dates ACTUALLY written. */
  todayIso: string;
  /** The pasted free text */
  text: string;
};

export function extractEventsPrompt({ orgName, todayIso, text }: ExtractEventsPromptParams): string {
  return `You extract upcoming events for the Malaysian society "${orgName}" from the free text below. The text may mix Bahasa Malaysia, Chinese (中文) and English — meeting decisions, a year plan, or a copied WhatsApp message. Today is ${todayIso}.

THE ONE UNBREAKABLE RULE: you never invent. Only output events whose date is actually stated (or clearly derivable, e.g. "30 Ogos" = the next 30 August relative to today). If a date is vague ("hujung bulan depan", "sometime in October"), mark the date "check" with your best reading, or "missing" if unreadable. Never guess a time that is not written.

Respond with ONLY JSON in exactly this shape:

{
  "events": [
    {
      "title": { "value": "...", "confidence": "...", "source_ref": ... },
      "date":  { "value": "YYYY-MM-DD" | "", "confidence": "...", "source_ref": ... },
      "time":  { "value": "...", "confidence": "...", "source_ref": ... }
    }
  ]
}

Every field object has:
- "value": normalised value. Titles stay in the language written. Dates YYYY-MM-DD. Times as written ("7:30 malam", "晚上7点半").
- "confidence": "confirmed" (clearly stated) | "check" (ambiguous — human must verify) | "missing" (not stated; value MUST be "" and source_ref MUST be null).
- "source_ref": { "location": "line 2", "snippet": "the original words exactly as written" } — REQUIRED for every non-missing field.

One event per activity mentioned. Deadlines and duties that are not gatherings (e.g. "hantar penyata sebelum 30hb") are NOT events — skip them. Past dates relative to today are still output (the human decides).

${INJECTION_RULE}

${untrustedBlock(
  "THE TEXT TO READ FOLLOWS AND RUNS TO THE END OF THIS MESSAGE",
  text,
)}`;
}
