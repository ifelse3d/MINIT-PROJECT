// Prompt template — pipeline step 3: organise a CONFIRMED extraction into the
// shape of a formal BM minit mesyuarat. Prompts are content, not code
// (CLAUDE.md rule 6).
//
// 2026-08-19 REWRITE — and note WHAT the model is asked for, because the first
// attempt at this got it wrong in an instructive way.
//
// v1 asked the model for the finished Markdown. Run against a real 17-item
// planning whiteboard, gemini-3.5-flash-lite produced nicely grouped BM
// sections — and silently dropped items 13-17 (the whole parents' class
// programme). Nothing in the output said anything was missing. That is the
// exact failure shape that got gpt-5.6-luna rejected on 2026-08-07: `invented`
// stays 0 while facts quietly disappear, and in a document a society signs and
// files, an omission is as damaging as a fabrication.
//
// So the model no longer writes the document. It ASSIGNS each confirmed item
// to a section, by index, and phrases it. The code then checks that every
// index came back exactly once and renders the Markdown itself
// (src/lib/minutes-compose.ts). Grouping and wording are judgement, which is
// what a model is for; "nothing was lost" is arithmetic, which is not.

import { LANGUAGE_NAME, type MinutesLang } from "@/lib/minutes-lang";

export type DraftMinutesPromptParams = {
  /** The confirmed resolution texts, in their original order. */
  resolutionTexts: string[];
  /** What language the finished minutes are to be written in. */
  lang?: MinutesLang;
  /** The organisation's own vocabulary, already formatted (src/lib/glossary.ts). */
  glossaryBlock?: string;
  /** Appended when a first attempt failed the coverage check (rule 7). */
  repair?: {
    missing: number[];
    duplicated: number[];
    unknown: number[];
    altered: number[];
  };
};

/** Per-language worked examples for "translate the ordinary words, keep the
 *  names". Generic instructions do not survive contact with a mixed-script
 *  page; concrete pairs do. */
const ORDINARY_WORD_EXAMPLES: Record<MinutesLang, string> = {
  bm: '游行队伍 is "barisan perarakan", 家长班 is "kelas ibu bapa", 早餐 is "sarapan", 桌游 is "permainan meja", 聊天 is "sesi beramah mesra", 15分钟 is "15 minit"',
  en: '游行队伍 is "the procession line-up", 家长班 is "the parents\' class", 早餐 is "breakfast", 桌游 is "board games", 聊天 is "an informal chat", 15分钟 is "15 minutes"',
  zh: 'a fragment such as "早餐: 干捞面，Milo" becomes a full sentence — "早餐供应干捞面和 Milo。" — and a Malay or English word already in the note (Nasi Lemak, Live Band, Playground) is left exactly as it is',
};

export function draftMinutesPrompt({
  resolutionTexts,
  lang = "bm",
  glossaryBlock = "",
  repair,
}: DraftMinutesPromptParams): string {
  const language = LANGUAGE_NAME[lang];
  const numbered = resolutionTexts
    .map((t, i) => `${i}: ${t}`)
    .join("\n");

  const base = `You are organising the confirmed contents of a Malaysian society's meeting notes into the structure of a formal set of minutes, to be written in ${language}. A human has already verified every item below; your job is to decide how they should be ARRANGED and how each should be PHRASED — not to decide what is true.

THE ITEMS (index: text). There are exactly ${resolutionTexts.length} of them:
${numbered}

=== WHAT YOU RETURN ===
JSON, and nothing else:

{
  "sections": [
    {
      "heading": "Section heading, in ${language}",
      "items": [ { "source": 0, "kind": "perbincangan" | "keputusan" | "tindakan", "text": "the item, phrased for a minutes document, in ${language}" } ]
    }
  ],
  "unresolved": [ { "source": 0, "text": "..." } ]
}

"kind" says what the line RECORDS, and the document prints the matching formal
label (Perbincangan / Keputusan / Tindakan) in front of it:
- "keputusan"    — the meeting decided or agreed something.
- "tindakan"     — a task or duty was assigned to a named person or group.
- "perbincangan" — something was discussed, reported or noted, with no decision
                   and no assignment. When unsure, use "perbincangan".
"kind" changes only the label; it must not change the text. Items in
"unresolved" take no "kind".

=== THE RULE THAT IS CHECKED BY CODE ===
Every index from 0 to ${resolutionTexts.length - 1} must appear EXACTLY ONCE,
either in a section or in "unresolved". Not zero times. Not twice. Never
invent an index. Your answer is rejected and sent back to you if this does not
hold, so count before you finish. If an item does not fit any section you
devised, make a section for it — dropping it is not an option.

Your section headings are load-bearing: the opening summary of the document is
built from them word for word, by code, so a heading that names something the
meeting did not discuss puts an untrue sentence at the top of a signed document.
Name the section after the items that are in it, and nothing else.

=== HOW TO GROUP ===
Choose the sections from the content itself, in the order a reader needs them
(who is responsible → what happens → supporting arrangements is usually right).
Typical groupings are duty assignments, order of events, logistics and
transport, refreshments, and the programme for a particular group. Do not force
content into a heading that does not fit it, and do not create a section with
one item in it if it belongs naturally with another.

Put an item in "unresolved" when its own text shows it is NOT yet settled — a
question mark, "TBC", "belum pasti", "?". Those must be listed as outstanding
rather than recorded as decided. This is not optional: an item ending in "?"
records a question the meeting did not answer, and printing it as a decision
makes the minutes say something the meeting did not say. Put the item in
"unresolved" and phrase it as the open question it is. Worked example: the item
"小视频 - 大事纪掌控 (歌: Saya Anak Malaysia ?)" belongs in "unresolved",
because the "?" says the song has not been chosen — record the video and its
handler as decided, and the song as the outstanding question.

HEADINGS AND SOCIETY OFFICE — do not use "Ahli Jawatankuasa", "Pemegang
Jawatan", "Pelantikan" or any other wording that implies a standing office of
the society for duties that are one-off jobs for this event. Those words map to
the committee list a society files with the Registrar, and a person given a
task for one day has not been elected to anything. Name such sections after the
work ("Pembahagian Tugas", "Tugasan Perarakan").

=== HOW TO PHRASE text ===
Write it as a COMPLETE SENTENCE of formal minutes prose, not as a note
fragment or point-form entry: state the duty or decision, then the person or
detail, in formal ${language}, ending with a full stop.

The notes mix Bahasa Malaysia, Chinese and English on one page. THE ORDINARY
WORDS COME OUT IN ${language.toUpperCase()}; ONLY THE NAMES KEEP THEIR OWN
FORM. For example: ${ORDINARY_WORD_EXAMPLES[lang]}. A line still carrying a
word in another language where ${language} has a perfectly good one is not
finished. Class labels built from a single character (青班, 少班, 小小班) are
labels rather than descriptions — keep those as they are.

Proper nouns are copied EXACTLY, character for character. A personal name in
Chinese characters STAYS in Chinese characters — never romanised, never given
in pinyin, never translated, and never "corrected" because it looks unusual.
This holds whatever language the document is in.
The same holds for the names of organisations, teachings and titles of office
within them: 崇德 stays 崇德 and not "Chong De"; 点传师 stays 点传师. A dish may be given the name it is
commonly known by in ${language} where one plainly exists; where none does,
keep it as written. Keep every number, quantity and
duration exactly as given.

Do not add a fact that is not in the item you were given, and do not merge two
indices into one line of text.${glossaryBlock}`;

  if (!repair) return base;

  const problems = [
    repair.missing.length ? `MISSING (you left these out): ${repair.missing.join(", ")}` : "",
    repair.duplicated.length ? `DUPLICATED (you used these more than once): ${repair.duplicated.join(", ")}` : "",
    repair.unknown.length ? `NOT REAL INDICES (you invented these): ${repair.unknown.join(", ")}` : "",
    repair.altered.length
      ? `CHANGED CHARACTERS (you altered a name or label — every run of Chinese ` +
        `characters you write must appear character for character in the item it ` +
        `came from): ${repair.altered.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${base}

=== YOUR PREVIOUS ANSWER WAS REJECTED ===
${problems}

Return the corrected JSON, with every index from 0 to ${resolutionTexts.length - 1} appearing exactly once and every Chinese character run copied exactly.`;
}
