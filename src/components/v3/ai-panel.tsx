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
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, CircleHelp, RotateCcw, Sparkles, X } from "lucide-react";
import {
  Tri,
  isLangMode,
  useLangs,
  useLocalizedError,
  useTriText,
} from "@/components/language-provider";
import { GlassBadge } from "./surfaces";
import { AnswerSources, type AnswerSource } from "./answer-sources";
import { Modal } from "@/components/modal";
import { ConfirmedAction } from "@/components/confirm-delete";
import { AiMistakesNote } from "@/components/ai-disclaimer";
import {
  AgentChangeCard,
  UiChangeCard,
  type AgentChangeInfo,
  type AgentUiChangeInfo,
} from "@/components/agent-change-card";
import { writeIntake } from "@/lib/intake-handoff";
import { pctOfQuota } from "@/lib/quota-display";
import { tidyReply } from "@/lib/tidy-reply";
import { ASSISTANT_NAME } from "@/lib/brand";
import {
  matchPreparedAnswer,
  preparedButtonFor,
  PREPARED_FREE_NOTE,
  suggestedQuestionsFor,
} from "@/lib/prepared-answers";
import { useEinvoisVisible } from "@/lib/einvois-pref";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";

type Turn = {
  role: "user" | "assistant";
  text: string;
  button?: { href: string; bm: string; zh: string; en: string } | null;
  /** Clickable "this came from the 12 June meeting" links. */
  sources?: AnswerSource[] | null;
  lookups?: string[] | null;
  /** K1 (work order 82): answered by the prepared layer — no AI, no quota.
   *  Free turns are also excluded from the history sent to /api/chat, so a
   *  free exchange never eats the per-conversation turn cap. */
  free?: boolean;
  /** §0-4 (work order 100): record changes the agent made this turn. */
  changes?: AgentChangeInfo[];
  /** §0-2a (work order 102): device-side changes (language) — old → new + undo. */
  uiChanges?: AgentUiChangeInfo[];
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
  /** §0-4: record changes the agent made this turn. */
  changes?: AgentChangeInfo[] | null;
  /** §0-2a: device-side changes for this browser to apply (language). */
  uiChanges?: AgentUiChangeInfo[] | null;
  /** §0-2c: the person dictated a meeting — run the account through the
   *  extraction pipeline now. */
  dictate?: boolean;
  remaining: number | null;
  /** Share of the monthly free quota spent, 0–100 (2026-08-22). */
  usedPct: number | null;
  turnsUsed: number;
  maxTurns: number;
};

// Chips only PREFILL the input — the member presses Ask themselves. Since K1
// (work order 82) every chip is a question the PREPARED layer answers for
// free (prepared-answers.ts owns the list and its tests pin each one), so a
// chip can never spend the quota at all. D49: which chips exist follows the
// e-Invois beta gate — see suggestedQuestionsFor at the render site.

export function AIPanel({
  initialRemaining,
  initialUsedPct,
  initialQuota = null,
  blocked,
  onNavigate,
  onClose,
}: {
  /** null = unknown (no org yet) */
  initialRemaining: number | null;
  /** Share of the monthly free quota spent, 0–100. null = unknown. */
  initialUsedPct: number | null;
  /** The monthly pool (actions) — display-layer % conversion only (102). */
  initialQuota?: number | null;
  blocked: boolean;
  /** Close the sheet when the member follows the Go-to-page button. Omitted by
   *  the docked desktop rail, which deliberately STAYS open while the page
   *  behind it navigates. */
  onNavigate?: () => void;
  /** Collapse the panel back to the floating button. */
  onClose?: () => void;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const router = useRouter();
  const pathname = usePathname();
  // §0-2a: the agent can switch the interface language (device preference).
  const { setMode } = useLangs();
  // D49: prepared e-Invois answers and their chip follow the beta gate.
  const [einvoisVisible] = useEinvoisVisible();
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
  // K2 (work order 82): the explanations live behind the ? icon now.
  const [usageOpen, setUsageOpen] = useState(false);
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
    // K1 (work order 82): the free layer answers first. A hit costs nothing —
    // no vendor, no quota, no server round-trip — and the deep-link button
    // comes from the same whitelist the model's buttons do.
    const hit = matchPreparedAnswer(q, { einvois: einvoisVisible });
    if (hit) {
      setError(null);
      setQuestion("");
      setTurns((prev) => [
        ...prev,
        { role: "user", text: q, free: true },
        {
          role: "assistant",
          text: hit.entry.answer[hit.lang],
          button: preparedButtonFor(hit.entry),
          free: true,
        },
      ]);
      return;
    }
    const seq = ++askSeq.current;
    setError(null);
    setQuestion("");
    // Free exchanges are navigation, not context — they stay out of the
    // history so they never eat the MAX_TURNS cap or a single prompt token.
    const history = turns
      .filter((x) => !x.free)
      .map((x) => ({ role: x.role, text: x.text }));
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
      // §0-2a: apply device-side changes as the answer lands — the interface
      // switches NOW, and the card shows old → new with an undo.
      const uiChanges = (body.uiChanges ?? []).filter(
        (c) => c.kind === "language" && isLangMode(c.to),
      );
      for (const c of uiChanges) {
        if (isLangMode(c.to)) setMode(c.to);
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: tidyReply(body.reply),
          button: body.button,
          sources: body.sources ?? null,
          lookups: body.lookups ?? null,
          changes: body.changes && body.changes.length > 0 ? body.changes : undefined,
          uiChanges: uiChanges.length > 0 ? uiChanges : undefined,
        },
      ]);
      // §0-2c: the reply said "drafting it now" — run the person's own words
      // through the dictation road. The panel has no product cards, so the
      // finished draft arrives as a button to the page that shows it.
      if (body.dictate) {
        const story = [
          ...history.filter((x) => x.role === "user").map((x) => x.text),
          q,
        ].join("\n");
        void runDictation(story);
      }
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

  /**
   * §0-2c: the dictated-meeting road, panel edition. Same /api/intake
   * dictation branch as the workbench; the draft is handed to the Minutes
   * page through the one-shot courier and announced with a button — the
   * panel has no product cards. First await yields one macrotask so ask()'s
   * cleanup lands before this takes the busy flag over.
   */
  async function runDictation(story: string) {
    await new Promise((r) => setTimeout(r, 0));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("dictatedText", story);
      const res = await fetch("/api/intake", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as {
        page?: string;
        fileName?: string;
        extraction?: unknown;
        error?: string;
      } | null;
      if (!res.ok || !body?.page || !body.extraction) {
        setError(
          body?.error ??
            t(
              "MinitAI tidak dapat menyusun cerita itu menjadi minit. Cuba sekali lagi.",
              "MinitAI 没能把这段话整理成会议记录。请再试一次。",
              "MinitAI could not turn that account into minutes. Please try again.",
            ),
        );
        return;
      }
      // The paid-for draft is waiting on the Minutes page (30-min courier).
      writeIntake({
        kind: "meeting_notes",
        fileName: body.fileName ?? "lisan",
        extraction: body.extraction,
        storagePath: null,
        photoDataUrl: null,
      });
      // §0-4 (102): the receipt speaks percentages, never action counts.
      const pct = pctOfQuota(1, initialQuota);
      const costBit = {
        bm: pct === null ? "" : ` Guna kira-kira ${pct}% kuota bulanan.`,
        zh: pct === null ? "" : `这次用了大约 ${pct}% 的本月用量。`,
        en: pct === null ? "" : ` Used about ${pct}% of the monthly quota.`,
      };
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: t(
            `Siap — draf minit sudah disediakan daripada cerita anda. Buka dan semak; apa-apa nak ubah, beritahu saya di sana.${costBit.bm}`,
            `做好了 —— 已经把您讲的内容整理成会议记录草稿。点开核对；要改哪里，进去后直接跟我说。${costBit.zh}`,
            `Done — the minutes draft is ready from your account. Open it and check; tell me there if anything needs changing.${costBit.en}`,
          ),
          button: {
            href: "/minutes?dari=ai",
            bm: "Buka draf minit",
            zh: "打开会议草稿",
            en: "Open the draft",
          },
        },
      ]);
      router.refresh();
    } catch {
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The internet connection dropped. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
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
        {/* K2 + K0 (work order 82): the probe proved the transcript SURVIVES
            closing and reopening the panel (scoped localStorage), so the
            clear button stays — but as a small header icon, not the block
            that used to cover the answers. It confirms first (§1-10: every
            destructive control confirms, and it sits one finger-width from
            the X). */}
        {turns.length > 0 && !busy && (
          <ConfirmedAction
            onConfirm={() => {
              askSeq.current++;
              setTurns([]);
              setTurnsLeft(null);
              setError(null);
            }}
            body={
              <Tri
                bm="Padam perbualan ini dan mula semula? Kuota bulanan tidak terjejas."
                zh="把这轮对话清掉、重新开始？本月用量不受影响。"
                en="Clear this conversation and start fresh? The monthly allowance is unaffected."
              />
            }
            confirmLabel={<Tri bm="Padam perbualan" zh="清除对话" en="Clear conversation" />}
            trigger={(open) => (
              <button
                type="button"
                aria-label={t("Padam perbualan", "清除对话", "Clear conversation")}
                title={t("Padam perbualan", "清除对话", "Clear conversation")}
                onClick={open}
                className="flex size-10 shrink-0 items-center justify-center rounded-sm text-[color:var(--v2-text-soft)] hover:bg-white/60 dark:hover:bg-white/10"
              >
                <RotateCcw className="h-5 w-5" strokeWidth={2} />
              </button>
            )}
          />
        )}
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
      {/* K2 (work order 82, J's own sketch): ONE compact meter row — the
          badge, the turns-left counter (Hard Rule 10: both stay visible),
          and a ? that opens the explanation. The three-line block that used
          to cover the answers is inside that popup now. */}
      {remaining !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <GlassBadge tone={remaining > 0 ? "info" : "missing"}>
            <Tri
              bm={usedPct === null ? `Baki ${remaining}` : `${usedPct}% guna bulan ini`}
              zh={usedPct === null ? `剩 ${remaining}` : `本月已用 ${usedPct}%`}
              en={usedPct === null ? `${remaining} left` : `${usedPct}% used this month`}
            />
          </GlassBadge>
          {turnsLeft !== null && (
            <span className="text-sm text-[color:var(--v2-text-soft)]">
              <Tri
                bm={`· boleh tanya ${turnsLeft} lagi`}
                zh={`· 这轮还能问 ${turnsLeft} 题`}
                en={`· ${turnsLeft} left this conversation`}
              />
            </span>
          )}
          <button
            type="button"
            aria-label={t(
              "Apa maksud kuota ini?",
              "这些用量是什么意思？",
              "What do these numbers mean?",
            )}
            onClick={() => setUsageOpen(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-text-soft)] hover:bg-white/60 dark:hover:bg-white/10"
          >
            <CircleHelp className="h-5 w-5" strokeWidth={2} />
          </button>
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

      {/* The K2 popup: everything the panel used to SAY all the time. */}
      <Modal open={usageOpen} onClose={() => setUsageOpen(false)} labelledBy="ai-usage-help">
        <div className="flex flex-col gap-3">
          <h2 id="ai-usage-help" className="text-lg font-semibold">
            <Tri bm="Kuota AI anda" zh="您的 AI 用量" en="Your AI allowance" />
          </h2>
          <p className="text-base">
            <Tri
              bm={`Setiap soalan yang dijawab oleh AI menggunakan kuota bulanan pertubuhan.${usedPct === null ? "" : ` Bulan ini sudah guna ${usedPct}%.`} Ia bermula semula pada 1 hari bulan.`}
              zh={`每个由 AI 回答的问题都会用机构的本月用量。${usedPct === null ? "" : `本月已用 ${usedPct}%。`}每月 1 号重新开始。`}
              en={`Every question the AI answers uses the organisation's monthly allowance.${usedPct === null ? "" : ` ${usedPct}% used this month.`} It starts fresh on the 1st.`}
            />
          </p>
          <p className="text-base">
            {/* No hardcoded max here: the server owns MAX_TURNS and reports
                the live count with every answer — printing a mirror constant
                is how the two would drift. */}
            <Tri
              bm={`Satu perbualan ada had soalan.${turnsLeft === null ? "" : ` Perbualan ini tinggal ${turnsLeft}.`} Perbualan baharu bermula semula — kuota bulanan tidak terjejas.`}
              zh={`一轮对话的题数有上限。${turnsLeft === null ? "" : `这轮还剩 ${turnsLeft} 题。`}换新对话会重新计算，不影响本月用量。`}
              en={`One conversation has a question limit.${turnsLeft === null ? "" : ` This one has ${turnsLeft} left.`} A new conversation resets that — the monthly allowance is unaffected.`}
            />
          </p>
          <p className="text-base">
            <Tri
              bm="Perbualan yang panjang jadi perlahan dan lebih mahal — bila satu topik selesai, tekan ↺ di atas untuk mula semula."
              zh="对话太长会变慢、也更耗 AI —— 一个话题告一段落，按上面的 ↺ 重新开始。"
              en="A long conversation gets slow and costs more — when a topic is done, tap ↺ above to start fresh."
            />
          </p>
          <p className="text-base">
            <Tri
              bm={PREPARED_FREE_NOTE.bm + " Soalan biasa (mis. “di mana buat resit?”) dijawab begitu."}
              zh={PREPARED_FREE_NOTE.zh + "常见问题（例如「在哪里做收据？」）就是这样回答的。"}
              en={PREPARED_FREE_NOTE.en + " Common questions (e.g. “where do I make receipts?”) are answered that way."}
            />
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setUsageOpen(false)}
              className="v2-pill inline-flex min-h-11 items-center bg-[color:var(--v2-primary-fill)] px-5 text-base font-semibold text-white"
            >
              <Tri bm="Faham" zh="知道了" en="Got it" />
            </button>
          </div>
        </div>
      </Modal>

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
                  // I3 (work order 81): the probed-alive wiring has ONE dead
                  // case left — the person is ALREADY on the destination, so
                  // the Link is a no-op and the tap looks ignored (on the
                  // docked rail nothing whatsoever happens). Same path ⇒
                  // scroll the page to the top of the content the button
                  // promises: the tap always visibly does something.
                  onClick={() => {
                    onNavigate?.();
                    if (turn.button && turn.button.href.split("?")[0] === pathname) {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
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
              {/* K1 ④: a prepared answer says so — honest about being free. */}
              {turn.free && (
                <p className="mt-2 text-xs text-[color:var(--v2-text-soft)]">
                  ⚡{" "}
                  <Tri
                    bm={PREPARED_FREE_NOTE.bm}
                    zh={PREPARED_FREE_NOTE.zh}
                    en={PREPARED_FREE_NOTE.en}
                  />
                </p>
              )}
              <AnswerSources sources={turn.sources ?? []} lookups={turn.lookups ?? []} />
              {/* §0-4: record changes this turn made — old → new + undo. */}
              {turn.changes?.map((c, j) => (
                <AgentChangeCard
                  key={c.changeId}
                  change={c}
                  onUndone={() =>
                    setTurns((prev) =>
                      prev.map((x, xi) =>
                        xi === i
                          ? {
                              ...x,
                              changes: x.changes?.map((y, yj) =>
                                yj === j ? { ...y, undone: true } : y,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              ))}
              {/* §0-2a: device-side changes (language) — old → new + undo. */}
              {turn.uiChanges?.map((c, j) => (
                <UiChangeCard
                  key={`ui-${j}`}
                  change={c}
                  onUndone={() =>
                    setTurns((prev) =>
                      prev.map((x, xi) =>
                        xi === i
                          ? {
                              ...x,
                              uiChanges: x.uiChanges?.map((y, yj) =>
                                yj === j ? { ...y, undone: true } : y,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              ))}
            </div>
          ),
        )}

        {busy && (
          <p className="self-start rounded-md rounded-tl-sm border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] p-4 text-base text-[color:var(--v2-text-soft)]">
            <Tri bm="Sedang berfikir…" zh="想一下…" en="Thinking…" />
          </p>
        )}

        {isBlocked && (
          <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Bantuan AI untuk bulan ini sudah habis. Ia bermula semula pada 1 hari bulan depan — rekod dan dokumen anda masih boleh dibuka seperti biasa."
              zh="这个月的 AI 用量已经用完了。下个月 1 号会重新开始 —— 您的记录和文件都还能照常打开。"
              en="This month's AI help is used up. It starts again on the 1st of next month — your records and documents still open as normal."
            />{" "}
            {/* §0-7: a used-up meter needs a door, not just a date. */}
            <Link
              href="/settings/plan"
              onClick={() => onNavigate?.()}
              className="underline underline-offset-4"
            >
              <Tri bm="Lihat pelan" zh="看方案" en="See the plans" /> →
            </Link>
          </div>
        )}

        {error && !isBlocked && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {/* §0-7 (work order 102, J's live catch): server errors arrive as
                the three-line bm/zh/en block — printing it raw stacked Malay
                on English in one red box. One language, the person's own. */}
            {localizeError(error)}
          </p>
        )}

        {turns.length === 0 && !busy && !isBlocked && (
          <>
            <p className="mt-2 text-base font-semibold text-[color:var(--v2-text-soft)]">
              <Tri bm="Cuba tanya" zh="试试问" en="Try asking" />
            </p>
            {suggestedQuestionsFor(einvoisVisible).map((s, i) => (
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

      {/* K2 (work order 82): the Clear block that used to sit HERE — a full
          button plus three lines of small print, covering the newest answer
          on J's screenshot — is gone. Clearing is the ↺ icon in the header;
          the counter lives on the meter row; the explanations are behind ?. */}

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

      {/* §0-5 (work order 100): the standing three-language "AI can be
          wrong" line — same one as the workbench. */}
      <AiMistakesNote className="mt-2" />
    </aside>
  );
}
