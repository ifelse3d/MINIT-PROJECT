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
import { ArrowUp, Camera, Paperclip, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { PdpaNote } from "@/components/pdpa-note";
import { VoiceButton } from "@/components/voice-input";
import { writeIntake, type IntakeKind } from "@/lib/intake-handoff";
import { tidyReply } from "@/lib/tidy-reply";
import {
  AnswerSources,
  type AnswerSource,
} from "@/components/v3/answer-sources";
import { isTurnArray } from "@/components/v3/ai-panel";
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
  // F-4 (work order 31, J's #17): the conversation survives page changes and
  // browser restarts, in user+org-scoped localStorage. Its OWN key, distinct
  // from the floating panel's — two usePersistentState on one key silently
  // overwrite each other (STATE trap).
  const chatKey = useScopedKey("chat.home.v1");
  const [turns, setTurns] = usePersistentState<Turn[]>(chatKey, [], isTurnArray);
  const [busy, setBusy] = useState<"chat" | "file" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  const [usedPct, setUsedPct] = useState<number | null>(initialUsedPct);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  // A-2 (2026-08-25): a picked file is STAGED, not sent — the person can add
  // a line of text first ("type first, then confirm to send"), sees exactly
  // what will go, and presses Send. Choosing a file used to fire the AI (and
  // the charge) on the spot, which is "choosing a file silently charged you".
  const [staged, setStaged] = useState<File | null>(null);
  // Set when Minit could not place the page: it ASKS instead of giving up.
  // Holds the text that accompanied the failed attempt so the retry carries it.
  const [askKind, setAskKind] = useState<{ context: string } | null>(null);

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
      // P-1: a response we RECEIVED but cannot read is not "the internet
      // dropped" — the network was fine; the server never gave an answer
      // (e.g. the platform killed it). Two different failures, two messages.
      let body: ChatOk & { error?: string };
      try {
        body = (await res.json()) as ChatOk & { error?: string };
      } catch {
        if (seq !== sendSeq.current) return;
        setTurns((prev) => prev.slice(0, -1));
        setError(
          t(
            "Pelayan tidak membalas kali ini. Ini bukan salah anda. Tunggu seminit, lihat baki kuota AI anda, kemudian tanya sekali lagi.",
            "伺服器这次没有回应。这不是您的问题。请等一分钟，看一下 AI 用量的余额，再问一次。",
            "The server did not reply this time. This is not your fault. Wait a minute, check your remaining AI quota, then ask again.",
          ),
        );
        return;
      }
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

  /** A picked file only lands in the staging area; nothing is sent yet. */
  function stageFile(file: File | null) {
    if (!file || busy) return;
    setError(null);
    setAskKind(null);
    setStaged(file);
  }

  /**
   * Send the staged file (with whatever was typed as context for the reader).
   * `forcedKind` is the person's own answer after Minit asked what the page
   * is — it skips the classifier, so only the read itself is charged.
   */
  async function sendFile(file: File, context: string, forcedKind?: IntakeKind) {
    if (busy) return;
    setError(null);
    setAskKind(null);
    setBusy("file");
    setReading(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      if (context.trim() !== "") form.append("context", context.trim());
      if (forcedKind) form.append("kind", forcedKind);
      const res = await fetch("/api/intake", { method: "POST", body: form });
      // P-1 (the "connection dropped" incident): the old code read ANY failure
      // here as a dropped connection — including the server being killed
      // mid-read, which is precisely when the quota may have been eaten with
      // nothing to show. If a response arrived but is unreadable, say THAT.
      let body: IntakeOk;
      try {
        body = (await res.json()) as IntakeOk;
      } catch {
        setError(
          t(
            "Pelayan tidak membalas semasa membaca fail itu. Ini bukan salah anda. Tunggu seminit, lihat baki kuota AI anda, kemudian cuba sekali lagi.",
            "读取文件的时候，伺服器没有回应。这不是您的问题。请等一分钟，看一下 AI 用量的余额，再试一次。",
            "The server did not reply while reading that file. This is not your fault. Wait a minute, check your remaining AI quota, then try again.",
          ),
        );
        return;
      }
      if (body.kind === "unknown") {
        // Minit could not place the page — ASK, don't give up (A-2). The file
        // stays staged; the person answers with one tap and only the read is
        // charged on the retry.
        setAskKind({ context });
        return;
      }
      if (!res.ok || !body.page || !body.extraction) {
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
      setStaged(null);
      setQuestion("");
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
    <section className="v2-glass-strong rounded-md border-2 border-[#a855f7]/40 p-4 sm:p-6">
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
        <p className="mt-4 rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
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
              bm="Pilih gambar, PDF atau Word/Excel"
              zh="选照片、PDF 或 Word/Excel"
              en="Choose a photo, PDF or Word/Excel"
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
            stageFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf,.docx,.xlsx"
          className="hidden"
          onChange={(e) => {
            stageFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {/* A-2: the staged file, visible and removable BEFORE anything is
            sent or charged. */}
        {staged && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-3 dark:bg-white/10">
            <span className="text-base font-medium">
              📄 {staged.name}{" "}
              <span className="text-muted-foreground">
                ({Math.max(1, Math.round(staged.size / 1024))} KB)
              </span>
            </span>
            <span className="text-sm text-muted-foreground">
              <Tri
                bm="Belum dihantar — boleh taip beberapa patah dahulu, kemudian tekan Hantar."
                zh="还没送出 —— 可以先打几句说明，再按送出。"
                en="Not sent yet — you can type a few words first, then press Send."
              />
            </span>
            <button
              type="button"
              onClick={() => {
                setStaged(null);
                setAskKind(null);
              }}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-sm text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-400/10"
              aria-label={t("Buang fail", "移除档案", "Remove the file")}
            >
              <X className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        )}

        {/* Minit could not place the page → it asks, with one-tap answers.
            Only the read is charged after the person answers. */}
        {askKind && staged && (
          <div className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/80 p-4 dark:bg-white/10">
            <p className="text-lg">
              🤔{" "}
              <Tri
                bm={`Minit tidak pasti "${staged.name}" ini halaman jenis apa. Beritahu Minit — ia jenis yang mana?`}
                zh={`Minit 看不出「${staged.name}」是哪一种文件。告诉 Minit —— 这是哪一种？`}
                en={`Minit is not sure what kind of page "${staged.name}" is. Tell Minit — which is it?`}
              />
            </p>
            <div className="flex flex-wrap gap-2">
              {/* I-4① (26 号报告 §3-6): send what is in the box NOW — the
                  person often types more hints AFTER Minit asks, and the old
                  snapshot silently threw those away. */}
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFile(staged, question.trim() || askKind.context, "meeting_notes")
                }
              >
                📝 <Tri bm="Nota mesyuarat" zh="会议笔记" en="Meeting notes" />
              </Button>
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFile(staged, question.trim() || askKind.context, "ledger_page")
                }
              >
                🧾 <Tri bm="Halaman lejar derma" zh="捐款账页" en="Donation ledger page" />
              </Button>
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFile(staged, question.trim() || askKind.context, "constitution")
                }
              >
                📜 <Tri bm="Perlembagaan" zh="章程" en="Constitution" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setStaged(null);
                  setAskKind(null);
                }}
              >
                <Tri bm="Bukan satu pun — batal" zh="都不是，取消" en="None of these — cancel" />
              </Button>
            </div>
          </div>
        )}

        {busy === "file" && (
          <p className="rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-4 text-lg font-medium dark:bg-white/10">
            ⏳{" "}
            <Tri
              bm={`Minit sedang tengok "${reading}" — ia akan kenal ini kertas apa, kemudian bacanya. Tunggu sekejap.`}
              zh={`Minit 正在看「${reading}」—— 它会先认出这是什么纸，再读里面的内容。请稍等。`}
              en={`Minit is looking at "${reading}" — it will work out what kind of page this is, then read it. One moment.`}
            />
          </p>
        )}

        {/* Type a question — or type context for the staged file. Enter sends;
            Shift+Enter makes a new line. One Send button for both paths (A-2):
            with a file staged it sends the file (plus the typed words as hints
            for the reader); without one it asks the assistant. */}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (staged) void sendFile(staged, question);
            else void send(question);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">
              {t("Soalan anda", "您的问题", "Your question")}
            </span>
            <textarea
              // A-1 (work order 27): the "Hand it to AI" task card focuses
              // this box by id — the card is a doorway to HERE, not a page.
              id="minit-ask-input"
              value={question}
              rows={2}
              disabled={!hasOrg || busy !== null || outOfQuota}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (staged) void sendFile(staged, question);
                  else void send(question);
                }
              }}
              placeholder={
                staged
                  ? t(
                      "Apa-apa yang membantu bacaan — ejaan nama, singkatan, tarikh. Boleh kosong.",
                      "写点帮助读取的话 —— 名字的写法、缩写、日期。可以留空。",
                      "Anything that helps the reading — name spellings, abbreviations, dates. Can be empty.",
                    )
                  : t(
                      "cth: Bila saya kena hantar Penyata Tahunan?",
                      "例如：年度呈报什么时候要交？",
                      "e.g. When do I have to file the Annual Return?",
                    )
              }
              className="w-full resize-y rounded-md border-2 border-input bg-white p-3.5 text-lg leading-snug disabled:opacity-60 dark:bg-white/5"
            />
          </label>
          {/* C-4 (work order 27): speak instead of type — free, browser-side,
              never the AI quota. Renders nothing where unsupported. */}
          {hasOrg && !outOfQuota && (
            <VoiceButton
              onText={(text) =>
                setQuestion((q) => (q.trim() ? `${q.trim()} ${text}` : text))
              }
            />
          )}
          <Button
            type="submit"
            size="lg"
            disabled={
              !hasOrg ||
              busy !== null ||
              outOfQuota ||
              (staged === null && !question.trim())
            }
          >
            {busy !== null ? (
              <Tri bm="Sebentar…" zh="请稍等…" en="One moment…" />
            ) : staged ? (
              <>
                <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
                <Tri bm="Hantar" zh="送出" en="Send" />
              </>
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
                className="min-h-11 rounded-xs border-2 border-[color:var(--v2-accent)]/30 bg-white/70 px-4 text-base font-medium hover:border-[color:var(--v2-accent)]/60 disabled:opacity-50 dark:bg-white/10"
              >
                {t(ex.bm, ex.zh, ex.en)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border-2 border-red-300 bg-red-50 p-4 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
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
                className="self-end rounded-md rounded-br-md bg-[color:var(--v2-primary-fill)] px-4 py-3 text-lg text-white sm:max-w-[80%]"
              >
                {turn.text}
              </p>
            ) : (
              <div
                key={i}
                className="self-start rounded-md rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10"
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
            <div className="self-start rounded-md rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10">
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
            <div className="flex flex-col gap-1">
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
                  <Tri bm="Padam perbualan" zh="清除对话" en="Clear conversation" />
                </Button>
                {turnsLeft !== null && (
                  <span className="text-base text-muted-foreground">
                    <Tri
                      bm={`Boleh tanya ${turnsLeft} soalan lagi dalam perbualan ini · perbualan baharu bermula semula, kuota bulanan tidak terjejas`}
                      zh={`这轮对话还能问 ${turnsLeft} 题 · 换新对话会重置，不影响本月用量`}
                      en={`${turnsLeft} questions left in this conversation · a new conversation resets this, the monthly allowance is unaffected`}
                    />
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Perbualan yang terlalu panjang jadi perlahan — padamkannya bila satu topik selesai."
                  zh="对话太长会变慢，告一段落建议清除。"
                  en="A very long conversation gets slow — clear it when a topic is done."
                />
              </p>
            </div>
          )}
        </div>
      )}

      {/* --- what this costs, always visible ------------------------------- */}
      <p className="mt-5 border-t-2 border-[color:var(--v2-border)] pt-3 text-base text-muted-foreground">
        {outOfQuota ? (
          <>
            <Tri
              bm="Bantuan AI untuk bulan ini sudah habis. Ia bermula semula pada 1 hari bulan depan — semua rekod dan dokumen anda masih boleh dibuka seperti biasa."
              zh="这个月的 AI 用量已经用完了。下个月 1 号会重新开始 —— 您所有的记录和文件都还能照常打开。"
              en="This month's AI help is used up. It starts again on the 1st of next month — all your records and documents still open as normal."
            />{" "}
            {/* C-3: a used-up meter needs a door, not just a date. */}
            <Link href="/settings/plan" className="underline underline-offset-4">
              <Tri bm="Lihat pelan" zh="看方案" en="See the plans" /> →
            </Link>
          </>
        ) : (
          /* 0-2 (2026-08-25, J's #14): the AI-path marker stays ("this uses
             the allowance"), the per-question/per-photo "about X%" promises
             are gone. The ONE number is the meter — "X% used this month" —
             always saying what the percentage is OF ("guna / 用了 / used"),
             because a bare percentage reads as the remaining one. */
          <Tri
            bm={`Soalan dan gambar di sini menggunakan kuota AI bulanan.${
              usedPct === null ? "" : ` Bulan ini sudah guna ${usedPct}%.`
            }`}
            zh={`在这里提问或上传照片会用本月的 AI 用量。${
              usedPct === null ? "" : `本月已用 ${usedPct}%。`
            }`}
            en={`Questions and photos here use the monthly AI allowance.${
              usedPct === null ? "" : ` ${usedPct}% used this month.`
            }`}
          />
        )}
      </p>
      {/* 0-5 (2026-08-25): the paid-tier privacy notice sits beside the door
          that sends things to the AI — not on some other page. */}
      <div className="mt-2">
        <PdpaNote />
      </div>
    </section>
  );
}
