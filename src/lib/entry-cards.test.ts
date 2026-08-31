import { describe, expect, it } from "vitest";
import { ALL_ENTRY_CARDS, entryCardsFor, type EntryCard } from "./entry-cards";

/** Every user-visible string on a card, flattened. */
function allStrings(card: EntryCard): string[] {
  return [
    card.title.bm,
    card.title.zh,
    card.title.en,
    card.detail.bm,
    card.detail.zh,
    card.detail.en,
  ];
}

describe("the home page's entry cards (work order 113 §1)", () => {
  // --- §1: the six cards, and each one's landing ---------------------------

  it("shows all six cards when there is work waiting and a microphone", () => {
    const cards = entryCardsFor({ unfinished: 4, canDictate: true });
    expect(cards.map((c) => c.id)).toEqual([
      "meeting_notes",
      "money",
      "constitution",
      "dictate",
      "ask",
      "resume",
    ]);
  });

  it("card 1 lands on the meeting-notes reader with the kind already decided", () => {
    const card = entryCardsFor({ unfinished: null, canDictate: true })[0];
    expect(card.id).toBe("meeting_notes");
    expect(card.action).toBe("pick");
    expect(card.kind).toBe("meeting_notes");
  });

  it("card 2 lands on the money reader with the kind already decided", () => {
    const card = entryCardsFor({ unfinished: null, canDictate: true })[1];
    expect(card.id).toBe("money");
    expect(card.action).toBe("pick");
    expect(card.kind).toBe("ledger_page");
  });

  it("card 3 lands on the constitution reader with the kind already decided", () => {
    const card = entryCardsFor({ unfinished: null, canDictate: true })[2];
    expect(card.id).toBe("constitution");
    expect(card.action).toBe("pick");
    expect(card.kind).toBe("constitution");
  });

  it("card 4 goes to the microphone and pre-marks nothing", () => {
    const card = entryCardsFor({ unfinished: null, canDictate: true })[3];
    expect(card.id).toBe("dictate");
    expect(card.action).toBe("dictate");
    expect(card.kind).toBeUndefined();
  });

  it("card 5 unfolds the common questions and pre-marks nothing", () => {
    const card = entryCardsFor({ unfinished: null, canDictate: true })[4];
    expect(card.id).toBe("ask");
    expect(card.action).toBe("ask");
    expect(card.kind).toBeUndefined();
  });

  it("card 6 goes back to the half-finished work, carrying the count", () => {
    const cards = entryCardsFor({ unfinished: 4, canDictate: true });
    const resume = cards[cards.length - 1];
    expect(resume.id).toBe("resume");
    expect(resume.action).toBe("resume");
    expect(resume.href).toBe("/minutes/drafts");
    // The number is the whole reason to press it, so it is IN the card.
    expect(resume.title.zh).toContain("4");
    expect(resume.title.bm).toContain("4");
    expect(resume.title.en).toContain("4");
    // Heavier than the other five: this is the likeliest reason for the visit.
    expect(resume.emphasis).toBe(true);
    expect(cards.filter((c) => c.emphasis).length).toBe(1);
  });

  // --- never a dead control (CLAUDE.md rule 13) ----------------------------

  it("hides the resume card when there is nothing unfinished", () => {
    const cards = entryCardsFor({ unfinished: 0, canDictate: true });
    expect(cards.some((c) => c.id === "resume")).toBe(false);
    expect(cards.length).toBe(5);
  });

  it("hides the resume card when the count could not be read (null ≠ none)", () => {
    // 🔴 null is "we do not know", and an unknown must never be rendered as a
    // claim in either direction — no card, no number, no "you have none".
    const cards = entryCardsFor({ unfinished: null, canDictate: true });
    expect(cards.some((c) => c.id === "resume")).toBe(false);
  });

  it("hides the dictate card in a browser that cannot listen", () => {
    const cards = entryCardsFor({ unfinished: 4, canDictate: false });
    expect(cards.some((c) => c.id === "dictate")).toBe(false);
    // …and the rest of the grid is untouched.
    expect(cards.map((c) => c.id)).toEqual([
      "meeting_notes",
      "money",
      "constitution",
      "ask",
      "resume",
    ]);
  });

  it("the leanest possible grid is still four working cards", () => {
    const cards = entryCardsFor({ unfinished: null, canDictate: false });
    expect(cards.map((c) => c.id)).toEqual([
      "meeting_notes",
      "money",
      "constitution",
      "ask",
    ]);
  });

  // --- the house rules every visible string is under ------------------------

  it("every card speaks all three languages (Hard Rule 9)", () => {
    for (const card of ALL_ENTRY_CARDS) {
      for (const s of allStrings(card)) {
        expect(s.trim(), card.id).not.toBe("");
      }
      // Three different languages, not the same string three times.
      expect(new Set([card.title.bm, card.title.zh, card.title.en]).size, card.id).toBe(3);
    }
  });

  it("no card speaks in trade jargon (108 §5 sweeps for exactly these)", () => {
    // The English words a treasurer does not use. BM "draf"/"muat" are the
    // ordinary Malay words and are not what that sweep is about, so the
    // pattern is deliberately the English spellings only.
    const jargon = /\b(upload|uploading|extraction|extract|classify|classification|draft|OCR|API|parse|metadata)\b/i;
    for (const card of ALL_ENTRY_CARDS) {
      for (const s of allStrings(card)) {
        expect(jargon.test(s), `${card.id}: ${s}`).toBe(false);
      }
    }
  });

  it("only the three paper cards pre-mark a kind, and each a different one", () => {
    const kinds = ALL_ENTRY_CARDS.filter((c) => c.kind).map((c) => c.kind);
    expect(kinds).toEqual(["meeting_notes", "ledger_page", "constitution"]);
    for (const card of ALL_ENTRY_CARDS) {
      if (card.kind) expect(card.action, card.id).toBe("pick");
      else expect(card.action, card.id).not.toBe("pick");
    }
  });

  it("every card has somewhere to go — no card is decoration", () => {
    for (const card of ALL_ENTRY_CARDS) {
      const goes =
        (card.action === "pick" && card.kind !== undefined) ||
        (card.action === "resume" && card.href !== undefined) ||
        card.action === "dictate" ||
        card.action === "ask";
      expect(goes, card.id).toBe(true);
    }
  });
});
