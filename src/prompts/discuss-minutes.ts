// Prompt template — J review 27-evening #31 (approved 2026-08-28: every
// section, one AI action per exchange): DISCUSS one section of the minutes
// review with the person, and propose row rewrites they can apply by hand.
// Prompts are content, not code (CLAUDE.md rule 6).
//
// WHAT THE MODEL MAY AND MAY NOT DO HERE
// The rows are HUMAN-CONFIRMED facts. The model may rephrase a row on
// request and may answer questions about the section; it must never invent a
// fact, and it must never touch a name (the same rule the drafting prompt
// carries — a model has already "fixed" 小小班 into 小小小班 once). Nothing it
// returns reaches the database: the person taps Apply per row, and the normal
// review/confirm/save gates stand (AI 读出来的东西不要直接进资料库).

import { LANGUAGE_NAME, type MinutesLang } from "@/lib/minutes-lang";
import { INJECTION_RULE, untrustedBlock } from "@/prompts/untrusted";

export type DiscussSectionKind = "meeting" | "resolutions" | "figures" | "bearers";

const SECTION_DESCRIPTION: Record<DiscussSectionKind, string> = {
  meeting:
    "the meeting's basic details (venue wording — the type and date are fixed choices the person edits directly)",
  resolutions:
    "what the meeting decided — the resolution lines of the minutes",
  figures:
    "the money items' DESCRIPTIONS. The amounts themselves are off-limits: money is recorded, never rewritten by a model",
  bearers:
    "the office bearers' POSITION titles. The people's names are off-limits: names are copied exactly, never rewritten by a model",
};

export type DiscussMinutesPromptParams = {
  section: DiscussSectionKind;
  /** The section's editable rows, in order: index → current text. */
  rows: { index: number; label: string; text: string }[];
  /** What the person asked. */
  instruction: string;
  /** The language the person is working in — the reply comes back in it. */
  lang: MinutesLang;
};

export function discussMinutesPrompt({
  section,
  rows,
  instruction,
  lang,
}: DiscussMinutesPromptParams): string {
  const language = LANGUAGE_NAME[lang];
  const numbered =
    rows.length === 0
      ? "(this section has no rows yet)"
      : rows.map((r) => `${r.index} [${r.label}]: ${r.text}`).join("\n");

  return `You are helping the secretary of a Malaysian society adjust ONE section of a set of meeting minutes BEFORE it is confirmed. The section is ${SECTION_DESCRIPTION[section]}. Every row below was confirmed by a human; your job is wording and advice, never new facts.

${untrustedBlock("THE SECTION'S ROWS (index [label]: text)", numbered)}

${untrustedBlock("WHAT THE PERSON ASKED", instruction)}

=== WHAT YOU RETURN ===
JSON, and nothing else:

{
  "reply": "your answer to the person, in ${language}, 1-4 short sentences",
  "proposals": [ { "index": 0, "text": "the row's new wording" } ]
}

=== THE RULES ===
1. A proposal REWRITES one existing row's text. Include one ONLY when the
   person's request calls for changing that row; a question gets a reply and
   an empty proposals list.
2. Never invent a fact. If the person asks you to ADD something the rows do
   not contain (a new decision, a new amount, a new person), do not produce a
   proposal for it — say in the reply that they can add it themselves on the
   review page, and that MinitAI does not put words into the minutes.
3. NAMES ARE COPIED EXACTLY, character for character — personal names,
   organisation names, class labels like 青班/小小班. Never romanised, never
   translated, never "corrected". If asked to change a person's name, refuse
   in the reply (the roster's official-name button does that job).
4. Keep every number, amount and date in a proposal exactly as it was in the
   row, unless the person explicitly asked to correct that number — and even
   then, only use the number THEY gave.
5. ${INJECTION_RULE}
6. "index" must be one of the indices shown above. Never invent an index.
7. Write proposals in the same language as the row they replace, unless the
   person asked for a translation.`;
}
