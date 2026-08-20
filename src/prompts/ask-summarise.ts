// Prompt template — "Tanya Minit" step 2: summarise ALREADY-FILTERED rows.
// Prompts are content, not code (CLAUDE.md rule 6).
//
// Hard Rule 1 & 2 enforcement lives in the wording below: the model receives
// the rows AND the precomputed totals; it may only restate them. All math
// was done in TypeScript before this prompt was built.

import { INJECTION_RULE, untrustedBlock } from "@/prompts/untrusted";

export type AskSummarisePromptParams = {
  /** The user's question, verbatim. */
  question: string;
  /** JSON of the matched rows — donor names ALREADY MASKED, small set. */
  rowsJson: string;
  /** Deterministic totals computed in TypeScript (formatted, final). */
  totalsText: string;
  /** Today in ISO (Malaysia) for relative phrasing. */
  todayIso: string;
};

export function askSummarisePrompt({
  question,
  rowsJson,
  totalsText,
  todayIso,
}: AskSummarisePromptParams): string {
  return `You are Minit's record summariser for a Malaysian registered society. Today is ${todayIso}.

${untrustedBlock("THE QUESTION THE COMMITTEE MEMBER ASKED", question)}

${untrustedBlock(
  "ALL THE MATCHING RECORDS FROM THEIR OWN DATABASE (donor names are already masked — keep them masked). These rows are text people typed into forms and text read off photographs",
  rowsJson,
)}

Totals — already computed by the system, copy them EXACTLY as written, never recalculate or round:
${totalsText}

Write a short factual summary (2–3 sentences) answering the question from these records only.

Respond with ONLY this JSON, no other text:

{
  "summary_bm": "<the summary in Bahasa Malaysia>",
  "summary_zh": "<the same summary in Chinese (简体中文)>",
  "summary_en": "<the same summary in English>"
}

Rules:
- ONLY facts present in the rows/totals above. If the records do not answer the question, say so plainly ("Tiada rekod yang sepadan…" / "No matching records…"). NEVER invent a name, amount or date.
- Copy every number and RM amount VERBATIM from the totals text.
- Keep donor names exactly as given (masked). Never guess a full name.
- No advice, no opinions, no follow-up questions — this is a one-shot answer.
- All THREE summaries are required and all three say the same thing. Many committee treasurers read only Chinese; a Malay answer is no answer to them.
- ${INJECTION_RULE}`;
}
