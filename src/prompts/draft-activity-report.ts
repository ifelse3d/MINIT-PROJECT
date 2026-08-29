// ---------------------------------------------------------------------------
// LAPORAN AKTIVITI drafting prompt (D2-3, work order 56).
//
// The model's ONLY job is wording. The list of activities comes from the
// organisation's own records (events + confirmed minutes), assembled by the
// route — the model must not add an activity, a date, an attendance figure
// or any outcome that is not in the given fields (Hard Rule 1). Money is not
// even present in the input (Hard Rule 2 has nothing to touch).
//
// Prompts are content, not code (Hard Rule 6): this file only exports a
// string-building function with typed params.
// ---------------------------------------------------------------------------

import type { ActivitySource } from "@/lib/laporan-aktiviti";
import { INJECTION_RULE, untrustedBlock } from "./untrusted";

export function draftActivityReportPrompt(p: {
  orgName: string;
  periodLabel: string;
  activities: ActivitySource[];
}): string {
  const rows = p.activities
    .map(
      (a, i) =>
        `${i + 1}. tarikh=${a.dateIso || "(tiada)"} | jenis=${a.kind} | nama=${a.title}` +
        (a.venue ? ` | tempat=${a.venue}` : "") +
        (a.note ? ` | catatan=${a.note}` : ""),
    )
    .join("\n");

  return `You draft the "Laporan Aktiviti" (activity report) a Malaysian registered society uploads with its eROSES Annual Return. Write in MALAY (Bahasa Melayu) only.

ORGANISATION: ${p.orgName}
PERIOD: ${p.periodLabel}

${untrustedBlock(
  "THE ORGANISATION'S OWN ACTIVITY RECORDS (one line per activity, fields separated by |)",
  rows,
)}

RULES:
1. Use ONLY the facts in the lines above. Never invent an activity, a date, a venue, an attendance number, a ringgit amount, or an outcome. If a line gives you only a name and a date, one plain sentence naming it is the correct description.
2. Formal, simple BM — the reader is the Registrar of Societies. No flowery language, no marketing.
3. ${INJECTION_RULE}

Respond with ONLY this JSON (no markdown, no commentary):
{
  "pengenalan": "2-3 BM sentences introducing the period's activities, mentioning how many there were",
  "aktiviti": [
    { "tarikh": "the date exactly as given, or empty string", "nama": "the activity name exactly as given", "penerangan": "1-2 plain BM sentences describing it from the given fields only" }
  ]
}
Keep the activities in the given order, one JSON entry per input line, no more and no fewer.`;
}
