"use client";

// ---------------------------------------------------------------------------
// "TANYA MINIT" — the floating assistant, available on every page.
//
// 2026-07-28, PRODUCT DECISION. This used to be deliberately NOT a chat: one
// question in, one answer out, no history, because CLAUDE.md rule 10 forbade an
// open-ended chatbot. The product owner has overridden that — with usage limits
// instead of a hard ban — because a one-shot box is a poor fit for someone who
// has never used a computer and whose first question is rarely their real one.
//
// It now shares ONE implementation with the home page box: /api/chat, the same
// prompt, the same three limits (per turn, per conversation, per month). Having
// two assistants that behaved differently was itself a source of confusion.
//
// 2026-08-22/23 (A-3 catch-up): the assistant CAN see this organisation's
// records now — six RLS-scoped lookup tools (confirmed minutes, donations,
// receipts, constitution clauses, committee, deadlines), every claim carrying
// a clickable source. The old "cannot see your records" line in this comment
// and in the opener below outlived that change by five days. It still answers
// with a "go to this page" button wherever the real work happens on a page.
//
// PDPA + persistence (F-4, work order 31, J's #17): the transcript is saved in
// SCOPED localStorage (`minit:<user>:<org>:chat.panel.v1`) so switching pages
// or reopening the browser does not eat the conversation. Scoped means another
// member on the same laptop never sees it, and sign-out/delete-org clears it
// (storage-scope.tsx). Nothing is ever logged server-side. The home box keeps
// its OWN key — two usePersistentState on one key silently fight (STATE trap).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { GlassBadge } from "./surfaces";
import { AnswerSources, type AnswerSource } from "./answer-sources";
import { tidyReply } from "@/lib/tidy-reply";
import { ASSISTANT_NAME } from "@/lib/brand";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";

type Turn = {
  role: "user" | "assistant";
  text: string;
  button?: { href: string; bm: string; zh: string; en: string } | null;
  /** Clickable "this came from the 12 June meeting" links. */
  sources?: AnswerSource[] | null;
  lookups?: string[] | null;
};

/** Shape guard for a stored transcript (usePersistentState contract). */
export function isTurnArray(parsed: unknown): boolean {
  return (
    Array.isArray(parsed) &&
    parsed.every(
      (x) =>
        typeof x === "object" &&
        x !== null &&
        ((x as Turn).role === "user" || (x as Turn).role === "assistant") &&
        typeof (x as Turn).text === "string",
    )
  );
}

const EMPTY_TURNS: Turn[] = [];

type ChatOk = {
  reply: string;
  inScope: boolean;
  button: { href: string; bm: string; zh: string; en: string } | null;
  /** Which of the society's own meetings the answer rests on (2026-08-22). */
  sources: AnswerSource[] | null;
  /** Which record lookups ran for this answer (tool names). */
  lookups: string[] | null;
  remaining: number | null;
  /** Share of the monthly free quota spent, 0–100 (2026-08-22). */
  usedPct: number | null;
  turnsUsed: number;
  maxTurns: number;
};

// Chips only PREFILL the input — the member presses Ask themselves, so the
// quota spend stays a deliberate act.
const SUGGESTIONS = [
  {
    bm: "Bila saya kena hantar Penyata Tahunan?",
    zh: "年度呈报什么时候要交？",
    en: "When do I file the Annual Return?",
  },
  {
    bm: "Di mana saya buat resit?",
    zh: "在哪里做收据？",
    en: "Where do I make receipts?",
  },
  { bm: "Apa itu e-Invois?", zh: "e-Invois 是什么？", en: "What is e-Invois?" },
];

export function AIPanel({
  initialRemaining,
  initialUsedPct,
  blocked,
  onNavigate,
  onClose,
}: {
  /** null = unknown (no org yet) */
  initialRemaining: number | null;
  /** Share of the monthly free quota spent, 0–100. null = unknown. */
  initialUsedPct: number | null;
  blocked: boolean;
  /** Close the sheet when the member follows the Go-to-page button. Omitted by
   *  the docked desktop rail, which deliberately STAYS open while the page
   *  behind it navigates. */
  onNavigate?: () => void;
  /** Collapse the panel back to the floating button. */
  onClose?: () => void;
}) {
  const t = useTriText();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  // F-4: the transcript survives page changes and browser restarts, per
  // user+org scope. See the header comment for the PDPA reasoning.
  const chatKey = useScopedKey("chat.panel.v1");
  const [turns, setTurns] = usePersistentState<Turn[]>(
    chatKey,
    EMPTY_TURNS,
    isTurnArray,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  const [usedPct, setUsedPct] = useState<number | null>(initialUsedPct);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  /** Ticket for the question in flight — see ask(). */
  const askSeq = useRef(0);

  // 2026-08-18: this panel is mounted by the ROOT LAYOUT, so it does not
  // remount when you change page. Its meter kept showing whatever was true when
  // the tab was first opened, while the home box and /settings showed the real
  // number — three places, three answers. Adopt the server's value whenever the
  // layout re-renders. (Derived during render on purpose: doing it in an effect
  // trips the set-state-in-effect rule.)
  const [seenRemaining, setSeenRemaining] = useState<number | null>(
    initialRemaining,
  );
  if (initialRemaining !== seenRemaining) {
    setSeenRemaining(initialRemaining);
    setRemaining(initialRemaining);
    // The percentage is adopted with the count, never on its own: the two are
    // one reading of one meter, and letting them arrive separately is how the
    // badge ends up saying "99 left · 40% used".
    setUsedPct(initialUsedPct);
  }

  const isBlocked = blocked || (remaining !== null && remaining <= 0);

  // Keep the newest reply in view without yanking the whole page.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || busy || isBlocked) return;
    const seq = ++askSeq.current;
    setError(null);
    setQuestion("");
    const history = turns.map((x) => ({ role: x.role, text: x.text }));
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const body = (await res.json()) as ChatOk & { error?: string; code?: string };
      if (seq !== askSeq.current) return;
      if (!res.ok) {
        setError(body.error ?? t("Ralat.", "出错了。", "Something went wrong."));
        if (body.code === "QUOTA_EXCEEDED") setRemaining(0);
        // Remove the question we optimistically showed: it was never answered.
        setTurns((prev) => prev.slice(0, -1));
        return;
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: tidyReply(body.reply),
          button: body.button,
          sources: body.sources ?? null,
          lookups: body.lookups ?? null,
        },
      ]);
      if (typeof body.remaining === "number") setRemaining(body.remaining);
      if (typeof body.usedPct === "number") setUsedPct(body.usedPct);
      setTurnsLeft(Math.max(0, body.maxTurns - body.turnsUsed));
      // Re-run the server render so the other meters (home box, /settings)
      // move at the same time as this one.
      router.refresh();
    } catch {
      if (seq !== askSeq.current) return;
      setTurns((prev) => prev.slice(0, -1));
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The internet connection dropped. Please try again.",
        ),
      );
    } finally {
      if (seq === askSeq.current) setBusy(false);
    }
  }

  return (
    <aside className="v2-glass flex h-full w-full flex-col rounded-md p-4 sm:p-5">
      {/* Header — A-2 (work order 31, J: 「排版很不好，弄到那麼長」).
          The old header put icon + title + description + quota badge + close
          all on ONE flex row; in the narrow docked panel the badge squeezed
          the title into one character per line. Now three rows, each with a
          single job: title line (icon · name · close), badge line, then the
          explanation as small print. Nothing competes with the title for
          width any more. */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--v2-primary-fill)] text-white shadow-[var(--v2-shadow-soft)]">
          <Sparkles className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <p className="min-w-0 flex-1 truncate text-lg font-semibold text-[color:var(--v2-text)]">
          <Tri
            bm={`Tanya ${ASSISTANT_NAME}`}
            zh={`问一问 ${ASSISTANT_NAME}`}
            en={`Ask ${ASSISTANT_NAME}`}
          />
        </p>
        {onClose && (
          <button
            type="button"
            aria-label={t("Tutup", "关闭", "Close")}
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-sm text-[color:var(--v2-text-soft)] hover:bg-white/60 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        )}
      </div>
      {/* 2026-08-22, J: "为什么还是在额度呢？不是说要换去 PERCENTAGE 吗".
          Both numbers, not one: "99 left" is the concrete thing an older
          treasurer acts on, and the percentage is what makes "am I about to
          run out" readable at a glance. The word "guna / 用了 / used" is
          carried with the figure on purpose — "Baki 99 · 1%" on its own reads
          as "1% LEFT", which is the opposite of what it says. */}
      {/* F-1 (2026-08-25, J's decision #4): the badge reads the percentage,
          with "used" carried on it so it cannot be misread as "X% left".
          The raw count only appears when the percentage is unknown. */}
      {remaining !== null && (
        <div className="mt-2">
          <GlassBadge tone={remaining > 0 ? "info" : "missing"}>
            <Tri
              bm={usedPct === null ? `Baki ${remaining}` : `${usedPct}% guna bulan ini`}
              zh={usedPct === null ? `剩 ${remaining}` : `本月已用 ${usedPct}%`}
              en={usedPct === null ? `${remaining} left` : `${usedPct}% used this month`}
            />
          </GlassBadge>
        </div>
      )}
      <p className="mt-1.5 text-sm text-[color:var(--v2-text-soft)]">
        {/* 0-2 (2026-08-25, J's #14): the AI-path marker stays; the
            per-question "about X%" promise is gone — the only number is
            the "X% used" badge above. */}
        <Tri
          bm="Soalan di sini menggunakan kuota AI bulanan"
          zh="在这里提问会用本月的 AI 用量"
          en="Questions here use the monthly AI allowance"
        />
      </p>

      {/* Conversation */}
      <div className="v2-scroll mt-4 flex flex-1 flex-col gap-3 overflow-y-auto">
        {turns.length === 0 && (
          <div className="rounded-md rounded-tl-sm border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] p-4 text-base leading-relaxed text-[color:var(--v2-text)]">
            {/* A-3 (work order 31): the "I cannot see your records" opener was
                written BEFORE 2026-08-22, when the assistant got its six
                lookup tools — it has been able to read the org's confirmed
                records (with a citation on every claim) for days while this
                line kept denying it. Now it says what is true. */}
            <Tri
              bm="Tanya saya tarikh akhir, perlembagaan, atau rekod pertubuhan anda — mesyuarat yang disahkan, derma, resit. Setiap jawapan datang dengan sumbernya supaya anda boleh semak sendiri."
              zh="可以问我截止日期、章程、或你们机构的记录 —— 已确认的会议、捐款、收据。每个答案都会附上出处，让您自己核对。"
              en="Ask me about deadlines, the constitution, or your organisation's records — confirmed meetings, donations, receipts. Every answer comes with its source so you can check it yourself."
            />
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p
              key={i}
              className="max-w-[88%] self-end rounded-md rounded-br-md bg-[color:var(--v2-primary-fill)] px-4 py-3 text-base text-white"
            >
              {turn.text}
            </p>
          ) : (
            <div
              key={i}
              // #1 (J's launch feedback): the reply gets a REAL box — the old
              // white-on-white ring was invisible in light mode, so answers
              // looked like loose text while the question had its bubble.
              className="max-w-[92%] self-start rounded-md rounded-tl-sm border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] p-4"
            >
              <p className="text-base leading-relaxed whitespace-pre-line text-[color:var(--v2-text)]">
                {turn.text}
              </p>
              {turn.button && (
                <Link
                  href={turn.button.href}
                  onClick={onNavigate}
                  className="v2-pill mt-3 inline-flex min-h-11 items-center gap-2 bg-[color:var(--v2-primary-fill)] px-5 text-base font-semibold text-white"
                >
                  <Tri
                    bm={turn.button.bm}
                    zh={turn.button.zh}
                    en={turn.button.en}
                  />
                  <ArrowRight className="h-5 w-5" strokeWidth={2} />
                </Link>
              )}
              <AnswerSources sources={turn.sources ?? []} lookups={turn.lookups ?? []} />
            </div>
          ),
        )}

        {busy && (
          <p className="self-start rounded-md rounded-tl-sm border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] p-4 text-base text-[color:var(--v2-text-soft)]">
            <Tri bm="Sedang berfikir…" zh="想一下…" en="Thinking…" />
          </p>
        )}

        {isBlocked && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Bantuan AI untuk bulan ini sudah habis. Ia bermula semula pada 1 hari bulan depan — rekod dan dokumen anda masih boleh dibuka seperti biasa."
              zh="这个月的 AI 用量已经用完了。下个月 1 号会重新开始 —— 您的记录和文件都还能照常打开。"
              en="This month's AI help is used up. It starts again on the 1st of next month — your records and documents still open as normal."
            />
          </p>
        )}

        {error && !isBlocked && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {error}
          </p>
        )}

        {turns.length === 0 && !busy && !isBlocked && (
          <>
            <p className="mt-2 text-base font-semibold text-[color:var(--v2-text-soft)]">
              <Tri bm="Cuba tanya" zh="试试问" en="Try asking" />
            </p>
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setQuestion(t(s.bm, s.zh, s.en))}
                className="min-h-12 rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] px-4 py-3 text-left text-base text-[color:var(--v2-text)] hover:bg-[color:var(--v2-card-nested)]"
              >
                {t(s.bm, s.zh, s.en)}
              </button>
            ))}
          </>
        )}

        <div ref={endRef} />
      </div>

      {/* Never while an answer is on its way — see ask-box.tsx.
          F-4: "Start again" became "Clear conversation" — the transcript is
          saved now, so throwing it away deserves a name that says so, plus
          the honest reason to do it (long transcripts slow every answer).
          F-1: the turn counter says what resets and what does not. */}
      {turns.length > 0 && !busy && (
        <div className="mt-3 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                askSeq.current++;
                setTurns([]);
                setTurnsLeft(null);
                setError(null);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-sm border-2 border-[color:var(--v2-outline-border)] bg-white/80 px-4 text-base font-medium dark:bg-white/10"
            >
              <RotateCcw className="h-5 w-5" strokeWidth={2} />
              <Tri bm="Padam perbualan" zh="清除对话" en="Clear conversation" />
            </button>
            {turnsLeft !== null && (
              <span className="text-base text-[color:var(--v2-text-soft)]">
                <Tri
                  bm={`Boleh tanya ${turnsLeft} soalan lagi dalam perbualan ini · perbualan baharu bermula semula, kuota bulanan tidak terjejas`}
                  zh={`这轮对话还能问 ${turnsLeft} 题 · 换新对话会重置，不影响本月用量`}
                  en={`${turnsLeft} questions left in this conversation · a new conversation resets this, the monthly allowance is unaffected`}
                />
              </span>
            )}
          </div>
          <p className="text-sm text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Perbualan yang terlalu panjang jadi perlahan — padamkannya bila satu topik selesai."
              zh="对话太长会变慢，告一段落建议清除。"
              en="A very long conversation gets slow — clear it when a topic is done."
            />
          </p>
        </div>
      )}

      {/* Input */}
      <div className="mt-3 flex items-end gap-2 rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-2 pl-4">
        <textarea
          value={question}
          rows={1}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          disabled={busy || isBlocked}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder={t(
            "Taip soalan anda…",
            "打字问我…",
            "Type your question…",
          )}
          className="max-h-32 w-full resize-y bg-transparent py-2.5 text-base text-[color:var(--v2-text)] placeholder:text-[color:var(--v2-text-soft)] focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          aria-label={t("Hantar soalan", "发送问题", "Send question")}
          onClick={() => ask()}
          disabled={busy || isBlocked || !question.trim()}
          className="v2-pill flex size-11 shrink-0 items-center justify-center bg-[color:var(--v2-primary-fill)] text-[color:var(--v2-primary-on)] shadow-[var(--v2-shadow-soft)] disabled:opacity-50"
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>
    </aside>
  );
}
