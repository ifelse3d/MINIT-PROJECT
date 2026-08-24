"use client";

// ---------------------------------------------------------------------------
// THE ONE DOOR — the home page's single starting point.
//
// WHY (user request, 2026-07-28: "我希望 homepage 是有直接一个 chatbox，让不懂的
// user 可以直接 upload file 或跟他说，然后 AI 识别")
//
// The home page used to ask "What did you photograph?" and offer three cards.
// That question is backwards: it makes the person classify their own paperwork
// before Minit will help. Someone holding a piece of paper they do not
// understand cannot answer it.
//
// Now there is one box that accepts either:
//   * A FILE — Minit works out whether it is meeting notes, a donation ledger
//     page or the constitution (/api/intake), reads it, and takes them straight
//     to the right page with the work already done.
//   * A QUESTION — a real conversation (/api/chat), capped.
//
// USAGE LIMITS ARE PART OF THE DESIGN, not a hidden guard rail. The person can
// always see how many AI actions are left this month and how many questions are
// left in this conversation, because the product owner allowed open conversation
// specifically on the condition that the spend is bounded. See api/chat/route.ts.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Camera, Paperclip, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { writeIntake, type IntakeKind } from "@/lib/intake-handoff";
import { tidyReply } from "@/lib/tidy-reply";
import {
  AnswerSources,
  type AnswerSource,
} from "@/components/v3/answer-sources";

type Turn = {
  role: "user" | "assistant";
  text: string;
  button?: { href: string; bm: string; zh: string; en: string } | null;
  /** Clickable "this came from the 12 June meeting" links. */
  sources?: AnswerSource[] | null;
  lookups?: string[] | null;
};

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

type IntakeOk = {
  kind: IntakeKind | "unknown";
  page?: string;
  fileName?: string;
  extraction?: unknown;
  error?: string;
};

const EXAMPLES = [
  {
    bm: "Bila saya kena hantar Penyata Tahunan?",
    zh: "年度呈报什么时候要交？",
    en: "When do I have to file the Annual Return?",
  },
  {
    bm: "Macam mana nak buat resit derma?",
    zh: "捐款收据要怎么做？",
    en: "How do I make a donation receipt?",
  },
  {
    bm: "Apa itu e-Invois?",
    zh: "e-Invois 是什么？",
    en: "What is e-Invois?",
  },
];

export function AskBox({
  hasOrg,
  initialRemaining,
  initialUsedPct,
}: {
  hasOrg: boolean;
  /** AI actions left this month; null when there is no organisation yet. */
  initialRemaining: number | null;
  /** Share of the monthly free quota spent, 0–100; null when unknown. */
  initialUsedPct: number | null;
}) {
  const t = useTriText();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  /** Ticket for the question currently in flight — see send(). */
  const sendSeq = useRef(0);

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<"chat" | "file" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  const [usedPct, setUsedPct] = useState<number | null>(initialUsedPct);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [reading, setReading] = useState<string | null>(null);

  const outOfQuota = remaining !== null && remaining <= 0;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy || outOfQuota) return;
    // 2026-08-18: "Start again" used to be reachable WHILE an answer was on its
    // way. Tapping it emptied the conversation, then the late answer landed in
    // the empty one — an answer sitting there with no question above it. Every
    // send takes a ticket; a reply holding a stale ticket is dropped.
    const seq = ++sendSeq.current;
    setError(null);
    setQuestion("");
    const history = turns.map((x) => ({ role: x.role, text: x.text }));
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    setBusy("chat");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const body = (await res.json()) as ChatOk & { error?: string };
      if (seq !== sendSeq.current) return;
      if (!res.ok) {
        // Always a message: `?? null` here meant that a response without an
        // `error` field left the person with total silence after tapping.
        setError(
          body.error ??
            t(
              "Ada masalah di pihak Minit. Cuba sekali lagi.",
              "Minit 这边出了点问题。请再试一次。",
              "Something went wrong on Minit's side. Please try again.",
            ),
        );
        // Drop the question we optimistically added: it was never answered, and
        // leaving it there makes the person think Minit ignored them.
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
      // The meter in the side panel is rendered by the ROOT LAYOUT, which does
      // not re-run when only this component's state changes — which is why the
      // panel kept showing the number it had when the tab was opened while this
      // box counted down. Re-run the server render so every meter agrees.
      router.refresh();
    } catch {
      if (seq !== sendSeq.current) return;
      setTurns((prev) => prev.slice(0, -1));
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The internet connection dropped. Please try again.",
        ),
      );
    } finally {
      if (seq === sendSeq.current) setBusy(null);
    }
  }

  async function onFile(file: File | null) {
    if (!file || busy) return;
    setError(null);
    setBusy("file");
    setReading(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/intake", { method: "POST", body: form });
      const body = (await res.json()) as IntakeOk;
      if (!res.ok || body.kind === "unknown" || !body.page || !body.extraction) {
        setError(
          body.error ??
            t(
              "Minit tidak dapat membaca fail itu. Cuba sekali lagi.",
              "Minit 读不了这个文件。请再试一次。",
              "Minit could not read that file. Please try again.",
            ),
        );
        return;
      }
      // Hand the finished extraction to the review page and go there.
      writeIntake({
        kind: body.kind,
        fileName: body.fileName ?? file.name,
        extraction: body.extraction,
      });
      router.push(body.page);
    } catch {
      setError(
        t(
          "Sambungan internet terputus semasa menghantar gambar. Cuba sekali lagi.",
          "上传照片的时候网络断了。请再试一次。",
          "The connection dropped while sending the photo. Please try again.",
        ),
      );
    } finally {
      setBusy(null);
      setReading(null);
    }
  }

  return (
    <section className="v2-glass-strong rounded-3xl border-2 border-[#7c6cf5]/40 p-4 sm:p-6">
      <h2 className="font-heading text-2xl font-semibold leading-snug">
        <Tri
          bm="Ada kertas di tangan, atau ada soalan?"
          zh="手上有文件，或者有问题？"
          en="Got a piece of paper, or a question?"
        />
      </h2>
      {/* 2026-07-28 — the long paragraph that used to sit here ("send a photo of
          it here and Minit will work out what it is…") is gone. It explained in
          words what the two buttons and the question box below it already say,
          and it read like notes to ourselves rather than something a user needs. */}

      {!hasOrg && (
        <p className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Beritahu Minit nama pertubuhan anda dahulu — barulah ia tahu dokumen ini untuk siapa."
            zh="请先告诉 Minit 您机构的名字 —— 它才知道这些文件是属于谁的。"
            en="Tell Minit your organisation's name first — then it knows who these documents belong to."
          />{" "}
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri bm="Buat sekarang" zh="现在填写" en="Do it now" /> →
          </Link>
        </p>
      )}

      {/* --- the two ways in ------------------------------------------------ */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            disabled={!hasOrg || busy !== null || outOfQuota}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera className="h-5 w-5" strokeWidth={2} />
            <Tri bm="Ambil gambar" zh="拍一张" en="Take a photo" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={!hasOrg || busy !== null || outOfQuota}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip className="h-5 w-5" strokeWidth={2} />
            <Tri
              bm="Pilih gambar atau PDF"
              zh="选照片或 PDF"
              en="Choose a photo or PDF"
            />
          </Button>
        </div>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {busy === "file" && (
          <p className="rounded-2xl border-2 border-[#7c6cf5]/40 bg-white/70 p-4 text-lg font-medium dark:bg-white/10">
            ⏳{" "}
            <Tri
              bm={`Minit sedang tengok "${reading}" — ia akan kenal ini kertas apa, kemudian bacanya. Tunggu sekejap.`}
              zh={`Minit 正在看「${reading}」—— 它会先认出这是什么纸，再读里面的内容。请稍等。`}
              en={`Minit is looking at "${reading}" — it will work out what kind of page this is, then read it. One moment.`}
            />
          </p>
        )}

        {/* Type a question. Enter sends; Shift+Enter makes a new line. */}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">
              {t("Soalan anda", "您的问题", "Your question")}
            </span>
            <textarea
              value={question}
              rows={2}
              disabled={!hasOrg || busy !== null || outOfQuota}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(question);
                }
              }}
              placeholder={t(
                "cth: Bila saya kena hantar Penyata Tahunan?",
                "例如：年度呈报什么时候要交？",
                "e.g. When do I have to file the Annual Return?",
              )}
              className="w-full resize-y rounded-2xl border-2 border-input bg-white p-3.5 text-lg leading-snug disabled:opacity-60 dark:bg-white/5"
            />
          </label>
          <Button
            type="submit"
            size="lg"
            disabled={!hasOrg || busy !== null || outOfQuota || !question.trim()}
          >
            {busy === "chat" ? (
              <Tri bm="Sebentar…" zh="想一下…" en="One moment…" />
            ) : (
              <>
                <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
                <Tri bm="Tanya" zh="问" en="Ask" />
              </>
            )}
          </Button>
        </form>

        {turns.length === 0 && hasOrg && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.en}
                type="button"
                disabled={busy !== null || outOfQuota}
                onClick={() => setQuestion(t(ex.bm, ex.zh, ex.en))}
                className="min-h-11 rounded-full border-2 border-[#7c6cf5]/30 bg-white/70 px-4 text-base font-medium hover:border-[#7c6cf5]/60 disabled:opacity-50 dark:bg-white/10"
              >
                {t(ex.bm, ex.zh, ex.en)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {error}
        </p>
      )}

      {/* --- the conversation ---------------------------------------------- */}
      {turns.length > 0 && (
        <div className="mt-5 flex flex-col gap-3">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <p
                key={i}
                className="self-end rounded-2xl rounded-br-md bg-gradient-to-r from-[#5b4bd6] to-[#6f5ef2] px-4 py-3 text-lg text-white sm:max-w-[80%]"
              >
                {turn.text}
              </p>
            ) : (
              <div
                key={i}
                className="self-start rounded-2xl rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10"
              >
                <p className="text-lg whitespace-pre-line">{turn.text}</p>
                {turn.button && (
                  // h-auto + whitespace-normal: the destination label can be a
                  // full sentence ("Money: donation register, numbered
                  // receipts, custody handover, e-Invois pack"), and the button
                  // base class is whitespace-nowrap — so it ran off the right
                  // edge of the screen instead of wrapping.
                  <Button
                    asChild
                    className="mt-3 h-auto py-2.5 text-left leading-snug whitespace-normal"
                  >
                    <Link href={turn.button.href}>
                      <Tri
                        bm={`Buka: ${turn.button.bm}`}
                        zh={`打开：${turn.button.zh}`}
                        en={`Open: ${turn.button.en}`}
                      />{" "}
                      →
                    </Link>
                  </Button>
                )}
                <AnswerSources sources={turn.sources ?? []} lookups={turn.lookups ?? []} />
              </div>
            ),
          )}

          {/* Waiting has to have a place to happen. Without this the only
              sign that anything is coming was the small word on the send
              button, so the next thing the eye lands on is "Start again" —
              which reads as "this is stuck, press me". */}
          {busy === "chat" && (
            <div className="self-start rounded-2xl rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10">
              <p className="text-lg">
                ⏳{" "}
                <Tri
                  bm="Minit sedang berfikir… tunggu sekejap."
                  zh="Minit 正在想…… 请稍等。"
                  en="Minit is thinking… one moment."
                />
              </p>
            </div>
          )}

          {/* Offered only once there is an answer to start again FROM, and
              never while one is on its way. */}
          {busy === null && turns.some((x) => x.role === "assistant") && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  // Anything still in flight belongs to the conversation being
                  // thrown away — make sure it cannot land in the new one.
                  sendSeq.current++;
                  setTurns([]);
                  setTurnsLeft(null);
                  setError(null);
                }}
              >
                <RotateCcw className="h-5 w-5" strokeWidth={2} />
                <Tri bm="Mula semula" zh="重新开始" en="Start again" />
              </Button>
              {turnsLeft !== null && (
                <span className="text-base text-muted-foreground">
                  <Tri
                    bm={`${turnsLeft} soalan lagi dalam perbualan ini`}
                    zh={`这个对话还可以问 ${turnsLeft} 次`}
                    en={`${turnsLeft} more questions in this conversation`}
                  />
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- what this costs, always visible ------------------------------- */}
      <p className="mt-5 border-t-2 border-[color:var(--v2-border)] pt-3 text-base text-muted-foreground">
        {outOfQuota ? (
          <Tri
            bm="Bantuan AI untuk bulan ini sudah habis. Ia bermula semula pada 1 hari bulan depan — semua rekod dan dokumen anda masih boleh dibuka seperti biasa."
            zh="这个月的 AI 用量已经用完了。下个月 1 号会重新开始 —— 您所有的记录和文件都还能照常打开。"
            en="This month's AI help is used up. It starts again on the 1st of next month — all your records and documents still open as normal."
          />
        ) : (
          /* 2026-08-22: the percentage of the month's free quota now travels
             with the count here too, so this line, the assistant badge and
             /settings all read the same meter. It always says what the
             percentage is OF ("guna / 用了 / used") — a bare percentage beside
             a remaining count reads as the remaining percentage. */
          <Tri
            bm={`Setiap soalan guna 1 bantuan AI; setiap gambar guna 2. ${
              remaining === null
                ? ""
                : `Tinggal ${remaining} bulan ini${
                    usedPct === null ? "" : ` (${usedPct}% kuota percuma sudah diguna)`
                  }.`
            }`}
            zh={`每问一次用掉 1 次 AI；每张照片用掉 2 次。${
              remaining === null
                ? ""
                : `这个月还剩 ${remaining} 次${
                    usedPct === null ? "" : `（免费额度已经用了 ${usedPct}%）`
                  }。`
            }`}
            en={`Each question uses 1 AI action; each photo uses 2. ${
              remaining === null
                ? ""
                : `${remaining} left this month${
                    usedPct === null ? "" : ` (${usedPct}% of the free quota used)`
                  }.`
            }`}
          />
        )}
      </p>
    </section>
  );
}
