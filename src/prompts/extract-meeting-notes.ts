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
  "meeting_time": { "value": "the meeting's time EXACTLY as written, e.g. 8.30 PM – 10.30 PM", ...field },
  "meeting_venue": { "value": "...", "confidence": "...", "source_ref": ... },
  "attendance_count": { "value": "the headcount line EXACTLY as written, e.g. AJK yang hadir : 33 orang", ...field },
  "adjournment": { "value": "the closing sentence EXACTLY as written, e.g. Mesyuarat ditangguhkan pada 10.30 PM", ...field },
  "prepared_by": { "position": { ...field }, "person_name": { ...field } },
  "endorsed_by": { "position": { ...field }, "person_name": { ...field } },
  "attendees": [ { "name": { ...field } } ],
  "resolutions": [ { "text": { "value": "...", "confidence": "...", "source_ref": ... }, "kind": "decision" | "task" | "duty" | "info", "section_no": "1", "section_title": "as printed", "own_no": "2.1" } ],
  "figures": [ { "description": { ...field }, "amount_cents": { "value": <integer sen> | null, ...field } } ],
  "financial_resolutions": [ { "vendor_name": { ...field }, "approved_amount_cents": { "value": <integer sen> | null, ...field }, "purpose": { ...field } } ],
  "office_bearers": [ { "position": { ...field }, "person_name": { ...field }, "ic_no": { ...field }, "address": { ...field }, "occupation": { ...field } } ]
}

Every "text" is a FIELD OBJECT ({ "value", "confidence", "source_ref" }) like
all the others — never a bare string. "meeting_time", "attendance_count" and "adjournment" are verbatim copies of
those lines when the page has them, confidence "missing" when it does not.
"prepared_by" / "endorsed_by" come ONLY from a signature block (Disediakan
oleh / Disahkan oleh, 记录人 / 核准人, Prepared by / Endorsed by): position =
the printed role (SETIAUSAHA, PENGERUSI), person_name = the printed name. No
signature block = both fields missing. "section_no", "section_title" and
"own_no" are OPTIONAL structure markers — see DOCUMENT STRUCTURE below; omit
them on pages that have no numbered sections.

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
- When a printed appointment lists the person's particulars beside it (No. Kad Pengenalan / No. K/P, Alamat, Pekerjaan), copy each EXACTLY as printed into that entry's "ic_no" / "address" / "occupation", each with its own source_ref. When the page does not print one, OMIT that key entirely — never leave a placeholder and never copy another person's particulars.

DOCUMENT STRUCTURE — when the input is a PRINTED or TYPED formal minutes
document (a letterhead, an agenda list, numbered sections like "Agenda 1:
ucapan Pengerusi" each followed by paragraphs), the document's own structure
is a fact about the page and you preserve it:
- One resolutions entry PER PARAGRAPH, and the paragraph text is copied
  COMPLETE and VERBATIM in its original language — every sentence. Never
  summarise a paragraph, never keep only its "important" sentence: in a signed
  document a silently shortened paragraph is as wrong as an invented one.
- Every entry from a numbered section carries "section_no" (the section's
  printed number, e.g. "1") and "section_title" (the heading as printed,
  WITHOUT its number, e.g. "Ucapan Pengerusi"). Keep the document's order.
- Do NOT emit the agenda summary table's rows as separate entries when the
  document also has a matching section per row — the sections already carry
  those titles, and the table is rebuilt from them. If a table row has NO
  matching section, emit it as its own entry so it is not lost.
- A printed SUB-HEADING with its own number AND its own title (e.g.
  "Agenda 2.1: Kekosongan jawatan Ahli Jawatankuasa") is a SECTION of its
  own: its paragraphs carry section_no "2.1" and section_title the printed
  title. Losing a sub-heading's title flattens the document — the title is
  part of the page. A line that merely STARTS with a sub-number inside a
  paragraph (no title of its own) keeps that number in "own_no" instead.
- A line printed with its own sub-number keeps it in "own_no" (e.g. "2.1").
  Handwritten annotations in the margins of a printed page are entries too —
  put each in the section it is written beside, mark it "check" if smudged.
- Handwritten note pages and whiteboards usually have NO sections: omit the
  structure markers entirely there.

MONEY THE MEETING APPROVED TO PAY OUT — "financial_resolutions" is a
COPY-INDEX and it must never change what the other fields contain. Fill it
ONLY when the meeting DECIDED money will be PAID OUT to a named party (a
vendor, a contractor, a supplier): "vendor_name" exactly as written,
"approved_amount_cents", "purpose". Two rules stay EXACTLY as they were:
1. Every fact still lives in EXACTLY ONE of "resolutions"/"figures" under
   the earlier rules — this index only COPIES the triple. It NEVER adds an
   entry to "resolutions", NEVER changes an entry's wording, and NEVER
   moves an amount out of "figures".
2. Money RECEIVED (kutipan, derma, 收到/筹到 collections, balances) is
   NEVER a financial_resolution — money coming in is not money paid out.
   It stays in "figures" and only there, same as always.
Most meetings decide no payout: an empty array is the normal answer.

NUMBERED LISTS — a page that is a numbered list (a whiteboard of targets, a
name list, an agenda) is read row by row, EVERY row, in order. Never skip a
row number: after item 12 comes item 13, and if 13 is illegible you output an
entry for it with what you can see and confidence "check" — skipping it
silently is the one unforgivable answer. Keep each row's own number at the
start of its text exactly as written.
Reading every row does NOT mean recording a row twice: each fact goes in
EXACTLY ONE field. A row that is a money amount (a balance, a collection, a
budget figure) belongs in "figures" — do not also copy it into "resolutions".

RESOLUTIONS — use "resolutions" for what was decided, agreed, planned or is to be done, INCLUDING every one-off duty assignment kept out of office_bearers above.
- Agenda and programme items, tasks, things to prepare or bring, arrangements such as meals, transport or equipment, and any time or duration written for an activity.
- Duty assignments: one entry per duty, written so a reader can see it is an assignment for this activity — e.g. "游行队伍带头：嘉益、柔依", "青少年班主持：嘉益". Keep the original wording and script.
- If a heading applies to several rows (e.g. a 主持 heading followed by 青:A 少:B 小小:C), combine the heading with each row's own label so two duties never read the same: "青班主持：A", "少班主持：B", "小小班主持：C".
- Keep each item's own wording; do not merge unrelated items into one entry.
- Label each entry with "kind" — this only classifies the text you already extracted, it never changes the text:
  - "decision" = the meeting decided/agreed/approved something (通过/决定/同意/diluluskan/bersetuju)
  - "task"     = something to be done, prepared, bought or brought (with or without a name attached)
  - "duty"     = a role-for-this-activity paired with people (主持/带队/司仪/负责人 + names) — the one-off assignments kept out of office_bearers
  - "info"     = a recorded fact with no action: times, programme order, headcounts, notes
  If unsure between two kinds, prefer "task" over "decision" and "info" over everything.

Amounts: extract as integer sen (RM 3,500.00 => 350000). Extract ONLY numbers you can see — never total, never compute; all arithmetic is done by our code, not by you.
Dates: normalise to YYYY-MM-DD; resolve 2-digit years to the most recent past date relative to today; if the date is not written anywhere, it is missing.
Names: keep the spelling as written; put alternate scripts (e.g. 陈亚九) in the snippet.
Name characters: Chinese given names often use an uncommon character that resembles a common one (昶/湘, 骐/骑, 倩/情, 妮/呢). A substituted character is a DIFFERENT PERSON, so never "correct" a name into the character you expect. If a name character is not unmistakably legible, output what you see and mark that name "check" so a human verifies it — an honest "check" is always better than a confident wrong name.
Empty page sections are not errors — output empty arrays.${glossaryBlock}${contextBlock}`;
}
