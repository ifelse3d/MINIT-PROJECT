import { z } from "zod";

// ---------------------------------------------------------------------------
// THE ORGANISATION'S OWN WORDS.
//
// A general model has never met 崇德, 点传师, 青班, or a member called 昶源.
// Left to itself it romanises, translates, or reads an unfamiliar character as
// a similar-looking common one (2026-08-18: 昶源 → 湘源) — and it does not do
// it the same way twice, which is worse than doing it wrong once.
//
// So the society teaches Minit its words, and the list goes to the model in
// BOTH places it could get them wrong: reading the handwriting, and writing
// the Malay document. This file is the pure half — shaping and formatting —
// so it can be unit-tested without a database.
// ---------------------------------------------------------------------------

export const glossaryEntrySchema = z.object({
  term: z.string().trim().min(1).max(80),
  action: z.enum(["keep", "translate"]),
  translation: z.string().trim().max(160).nullable().default(null),
  note: z.string().trim().max(200).nullable().default(null),
});

export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

/** A 'translate' row with no target is inert; drop it rather than send the
 *  model a rule it cannot follow. Mirrors the DB constraint. */
export function usableEntries(entries: GlossaryEntry[]): GlossaryEntry[] {
  return entries.filter(
    (e) =>
      e.term.trim() !== "" &&
      (e.action === "keep" || (e.translation ?? "").trim() !== ""),
  );
}

/**
 * The block handed to the model when it READS handwriting.
 *
 * Framed as "these words exist here", not "these are the only words": a
 * glossary must never become a reason to force an unfamiliar scribble into a
 * listed term. Reading something that is genuinely not on the list, and
 * marking it `check`, stays the correct behaviour.
 */
export function glossaryPromptBlockForReading(entries: GlossaryEntry[]): string {
  const usable = usableEntries(entries);
  if (usable.length === 0) return "";

  const lines = usable.map((e) =>
    e.note ? `- ${e.term} (${e.note})` : `- ${e.term}`,
  );

  return `
THIS ORGANISATION'S OWN VOCABULARY — words, names and titles that genuinely occur in its papers:
${lines.join("\n")}

Use this list the way you would use knowing the people in the room: when what
is written matches one of these, you can read it with confidence even if the
handwriting is poor. It is NOT a closed list and NOT a set of choices. If what
is on the page is not one of these, transcribe what is actually there — do not
snap it to the nearest entry, and do not treat a near-miss as a correction. An
unreadable word is still marked "check", listed or not.`;
}

/**
 * The block handed to the model when it WRITES the Malay minutes.
 *
 * The point here is consistency between meetings, not one good document: the
 * same class must not be "Kelas Qing" in March and "青班" in April.
 */
export function glossaryPromptBlockForWriting(entries: GlossaryEntry[]): string {
  const usable = usableEntries(entries);
  if (usable.length === 0) return "";

  const keep = usable.filter((e) => e.action === "keep");
  const translate = usable.filter((e) => e.action === "translate");

  const parts: string[] = [
    "\nTHIS ORGANISATION'S OWN VOCABULARY — it has told you how it wants these written. These rulings override your own judgement about what is a proper noun and what is an ordinary word:",
  ];

  if (keep.length > 0) {
    parts.push(
      "\nCOPY EXACTLY, never translate, never romanise:",
      ...keep.map((e) => (e.note ? `- ${e.term} (${e.note})` : `- ${e.term}`)),
    );
  }
  if (translate.length > 0) {
    parts.push(
      "\nALWAYS render as given:",
      ...translate.map(
        (e) =>
          `- ${e.term} → ${e.translation}${e.note ? ` (${e.note})` : ""}`,
      ),
    );
  }
  parts.push(
    "\nA term not on this list is handled by the general rules above. Never apply a ruling to a word that merely resembles a listed one.",
  );
  return parts.join("\n");
}

/**
 * Chinese-character runs the name check must accept even though they are not
 * in the source item: a glossary translation may legitimately introduce the
 * org's preferred spelling of a term.
 */
export function glossaryAllowedRuns(entries: GlossaryEntry[]): string[] {
  const runs: string[] = [];
  for (const e of usableEntries(entries)) {
    runs.push(e.term);
    if (e.translation) runs.push(e.translation);
  }
  return runs;
}
