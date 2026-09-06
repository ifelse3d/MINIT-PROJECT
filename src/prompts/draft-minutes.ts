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
    /** Sources a MERGED line lost a name or figure from (checkMergedFacts). */
    dropped?: number[];
    /** 118 §1: sources whose line was given a DOER or a DECISION the item
     *  never carried (checkInventedAgent). */
    invented?: number[];
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
      "items": [ { "source": 0, "kind"?: "keputusan" | "tindakan", "text": "the item, phrased for a minutes document, in ${language}" } ]
    }
  ],
  "unresolved": [ { "source": 0, "text": "..." } ]
}

"source" is ONE index — or a LIST of indices, [3, 4, 5], when one line of the
document covers several items (see MERGING LIKE ITEMS below).

"kind" is OPTIONAL, and it is EARNED BY THE WORDS ON THE PAGE — never by
your reading of them. The document prints a formal label (Keputusan /
Tindakan) in front of a line only when the item ITSELF carries the words:
- "keputusan" ONLY when the item's own text says a decision was taken —
  memutuskan, diputuskan, lulus, diluluskan, bersetuju, dipersetujui, 通过,
  決定/决定, 議決/议决, approved, agreed, decided.
- "tindakan"  ONLY when the item itself names WHO and WHAT THEY ARE TO DO —
  a person or group, plus a task that is THEIRS to carry out (ditugaskan,
  diminta, bertanggungjawab, 负责, 委派, a duty-roster line like
  "游行队伍带头：嘉益、柔依").
- Otherwise OMIT "kind" and write the item as one plain line. There is no
  third label: "something was discussed" is not a label, it is the absence
  of one.
A label the words do not earn is removed by code; a label never changes the
text. Items in "unresolved" take no "kind".

=== NO DOER THE PAGE DID NOT NAME (checked by code) ===
A note usually states a task without saying who does it, and Bahasa Malaysia
lets you write it that way too. THE RULE, IN ONE SENTENCE: if the item does
not say who does something, your sentence does not say who does it either.
- "X ditugaskan untuk…", "X diminta…", "X diarahkan…", "X bertanggungjawab…",
  "X akan menguruskan…", "Mesyuarat memutuskan agar X…", "Mesyuarat bersetuju
  supaya X…" are FORBIDDEN unless the item itself carries the corresponding
  words (tugas, minta, arah, tanggungjawab, memutuskan, bersetuju, 负责,
  委派, 安排…). Never supply a doer to make a sentence grammatical.
- An appointment is not an assignment. "lanti Ajk seorg. Tan Kim Loo"
  records that Tan Kim Loo IS APPOINTED as one committee member —
  "Melantik Ajk seorang iaitu Tan Kim Loo." Writing "Tan Kim Loo ditugaskan
  untuk melantik seorang Ahli Jawatankuasa" turns the person being
  appointed into the person doing the appointing: the worst thing this
  document can do, and the reason this rule exists.
- The same for a decision: an item that does not say the meeting decided
  or agreed is not written as "Mesyuarat memutuskan/bersetuju…". Record what
  the line records; the label, if any, is earned separately (above).
- When a line can be read two ways (who replaced whom, who appointed whom),
  keep the ambiguity: write it as it stands, expanded only in spelling, and
  never pick a reading.

=== THE RULE THAT IS CHECKED BY CODE ===
Every index from 0 to ${resolutionTexts.length - 1} must appear EXACTLY ONCE
across the whole answer — inside exactly one item's "source" (alone or in a
list), in a section or in "unresolved". Not zero times. Not twice. Never
invent an index. Your answer is rejected and sent back to you if this does not
hold, so count before you finish. If an item does not fit any section you
devised, make a section for it — dropping it is not an option.

=== MERGING LIKE ITEMS ===
A run of items that are THE SAME KIND OF FACT repeated — a target per group, a
leader appointed per class, a price per stall — reads terribly as one sentence
each. Write those as ONE line that carries all of them, with
"source": [every index it covers]. Worked example: the items
"1. 宏道 10位", "2. 同吉 10位", "3. 同行 5位" become one keputusan —
"Sasaran ditetapkan bagi setiap kumpulan: 宏道 10 orang, 同吉 10 orang,
同行 5 orang." — with "source": [4, 5, 6] (their real indices). This is
checked by code: a merged line must still contain EVERY name (any Chinese word
of two or more characters, character for character) and EVERY number of every
item it merges — only a leading list number like the "1." in "1. 宏道 10位"
and single-character measure words (位, 个) may go. If an item's words would
have to be translated away to fit the merged sentence, phrase that item on its
own instead. Merge only items of the same kind; never merge to shorten, only
to read the way a person would actually write the minutes.

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

=== THE LOCKED LIST — copied character for character, never rewritten ===
(118 §2: these rules used to live in a separate "formal version" pass. They
now live HERE, on the document itself, because the document is what a
society signs and files — and every one of them is checked by code.)
* every amount of money, exactly as written, with its currency and digits;
* every date and every time, exactly as written;
* every person's name, EXACTLY as spelled — a changed letter is a different
  person, and the check is on WHOLE WORDS: "Tan Kim Looi" is not "Tan Kim Loo";
* every identity-card number and every receipt number, digit for digit;
* the SUBSTANCE of every decision: approved stays approved, not approved
  stays not approved, deferred stays deferred — never soften, never harden,
  never resolve an open item;
* nobody is added, no amount is added, no date is added, no doer is added.
FINISHING A SENTENCE IS NOT ADDING A FACT. You may add the grammar a
sentence needs — a verb, a connective, a preposition. You may not add who,
how much, when, or what was decided.
LEAVE THE GAPS AS GAPS. Where the line does not say something, your sentence
does not say it either. Never write "the meeting agreed" over a line that
only records that something was discussed; an honest gap is always better
than a fluent guess.

=== HOW TO PHRASE text ===
Write it as a COMPLETE SENTENCE of formal minutes prose, not as a note
fragment or point-form entry: state the duty or decision, then the person or
detail, in formal ${language}, ending with a full stop.

SHORTHAND IS EXPANDED; FACTS ARE NEVER ADDED. A telegraphic note is written
out as the full formal sentence it abbreviates. Worked example: the item
"5 lanti AJK baru. Tan Mei Lee 800101-07-1234 - 8, Lrg 3 Tmn Aman" becomes
"Melantik Tan Mei Lee (No. K/P: 800101-07-1234), beralamat di 8, Lorong 3,
Taman Aman, sebagai Ahli Jawatankuasa baharu." — the abbreviations written
in full (lanti → melantik, mes. agung → mesyuarat agung, Lrg → Lorong, Tmn →
Taman), every digit copied exactly, nothing new. Note what is NOT there: no
"Mesyuarat bersetuju" (the note never said the meeting agreed), no doer.
Expanding an abbreviation is WORDING, which is your job; adding anything the
note does not carry (a date, a reason, an honorific, a second person, a
doer, a decision) is INVENTION — never do that. A shorthand word you cannot
confidently expand stays exactly as written.

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
A COMPOSITE label joined with slashes or 、 (like 青/小/小小班) is copied
WHOLE, exactly as written — never split into pieces and never recombined
into new words (writing 青班 when the page wrote 青/小/小小班 fails the
character check).

Do not add a fact that is not in the items you were given. A line's "source"
must list exactly the items that line covers — nothing folded in silently.${glossaryBlock}`;

  if (!repair) return base;

  const problems = repairProblems(repair);

  return `${base}

=== YOUR PREVIOUS ANSWER WAS REJECTED ===
${problems}

Return the corrected JSON, with every index from 0 to ${resolutionTexts.length - 1} appearing exactly once and every Chinese character run copied exactly.`;
}

function repairProblems(repair: NonNullable<DraftMinutesPromptParams["repair"]>): string {
  return [
    repair.missing.length ? `MISSING (you left these out): ${repair.missing.join(", ")}` : "",
    repair.duplicated.length ? `DUPLICATED (you used these more than once): ${repair.duplicated.join(", ")}` : "",
    repair.unknown.length ? `NOT REAL INDICES (you invented these): ${repair.unknown.join(", ")}` : "",
    repair.altered.length
      ? `CHANGED NAMES (you altered a name or label — every run of Chinese ` +
        `characters you write must appear character for character in the item it ` +
        `came from, and every Latin-letter personal/organisation name must be ` +
        `copied letter for letter, never turned into Chinese characters): ` +
        repair.altered.join(", ")
      : "",
    repair.dropped?.length
      ? `MERGED AWAY (a merged line lost this item's name or number — a merged ` +
        `line must still contain every name and every figure of every index in ` +
        `its "source" list): ${repair.dropped.join(", ")}`
      : "",
    repair.invented?.length
      ? `INVENTED A DOER OR A DECISION (your sentence says WHO does something, ` +
        `or that the meeting decided/agreed, and the item itself carries no such ` +
        `words — write the line without a doer and without a verdict, expanded ` +
        `only in spelling): ${repair.invented.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// G2 (work order 68): PHRASE-IN-PLACE — the structured document's prompt.
//
// A printed formal minit already HAS its arrangement (G1 preserved it), so
// the model is not asked to arrange anything: section order, numbering and
// membership are fixed by code. Its only job here is language — each listed
// paragraph rewritten in the target language, one for one, in the register
// of formal minutes. Coverage arithmetic (every index exactly once) and the
// checkNames guard run on the result exactly as in the arranging prompt.
// ---------------------------------------------------------------------------

export type PhraseMinutesItemsPromptParams = {
  /** index (into the shared resolution numbering) → the paragraph to phrase. */
  items: { index: number; text: string }[];
  lang?: MinutesLang;
  glossaryBlock?: string;
  repair?: DraftMinutesPromptParams["repair"];
};

export function phraseMinutesItemsPrompt({
  items,
  lang = "bm",
  glossaryBlock = "",
  repair,
}: PhraseMinutesItemsPromptParams): string {
  const language = LANGUAGE_NAME[lang];
  const numbered = items.map((it) => `${it.index}: ${it.text}`).join("\n");
  const indices = items.map((it) => it.index).join(", ");

  const naturalZh =
    lang === "zh"
      ? `\nWrite NATURAL written Chinese, the way a society's secretary actually
writes minutes — full sentences, plain register. Do not write bureaucratic
boilerplate (no "兹决议", no clause-style fragments); keep it formal but
human.`
      : "";

  const base = `You are rewriting individual paragraphs of a Malaysian society's meeting minutes into ${language}. The document's structure is already fixed by other means; you rewrite ONLY the paragraphs listed, one for one. A human has verified every paragraph — you decide the WORDING in ${language}, never what is true.

THE PARAGRAPHS (index: text). There are exactly ${items.length}, with indices ${indices}:
${numbered}

=== WHAT YOU RETURN ===
JSON, and nothing else:

{ "items": [ { "source": <index>, "text": "the same paragraph, written in ${language}" } ] }

=== THE RULE THAT IS CHECKED BY CODE ===
Each listed index appears EXACTLY ONCE in your answer — no index skipped, no
index repeated, no index invented. Your answer is rejected and sent back if
this does not hold.

=== THE LOCKED LIST — copied character for character, never rewritten ===
(118 §2: these rules used to live in a separate "formal version" pass. They
now live HERE, on the document itself, because the document is what a
society signs and files — and every one of them is checked by code.)
* every amount of money, exactly as written, with its currency and digits;
* every date and every time, exactly as written;
* every person's name, EXACTLY as spelled — a changed letter is a different
  person, and the check is on WHOLE WORDS: "Tan Kim Looi" is not "Tan Kim Loo";
* every identity-card number and every receipt number, digit for digit;
* the SUBSTANCE of every decision: approved stays approved, not approved
  stays not approved, deferred stays deferred — never soften, never harden,
  never resolve an open item;
* nobody is added, no amount is added, no date is added, no doer is added.
FINISHING A SENTENCE IS NOT ADDING A FACT. You may add the grammar a
sentence needs — a verb, a connective, a preposition. You may not add who,
how much, when, or what was decided.
LEAVE THE GAPS AS GAPS. Where the line does not say something, your sentence
does not say it either. Never write "the meeting agreed" over a line that
only records that something was discussed; an honest gap is always better
than a fluent guess.

=== HOW TO PHRASE ===
- COMPLETE content: every sentence of the original paragraph is carried into
  the rewritten one. Shortening a paragraph loses facts from a signed
  document — as bad as inventing one.
- Formal minutes prose in ${language}, complete sentences, ending with a full
  stop. For example: ${ORDINARY_WORD_EXAMPLES[lang]}.${naturalZh}
- Proper nouns are copied EXACTLY, character for character. A personal name in
  Chinese characters STAYS in Chinese characters — never romanised, never
  translated, never "corrected". Same for organisation names and titles of
  office within a teaching (点传师 stays 点传师).
- THE MIRROR RULE, checked by code: a personal name written in LATIN letters
  stays in Latin letters, letter for letter — "Loo Sio San" NEVER becomes
  invented Chinese characters (no 吕兆生, no guessing what characters a name
  "should" be). In a Chinese sentence write it as-is: "秘书 Loo Sio San 先生".
  An honorific abbreviation (En., Puan) may be translated (先生/女士); the
  name itself may not change by one letter. Organisation names and addresses
  in Latin letters also stay exactly as written.
- Keep every number, date, time, quantity and duration exactly as given.
- A line's leading list number (like "3." in "3. 同行 10位") stays at the
  start of the rewritten line, unchanged.
- SHORTHAND IS EXPANDED; FACTS ARE NEVER ADDED. A telegraphic paragraph
  ("5 lanti AJK baru. Tan Mei Lee 800101-07-1234 - 8, Lrg 3 Tmn Aman") is
  written out as the full formal sentence it abbreviates ("Melantik Tan
  Mei Lee (No. K/P: 800101-07-1234), beralamat di 8, Lorong 3, Taman Aman,
  sebagai Ahli Jawatankuasa baharu.") — common abbreviations in full
  (lanti → melantik, mes. agung → mesyuarat agung, Lrg → Lorong, Tmn →
  Taman), every digit exact, and NOTHING the paragraph does not carry (no
  date, no reason, no honorific, no second person, no doer, no "Mesyuarat
  bersetuju"). A shorthand word you cannot confidently expand stays exactly
  as written.
- NO DOER THE PARAGRAPH DID NOT NAME (checked by code). If the paragraph
  does not say who does something, your sentence does not say who does it
  either: "X ditugaskan untuk…", "X diminta…", "Mesyuarat memutuskan agar…"
  are forbidden unless the paragraph carries those words. "lanti Ajk seorg.
  Tan Kim Loo" is Tan Kim Loo BEING appointed ("Melantik Ajk seorang iaitu
  Tan Kim Loo."), never Tan Kim Loo appointing someone. A line that can be
  read two ways is written as it stands — you never pick a reading.
- Do not add anything that is not in the paragraph you were given.${glossaryBlock}`;

  if (!repair) return base;

  return `${base}

=== YOUR PREVIOUS ANSWER WAS REJECTED ===
${repairProblems(repair)}

Return the corrected JSON, with each listed index appearing exactly once and every Chinese character run copied exactly.`;
}

