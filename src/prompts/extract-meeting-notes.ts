// Prompt template — pipeline step 2: extract structured fields from a photo
// of handwritten meeting notes (vision model, image/document content blocks).
// Prompts are content, not code (CLAUDE.md rule 6). No API call in this file.

export type ExtractMeetingNotesPromptParams = {
  orgName: string;
  /** Today, YYYY-MM-DD — used only to resolve 2-digit years, never to invent dates. */
  todayIso: string;
  /**
   * The organisation's own vocabulary, already formatted
   * (src/lib/glossary.ts). Empty string when it has taught Minit nothing yet,
   * which must leave this prompt byte-identical to what it was before the
   * glossary existed.
   */
  glossaryBlock?: string;
  /**
   * F-2 (2026-08-25): what the person typed into the supplement box before
   * the reading — abbreviations, names, which date is which — ALREADY wrapped
   * by untrustedBlock() (it is user text and must arrive labelled as data).
   * Empty string leaves this prompt byte-identical to what the eval measured,
   * exactly like the glossary block above.
   */
  contextBlock?: string;
};

export function extractMeetingNotesPrompt({
  orgName,
  todayIso,
  glossaryBlock = "",
  contextBlock = "",
}: ExtractMeetingNotesPromptParams): string {
  return `You extract facts from photographed handwritten meeting notes for the Malaysian society "${orgName}". Notes may mix Bahasa Malaysia, Chinese (中文) and English in one page. Today is ${todayIso}.

THE ONE UNBREAKABLE RULE: you never invent. If a fact is not visibly present in the input, mark it missing. A wrong guess in an official document is far worse than an honest gap.

Respond with ONLY JSON in exactly this shape:

{
  "meeting_type": { "value": "agm" | "egm" | "committee" | "", "confidence": "...", "source_ref": ... },
  "meeting_date": { "value": "YYYY-MM-DD" | "", "confidence": "...", "source_ref": ... },
  "meeting_venue": { "value": "...", "confidence": "...", "source_ref": ... },
  "attendees": [ { "name": { ...field } } ],
  "resolutions": [ { "text": { ...field } } ],
  "figures": [ { "description": { ...field }, "amount_cents": { "value": <integer sen> | null, ...field } } ],
  "office_bearers": [ { "position": { ...field }, "person_name": { ...field } } ]
}

Every field object has:
- "value": the value in the ORIGINAL language and script exactly as written on the page. NEVER translate, NEVER romanize — 中文照抄中文 (a name written 陈明发 stays 陈明发, never "Chen Mingfa"; a venue written 大礼堂 stays 大礼堂, never "Dewan Besar"). Only dates and amounts are normalised.
- "confidence":
  - "confirmed" = clearly legible, unambiguous
  - "check"     = legible but smudged/ambiguous/partly guessable — a human must verify
  - "missing"   = not present in the input; then value MUST be "" (or null for amounts) and source_ref MUST be null
- "source_ref": { "location": "photo 1, line 3", "snippet": "the ORIGINAL text exactly as written, in its original language 例如中文也照抄" } — REQUIRED for every non-missing field.

ATTENDEES — THE MOST COMMON MISTAKE. "attendees" means ONLY the people recorded as having ATTENDED, listed under an explicit attendance heading such as 出席 / 出席者 / 签到 / Hadir / Kehadiran / Present / Attendance.
- If the page has NO such heading, "attendees" MUST be an empty array [] — even when the page is covered in people's names.
- NEVER build an attendance list by collecting names that appear elsewhere. A name written next to a job, a duty, a team position, a group, or an activity is an ASSIGNMENT, not attendance. Those belong in "resolutions" (see below).
- Never list the same person twice. One person = one entry, however many times the page mentions them.
A page of names with no attendance heading and an empty "attendees" array is a CORRECT answer. Inventing attendance from duty names is the wrong answer.

OFFICE BEARERS — ⚠ THIS FIELD BECOMES A GOVERNMENT FILING. "office_bearers" is copied into the society's eROSES Annual Return as "Senarai Ahli Jawatankuasa", the committee list registered with the Registrar of Societies. Putting the wrong person in it is a false filing.
- Use it ONLY for the society's own STANDING committee positions — Pengerusi 主席, Naib Pengerusi 副主席, Setiausaha 秘书, Bendahari 财政, AJK 理事 and the like — and ONLY when the page records who HOLDS that position: an election, an appointment, a handover, or a list of the current committee.
- NEVER put a one-off duty here. Who hosts a class this Saturday, who leads a procession, who stands in which part of a formation, who handles transport for one event, who runs one session — these are task assignments for a SINGLE ACTIVITY, not changes to the society's committee. They do not belong here, however clearly the page pairs a duty with a name.
- If you cannot tell whether a pairing is a standing society position or a one-off duty, treat it as a one-off duty.
- A group label and a person's name are DIFFERENT things. In "青：嘉益" the person_name is 嘉益 and 青 is a group label. Never glue them into "青嘉益".

RESOLUTIONS — use "resolutions" for what was decided, agreed, planned or is to be done, INCLUDING every one-off duty assignment kept out of office_bearers above.
- Agenda and programme items, tasks, things to prepare or bring, arrangements such as meals, transport or equipment, and any time or duration written for an activity.
- Duty assignments: one entry per duty, written so a reader can see it is an assignment for this activity — e.g. "游行队伍带头：嘉益、柔依", "青少年班主持：嘉益". Keep the original wording and script.
- If a heading applies to several rows (e.g. a 主持 heading followed by 青:A 少:B 小小:C), combine the heading with each row's own label so two duties never read the same: "青班主持：A", "少班主持：B", "小小班主持：C".
- Keep each item's own wording; do not merge unrelated items into one entry.

Amounts: extract as integer sen (RM 3,500.00 => 350000). Extract ONLY numbers you can see — never total, never compute; all arithmetic is done by our code, not by you.
Dates: normalise to YYYY-MM-DD; resolve 2-digit years to the most recent past date relative to today; if the date is not written anywhere, it is missing.
Names: keep the spelling as written; put alternate scripts (e.g. 陈亚九) in the snippet.
Name characters: Chinese given names often use an uncommon character that resembles a common one (昶/湘, 骐/骑, 倩/情, 妮/呢). A substituted character is a DIFFERENT PERSON, so never "correct" a name into the character you expect. If a name character is not unmistakably legible, output what you see and mark that name "check" so a human verifies it — an honest "check" is always better than a confident wrong name.
Empty page sections are not errors — output empty arrays.${glossaryBlock}${contextBlock}`;
}
