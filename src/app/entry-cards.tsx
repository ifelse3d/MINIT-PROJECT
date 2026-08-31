"use client";

// ---------------------------------------------------------------------------
// THE HOME PAGE'S EMPTY STATE — six cards you can press (work order 113).
//
// J, 2026-08-31: 「這個 HOME 一定要改…你做成 CARD，可以按有想要 UPLOAD 東西，
// 或者問東西…這裏是 ALL IN ONE，有什麽都可以放在這裏讓 AI 來看。開始聊天后
// 那些 card 就會收起來」.
//
// 🔴 THIS GROWS INSIDE THE CONVERSATION, NOT ABOVE IT. 104 §8 and 109 §1 were
// both about the same illness: something new appears on the home page and the
// typing box slides down the screen. The cards are rendered INSIDE
// [data-probe="conversation-region"] — the pane that scrolls — so they cannot
// move the composer by one pixel, in any of the four states, at any width.
// Anyone editing this file: if you find yourself moving it out of that pane
// to "give the cards more room", you have re-introduced the bug twice cured.
//
// The card list itself is data in src/lib/entry-cards.ts (three languages,
// no jargon, pinned by tests). This file is only how it looks and what each
// press does.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  MessageCircleQuestion,
  Mic,
  PenLine,
  ReceiptText,
  ScrollText,
} from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import {
  entryCardsFor,
  type EntryCard,
  type EntryCardId,
} from "@/lib/entry-cards";
import type { IntakeKind } from "@/lib/intake-handoff";

/**
 * 🔴 THE ICONS WENT THROUGH THE MALAYSIA CHECK (house rule: every icon, emoji
 * and example is read once against EVERY community in the country before it
 * ships — D41, the piggy bank that had to be deleted).
 *
 * All six are office objects from the line-icon set the app already uses — no
 * new family, per §1. What each one is, and why it is safe here:
 *   FileText              a sheet of paper with lines
 *   ReceiptText           a receipt with a torn edge and lines
 *   ScrollText            a rolled document
 *   Mic                   a microphone
 *   MessageCircleQuestion a speech bubble with a question mark
 *   PenLine               a pen drawing a line
 *
 * What was considered and REJECTED:
 *   * lucide's `Receipt` — identical to ReceiptText but with a "$" struck
 *     through it. This is a Malaysian product; the money is RM. A US dollar
 *     sign on the money card is both wrong and foreign, so the plain
 *     receipt is used instead.
 *   * `Banknote`, `PiggyBank`, `HandCoins` — money imagery with either an
 *     animal (D41's lesson) or a hand gesture on it. Hands and animals are
 *     exactly where a symbol stops being neutral across communities.
 *   * emoji of any kind — 📝🧾📜 render as somebody else's artwork on every
 *     platform, and the work order asks for the existing line set.
 * No religious symbol, no animal, no food, no hand, no flag, no face.
 */
const ICONS: Record<EntryCardId, typeof FileText> = {
  meeting_notes: FileText,
  money: ReceiptText,
  constitution: ScrollText,
  dictate: Mic,
  ask: MessageCircleQuestion,
  resume: PenLine,
};

export function EntryCards({
  unfinished,
  canDictate,
  questions,
  disabled,
  dragActive,
  howItWorks,
  onPick,
  onDictate,
  onAsk,
}: {
  /** Half-finished work waiting; null = could not be read, so no claim. */
  unfinished: number | null;
  /** False in a browser that cannot listen — then no "just say it" card. */
  canDictate: boolean;
  /** The common questions card 5 unfolds. Every one is answered FREE. */
  questions: { bm: string; zh: string; en: string }[];
  /** No organisation yet, something already running, or the month's AI is
   *  used up — the cards go quiet rather than disappearing. */
  disabled: boolean;
  /** Something is being dragged over the screen right now. */
  dragActive: boolean;
  howItWorks?: React.ReactNode;
  /** Cards 1–3: the person has ALREADY said what the paper is. */
  onPick: (kind: IntakeKind) => void;
  /** Card 4: open the microphone. */
  onDictate: () => void;
  /** Card 5: ask this question now. */
  onAsk: (text: string) => void;
}) {
  const t = useTriText();
  const [askOpen, setAskOpen] = useState(false);
  const cards = entryCardsFor({ unfinished, canDictate });

  function press(card: EntryCard) {
    switch (card.action) {
      case "pick":
        if (card.kind) onPick(card.kind);
        return;
      case "dictate":
        onDictate();
        return;
      case "ask":
        setAskOpen((v) => !v);
        return;
      case "resume":
        // handled by <Link> — a real address, so it opens in a new tab too.
        return;
    }
  }

  return (
    <div data-probe="entry-cards" className="flex flex-col gap-3">
      {/* §3: ONE SHORT QUESTION, not a paragraph of instructions. What stood
          here was a four-line sentence explaining drag-and-drop, the
          paperclip, the file types and that questions are allowed — all of
          which the six cards below now SHOW. The drag instruction only
          appears at the moment it is true: while something is over the
          screen. (The whole screen is still the drop target; that never
          changed.) */}
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold">
          {dragActive ? (
            <Tri
              bm="Lepaskan di sini — di mana-mana pada skrin ini."
              zh="放开手就行 —— 这个画面上任何地方都可以。"
              en="Let go anywhere on this screen."
            />
          ) : (
            <Tri
              bm="Apa yang nak diuruskan?"
              zh="有什么要处理的？"
              en="What needs doing?"
            />
          )}
        </p>
        <p className="text-base text-[color:var(--v2-text-soft)]">
          {/* On a phone this sentence is HIDDEN, and that is a measurement,
              not a preference: 447px of conversation is what 110 recorded and
              this line costs 44px of it — while the six cards under it say
              the same thing by being pressable. The walkthrough link stays at
              every width, because nothing else offers it. */}
          <span className="hidden @2xl:inline">
            <Tri
              bm="Apa sahaja di tangan anda boleh masuk sini — atau tanya sahaja."
              zh="手上有什么都可以放进来 —— 或者就问一句。"
              en="Anything in your hand can come in here — or just ask."
            />{" "}
          </span>
          {howItWorks}
        </p>
      </div>

      {/* Desktop three across, phone two across (§1). Container variants, not
          viewport ones: the left rail and the assistant take width off this
          column, so a viewport breakpoint lies about the room there is
          (shell.tsx). */}
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @2xl:gap-3">
        {cards.map((card) => {
          const Icon = ICONS[card.id];
          const inner = (
            <>
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${
                  card.emphasis
                    ? "bg-[color:var(--v2-primary)] text-white"
                    : "bg-[color:var(--v2-primary)]/10 text-[color:var(--v2-primary)]"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="block text-base font-semibold leading-snug">
                {t(card.title.bm, card.title.zh, card.title.en)}
              </span>
              <span className="line-clamp-2 block text-sm leading-snug text-[color:var(--v2-text-soft)]">
                {t(card.detail.bm, card.detail.zh, card.detail.en)}
              </span>
            </>
          );
          // 🔴 The heavier border is the ONE card with work already waiting
          // (§1). Everything else is the same weight on purpose: six cards of
          // six different weights is a ranking nobody asked for.
          // min-height is smaller on a phone on purpose: 447px of
          // conversation cannot hold six desktop-sized cards, and the honest
          // answer is a tighter card plus a pane that scrolls — not smaller
          // type (F-3: the touch floor and the reading size are not currency).
          const shell = `group relative flex min-h-[5.5rem] flex-col gap-1.5 rounded-md border-2 p-3 text-left @2xl:min-h-[7rem] transition-[transform,border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[var(--v2-shadow-soft)] active:scale-[0.995] disabled:opacity-50 ${
            card.emphasis
              ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary)]/8 hover:border-[color:var(--v2-primary)]"
              : "border-[color:var(--v2-border)] bg-white/70 hover:border-[color:var(--v2-primary)]/60 dark:bg-white/5"
          }`;

          if (card.action === "resume" && card.href) {
            return (
              <Link
                key={card.id}
                data-probe="entry-card"
                data-card={card.id}
                href={card.href}
                className={shell}
              >
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={card.id}
              type="button"
              data-probe="entry-card"
              data-card={card.id}
              data-kind={card.kind ?? ""}
              aria-expanded={card.action === "ask" ? askOpen : undefined}
              disabled={disabled}
              onClick={() => press(card)}
              className={shell}
            >
              {inner}
              {/* The one card that unfolds rather than leaving the page says
                  so in its corner — on its own line it read as a stray
                  control and made this card taller than the other five. */}
              {card.action === "ask" && (
                <ChevronDown
                  className={`absolute top-3 right-3 h-4 w-4 text-[color:var(--v2-text-soft)] transition-transform duration-[var(--dur-fast)] ${
                    askOpen ? "rotate-180" : ""
                  }`}
                  strokeWidth={2.2}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Card 5 unfolded. The two suggestion buttons that used to sit above
          the typing box live HERE now (§3) — and pressing one ASKS it rather
          than typing it into the box for you to press Send on.
          🔴 Every one of these is answered by the prepared layer for free
          (prepared-answers.ts pins each in all three languages), so "one tap
          asks it" cannot cost anybody an AI action. */}
      {askOpen && (
        <div className="flex flex-wrap gap-2" data-probe="entry-questions">
          {questions.map((q) => (
            <button
              key={q.en}
              type="button"
              data-probe="entry-question"
              disabled={disabled}
              onClick={() => onAsk(t(q.bm, q.zh, q.en))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-[color:var(--v2-border)] bg-white/70 px-3.5 text-sm font-medium transition-colors hover:border-[color:var(--v2-primary)]/60 hover:text-[color:var(--v2-primary)] disabled:opacity-50 dark:bg-white/5"
            >
              {t(q.bm, q.zh, q.en)}
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
