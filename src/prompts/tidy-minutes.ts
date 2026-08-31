// Prompt template — the TIDY PASS (work order 105 §2). Prompts are content,
// not code (CLAUDE.md rule 6). No API call in this file.
//
// ---------------------------------------------------------------------------
// 🔴🔴 THE ARCHITECTURAL LAW THIS FILE EXISTS TO OBEY (105, J 2026-08-31):
//
//     extract-meeting-notes.ts is NOT TOUCHED. Not one byte.
//
// This pass reads the ALREADY-EXTRACTED verbatim JSON as TEXT. It never sees
// the photograph, never re-reads the page, and never changes how anything was
// extracted. That is why the meeting-notes eval baseline (93.6%, 117/125,
// invented = 0) is untouched by anything in this file — the measurement is of
// the extractor, and the extractor did not move. Anyone who tries to get the
// "formal version" by editing the extraction prompt has taken the wrong road;
// turn back.
//
// WHY A SECOND PASS AT ALL. J, holding what the app produced from two pages of
// one meeting: 「更新後的 AGENT 也是智障，弄出來的也是不好，沒自己看過全部，
// 然後做出好的，就只是摳字出來」— the agenda came out "3. 4. 5." and then
// "1. 2.1 4. 5." because the second page repeated the first, and the lines
// read like the shorthand they were scribbled in. All three complaints are
// about ARRANGEMENT, and arrangement is a judgement that can be made from the
// extracted text alone.
//
// 🔴 THE VERBATIM LAYER REMAINS THE ONLY ARCHIVAL TRUTH. eROSES, later
// checking, legal weight — all of them read the verbatim layer. What this pass
// makes is a DERIVATIVE, and every paragraph of it must be able to point back
// at the verbatim line it came from, which is what `source` is for.
// ---------------------------------------------------------------------------

export type TidyMinutesPromptParams = {
  orgName: string;
  /** The verbatim resolution lines, in extraction order, numbered from 0. */
  items: readonly { index: number; text: string; sectionNo?: string; sectionTitle?: string }[];
};

export function tidyMinutesPrompt({ orgName, items }: TidyMinutesPromptParams): string {
  const listed = items
    .map(
      (it) =>
        `[${it.index}]${
          it.sectionNo || it.sectionTitle
            ? ` (agenda ${it.sectionNo ?? ""}${it.sectionTitle ? `: ${it.sectionTitle}` : ""})`
            : ""
        } ${it.text}`,
    )
    .join("\n");

  return `You are tidying the minutes of a meeting of the Malaysian society "${orgName}". The lines below were already read off the original paper, word for word, by another step. You are NOT reading a photograph and you are NOT re-reading anything: your only input is the text below, and your only job is to ARRANGE it.

THE ONE UNBREAKABLE RULE, UNCHANGED: you never invent. Every fact in your output must already be in the lines below. If something is not there, it stays absent — an honest gap is always better than a fluent guess.

YOU MAY DO EXACTLY FOUR THINGS. Nothing else.

1. PUT THEM IN ORDER. Arrange the items by their own printed numbering and by the order of the meeting, not by the order they happened to be read off the page. "3." comes after "2.1", and "1." comes before both, even when the paper was photographed out of order.

2. MERGE WHAT IS THE SAME ITEM TWICE. The same agenda item often appears on two pages — a scribbled note of it and a typed-up version of it. When two lines are two tellings of ONE thing, write ONE item and give it BOTH indices in "source". Keep the FULLER telling's wording; the shorter one contributes only what the fuller one is missing.
   🔴 Two items that merely mention the same person, the same amount or the same date are NOT the same item. If you are not sure, DO NOT merge — a duplicate a person can delete is recoverable; a decision you deleted is not.

3. FINISH THE SENTENCE. A line written in shorthand becomes a complete sentence that reads like minutes. "lanti Ajk seong. Teh Kim Hoo" becomes a proper sentence appointing Teh Kim Hoo as one committee member.
   🔴 IN ITS OWN LANGUAGE. A Malay line is completed in Malay, a Chinese line in Chinese, an English line in English. A line that mixes them is completed in whichever language most of its words are in. YOU ARE NOT TRANSLATING. A document that changes language between the paper and the file is a different document.
   🔴 FINISHING A SENTENCE IS NOT ADDING A FACT. You may add the grammar a sentence needs — a verb, a connective, a preposition. You may not add who, how much, when, or what was decided.

4. LEAVE THE GAPS AS GAPS. Where the line does not say something, your sentence does not say it either. Never write "the meeting agreed" over a line that only records that something was discussed.

🔴 THE LOCKED LIST — COPY THESE CHARACTER FOR CHARACTER, NEVER REWRITE THEM:
   * every amount of money, exactly as written, with its currency and its digits;
   * every date and every time, exactly as written;
   * every person's name, EXACTLY as spelled — a changed character is a different person, and this document may end up naming who is responsible for what;
   * every identity-card number and every receipt number, digit for digit;
   * the SUBSTANCE of every decision: approved stays approved, not approved stays not approved, deferred stays deferred. Never soften, never harden, never resolve an open item.

Respond with ONLY JSON in exactly this shape:

{
  "sections": [
    {
      "heading": "the section's own heading as printed on the paper, in the paper's own language; when the paper has no sections, one heading you can justify from the items under it",
      "items": [
        { "source": 0, "text": "the finished sentence" },
        { "source": [3, 7], "text": "the finished sentence for two tellings of one item" }
      ]
    }
  ],
  "unresolved": [
    { "source": 5, "text": "an item the meeting left open, or that you could not place under any heading" }
  ]
}

"source" is the number in square brackets in front of each line below. EVERY index from 0 to ${Math.max(items.length - 1, 0)} must appear EXACTLY ONCE across the whole answer — in a section item, in a merged item's list, or in "unresolved". An index you drop is a decision that vanishes from a society's record, and it is the one mistake this step must never make.

THE LINES, word for word as they were read off the paper:

${listed}`;
}
