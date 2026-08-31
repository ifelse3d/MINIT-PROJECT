// Prompt template — pipeline step 2 (Phase 5): extract clauses from a
// photographed/scanned society constitution (vision model, image/document
// content blocks). Prompts are content, not code (CLAUDE.md rule 6).
// No API call in this file.

export type ExtractConstitutionPromptParams = {
  orgName: string;
  /**
   * A-2 (2026-08-25): what the person typed alongside the upload in the home
   * box. ALREADY wrapped by untrustedBlock(); empty string leaves this prompt
   * byte-identical — the same contract as the other two extractors.
   */
  contextBlock?: string;
};

export function extractConstitutionPrompt({
  orgName,
  contextBlock = "",
}: ExtractConstitutionPromptParams): string {
  return `You extract clauses from the registered constitution ("Undang-Undang Tubuh" / 章程) of the Malaysian society "${orgName}". Constitutions are usually Bahasa Malaysia, sometimes bilingual with Chinese (中文) or English, and may be old photocopies or typewritten pages.

THE ONE UNBREAKABLE RULE: you never invent. If something is not visibly present in the input, mark it missing. This document has LEGAL meaning — a clause text must be copied VERBATIM, character for character, in its original language. Summarising, modernising spelling, or "fixing" a clause is inventing.

Respond with ONLY JSON in exactly this shape:

{
  "document_title": { "value": "...", "confidence": "...", "source_ref": ... },
  "organisation": {
    "registered_name":    { "value": "...", "confidence": "...", "source_ref": ... },
    "registered_address": { "value": "...", "confidence": "...", "source_ref": ... },
    "registration_no":    { "value": "...", "confidence": "...", "source_ref": ... }
  },
  "clauses": [
    {
      "clause_no": { "value": "...", "confidence": "...", "source_ref": ... },
      "heading":   { "value": "...", "confidence": "...", "source_ref": ... },
      "text":      { "value": "...", "confidence": "...", "source_ref": ... },
      "page_ref":  { "value": "...", "confidence": "...", "source_ref": ... }
    }
  ]
}

Every field object has:
- "value": the content. For "text" this is the VERBATIM clause body in its ORIGINAL language — do NOT translate or paraphrase.
- "confidence":
  - "confirmed" = clearly legible, unambiguous
  - "check"     = partially legible / photocopy cut off / handwritten amendment — a human must verify
  - "missing"   = not present; then value MUST be "" and source_ref MUST be null
- "source_ref": { "location": "page 3, middle", "snippet": "the first ~10 words exactly as printed" } — REQUIRED for every non-missing field.

"organisation": WHAT THIS SOCIETY IS, copied out of the very same pages — the three facts every registered society's constitution prints on its first page or two.
- "registered_name": the society's registered name, exactly as printed in the NAMA clause (Fasal 1 in almost every ROS-approved constitution). Copy the WHOLE name, character for character, INCLUDING brackets, commas and the state — "PERTUBUHAN CONTOH HARMONI KANGAR, PERLIS", not "Pertubuhan". A name printed over TWO OR MORE LINES is ONE name: join the lines with a single space and give the whole string. Do NOT stop at a line break. Do NOT include the "hereinafter referred to as …" / "selepas ini disebut …" / "以下简称" tail, and do NOT include the words that introduce it ("dikenali sebagai", "名称：").
- "registered_address": the registered address / tempat urusan berdaftar, exactly as printed, joined into ONE string across line breaks and INCLUDING the postcode and the state — "No. 12, Jalan Tepi Sungai, Taman Aman, 01000 Kangar, Perlis", never cut off at "Taman". Leave out any "…atau di mana-mana tempat lain yang ditetapkan…" tail: that is not the address.
- "registration_no": the PPM/ROS registration number as printed, e.g. "PPM-012-02-01011990" or "0123/2005 (Perlis)". Only if it is printed in the document.
Each of the three is "missing" (value "", source_ref null) when the pages you were given do not print it. NEVER guess a name, an address or a number, and never assemble one out of the document title if the clause itself does not say it.

Clauses: one output entry per numbered clause or sub-clause you can see (Fasal 5, 5.1, 5.2 are separate entries). Never merge clauses, never skip clauses — an amended/struck-through clause is still output with "check" confidence and the amendment noted in the snippet.
clause_no: exactly as printed ("Fasal 12", "12.1", "第十二条").
heading: only if a heading is printed; a clause with no printed heading has heading value "" with confidence "missing" — never the English word "missing" as the value.
page_ref: ONLY a page number PRINTED on the document itself, e.g. "muka surat 4". If no page number is printed, page_ref is "missing" with value "" — do NOT substitute the photo order. (Photo order belongs in source_ref.location, never in page_ref.)
If a page is missing from the photos (numbering jumps), do NOT fill the gap — the gap will be shown to the human.${contextBlock}`;
}
