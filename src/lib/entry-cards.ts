// ---------------------------------------------------------------------------
// THE ENTRY CARDS — what the home page shows when the conversation is empty
// (work order 113 §1, J 2026-08-31: 「這個 HOME 一定要改…你做成 CARD，可以按
// 有想要 UPLOAD 東西，或者問東西…或者說這裏是 ALL IN ONE，有什麽都可以放在
// 這裏讓 AI 來看。開始聊天后那些 card 就會收起來」).
//
// The product's claim — society paperwork without forms — is a sentence
// nobody reads. These six cards are that sentence made pressable: a person
// holding a piece of paper presses the card that looks like their paper and
// the work starts, instead of first having to work out which PAGE their paper
// belongs to (Hard Rule 11, the one door).
//
// 🔴 WHY THIS IS A LIB FILE AND NOT JUST JSX. Two reasons, both house rules:
//   * pure logic goes to src/lib BEFORE the UI divides (CLAUDE.md rule 13) —
//     which cards exist, in what order, and which of them pre-marks the paper
//     as what, is logic, and it is testable without a browser;
//   * every string here is three languages at once (Hard Rule 9) and none of
//     them may be trade jargon (108 §5 sweeps the site for "upload",
//     "extraction", "draft"). Both are pinned by entry-cards.test.ts, so a
//     card added later cannot quietly ship in one language or in jargon.
//
// 🔴 THE POINT OF CARDS 1–3 IS NOT "IT OPENS A FILE CHOOSER". It is that the
// person has ALREADY SAID what the paper is. /api/intake then skips the
// classify step entirely (`forcedKind`): one AI action saved every time, and
// one fewer chance for the classifier to place the page wrongly. Dropping a
// file in without pressing a card still classifies, exactly as before — the
// card is a shortcut for people who know, never a question everybody must
// answer first.
// ---------------------------------------------------------------------------

import type { IntakeKind } from "@/lib/intake-handoff";

/** One string in the three languages the interface is required to speak. */
export type CardText = { bm: string; zh: string; en: string };

export type EntryCardId =
  | "meeting_notes"
  | "money"
  | "constitution"
  | "dictate"
  | "ask"
  | "resume";

export type EntryCard = {
  id: EntryCardId;
  /**
   * What pressing it does. The component switches on this — the card list
   * stays data, so a new card is a data change plus one branch, never a new
   * copy of the grid.
   *   pick    — open the file chooser with `kind` already decided
   *   dictate — start the microphone (the spoken road)
   *   ask     — unfold the common questions
   *   resume  — go back to the half-finished work
   */
  action: "pick" | "dictate" | "ask" | "resume";
  /** `pick` only: what the person has just told us the paper is. */
  kind?: IntakeKind;
  /** `resume` only: where "back to where you stopped" goes. */
  href?: string;
  title: CardText;
  detail: CardText;
  /** The one card that is heavier than the others — there IS work waiting. */
  emphasis?: boolean;
};

/**
 * 🔴 CARD 2 IS THE ONE THAT HAD TO BE RE-WORDED, AND ON PURPOSE.
 *
 * The work order calls it 「收據、單據、帳單 → 記進帳本」 and says in the same
 * breath that the sub-lines are 「意思，不是死字」. Taken literally it would
 * promise something the reader behind it cannot do: the only money reader
 * Minit has is the DONATION LEDGER reader (`ledger_page` — "tables of names,
 * amounts and dates of money received"). Forcing a photographed utility bill down
 * that road does not produce an error, which is worse: it produces a
 * confident empty reading of a page that was never a ledger.
 *
 * So the card says what it really takes — the donation book, the page of
 * money received — and anything else still goes in the ordinary way, by being
 * dropped in and classified. A card that promises less than it delivers is a
 * missed shortcut; a card that promises more is a wrong answer.
 */
const CARDS: EntryCard[] = [
  {
    id: "meeting_notes",
    action: "pick",
    kind: "meeting_notes",
    title: {
      bm: "Nota mesyuarat",
      zh: "开会的笔记",
      en: "Notes from a meeting",
    },
    detail: {
      bm: "Ambil gambar — MinitAI tulis minitnya",
      zh: "拍下来，帮您写成会议记录",
      en: "Photograph it — MinitAI writes the minutes",
    },
  },
  {
    id: "money",
    action: "pick",
    kind: "ledger_page",
    title: {
      bm: "Wang yang masuk",
      zh: "收到的钱",
      en: "Money that came in",
    },
    detail: {
      bm: "Buku derma atau lejar — masuk rekod wang",
      zh: "捐款簿或账页，记进钱的记录",
      en: "A donation book or ledger — into your money records",
    },
  },
  {
    id: "constitution",
    action: "pick",
    kind: "constitution",
    title: {
      bm: "Undang-Undang Tubuh",
      zh: "章程 Undang-Undang Tubuh",
      en: "Constitution (Undang-Undang Tubuh)",
    },
    detail: {
      bm: "Jawapan ikut fasal anda sendiri",
      zh: "以后回答照你们自己的条文",
      en: "Answers then follow your own clauses",
    },
  },
  {
    id: "dictate",
    action: "dictate",
    title: {
      bm: "Baru habis mesyuarat",
      zh: "刚开完会",
      en: "Just came out of a meeting",
    },
    detail: {
      bm: "Cakap sahaja — MinitAI menaip",
      zh: "用讲的，MinitAI 帮您打字",
      en: "Just say it — MinitAI types",
    },
  },
  {
    id: "ask",
    action: "ask",
    title: {
      bm: "Tanya satu soalan",
      zh: "问一句",
      en: "Ask one question",
    },
    detail: {
      bm: "Soalan yang selalu ditanya — tekan satu",
      zh: "常问的几题，点一下就问",
      en: "Questions people ask most — tap one",
    },
  },
];

/**
 * The resume card (#6). It replaces the standing line that used to sit above
 * the conversation ("You have 4 unfinished minutes draft(s). Continue →") —
 * same fact, no longer a whole row of the screen to itself.
 *
 * 🔴 It carries the COUNT in its own title because that is the whole reason
 * to press it, and it is heavier than the other five because unfinished work
 * is the most likely thing the person came back for.
 *
 * "draft" is deliberately absent from the English: 108 §5 sweeps the site for
 * exactly that word. "Unfinished" is what a treasurer would say.
 */
function resumeCard(n: number): EntryCard {
  return {
    id: "resume",
    action: "resume",
    href: "/minutes/drafts",
    emphasis: true,
    title: {
      bm: `Sambung kerja (${n} belum siap)`,
      zh: `接着做（${n} 份还没做完）`,
      en: `Carry on (${n} unfinished)`,
    },
    detail: {
      bm: "Balik ke tempat anda berhenti",
      zh: "回到上次停下来的地方",
      en: "Back to where you stopped",
    },
  };
}

/**
 * Which cards this person actually sees.
 *
 * 🔴 A CARD THAT CANNOT DO ITS JOB IS NOT SHOWN. Never a dead control
 * (CLAUDE.md rule 13):
 *   * `unfinished` is null (the count could not be read) or 0 → no resume
 *     card. null must never render as "you have none" — it renders as
 *     nothing at all, which is the same rule the old line followed.
 *   * `canDictate` is false (a browser with no speech recognition — Firefox,
 *     many in-app WebViews) → no dictate card. The same graceful degradation
 *     the microphone button itself has always had.
 */
export function entryCardsFor({
  unfinished,
  canDictate,
}: {
  unfinished: number | null;
  canDictate: boolean;
}): EntryCard[] {
  const cards = CARDS.filter((c) => c.action !== "dictate" || canDictate);
  return unfinished !== null && unfinished > 0
    ? [...cards, resumeCard(unfinished)]
    : cards;
}

/** Every card, for tests and for anything that needs the full set. */
export const ALL_ENTRY_CARDS: EntryCard[] = [...CARDS, resumeCard(1)];
