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

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  Banknote,
  Check,
  FileText,
  Loader2,
  RotateCcw,
  ScrollText,
  X,
} from "lucide-react";
import { AiMistakesNote } from "@/components/ai-disclaimer";
import {
  AgentChangeCard,
  UiChangeCard,
  type AgentChangeInfo,
  type AgentUiChangeInfo,
} from "@/components/agent-change-card";
import { isLangMode, useLangs } from "@/components/language-provider";
import { ConfirmedAction } from "@/components/confirm-delete";
import {
  matchPreparedAnswer,
  preparedButtonFor,
  PREPARED_FREE_NOTE,
  suggestedQuestionsFor,
} from "@/lib/prepared-answers";
import { useEinvoisVisible } from "@/lib/einvois-pref";
import { AttachIcon, UPLOAD_LIMIT_MB, UploadLimitNote } from "@/components/attach-icon";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { prepareUploadForSend } from "@/lib/upload-relay-client";
import {
  fingerprintFiles,
  planUploadSegments,
  readConstitutionFiles,
  type ConstitutionReadResume,
} from "@/lib/constitution-read-client";
import { canStageTogether } from "@/lib/multi-page-staging";
import { mergeMeetingVersions } from "@/lib/extraction-versions";
import { asksToRedo, readStagedInstruction } from "@/lib/staged-instructions";
import { findRepeatedReading } from "@/lib/duplicate-pages";
import { ConstitutionReadEstimate } from "@/components/constitution-read-estimate";
import {
  forgetOpenJob,
  readOpenJob,
  rememberOpenJob,
  runJob,
  startJob,
} from "@/lib/jobs-client";
import type { JobEstimate } from "@/lib/jobs-core";
import {
  mergeConstitutionExtractions,
  mergeLedgerExtractions,
  mergeMeetingExtractions,
  mergedSourceLabel,
} from "@/lib/extraction-merge";
import type {
  ConstitutionExtraction,
  LedgerExtraction,
  MeetingNotesExtraction,
} from "@/lib/extraction";
import { useSpeechSupported, VoiceButton } from "@/components/voice-input";
import { writeIntake, type IntakeKind } from "@/lib/intake-handoff";
import { EntryCards } from "./entry-cards";
import { compressPhoto } from "@/app/minutes/minutes-storage";
import { tidyReply } from "@/lib/tidy-reply";
import {
  AnswerSources,
  type AnswerSource,
} from "@/components/v3/answer-sources";
import { isTurnArray } from "@/components/v3/ai-panel";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import { pctOfQuota } from "@/lib/quota-display";

/** §1 (105): the queue's estimate reads in whole minutes — "about 0 minutes"
 *  is not an estimate anybody believes, so it never goes below 1. */
function queueMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * A finished piece the agent made from what was handed over (work order 100
 * §3 — one conversation can produce SEVERAL). Everything the destination
 * page needs travels in the parcel; clicking the card writes it through the
 * one-shot intake courier and navigates. Persisted with the conversation so
 * a reload does not throw away work that was paid for.
 */
type ProductParcel = {
  kind: IntakeKind;
  /** Where "open and check" goes ( the page /api/intake named). */
  page: string;
  fileName: string;
  extraction: unknown;
  storagePath?: string | null;
  photoDataUrl?: string | null;
  pages?: { fileName: string; storagePath: string | null; photoDataUrl: string | null }[];
  /**
   * True for a piece the agent NOTICED and offers rather than one that was
   * asked for (§4-⑧: "還讀到 X 筆錢，要一起記嗎？") — the card asks instead
   * of announcing, and opening it is the person's yes.
   */
  offer?: boolean;
};

type Turn = {
  role: "user" | "assistant";
  text: string;
  button?: { href: string; bm: string; zh: string; en: string } | null;
  /** Clickable "this came from the 12 June meeting" links. */
  sources?: AnswerSource[] | null;
  lookups?: string[] | null;
  /** K1 (work order 82): answered by the prepared layer — no AI, no quota,
   *  and excluded from the history /api/chat sees. */
  free?: boolean;
  /** The finished pieces this agent turn produced, as clickable cards. */
  products?: ProductParcel[];
  /** §0-4: record changes the agent made this turn — old → new + undo. */
  changes?: AgentChangeInfo[];
  /** §0-2a: device-side changes this turn made (language) — old → new + undo. */
  uiChanges?: AgentUiChangeInfo[];
};

/** One visible step of the agent's work (§3 — wow 的來源: 邊做邊亮步驟). */
type AgentStep = { label: string; state: "doing" | "done" | "fail" };

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
  /** §0-2c: the person dictated a meeting — run the spoken account through
   *  the extraction pipeline now. */
  dictate?: boolean;
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
  /** Where the original landed in the uploads bucket (28/8 evening). */
  storagePath?: string | null;
};

// K1 (work order 82): the SAME chips as the floating panel, owned by the
// prepared layer — every one is answered for free (tests pin each language).
// The old home wordings ("Macam mana nak buat resit derma?" etc.) still hit
// the matcher, so nobody's muscle memory breaks.
// D49 (work order 94): chips obey the e-Invois beta gate — see the render
// site, which filters via suggestedQuestionsFor(einvoisVisible).

/**
 * One finished piece, as a card in the conversation (§3 多成品卡片). The
 * card IS the door: opening it hands the parcel to the destination page —
 * the same review/confirm gates as ever, nothing lands in the database from
 * here.
 */
function ProductCard({
  parcel,
  disabled,
  onOpen,
}: {
  parcel: ProductParcel;
  disabled: boolean;
  onOpen: () => void;
}) {
  const t = useTriText();
  let icon = <FileText className="h-6 w-6" strokeWidth={1.9} />;
  let title = "";
  let detail = "";
  let action = t("Buka & semak", "打开核对", "Open & check");
  if (parcel.kind === "meeting_notes") {
    const m = parcel.extraction as MeetingNotesExtraction;
    const date = m.meeting_date?.value ?? "";
    title = t("Minit mesyuarat", "会议记录", "Meeting minutes") + (date ? ` · ${date}` : "");
    const bits: string[] = [
      t(
        `${m.resolutions.length} perkara`,
        `${m.resolutions.length} 条内容`,
        `${m.resolutions.length} items`,
      ),
    ];
    if (m.attendees.length > 0)
      bits.push(
        t(`${m.attendees.length} hadir`, `${m.attendees.length} 位出席`, `${m.attendees.length} attendees`),
      );
    if (m.office_bearers.length > 0)
      bits.push(
        t(
          `${m.office_bearers.length} jawatan`,
          `${m.office_bearers.length} 个职位`,
          `${m.office_bearers.length} positions`,
        ),
      );
    detail = bits.join(" · ");
  } else if (parcel.kind === "ledger_page") {
    const rows = ((parcel.extraction as LedgerExtraction).rows ?? []).length;
    if (parcel.offer) {
      icon = <Banknote className="h-6 w-6" strokeWidth={1.9} />;
      title = t(
        `Ternampak ${rows} baris wang dalam nota`,
        `笔记里还读到 ${rows} 笔钱`,
        `Spotted ${rows} money line(s) in the notes`,
      );
      detail = t(
        "Mahu rekod sekali? Dibuka di halaman Wang untuk anda semak — tiada AI tambahan.",
        "要一起记账吗？会放进钱区给您核对 —— 不另花 AI。",
        "Record them too? They open on the Money page for you to check — no extra AI.",
      );
      action = t("Rekod di halaman Wang", "去钱区记账", "Record on Money page");
    } else {
      icon = <Banknote className="h-6 w-6" strokeWidth={1.9} />;
      title = t("Halaman lejar derma", "捐款账页", "Donation ledger page");
      detail = t(`${rows} baris`, `${rows} 行`, `${rows} rows`);
    }
  } else {
    icon = <ScrollText className="h-6 w-6" strokeWidth={1.9} />;
    title = t("Perlembagaan", "章程", "Constitution");
  }
  return (
    <button
      type="button"
      data-probe="product-card"
      data-kind={parcel.kind}
      disabled={disabled}
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/35 bg-white/85 p-3.5 text-left transition-[transform,border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-[color:var(--v2-primary)]/70 hover:shadow-[var(--v2-shadow-soft)] active:scale-[0.995] disabled:opacity-60 dark:bg-white/10"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-[color:var(--v2-primary)]/10 text-[color:var(--v2-primary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug">{title}</span>
        {detail && (
          <span className="block text-sm leading-snug text-[color:var(--v2-text-soft)]">
            {detail}
          </span>
        )}
        <span className="mt-0.5 block text-sm font-medium text-[color:var(--v2-primary)]">
          {action} →
        </span>
      </span>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-[color:var(--v2-text-soft)] transition-transform group-hover:translate-x-1"
        strokeWidth={2.2}
      />
    </button>
  );
}

export function AskBox({
  hasOrg,
  initialRemaining,
  initialUsedPct,
  monthlyQuota = null,
  unfinishedDrafts = null,
  howItWorks,
}: {
  hasOrg: boolean;
  /** AI actions left this month; null when there is no organisation yet. */
  initialRemaining: number | null;
  /** Share of the monthly free quota spent, 0–100; null when unknown. */
  initialUsedPct: number | null;
  /** The monthly pool (actions) — §0-4 (102): the display layer speaks
   *  percentages, and a percentage needs its denominator. */
  monthlyQuota?: number | null;
  /** G3-3: unfinished workspace drafts — a quiet reminder line in the
   *  greeting. null = unknown, no claim made (the home-card-lines rule:
   *  a failed query must never read like "you have none"). */
  unfinishedDrafts?: number | null;
  /** C-11 (work order 51): the "how it works" entry, rendered BESIDE the
   *  heading — it explains exactly the flow this box starts. */
  howItWorks?: React.ReactNode;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const router = useRouter();
  // §0-2a: the agent can switch the interface language (device preference).
  const { setMode } = useLangs();
  // D49: the prepared e-Invois answers and their chip follow the beta gate —
  // behind it, those questions go to the model like any other (the pages the
  // prepared buttons point at 404 for non-operators).
  const [einvoisVisible] = useEinvoisVisible();
  const fileInput = useRef<HTMLInputElement | null>(null);
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
  // A-5 (work order 51): SEVERAL photos can be staged together — a two-page
  // meeting record is two photos, and "one at a time" made people re-answer
  // the same questions per page. Each entry keeps a small preview for the
  // thumbnail strip (images only; PDFs/Office files show an icon).
  const [staged, setStaged] = useState<{ file: File; preview: string | null }[]>([]);
  /**
   * §1 (work order 113): the person pressed "notes from a meeting" / "money
   * that came in" / "the constitution" instead of just dropping a file in —
   * so they have ALREADY answered "what kind of paper is this?".
   *
   * 🔴 THIS IS THE WHOLE POINT OF CARDS 1–3, not the file chooser. It rides
   * with the staged file all the way to sendFiles(), where it becomes
   * `forcedKind` and /api/intake skips the classify step: one AI action fewer
   * every time (`actionsUsed = (forcedKind ? 0 : 1) + files.length`), and one
   * fewer chance of the classifier placing the page wrongly. Dropping a file
   * in WITHOUT a card still classifies — the card is a shortcut for people
   * who know, never a question everybody has to answer first.
   *
   * Cleared wherever the staging area empties: a kind left lying around
   * would silently force the NEXT, unrelated paper down the same road.
   */
  const [presetKind, setPresetKind] = useState<IntakeKind | null>(null);
  /** §3: the agent's work, visible step by step while a file is being read. */
  const [steps, setSteps] = useState<AgentStep[]>([]);
  /** Drag-and-drop highlight for the whole workbench (photos/PDF/Office). */
  const [dragActive, setDragActive] = useState(false);
  // Set when Minit could not place the page: it ASKS instead of giving up.
  // Holds the text that accompanied the failed attempt so the retry carries it.
  const [askKind, setAskKind] = useState<{ context: string } | null>(null);
  /**
   * §10 (work order 104, J's ruling 「上傳時選」): several photos of ONE
   * meeting are either its PAGES (page 1, page 2 — concatenate, which is what
   * this has always done) or two VERSIONS of the same thing (a short note and
   * a typed-up minit — use the fullest and let the other only add). Only the
   * person holding the paper knows which, so the strip asks.
   */
  const [multiMode, setMultiMode] = useState<"pages" | "versions">("pages");
  /**
   * ④ (work order 85): a long PDF just classified as a CONSTITUTION waits
   * here for the person's own "start reading" tap — with the price-and-time
   * line shown first. The classify is already paid at this point (that is the
   * cost of answering "what is this?"); the EXTRACT action is what this gate
   * prices before it starts.
   */
  const [constitutionGate, setConstitutionGate] = useState<{
    pages: number;
    context: string;
  } | null>(null);
  /**
   * §1 (work order 105): a long PDF that will be read a FEW PAGES AT A TIME
   * waits here for the person's own "start reading" tap, with the queue's
   * estimate shown first (§1-2 「預估講在前面」). The job row already exists
   * at this point and has cost nothing — /api/job/start is a quotation.
   */
  const [queueGate, setQueueGate] = useState<{
    jobId: number;
    kind: IntakeKind;
    page: string;
    fileName: string;
    context: string;
    estimate: JobEstimate;
  } | null>(null);
  /**
   * §3 (work order 105): the papers were read as PAGES, nobody said otherwise,
   * and the readings look like the SAME meeting told twice. The app asks — it
   * never decides. Taking the offer re-uses the readings already paid for, so
   * no photo is read again and nothing is charged.
   */
  const [repeatAsk, setRepeatAsk] = useState<{
    matches: number;
    pageA: number;
    pageB: number;
    done: {
      kind: IntakeKind;
      page: string;
      readings: unknown[];
      label: string;
      pages: { fileName: string; storagePath: string | null; photoDataUrl: string | null }[];
      actionsUsed: number;
    };
  } | null>(null);
  /** Where the running queue has got to — "part 3 of 7". */
  const [queue, setQueue] = useState<{
    fileName: string;
    batchesDone: number;
    totalBatches: number;
    percent: number;
    waiting: boolean;
  } | null>(null);
  /**
   * §1: a document this org left half-read — from this browser's own memory
   * after a reload, or from /api/job/open when it was somebody else's phone.
   * Closing the tab is not a failure; this card is what says so.
   */
  const [pickUp, setPickUp] = useState<{
    jobId: number;
    kind: IntakeKind;
    fileName: string;
    batchesDone: number;
    totalBatches: number;
  } | null>(null);
  /**
   * I1 (work order 81): where a partly-read LONG constitution PDF can pick up
   * again — a failed segment keeps everything read so far here, and pressing
   * Send on the same staged file continues from that segment on the same
   * paid action instead of charging a fresh read.
   */
  const constitutionResumeRef = useRef<ConstitutionReadResume | null>(null);
  /**
   * §4-② (work order 100): the paper carried MORE THAN ONE meeting (真件 A —
   * a printed minit annotated with notes about another meeting). The agent
   * stops and asks which one; `resume` holds everything already read so the
   * free "use it as it is" road costs nothing further.
   */
  const [meetingChoice, setMeetingChoice] = useState<{
    context: string;
    mainDate: string;
    options: { dateText: string; label: string }[];
    resume: {
      kind: IntakeKind;
      page: string;
      merged: unknown;
      label: string;
      pages: { fileName: string; storagePath: string | null; photoDataUrl: string | null }[];
      actionsUsed: number;
    };
  } | null>(null);

  /**
   * §1-3 (105): every SEPARATE reading of the document just delivered, kept
   * so a sentence typed AFTERWARDS can change how they are put together
   * without reading anything again. J's case exactly: two photos come out as
   * one document, he says "these two are the same, use the fuller one", and
   * the answer must be a NEW finished card — not a lesson about the upload
   * box (103 §7), and not a second bill for pages already paid for.
   */
  const lastReadRef = useRef<{
    kind: IntakeKind;
    page: string;
    readings: unknown[];
    label: string;
    pages: { fileName: string; storagePath: string | null; photoDataUrl: string | null }[];
  } | null>(null);

  // K5 (work order 82): after a send, bring the newest bubble AND the input
  // (they are adjacent now) into view. A ref, not state: nothing re-renders,
  // and hydrating an old conversation on page load must NOT yank the page.
  const flowEndRef = useRef<HTMLDivElement | null>(null);
  const scrollPending = useRef(false);
  useEffect(() => {
    if (!scrollPending.current) return;
    flowEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (busy === null) scrollPending.current = false;
    // §0-3 (102): the anchor lives INSIDE the conversation's own scroll
    // region now, so "nearest" scrolls the region, never the page. Steps are
    // a dep because the work cards grow while a multi-page read runs.
  }, [turns, busy, steps]);

  // §0-3 (102): a RESTORED conversation opens at its newest turn. Scrolling
  // the region (not the page) is safe on hydration — the old "must not yank
  // the page" rule was about full-page scrolling and still holds for it.
  // §1 (109): the typing box GROWS WITH THE TEXT, Claude-style — one line
  // at rest, up to about five before it scrolls itself. Two fixed rows cost a
  // phone 25px of conversation for a box that is empty most of the time, and
  // a person pasting a paragraph could not see what they had pasted. The
  // FLOOR does not move while it grows: the pane above gives way, because the
  // pane is the flexible one and this box is shrink-0.
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [question]);

  /** §1 (113): card 4 opens the microphone, from three hundred pixels away. */
  const micStart = useRef<(() => void) | null>(null);
  /** Does this browser have speech recognition at all? No → no card 4. */
  const canDictate = useSpeechSupported();

  /**
   * §2 (113): WHEN THE ENTRY CARDS ARE ON SCREEN, and how they leave.
   *
   * They follow ONE fact — "is this conversation empty?" — and nothing else.
   * J: 「開始聊天后那些 card 就會收起來」/「`Clear conversation` 之後卡回來」.
   * Deliberately NOT a remembered preference: a person who cleared the
   * conversation is back at the beginning, and the beginning has doors.
   *
   */
  const entryOpen =
    hasOrg && turns.length === 0 && staged.length === 0 && busy === null;

  /**
   * Cards 1–3: say what the paper is, THEN choose the file. Two things
   * happen in this order for a reason — the chooser is modal on a phone, so
   * the kind has to be recorded before the browser takes the screen away.
   */
  function pickWithKind(kind: IntakeKind) {
    setPresetKind(kind);
    fileInput.current?.click();
  }

  const convRegionRef = useRef<HTMLDivElement | null>(null);
  const hydratedScroll = useRef(false);
  useEffect(() => {
    if (hydratedScroll.current || turns.length === 0) return;
    const el = convRegionRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      hydratedScroll.current = true;
    }
  }, [turns]);

  // §1 (105): is this society still reading something? Two roads, because
  // they answer different questions — localStorage says "YOU were reading
  // this on THIS device", /api/job/open says "this ORGANISATION has an
  // unfinished document", which is how the treasurer's half-read ledger
  // reaches the secretary's laptop. The server's answer wins where both
  // speak: it is the one that knows how far the read actually got.
  useEffect(() => {
    if (!hasOrg) return;
    let cancelled = false;
    void (async () => {
      const note = readOpenJob();
      try {
        const res = await fetch("/api/job/open");
        const body = (await res.json().catch(() => null)) as {
          jobs?: {
            jobId: number;
            kind: IntakeKind;
            fileName: string;
            batchesDone: number;
            totalBatches: number;
          }[];
        } | null;
        const jobs = body?.jobs ?? [];
        const mine = note ? jobs.find((j) => j.jobId === note.jobId) : undefined;
        const pick = mine ?? jobs[0];
        if (!cancelled && pick) {
          setPickUp({
            jobId: pick.jobId,
            kind: pick.kind,
            fileName: pick.fileName,
            batchesDone: pick.batchesDone,
            totalBatches: pick.totalBatches,
          });
          return;
        }
        // The row is gone (finished elsewhere, or the org was switched):
        // the device's note is stale and must not offer a dead document.
        if (!cancelled && note) forgetOpenJob();
      } catch {
        // No answer: show nothing rather than a card that cannot work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasOrg]);

  const outOfQuota = remaining !== null && remaining <= 0;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    // §1-3 (105): the person is talking about the papers Minit is already
    // holding. "These two are the same, use the fuller one" is an instruction
    // about a document that has ALREADY been read — so it is carried out on
    // the readings in hand: no photo is read again, no action is charged, and
    // what comes back is a finished card, not an explanation. This runs
    // BEFORE the quota check on purpose, because it does not use any.
    const last = lastReadRef.current;
    if (last && last.readings.length > 1 && last.kind === "meeting_notes" && asksToRedo(q)) {
      setError(null);
      setQuestion("");
      scrollPending.current = true;
      setTurns((prev) => [...prev, { role: "user", text: q, free: true }]);
      deliverProducts({
        kind: last.kind,
        page: last.page,
        merged: mergeMeetingVersions(last.readings as MeetingNotesExtraction[]),
        label: last.label,
        pages: last.pages,
        // Nothing was read again — the cost sentence must not claim otherwise.
        actionsUsed: 0,
        redoneAsVersions: true,
      });
      return;
    }
    if (outOfQuota) return;
    // K1 (work order 82): the free layer answers first — zero AI, zero quota.
    const hit = matchPreparedAnswer(q, { einvois: einvoisVisible });
    if (hit) {
      setError(null);
      setQuestion("");
      scrollPending.current = true;
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
    // 2026-08-18: "Start again" used to be reachable WHILE an answer was on its
    // way. Tapping it emptied the conversation, then the late answer landed in
    // the empty one — an answer sitting there with no question above it. Every
    // send takes a ticket; a reply holding a stale ticket is dropped.
    const seq = ++sendSeq.current;
    setError(null);
    setQuestion("");
    scrollPending.current = true;
    // Free (prepared) exchanges are navigation, not context — they stay out
    // of the history so they never eat the turn cap or a prompt token.
    const history = turns
      .filter((x) => !x.free)
      .map((x) => ({ role: x.role, text: x.text }));
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
              "Ada masalah di pihak MinitAI. Cuba sekali lagi.",
              "MinitAI 这边出了点问题。请再试一次。",
              "Something went wrong on MinitAI's side. Please try again.",
            ),
        );
        // Drop the question we optimistically added: it was never answered, and
        // leaving it there makes the person think Minit ignored them.
        setTurns((prev) => prev.slice(0, -1));
        return;
      }
      // §0-2a: apply device-side changes as the answer lands — the interface
      // switches NOW, and the card below shows old → new with an undo.
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
      // §0-2c: the reply said "drafting it now" — run the spoken account
      // through the real pipeline. The story is every USER turn (the agent's
      // own words must never become source material — Hard Rule 1).
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

  /** Picked files land in the staging area; nothing is sent yet. A-5: more
   *  taps ADD to what is staged — that is how "add the next page" works. */
  async function stageFiles(list: FileList | null) {
    if (!list || list.length === 0 || busy) return;
    setError(null);
    setAskKind(null);
    setConstitutionGate(null);
    const picked = Array.from(list);
    // Several files at once only makes sense for PHOTOS of pages. A PDF or
    // Office file is already a whole document — one of those at a time.
    // (The rule is shared with the Constitution page — multi-page-staging.ts.)
    const wouldBe = [...staged.map((s) => s.file), ...picked];
    if (!canStageTogether(wouldBe.map((f) => f.type))) {
      setError(
        t(
          "Hantar beberapa fail sekali gus hanya untuk GAMBAR. PDF / Word / Excel / PowerPoint: satu fail pada satu masa.",
          "一次传多个，只限「照片」。PDF / Word / Excel / PowerPoint 请一次传一份。",
          "Sending several at once is for PHOTOS only. PDF / Word / Excel / PowerPoint: one file at a time.",
        ),
      );
      return;
    }
    const withPreviews = await Promise.all(
      picked.map(async (file) => ({
        file,
        preview: file.type.startsWith("image/") ? await compressPhoto(file) : null,
      })),
    );
    setStaged((prev) => [...prev, ...withPreviews]);
  }

  /** One reading through /api/intake. `forcedKind` skips the classifier. */
  async function readOneFile(
    file: File,
    context: string,
    forcedKind: IntakeKind | undefined,
  ): Promise<
    | { outcome: "ok"; body: IntakeOk }
    | { outcome: "unknown" }
    | { outcome: "error"; message: string }
  > {
    // 48 + A-4: shrink photos in the browser; relay a big PDF via Storage;
    // refuse honestly what neither road can carry.
    const prepared = await prepareUploadForSend(file);
    if (prepared.send === "refuse") return { outcome: "error", message: prepared.error };
    const form = new FormData();
    if (prepared.send === "file") form.append("file", prepared.file);
    else form.append("storagePath", prepared.storagePath);
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
      return {
        outcome: "error",
        message: t(
          "Pelayan tidak membalas semasa membaca fail itu. Ini bukan salah anda. Tunggu seminit, lihat baki kuota AI anda, kemudian cuba sekali lagi.",
          "读取文件的时候，伺服器没有回应。这不是您的问题。请等一分钟，看一下 AI 用量的余额，再试一次。",
          "The server did not reply while reading that file. This is not your fault. Wait a minute, check your remaining AI quota, then try again.",
        ),
      };
    }
    if (body.kind === "unknown") return { outcome: "unknown" };
    if (!res.ok || !body.page || !body.extraction) {
      return {
        outcome: "error",
        message:
          body.error ??
          t(
            "MinitAI tidak dapat membaca fail itu. Cuba sekali lagi.",
            "MinitAI 读不了这个文件。请再试一次。",
            "MinitAI could not read that file. Please try again.",
          ),
      };
    }
    return { outcome: "ok", body };
  }

  /**
   * I1: "what IS this?" for a LONG PDF — only the FIRST SEGMENT travels (the
   * title page answers the question), and only the classify action is
   * charged; whichever road then reads the document pays the extract.
   */
  async function classifyLongPdf(
    firstSegment: File,
    context: string,
  ): Promise<
    | { outcome: "kind"; kind: IntakeKind }
    | { outcome: "unknown" }
    | { outcome: "error"; message: string }
  > {
    const prepared = await prepareUploadForSend(firstSegment);
    if (prepared.send === "refuse")
      return { outcome: "error", message: prepared.error };
    const form = new FormData();
    if (prepared.send === "file") form.append("file", prepared.file);
    else form.append("storagePath", prepared.storagePath);
    if (context.trim() !== "") form.append("context", context.trim());
    form.append("classifyOnly", "1");
    let res: Response;
    try {
      res = await fetch("/api/intake", { method: "POST", body: form });
    } catch {
      return {
        outcome: "error",
        message: t(
          "Sambungan internet terputus. Tiada apa-apa dicaj. Cuba sekali lagi.",
          "网络断了，一分都没扣。请再试一次。",
          "The connection dropped — nothing was charged. Please try again.",
        ),
      };
    }
    const body = (await res.json().catch(() => null)) as IntakeOk | null;
    if (body?.kind === "unknown") return { outcome: "unknown" };
    const kind = body?.kind;
    if (
      !res.ok ||
      (kind !== "meeting_notes" && kind !== "ledger_page" && kind !== "constitution")
    ) {
      return {
        outcome: "error",
        message:
          body?.error ??
          t(
            "MinitAI tidak dapat membaca fail itu. Cuba sekali lagi.",
            "MinitAI 读不了这个文件。请再试一次。",
            "MinitAI could not read that file. Please try again.",
          ),
      };
    }
    return { outcome: "kind", kind };
  }

  // --- §3: the visible work steps ------------------------------------------
  function pushStep(label: string) {
    setSteps((prev) => [
      ...prev.map((s) =>
        s.state === "doing" ? { ...s, state: "done" as const } : s,
      ),
      { label, state: "doing" },
    ]);
  }
  function closeSteps(ok: boolean) {
    setSteps((prev) =>
      prev.map((s) =>
        s.state === "doing" ? { ...s, state: ok ? ("done" as const) : ("fail" as const) } : s,
      ),
    );
  }

  /** Open one finished piece: hand its parcel to the destination page. */
  function openProduct(p: ProductParcel) {
    writeIntake({
      kind: p.kind,
      fileName: p.fileName,
      extraction: p.extraction,
      storagePath: p.storagePath ?? null,
      photoDataUrl: p.photoDataUrl ?? null,
      pages: p.pages,
    });
    router.push(p.page);
  }

  /** The kind-specific page merge — the same rules each review page uses. */
  function mergeByKind(kind: IntakeKind, a: unknown, b: unknown): unknown {
    if (kind === "meeting_notes")
      return mergeMeetingExtractions(
        a as MeetingNotesExtraction,
        b as MeetingNotesExtraction,
      );
    if (kind === "ledger_page")
      return mergeLedgerExtractions(a as LedgerExtraction, b as LedgerExtraction);
    return mergeConstitutionExtractions(
      a as ConstitutionExtraction,
      b as ConstitutionExtraction,
    );
  }

  /**
   * Send everything staged (with whatever was typed as context). The first
   * file answers "what IS this?" (unless `forcedKind` carries the person's own
   * answer); every further photo is read as another page of the SAME document
   * and merged, so a two-page meeting arrives as one meeting.
   */
  async function sendFiles(
    files: File[],
    context: string,
    forcedKind?: IntakeKind,
    /** ④: true only from the gate's own "start reading" button. */
    constitutionConfirmed?: boolean,
    /** §4-②: true on a re-read from the which-meeting card — the person has
     *  already picked, so the card must not open again. */
    opts?: { meetingPicked?: boolean },
  ) {
    if (busy || files.length === 0) return;
    setError(null);
    setAskKind(null);
    setConstitutionGate(null);
    setMeetingChoice(null);
    setRepeatAsk(null);
    setSteps([]);
    setBusy("file");
    try {
      let kind: IntakeKind | null = forcedKind ?? null;
      if (!kind) {
        pushStep(
          t(
            "Kenal pasti dahulu: kertas apa ini?",
            "先认一认：这是什么纸？",
            "First: what kind of paper is this?",
          ),
        );
      }

      // I1 (work order 81): a LONG PDF cannot be read in one request — that
      // is the read "The AI took too long" kept killing. Ask what it is
      // first (first segment only, classify action only), then: a
      // constitution goes to the segmented reader — priced by D47's page
      // formula, the charge following the read segment by segment — and
      // anything else is read whole below with the answer as its forced kind.
      if (files.length === 1 && files[0].type === "application/pdf") {
        const plan = await planUploadSegments(files);
        if (plan.segments.length > 1) {
          if (!kind) {
            setReading(files[0].name);
            const k = await classifyLongPdf(plan.segments[0].file, context);
            if (k.outcome === "unknown") {
              // Minit could not place the page — ASK, don't give up (A-2).
              setAskKind({ context });
              return;
            }
            if (k.outcome === "error") {
              setError(k.message);
              return;
            }
            kind = k.kind;
          }
          if (kind === "constitution") {
            const fingerprint = fingerprintFiles(files);
            const resume =
              constitutionResumeRef.current?.fingerprint === fingerprint
                ? constitutionResumeRef.current
                : null;
            // ④ (work order 85): price first, read on the person's own
            // "start reading" tap. A matching resume means this document is
            // already paid for and half-read — pricing it again would be a
            // false statement, so a continuation never re-gates.
            if (!constitutionConfirmed && !resume) {
              setConstitutionGate({
                pages: plan.totalPages ?? plan.segments.length,
                context,
              });
              return;
            }
            const r = await readConstitutionFiles(files, {
              resume,
              onProgress: (p) =>
                setReading(
                  `${p.fileName} · ${t(
                    `bahagian ${p.segment}/${p.totalSegments}`,
                    `第 ${p.segment}／${p.totalSegments} 段`,
                    `part ${p.segment} of ${p.totalSegments}`,
                  )}`,
                ),
            });
            if (!r.ok) {
              constitutionResumeRef.current = r.resume;
              const continueLine = r.resume
                ? t(
                    `Bahagian ${r.failedSegment}/${r.totalSegments} gagal. Yang sudah dibaca disimpan — tekan Hantar sekali lagi untuk sambung dari situ (muka surat yang sudah dibaca tidak dicaj semula).`,
                    `第 ${r.failedSegment}／${r.totalSegments} 段没读成功。已读的部分都留着 —— 再按一次送出，会从那一段接着读；已经读好的页不会重扣。`,
                    `Part ${r.failedSegment} of ${r.totalSegments} failed. What was read is kept — press Send again to continue from there (pages already read are never charged again).`,
                  )
                : null;
              setError(continueLine ? `${r.message}\n\n${continueLine}` : r.message);
              return;
            }
            constitutionResumeRef.current = null;
            writeIntake({
              kind: "constitution",
              fileName: files[0].name,
              extraction: r.extraction,
            });
            setStaged([]);
            setPresetKind(null);
            setQuestion("");
            router.push("/constitution");
            return;
          }
          // §1 (105): NOT a constitution, and too long for one request —
          // this is the read that used to die at the 60s wall ("超過 10 頁的
          // FILE 讀不到"). It goes to the QUEUE: the file is put where the
          // server can reach it, a job row is opened, and the person is shown
          // what it will cost BEFORE anything is charged. The whole-file read
          // below stays as the fallback for a deployment without migration 43.
          if (kind === "meeting_notes" || kind === "ledger_page") {
            setReading(files[0].name);
            const started = await startJob(files[0], kind, context);
            if (started.ok) {
              closeSteps(true);
              setQueueGate({
                jobId: started.jobId,
                kind,
                page: kind === "meeting_notes" ? "/minutes" : "/money",
                fileName: started.fileName,
                context,
                estimate: started.estimate,
              });
              return;
            }
            if (!started.fallback) {
              closeSteps(false);
              setError(started.message);
              return;
            }
            // fallback: read it whole, exactly as before the queue existed.
          }
          // Not a constitution: the classify is paid; the loop below reads
          // the WHOLE file with the answer as its forced kind, so nothing is
          // classified (or charged for classifying) twice.
        }
      }

      let merged: unknown = null;
      let page: string | null = null;
      let label: string | null = null;
      // §10 (104): in "versions" mode the readings are NOT folded together as
      // they arrive — the fullest one has to be chosen once they are all in.
      const readings: unknown[] = [];
      // §1-3 (105): the tick-box on the strip (104 §10) is not the only way
      // to say this — J says it in words, in the box, in three languages at
      // once. A sentence that clearly says "same thing / use the fuller one"
      // is obeyed; one that says "page 2" is obeyed the other way; anything
      // else leaves the tick-box in charge exactly as before.
      const spoken = readStagedInstruction(context);
      const asVersions =
        (spoken.kind === "versions" ||
          (spoken.kind === "none" && multiMode === "versions")) &&
        files.length > 1 &&
        !opts?.meetingPicked;
      const pages: {
        fileName: string;
        storagePath: string | null;
        photoDataUrl: string | null;
      }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setReading(
          files.length === 1 ? file.name : `${file.name} (${i + 1}/${files.length})`,
        );
        pushStep(
          files.length === 1
            ? t(`Baca "${file.name}"…`, `读「${file.name}」…`, `Reading "${file.name}"…`)
            : t(
                `Baca muka surat ${i + 1}/${files.length}: "${file.name}"…`,
                `读第 ${i + 1}／${files.length} 页：「${file.name}」…`,
                `Reading page ${i + 1} of ${files.length}: "${file.name}"…`,
              ),
        );
        const r = await readOneFile(file, context, kind ?? undefined);
        if (r.outcome === "unknown") {
          // Minit could not place the page — ASK, don't give up (A-2). The
          // files stay staged; the person answers with one tap and only the
          // reads are charged on the retry. (Only the FIRST file classifies,
          // so this can only happen before anything was merged.)
          closeSteps(true);
          setAskKind({ context });
          return;
        }
        if (r.outcome === "error") {
          // Stop at the first page that failed and say WHICH one — pages read
          // before it are not handed over half-silent; everything stays
          // staged for one more send once the person fixes or removes it.
          closeSteps(false);
          setError(
            files.length === 1 ? r.message : `📄 ${file.name}\n${r.message}`,
          );
          return;
        }
        const body = r.body;
        kind = body.kind as IntakeKind;
        page = body.page ?? page;
        // Every reading is kept whole for §10; `merged` still folds them the
        // way it always has, so a kind with no version rule (a ledger, a
        // constitution) behaves exactly as before whatever was ticked.
        readings.push(body.extraction);
        merged = merged === null ? body.extraction : mergeByKind(kind, merged, body.extraction);
        label = label === null ? (body.fileName ?? file.name) : mergedSourceLabel(label, file.name);
        pages.push({
          fileName: body.fileName ?? file.name,
          storagePath: body.storagePath ?? null,
          photoDataUrl: file.type.startsWith("image/")
            ? await compressPhoto(file)
            : null,
        });
      }
      if (!kind || !page || merged === null) return;

      // §10: the person said these are VERSIONS of one thing. The fullest
      // reading becomes the document; the others may only add what it does
      // not already carry, so one agenda is never written out twice.
      if (asVersions && kind === "meeting_notes" && readings.length > 1) {
        merged = mergeMeetingVersions(readings as MeetingNotesExtraction[]);
      }
      // §1-3: hold on to the separate readings. Everything above has been
      // paid for; if the person says afterwards that these were two tellings
      // of one thing, that has to be doable without buying them again.
      lastReadRef.current = {
        kind,
        page,
        readings,
        label: label ?? files[0].name,
        pages,
      };

      // A constitution is a whole-book read with its own review flow — it
      // still goes straight to /constitution (same contract as the long-PDF
      // segmented path above).
      if (kind === "constitution") {
        writeIntake({
          kind,
          fileName: label ?? files[0].name,
          extraction: merged,
          storagePath: pages[0]?.storagePath ?? null,
          photoDataUrl: pages[0]?.photoDataUrl ?? null,
          pages,
        });
        setStaged([]);
        setPresetKind(null);
        setQuestion("");
        router.push(page);
        return;
      }

      // The classify (when it ran) and each page's read are the metered
      // actions — the self-report and the "read it again" buttons quote this.
      const actionsUsed = (forcedKind ? 0 : 1) + files.length;

      // §4-② (work order 100): TWO MEETINGS ON ONE PAPER — stop and ask
      // which one, instead of quietly stirring both into one document
      // (真件 A). The free road keeps what was already read; the re-read
      // roads say their price on the button.
      if (kind === "meeting_notes" && !opts?.meetingPicked) {
        const m = merged as MeetingNotesExtraction;
        const seen = new Set<string>();
        const others = (m.other_meetings ?? [])
          .map((o) => ({
            dateText: o.date_text?.value ?? "",
            label: o.label?.value ?? "",
          }))
          .filter((o) => o.dateText !== "" || o.label !== "")
          // Two pages often report the SAME other meeting (the merge
          // concatenates), sometimes written fuller on one page ("18/7" vs
          // "18/7/26") — keep the fullest writing, one button per meeting.
          .filter(
            (o, i, arr) =>
              o.dateText === "" ||
              !arr.some(
                (p, j) =>
                  j !== i &&
                  p.dateText.length > o.dateText.length &&
                  p.dateText.startsWith(o.dateText),
              ),
          )
          .filter((o) => {
            const key = (o.dateText || o.label).replace(/\s+/g, "").slice(0, 20);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        if (others.length > 0) {
          closeSteps(true);
          setMeetingChoice({
            context,
            mainDate: m.meeting_date.value,
            options: others,
            resume: {
              kind,
              page,
              merged,
              label: label ?? files[0].name,
              pages,
              actionsUsed,
            },
          });
          return; // staged stays — the card's buttons are the next move.
        }
      }

      // §3 (105): nobody ticked "different versions" and nobody said so in
      // words — but the readings look like one meeting written out twice.
      // ASK. The bar is measured and deliberately set to miss rather than to
      // nag (src/lib/duplicate-pages.ts), and the offer costs nothing: the
      // re-merge uses readings that are already paid for.
      if (kind === "meeting_notes" && !asVersions && readings.length > 1) {
        const repeat = findRepeatedReading(readings as MeetingNotesExtraction[]);
        if (repeat) {
          closeSteps(true);
          setRepeatAsk({
            matches: repeat.matches,
            pageA: Math.min(repeat.shorter, repeat.fuller) + 1,
            pageB: Math.max(repeat.shorter, repeat.fuller) + 1,
            done: {
              kind,
              page,
              readings,
              label: label ?? files[0].name,
              pages,
              actionsUsed,
            },
          });
          return; // staged stays — the card's buttons are the next move.
        }
      }

      deliverProducts({
        kind,
        page,
        merged,
        label: label ?? files[0].name,
        pages,
        actionsUsed,
      });
    } catch {
      closeSteps(false);
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

  /**
   * §3: the finished pieces land HERE, as cards — the person opens each when
   * ready, instead of being teleported mid-thought. Shared by the normal
   * read road and the "use it as it is" road of the which-meeting card.
   */
  /**
   * §1 (105): drive one queued document to the end. Every request does one
   * four-page batch, so no single request meets the platform's 60s wall; the
   * loop is what makes the DOCUMENT unbounded. The job id is remembered on
   * this device so a reload offers to carry on, and forgotten the moment the
   * document is finished or given up.
   */
  async function runQueue(a: {
    jobId: number;
    kind: IntakeKind;
    page: string;
    fileName: string;
    totalBatches: number;
  }) {
    if (busy) return;
    setError(null);
    setQueueGate(null);
    setPickUp(null);
    setBusy("file");
    setQueue({
      fileName: a.fileName,
      batchesDone: 0,
      totalBatches: a.totalBatches,
      percent: 0,
      waiting: false,
    });
    rememberOpenJob({
      jobId: a.jobId,
      kind: a.kind as "meeting_notes" | "ledger_page" | "constitution",
      fileName: a.fileName,
      totalBatches: a.totalBatches,
    });
    pushStep(
      t(
        `Baca "${a.fileName}" sedikit demi sedikit…`,
        `一批一批地读「${a.fileName}」…`,
        `Reading "${a.fileName}" a few pages at a time…`,
      ),
    );
    try {
      const r = await runJob(a.jobId, {
        onProgress: (p) =>
          setQueue({
            fileName: a.fileName,
            batchesDone: p.batchesDone,
            totalBatches: p.totalBatches,
            percent: p.percent,
            waiting: p.waiting,
          }),
      });
      if (!r.ok) {
        closeSteps(false);
        // Resumable means the row is still there with everything read so
        // far — the pick-up card is the honest next move, not "try again".
        if (r.resumable) {
          setPickUp({
            jobId: a.jobId,
            kind: a.kind,
            fileName: a.fileName,
            batchesDone: r.batchesDone,
            totalBatches: r.totalBatches,
          });
        } else {
          forgetOpenJob();
        }
        setError(r.message);
        return;
      }
      forgetOpenJob();
      closeSteps(true);
      deliverProducts({
        kind: a.kind,
        page: a.page,
        merged: r.extraction,
        label: a.fileName,
        pages: [{ fileName: a.fileName, storagePath: r.storagePath, photoDataUrl: null }],
        // The queue charged batch by batch; the row knows the real total and
        // the self-report quotes THAT, never the estimate (§1-2).
        actionsUsed: r.actionsCharged,
      });
    } finally {
      setQueue(null);
      setBusy(null);
    }
  }

  function deliverProducts(a: {
    kind: IntakeKind;
    page: string;
    merged: unknown;
    label: string;
    pages: { fileName: string; storagePath: string | null; photoDataUrl: string | null }[];
    actionsUsed: number;
    /** §1-3 (105): this card was rebuilt from readings already paid for,
     *  because the person said the papers were two tellings of one thing. */
    redoneAsVersions?: boolean;
  }) {
    const { kind, page, merged, label, pages, actionsUsed } = a;
    const mainParcel: ProductParcel = {
      kind,
      page,
      fileName: label,
      extraction: merged,
      storagePath: pages[0]?.storagePath ?? null,
      photoDataUrl: pages[0]?.photoDataUrl ?? null,
      pages,
    };

    // The primary piece is ALSO handed to its page right away: if the tab
    // reloads before the card is tapped, the paid-for reading is waiting
    // on the destination page instead of gone (one-shot courier, 30 min).
    writeIntake(mainParcel);

    const products: ProductParcel[] = [mainParcel];
    let moneyRows = 0;
    if (kind === "meeting_notes") {
      // §4-⑧: money mentioned inside the meeting — offer to record it,
      // never silently drop it and never silently book it either. The
      // conversion is a straight copy (amount/description); donor and
      // date stay honestly missing for the treasurer to complete. Zero
      // extra AI — the rows were already read.
      const m = merged as MeetingNotesExtraction;
      const rows = (m.figures ?? []).filter(
        (f) => f.amount_cents.value !== null || f.description.value !== "",
      );
      moneyRows = rows.length;
      if (rows.length > 0) {
        const missingField = { value: "", confidence: "missing", source_ref: null };
        products.push({
          kind: "ledger_page",
          page: "/money",
          fileName: mainParcel.fileName,
          offer: true,
          extraction: {
            page_title: { value: "", confidence: "missing", source_ref: null },
            rows: rows.map((f) => ({
              donor_name: { ...missingField },
              donor_phone: { ...missingField },
              amount_cents: f.amount_cents,
              purpose: f.description,
              donated_at: { ...missingField },
            })),
          },
        });
      }
    }

    // §4-⑨: the agent reports what it did, in plain words — what came out,
    // what to look at, and what it cost. §0-4 (102): the receipt speaks
    // PERCENTAGES of the monthly pool, never action counts; when the pool is
    // unknown the cost sentence is omitted rather than guessed.
    const costPct = pctOfQuota(actionsUsed, monthlyQuota);
    const costBm = costPct === null ? "" : ` Guna kira-kira ${costPct}% kuota bulanan.`;
    const costZh = costPct === null ? "" : `这次用了大约 ${costPct}% 的本月用量。`;
    const costEn = costPct === null ? "" : ` Used about ${costPct}% of the monthly quota.`;
    const m = kind === "meeting_notes" ? (merged as MeetingNotesExtraction) : null;
    const dateBit = m?.meeting_date.value ? ` (${m.meeting_date.value})` : "";
    const reportText =
      kind === "meeting_notes"
        ? t(
            `Siap. Saya baca nota itu dan sediakan minit mesyuarat${dateBit} — ${m!.resolutions.length} perkara.${moneyRows > 0 ? ` Saya juga ternampak ${moneyRows} baris wang — kad kedua di bawah kalau mahu rekod sekali.` : ""}${costBm} Buka kad untuk semak; apa-apa nak ubah, beritahu saya di halaman itu.`,
            `做好了。笔记读完，会议记录${dateBit ? `（${m!.meeting_date.value}）` : ""}整理出 ${m!.resolutions.length} 条内容。${moneyRows > 0 ? `我还看到 ${moneyRows} 笔钱 —— 想一起记账就点第二张卡。` : ""}${costZh}点卡片进去核对；要改哪里，进去后直接跟我说。`,
            `Done. I read the notes and prepared the meeting minutes${dateBit} — ${m!.resolutions.length} items.${moneyRows > 0 ? ` I also spotted ${moneyRows} money line(s) — the second card records them if you want.` : ""}${costEn} Open the card to check; tell me there if anything needs changing.`,
          )
        : t(
            `Siap. Halaman lejar itu sudah dibaca — buka kad di bawah untuk semak setiap baris.${costBm}`,
            `做好了。账页读完了 —— 点下面的卡片逐行核对。${costZh}`,
            `Done. The ledger page is read — open the card below to check each row.${costEn}`,
          );

    const redoLine = a.redoneAsVersions
      ? t(
          " Saya susun semula dua kertas itu sebagai DUA VERSI perkara yang sama: yang paling lengkap jadi dokumen, yang satu lagi hanya menambah apa yang tiada. Tiada gambar dibaca semula, jadi ini tidak mengambil kuota.",
          " 我把那两张当成同一件事的两个版本重做了一次：最完整的那份当正文，另一份只补它没有的。照片没有重读，所以这一次不花用量。",
          " I put those two papers back together as TWO VERSIONS of one thing: the fullest is the document, the other only adds what it was missing. No photo was read again, so this used no quota.",
        )
      : "";

    scrollPending.current = true;
    setTurns((prev) => [
      ...prev,
      { role: "assistant", text: reportText + redoLine, products, free: false },
    ]);
    setSteps([]);
    setStaged([]);
    setPresetKind(null);
    setQuestion("");
    setMeetingChoice(null);
  }

  /**
   * §0-2c: the dictated-meeting road. The chat model said "drafting it now";
   * this sends the person's own words (never the assistant's) through
   * /api/intake's dictation branch — one extract_minutes action — and lays
   * the result out exactly like a photographed page: steps, product card,
   * self-report. The first await yields one macrotask so send()'s own
   * cleanup (setBusy(null)) lands before this takes the busy flag over.
   */
  async function runDictation(story: string) {
    await new Promise((r) => setTimeout(r, 0));
    setSteps([]);
    setBusy("file");
    pushStep(
      t(
        "Susun cerita anda menjadi minit mesyuarat…",
        "把您讲的内容整理成会议记录…",
        "Turning your account into meeting minutes…",
      ),
    );
    try {
      const form = new FormData();
      form.append("dictatedText", story);
      const res = await fetch("/api/intake", { method: "POST", body: form });
      let body: IntakeOk;
      try {
        body = (await res.json()) as IntakeOk;
      } catch {
        closeSteps(false);
        setError(
          t(
            "Pelayan tidak membalas semasa menyusun minit itu. Ini bukan salah anda. Tunggu seminit, lihat baki kuota AI anda, kemudian cuba sekali lagi.",
            "整理会议记录的时候，伺服器没有回应。这不是您的问题。请等一分钟，看一下 AI 用量的余额，再试一次。",
            "The server did not reply while preparing those minutes. This is not your fault. Wait a minute, check your remaining AI quota, then try again.",
          ),
        );
        return;
      }
      if (!res.ok || !body.page || !body.extraction) {
        closeSteps(false);
        setError(
          body.error ??
            t(
              "MinitAI tidak dapat menyusun cerita itu menjadi minit. Cuba sekali lagi.",
              "MinitAI 没能把这段话整理成会议记录。请再试一次。",
              "MinitAI could not turn that account into minutes. Please try again.",
            ),
        );
        return;
      }
      deliverProducts({
        kind: "meeting_notes",
        page: body.page,
        merged: body.extraction,
        label: body.fileName ?? "lisan",
        pages: [],
        actionsUsed: 1,
      });
    } catch {
      closeSteps(false);
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The internet connection dropped. Please try again.",
        ),
      );
    } finally {
      setBusy(null);
      setReading(null);
    }
  }

  return (
    // §1 (work order 109), J: 「爲什麽不是放在下面，像 CLAUDE 或者 GPT 這樣」
    // and 「上面太空了，把 CHATBOX 弄大」.
    //
    // THIS IS NO LONGER A CARD ON A PAGE. It is the screen: a column exactly
    // as tall as the room the shell gave it, holding a conversation that
    // scrolls inside itself and a composer that is the floor. The card's own
    // border and glass are gone with the card — a chat window inside a
    // violet-outlined box was the "整個設計模板很奇怪" J was looking at.
    // The border comes back for one second only: while something is being
    // dragged over it, so the whole screen visibly IS the drop target.
    <section
      data-probe="chat-screen"
      className={`flex min-h-0 flex-1 flex-col rounded-md border-2 transition-colors ${
        dragActive
          ? "border-dashed border-[color:var(--v2-primary)] bg-[color:var(--v2-primary)]/5"
          : "border-transparent"
      }`}
      onDragOver={(e) => {
        if (!hasOrg || busy !== null) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (!hasOrg || busy !== null) return;
        void stageFiles(e.dataTransfer.files);
      }}
    >
      {/* The heading row is gone (§1, 109): "交给 MinitAI 帮你做" over a chat
          window said in large type what the box under it already is, and the
          product's own name now lives beside "Home" in the top bar. */}
      <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,application/pdf,.docx,.xlsx,.pptx"
          className="hidden"
          onChange={(e) => {
            void stageFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* 🔴 §8 (work order 104), J: 「爲什麽 chatbox 還是會被推到下面？」
            THE ROOT CAUSE, and it was not the conversation. 102 put the
            TRANSCRIPT in this scrolling region and left the four ask-back
            cards outside it — the staged-file strip, "what kind of page is
            this?", the constitution price gate, and "this paper has several
            meetings on it". Every one of those appears at exactly the moment
            somebody is working, and every one of them pushed the composer
            further down the page. They are all inside now, on the same
            scrollbar as the conversation, so nothing that appears can make
            the box move. overscroll-contain keeps a phone from rubber-banding
            the page while flicking the transcript. */}
        <div
          ref={convRegionRef}
          data-probe="conversation-region"
          // 🔴 §1 (109): ALWAYS HERE, AND IT TAKES WHATEVER THE COMPOSER DOES
          // NOT. 104 stopped the composer drifting by making this pane a fixed
          // 46dvh; a fixed pane is still a card inside a scrolling page — the
          // window scrolled underneath it, and on a phone the box ended up
          // below the fold (measured before this change: the composer sat at
          // 738–1117 in an 812px window). `flex-1 min-h-0` instead: the pane is
          // the leftover, so the composer sits at the same y in an empty
          // conversation and in a long one, and the window has nothing to
          // scroll at all. min-h-0 is load-bearing — a flex child defaults to
          // min-height:auto and would refuse to shrink below its content.
          className="v2-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pb-2"
        >
          {/* G3-3's unfinished-work reminder used to be a line of its own
              right here. §1 (113) moved it INTO the entry cards as card 6,
              where it is a door rather than a sentence about a door — and
              the top of the conversation stops opening with a status report.
              The null-is-not-zero rule travelled with it (entry-cards.ts). */}

          {!hasOrg && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="Beritahu MinitAI nama pertubuhan anda dahulu — barulah ia tahu dokumen ini untuk siapa."
                zh="请先告诉 MinitAI 您机构的名字 —— 它才知道这些文件是属于谁的。"
                en="Tell MinitAI your organisation's name first — then it knows who these documents belong to."
              />{" "}
              <Link href="/orgs" className="underline underline-offset-4">
                <Tri bm="Buat sekarang" zh="现在填写" en="Do it now" /> →
              </Link>
            </p>
          )}

        {/* §3: the agent's work, visible while it happens — each step lights
            up, finishes with a tick, and a failure shows exactly where it
            stopped. This is the wow AND the honesty: nothing is a black box
            with a spinner on it. (The constitution's segmented reader keeps
            its own per-segment progress via `reading`.) */}
        {steps.length > 0 && (busy === "file" || steps.some((s) => s.state === "fail")) && (
          <div className="flex flex-col gap-2.5 rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-4 dark:bg-white/10">
            <p className="text-base font-semibold">
              {busy === "file" ? (
                <Tri
                  bm="MinitAI sedang bekerja…"
                  zh="MinitAI 正在做…"
                  en="MinitAI is working…"
                />
              ) : (
                <Tri
                  bm="Kerja terhenti di sini"
                  zh="做到这里停住了"
                  en="The work stopped here"
                />
              )}
            </p>
            <ul className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2.5 text-base">
                  {s.state === "doing" ? (
                    <Loader2
                      className="h-5 w-5 shrink-0 animate-spin text-[color:var(--v2-primary)]"
                      strokeWidth={2.2}
                    />
                  ) : s.state === "done" ? (
                    <Check className="h-5 w-5 shrink-0 text-green-700 dark:text-green-400" strokeWidth={2.4} />
                  ) : (
                    <X className="h-5 w-5 shrink-0 text-red-700 dark:text-red-400" strokeWidth={2.4} />
                  )}
                  <span className={s.state === "doing" ? "font-medium" : "text-[color:var(--v2-text-soft)]"}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ul>
            {busy === "file" && reading && (
              <p className="text-sm text-[color:var(--v2-text-soft)]">
                📄 {reading}
              </p>
            )}
          </div>
        )}

        {/* --- the conversation — ABOVE the input (K5, work order 82) --------
            tester 8/30: "問問題的在上面回答在下面，要問另一個問題時還要移上去".
            The flow now reads like the floating panel: messages on top, the
            input at the bottom, so the newest answer always sits NEXT to the
            box for the follow-up — the same logic on both surfaces. */}
        {turns.length > 0 && (
          <div className="flex flex-col gap-3">
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <p
                  key={i}
                  className="minit-enter self-end rounded-md rounded-br-md bg-[color:var(--v2-primary-fill)] px-4 py-3 text-lg text-white sm:max-w-[80%]"
                >
                  {turn.text}
                </p>
              ) : (
                <div
                  key={i}
                  className="minit-enter self-start rounded-md rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10"
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
                  {/* K1 ④: a prepared answer says so — honest about being free. */}
                  {turn.free && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      ⚡{" "}
                      <Tri
                        bm={PREPARED_FREE_NOTE.bm}
                        zh={PREPARED_FREE_NOTE.zh}
                        en={PREPARED_FREE_NOTE.en}
                      />
                    </p>
                  )}
                  <AnswerSources sources={turn.sources ?? []} lookups={turn.lookups ?? []} />
                  {/* §3 多成品卡片: what this turn produced, each a door. */}
                  {turn.products && turn.products.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2.5">
                      {turn.products.map((p, j) => (
                        <ProductCard
                          key={j}
                          parcel={p}
                          disabled={busy !== null}
                          onOpen={() => openProduct(p)}
                        />
                      ))}
                    </div>
                  )}
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

            {/* Waiting has to have a place to happen. Without this the only
                sign that anything is coming was the small word on the send
                button. */}
            {busy === "chat" && (
              <div className="minit-enter self-start rounded-md rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10">
                <p className="text-lg">
                  ⏳{" "}
                  <Tri
                    bm="MinitAI sedang berfikir… tunggu sekejap."
                    zh="MinitAI 正在想…… 请稍等。"
                    en="MinitAI is thinking… one moment."
                  />
                </p>
              </div>
            )}

            {/* K2-adjacent (work order 82): ONE compact row — the clear button
                (confirming first, §1-10) and the short counter. The old
                two-line explainer moved into the panel's ? popup; here the
                footer already says what costs what. */}
            {busy === null && turns.some((x) => x.role === "assistant") && (
              <div className="flex flex-wrap items-center gap-3">
                <ConfirmedAction
                  onConfirm={() => {
                    // Anything still in flight belongs to the conversation being
                    // thrown away — make sure it cannot land in the new one.
                    sendSeq.current++;
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
                  confirmLabel={
                    <Tri bm="Padam perbualan" zh="清除对话" en="Clear conversation" />
                  }
                  trigger={(open) => (
                    <Button variant="outline" onClick={open}>
                      <RotateCcw className="h-5 w-5" strokeWidth={2} />
                      <Tri bm="Padam perbualan" zh="清除对话" en="Clear conversation" />
                    </Button>
                  )}
                />
                {turnsLeft !== null && (
                  <span className="text-sm text-muted-foreground">
                    <Tri
                      bm={`Boleh tanya ${turnsLeft} lagi dalam perbualan ini`}
                      zh={`这轮还能问 ${turnsLeft} 题`}
                      en={`${turnsLeft} left in this conversation`}
                    />
                  </span>
                )}
                {/* §0-3 (work order 102): what is LEFT, beside the clear
                    button, with the money-saving reason to press it. The word
                    "baki/还剩/left" rides with the figure so it cannot be
                    misread the other way round. */}
                {usedPct !== null && (
                  <span className="text-sm text-muted-foreground">
                    <Tri
                      bm={`· Baki kuota AI ${Math.max(0, 100 - usedPct)}%. Padam perbualan menjimatkan kuota.`}
                      zh={`· AI 额度还剩 ${Math.max(0, 100 - usedPct)}%。清空对话较省用量。`}
                      en={`· ${Math.max(0, 100 - usedPct)}% of the AI quota left. Clearing the conversation saves quota.`}
                    />
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* §0-3: the newest answer scrolls into view INSIDE the region. */}

        {/* A-2: the staged files, visible and removable BEFORE anything is
            sent or charged. A-5: several photos stage together, each with a
            thumbnail, and "+ add another page" keeps the same picker open.
            §0-3 (102): the strip sits BESIDE the composer now — the paperclip
            that stages a file is one finger-width away. */}
        {staged.length > 0 && (
          <div
            data-probe="askback-card"
            className="flex flex-col gap-3 rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-3 dark:bg-white/10"
          >
            <div className="flex flex-wrap gap-3">
              {staged.map((s, i) => (
                <div
                  key={`${s.file.name}-${i}`}
                  className="relative flex w-28 flex-col items-center gap-1 rounded-sm border-2 border-[color:var(--v2-border)] bg-white/80 p-2 dark:bg-white/10"
                >
                  {s.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.preview}
                      alt={s.file.name}
                      className="h-20 w-full rounded-xs object-cover"
                    />
                  ) : (
                    <span className="flex h-20 w-full items-center justify-center text-4xl">
                      📄
                    </span>
                  )}
                  <span className="w-full truncate text-center text-xs" title={s.file.name}>
                    {s.file.name}
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      const next = staged.filter((_, j) => j !== i);
                      setStaged(next);
                      // The card's answer belonged to THAT paper. With the
                      // staging area empty it must not carry over to whatever
                      // the person picks next.
                      if (next.length === 0) setPresetKind(null);
                      setAskKind(null);
                      setConstitutionGate(null);
                    }}
                    className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--v2-border)] bg-white text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:bg-neutral-800 dark:hover:bg-red-400/10"
                    aria-label={t(
                      `Buang ${s.file.name}`,
                      `移除 ${s.file.name}`,
                      `Remove ${s.file.name}`,
                    )}
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
              ))}
              {/* Adding the next page must not mean hunting for the first
                  button again — the strip itself offers it (photos only:
                  a PDF/Office file is already a whole document). */}
              {staged.every((s) => s.file.type.startsWith("image/")) && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => fileInput.current?.click()}
                  className="flex w-28 flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-[color:var(--v2-border)] p-2 text-muted-foreground hover:border-[#a855f7]/60 hover:text-foreground"
                >
                  <span className="text-3xl leading-none">＋</span>
                  <span className="text-center text-xs">
                    <Tri bm="Tambah muka surat" zh="加下一页" en="Add next page" />
                  </span>
                </button>
              )}
            </div>
            {/* 🔴 §10 (104, J: 「上傳時選」). Two papers about one meeting are
                either its PAGES or two VERSIONS of it, and the app cannot
                tell — it can only see two files. Reading versions as pages is
                what produced J's document running "3. 4. 5." and then
                "1. 2.1 4. 5.": the same agenda twice, in two hands. So the
                person says which, before anything is paid for. */}
            {staged.length > 1 && (
              <fieldset
                data-probe="multi-mode"
                className="flex flex-col gap-1.5 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5"
              >
                <legend className="px-1 text-sm font-semibold">
                  <Tri
                    bm="Fail-fail ini ialah…"
                    zh="这几份是……"
                    en="These are…"
                  />
                </legend>
                {(
                  [
                    {
                      value: "pages" as const,
                      bm: "Muka surat yang berlainan bagi dokumen yang sama (m/s 1, m/s 2…)",
                      zh: "同一份的不同页（第 1 页、第 2 页…）",
                      en: "Different pages of the same document (page 1, page 2…)",
                    },
                    {
                      value: "versions" as const,
                      bm: "Versi berlainan bagi perkara yang sama — MinitAI guna yang paling lengkap",
                      zh: "同一件事的不同版本（一份简、一份详）—— MinitAI 用最详细的那份",
                      en: "Different versions of the same thing — MinitAI uses the fullest one",
                    },
                  ]
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-start gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="multi-mode"
                      value={opt.value}
                      data-probe={`multi-mode-${opt.value}`}
                      checked={multiMode === opt.value}
                      disabled={busy !== null}
                      onChange={() => setMultiMode(opt.value)}
                      className="mt-0.5 h-4 w-4 accent-[color:var(--v2-primary)]"
                    />
                    <Tri bm={opt.bm} zh={opt.zh} en={opt.en} />
                  </label>
                ))}
              </fieldset>
            )}
            <span className="text-sm text-muted-foreground">
              {staged.length > 1 ? (
                <Tri
                  bm={`${staged.length} fail ini dibaca sebagai SATU dokumen. Belum dihantar — tekan Hantar bila siap.`}
                  zh={`这 ${staged.length} 份会当成同一份文件来读。还没送出 —— 准备好按送出。`}
                  en={`These ${staged.length} files are read as ONE document. Not sent yet — press Send when ready.`}
                />
              ) : (
                <Tri
                  bm="Belum dihantar — boleh taip beberapa patah dahulu, kemudian tekan Hantar."
                  zh="还没送出 —— 可以先打几句说明，再按送出。"
                  en="Not sent yet — you can type a few words first, then press Send."
                />
              )}
              {/* §0-4 (102): the price BEFORE the work, as a share of the
                  monthly pool ("這份 5 頁，大約用 X%"). Recognise-then-read
                  is why it says "about".
                  🔴 §1 (105): SILENT from the moment the queue quotes this
                  document — while the gate is up AND while it is reading.
                  This line guesses from the FILE COUNT (one classify + one
                  read); the queue knows the real page count and quotes from
                  that. Both on screen at once is two numbers calling each
                  other liars — the exact thing 104 §5 was opened to kill. */}
              {queueGate === null && queue === null && (() => {
                const est = pctOfQuota(staged.length + 1, monthlyQuota);
                return est === null ? null : (
                  <>
                    {" "}
                    <Tri
                      bm={`Bacaan ini guna kira-kira ${est}% kuota bulanan.`}
                      zh={`这次读取大约用 ${est}% 的本月用量。`}
                      en={`This reading uses about ${est}% of the monthly quota.`}
                    />
                  </>
                );
              })()}
            </span>
            {/* §1 (109): the size limit is said HERE — once something is
                actually attached — and in the paperclip's tooltip. It used to
                stand under the empty box forever, which is the moment it is
                least useful and the moment J was looking at. */}
            <UploadLimitNote office />
          </div>
        )}

        {/* MinitAI could not place the page → it asks, with one-tap answers.
            Only the read is charged after the person answers. */}
        {askKind && staged.length > 0 && (
          <div
            data-probe="askback-card"
            className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/80 p-4 dark:bg-white/10"
          >
            <p className="text-lg">
              🤔{" "}
              <Tri
                bm={`MinitAI tidak pasti "${staged[0].file.name}" ini halaman jenis apa. Beritahu MinitAI — ia jenis yang mana?`}
                zh={`MinitAI 看不出「${staged[0].file.name}」是哪一种文件。告诉 MinitAI —— 这是哪一种？`}
                en={`MinitAI is not sure what kind of page "${staged[0].file.name}" is. Tell MinitAI — which is it?`}
              />
            </p>
            <div className="flex flex-wrap gap-2">
              {/* I-4① (26 号报告 §3-6): send what is in the box NOW — the
                  person often types more hints AFTER MinitAI asks, and the old
                  snapshot silently threw those away. */}
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFiles(
                    staged.map((s) => s.file),
                    question.trim() || askKind.context,
                    "meeting_notes",
                  )
                }
              >
                📝 <Tri bm="Nota mesyuarat" zh="会议笔记" en="Meeting notes" />
              </Button>
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFiles(
                    staged.map((s) => s.file),
                    question.trim() || askKind.context,
                    "ledger_page",
                  )
                }
              >
                🧾 <Tri bm="Halaman lejar derma" zh="捐款账页" en="Donation ledger page" />
              </Button>
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFiles(
                    staged.map((s) => s.file),
                    question.trim() || askKind.context,
                    "constitution",
                  )
                }
              >
                📜 <Tri bm="Perlembagaan" zh="章程" en="Constitution" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setStaged([]);
                  setPresetKind(null);
                  setAskKind(null);
                }}
              >
                <Tri bm="Bukan satu pun — batal" zh="都不是，取消" en="None of these — cancel" />
              </Button>
            </div>
          </div>
        )}

        {/* ④ (work order 85): the long PDF turned out to be a CONSTITUTION —
            say what reading it will cost and take, and read only on the
            person's own tap. Informative, not a wall: one button starts it. */}
        {constitutionGate && staged.length > 0 && (
          <div
            data-probe="askback-card"
            className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/80 p-4 dark:bg-white/10"
          >
            <p className="text-lg">
              📜{" "}
              <Tri
                bm={`"${staged[0].file.name}" ialah perlembagaan. Sebelum MinitAI membacanya:`}
                zh={`「${staged[0].file.name}」是一份章程。开始读之前，先说清楚：`}
                en={`"${staged[0].file.name}" is a constitution. Before MinitAI reads it:`}
              />
            </p>
            <ConstitutionReadEstimate pages={constitutionGate.pages} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void sendFiles(
                    staged.map((s) => s.file),
                    question.trim() || constitutionGate.context,
                    "constitution",
                    true,
                  )
                }
              >
                📖 <Tri bm="Mula baca" zh="开始读" en="Start reading" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setConstitutionGate(null)}
              >
                <Tri bm="Belum lagi" zh="先不读" en="Not yet" />
              </Button>
            </div>
          </div>
        )}

        {/* §1 (work order 105): a long PDF that will be read a FEW PAGES AT
            A TIME. Say what it will cost and how long it will take, then read
            it on the person's own tap — the same manners the constitution
            gate has, for the documents that used to simply fail. */}
        {queueGate && (
          <div
            data-probe="askback-card"
            data-card="queue-gate"
            className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/80 p-4 dark:bg-white/10"
          >
            <p className="text-lg">
              📚{" "}
              <Tri
                bm={`"${queueGate.fileName}" ada ${queueGate.estimate.pages} muka surat — terlalu panjang untuk dibaca sekali gus, jadi MinitAI akan membacanya sedikit demi sedikit.`}
                zh={`「${queueGate.fileName}」有 ${queueGate.estimate.pages} 页 —— 一次读不完，MinitAI 会一批一批慢慢读。`}
                en={`"${queueGate.fileName}" has ${queueGate.estimate.pages} pages — too long to read in one go, so MinitAI will read it a few pages at a time.`}
              />
            </p>
            <p className="text-base text-[color:var(--v2-text-soft)]">
              <Tri
                bm={`${queueGate.estimate.batches} bahagian · lebih kurang ${queueMinutes(queueGate.estimate.seconds)} minit${queueGate.estimate.quotaPct === null ? "" : ` · kira-kira ${queueGate.estimate.quotaPct}% kuota bulan ini`}`}
                zh={`分 ${queueGate.estimate.batches} 批 · 大约 ${queueMinutes(queueGate.estimate.seconds)} 分钟${queueGate.estimate.quotaPct === null ? "" : ` · 大约用本月用量的 ${queueGate.estimate.quotaPct}%`}`}
                en={`${queueGate.estimate.batches} parts · about ${queueMinutes(queueGate.estimate.seconds)} minute(s)${queueGate.estimate.quotaPct === null ? "" : ` · about ${queueGate.estimate.quotaPct}% of this month's quota`}`}
              />
            </p>
            <p className="text-base text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Anda boleh tutup halaman ini di tengah jalan — apa yang sudah dibaca disimpan, dan anda sambung semula bila-bila masa tanpa bayar dua kali."
                zh="中途关掉这一页也没关系 —— 已经读好的都留着，随时回来接着读，不会重扣。"
                en="You can close this page part-way through — what has been read is kept, and you continue any time without paying twice."
              />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void runQueue({
                    jobId: queueGate.jobId,
                    kind: queueGate.kind,
                    page: queueGate.page,
                    fileName: queueGate.fileName,
                    totalBatches: queueGate.estimate.batches,
                  })
                }
              >
                📖 <Tri bm="Mula baca" zh="开始读" en="Start reading" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setQueueGate(null)}
              >
                <Tri bm="Belum lagi" zh="先不读" en="Not yet" />
              </Button>
            </div>
          </div>
        )}

        {/* §1: where the queue has got to. A bar and a sentence — "part 3 of
            7" is the thing a person waiting actually wants to know. */}
        {queue && (
          <div
            data-probe="queue-progress"
            className="flex flex-col gap-2 rounded-md border-2 border-[color:var(--v2-primary)]/40 bg-white/80 p-4 dark:bg-white/10"
          >
            <p className="text-base font-medium">
              <Tri
                bm={`Membaca "${queue.fileName}" — bahagian ${Math.min(queue.batchesDone + 1, queue.totalBatches)} daripada ${queue.totalBatches}`}
                zh={`正在读「${queue.fileName}」—— 第 ${Math.min(queue.batchesDone + 1, queue.totalBatches)}／${queue.totalBatches} 批`}
                en={`Reading "${queue.fileName}" — part ${Math.min(queue.batchesDone + 1, queue.totalBatches)} of ${queue.totalBatches}`}
              />
            </p>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--v2-primary)]/15"
              role="progressbar"
              aria-valuenow={queue.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[color:var(--v2-primary)] transition-[width] duration-[var(--dur)] ease-[var(--ease-out)]"
                style={{ width: `${queue.percent}%` }}
              />
            </div>
            <p className="text-base text-[color:var(--v2-text-soft)]">
              {queue.waiting ? (
                <Tri
                  bm="Dokumen ini sedang dibaca di tetingkap lain — menunggu giliran."
                  zh="这份文件正在另一个视窗里读 —— 在等它。"
                  en="This document is being read in another window — waiting for it."
                />
              ) : (
                <Tri
                  bm="Boleh tutup halaman ini — bacaan disambung bila anda kembali."
                  zh="可以关掉这一页 —— 回来的时候接着读。"
                  en="You can close this page — it carries on when you come back."
                />
              )}
            </p>
          </div>
        )}

        {/* §1: a document this society left half-read — from this browser's
            own memory, or from another phone entirely. Closing the tab is not
            a failure, and this card is what makes that true on screen. */}
        {pickUp && !queue && (
          <div
            data-probe="askback-card"
            data-card="queue-pickup"
            className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4 dark:bg-amber-400/10"
          >
            <p className="text-lg">
              ⏸{" "}
              <Tri
                bm={`"${pickUp.fileName}" dibaca sampai bahagian ${pickUp.batchesDone} daripada ${pickUp.totalBatches}. Sambung dari situ?`}
                zh={`「${pickUp.fileName}」读到第 ${pickUp.batchesDone}／${pickUp.totalBatches} 批。要从那里接着读吗？`}
                en={`"${pickUp.fileName}" was read up to part ${pickUp.batchesDone} of ${pickUp.totalBatches}. Continue from there?`}
              />
            </p>
            <p className="text-base text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Muka surat yang sudah dibaca tidak dicaj semula."
                zh="已经读好的页不会重扣。"
                en="The pages already read are not charged again."
              />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() =>
                  void runQueue({
                    jobId: pickUp.jobId,
                    kind: pickUp.kind,
                    page: pickUp.kind === "ledger_page" ? "/money" : "/minutes",
                    fileName: pickUp.fileName,
                    totalBatches: pickUp.totalBatches,
                  })
                }
              >
                ▶ <Tri bm="Sambung baca" zh="接着读" en="Carry on reading" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  forgetOpenJob();
                  setPickUp(null);
                }}
              >
                <Tri bm="Nanti dulu" zh="先不用" en="Not now" />
              </Button>
            </div>
          </div>
        )}

        {/* §3 (work order 105): read as pages, but they look like ONE meeting
            written out twice. The app asks; it never decides. Both buttons are
            free — the readings are already paid for, and neither one opens a
            photo again. */}
        {repeatAsk && (
          <div
            data-probe="askback-card"
            data-card="repeat-pages"
            className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/40 bg-white/80 p-4 dark:bg-white/10"
          >
            <p className="text-lg font-medium">
              📄{" "}
              <Tri
                bm={`Muka surat ${repeatAsk.pageA} dan ${repeatAsk.pageB} nampak macam DUA VERSI mesyuarat yang sama — ${repeatAsk.matches} perkara yang sama muncul pada kedua-duanya.`}
                zh={`第 ${repeatAsk.pageA} 张和第 ${repeatAsk.pageB} 张看起来是同一场会的两个版本 —— 有 ${repeatAsk.matches} 件事两边都记了。`}
                en={`Page ${repeatAsk.pageA} and page ${repeatAsk.pageB} look like TWO VERSIONS of the same meeting — ${repeatAsk.matches} item(s) appear on both.`}
              />
            </p>
            <p className="text-base text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Kalau ya, MinitAI guna yang paling lengkap sebagai dokumen dan yang satu lagi hanya menambah apa yang tiada. Tiada gambar dibaca semula — kedua-dua pilihan ini percuma."
                zh="如果是，MinitAI 就用最完整的那一份当正文，另一份只补它没有的。照片不会重读 —— 这两个选择都不花用量。"
                en="If so, MinitAI uses the fullest one as the document and lets the other only add what it was missing. No photo is read again — both choices here are free."
              />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() => {
                  const a = repeatAsk.done;
                  setRepeatAsk(null);
                  deliverProducts({
                    kind: a.kind,
                    page: a.page,
                    merged: mergeMeetingVersions(a.readings as MeetingNotesExtraction[]),
                    label: a.label,
                    pages: a.pages,
                    actionsUsed: a.actionsUsed,
                    redoneAsVersions: true,
                  });
                }}
              >
                ✅ <Tri bm="Ya — guna yang paling lengkap" zh="是，用最详细的那份" en="Yes — use the fullest one" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  const a = repeatAsk.done;
                  setRepeatAsk(null);
                  deliverProducts({
                    kind: a.kind,
                    page: a.page,
                    merged: a.readings.reduce((acc, r) =>
                      acc === null ? r : mergeByKind(a.kind, acc, r),
                    ),
                    label: a.label,
                    pages: a.pages,
                    actionsUsed: a.actionsUsed,
                  });
                }}
              >
                <Tri bm="Tidak — ini muka surat berlainan" zh="不是，这是不同页" en="No — these are different pages" />
              </Button>
            </div>
          </div>
        )}

        {/* §4-② (work order 100): TWO MEETINGS ON ONE PAPER — the agent
            stops and asks which one (真件 A). The paid roads carry their
            price on the button; the free road uses what was already read. */}
        {meetingChoice && staged.length > 0 && (
          <div
            data-probe="askback-card"
            data-card="meeting-choice"
            className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/40 bg-white/80 p-4 dark:bg-white/10"
          >
            <p className="text-lg font-medium">
              📅{" "}
              <Tri
                bm="Kertas ini ada catatan LEBIH DARIPADA SATU mesyuarat. Yang mana satu mahu dibuat?"
                zh="这张纸上看到不止一场会议的记录。要做哪一场？"
                en="This paper carries notes from MORE THAN ONE meeting. Which one do you want?"
              />
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ...(meetingChoice.mainDate
                  ? [{ dateText: meetingChoice.mainDate, label: "" }]
                  : []),
                ...meetingChoice.options,
              ].map((o, i) => (
                <Button
                  key={`${o.dateText}-${i}`}
                  size="lg"
                  variant={i === 0 ? "default" : "outline"}
                  disabled={busy !== null}
                  onClick={() =>
                    void sendFiles(
                      staged.map((s) => s.file),
                      `Only extract the meeting dated "${o.dateText || o.label}". The paper also carries notes from other meetings — leave every item that belongs to another meeting out of every field. ${meetingChoice.context}`.trim(),
                      "meeting_notes",
                      undefined,
                      { meetingPicked: true },
                    )
                  }
                >
                  {o.dateText || o.label}
                  {/* §0-4 (102): the price on the button, in %, when the pool
                      is known — never a raw action count. */}
                  {(() => {
                    const est = pctOfQuota(staged.length, monthlyQuota);
                    return est === null
                      ? ` · ${t("baca semula", "重读一次", "re-read")}`
                      : ` · ${t(
                          `baca semula (kira-kira ${est}% kuota)`,
                          `重读一次（约 ${est}% 用量）`,
                          `re-read (about ${est}% of quota)`,
                        )}`;
                  })()}
                </Button>
              ))}
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  const r = meetingChoice.resume;
                  setMeetingChoice(null);
                  deliverProducts({
                    kind: r.kind,
                    page: r.page,
                    merged: r.merged,
                    label: r.label,
                    pages: r.pages,
                    actionsUsed: r.actionsUsed,
                  });
                }}
              >
                <Tri
                  bm="Semua dalam satu — guna apa yang sudah dibaca (percuma)"
                  zh="不用分，全部放一份 —— 用刚才读好的（免费）"
                  en="Keep it all in one — use what was read (free)"
                />
              </Button>
            </div>
          </div>
        )}
        {/* §1 (109): the error belongs INSIDE the pane. Outside it, an error
            appearing was one more thing that pushed the typing box down at
            exactly the moment somebody needed to retype something. */}
        {error && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-4 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {localizeError(error)}
          </p>
        )}

        {/* §1 (109): the month's allowance used to be spelled out in a
            permanent line under the box. It is now one thing beside "Clear
            conversation" (102 §0-3③) — EXCEPT when it has run out, which is
            not a statistic but the reason the box below is dead, so it stays
            on screen, in the pane, where it cannot move anything. */}
        {outOfQuota && (
          <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Bantuan AI untuk bulan ini sudah habis. Ia bermula semula pada 1 hari bulan depan — semua rekod dan dokumen anda masih boleh dibuka seperti biasa."
              zh="这个月的 AI 用量已经用完了。下个月 1 号会重新开始 —— 您所有的记录和文件都还能照常打开。"
              en="This month's AI help is used up. It starts again on the 1st of next month — all your records and documents still open as normal."
            />{" "}
            {/* C-3: a used-up meter needs a door, not just a date. */}
            <Link href="/settings/plan" className="underline underline-offset-4">
              <Tri bm="Lihat pelan" zh="看方案" en="See the plans" /> →
            </Link>
          </p>
        )}

        {/* 🔴 §1 + §2 (work order 113) — THE EMPTY STATE IS A SET OF DOORS.
            J: 「這個 HOME 一定要改…你做成 CARD，可以按有想要 UPLOAD 東西，
            或者問東西…這裏是 ALL IN ONE」.

            What stood here: two quiet lines of instructions and two small
            suggestion buttons. What stands here now: six cards that each
            start a real job, and the suggestions folded into one of them.

            🔴 IT IS INSIDE THIS PANE, and that is the whole discipline of
            this change. 104 §8 and 109 §1 both cured the same illness —
            something appears on the home page and the typing box slides down
            the screen. The cards are content of the SCROLLING conversation
            region, exactly like an answer or a finished-work card, so they
            cannot move the composer at any width in any state. `mt-auto`
            centres them in whatever room the pane has: bottom-anchored, the
            whole of J's 「中間那塊大留白」 simply moved to the top of the
            screen (measured: 250px of nothing above them). Auto margins are
            also the safe way to centre inside a SCROLLING box — when free
            space runs out they resolve to zero, so a short screen scrolls
            from the top instead of clipping it, which `justify-center` would
            do.

            §2: they leave when the conversation starts and come back when it
            is cleared — one fact, no remembered preference. */}
        {entryOpen && (
          <div data-probe="entry-cards-shell" className="my-auto">
            <div className="px-2 pt-6 pb-2">
              <EntryCards
                unfinished={unfinishedDrafts}
                canDictate={canDictate}
                questions={suggestedQuestionsFor(einvoisVisible)}
                disabled={busy !== null || outOfQuota}
                dragActive={dragActive}
                howItWorks={howItWorks}
                onPick={pickWithKind}
                onDictate={() => micStart.current?.()}
                onAsk={(text) => void send(text)}
              />
            </div>
          </div>
        )}

        <div ref={flowEndRef} aria-hidden />
        </div>


        {/* Type a question — or type context for the staged file. Enter sends;
            Shift+Enter makes a new line. One Send button for both paths (A-2):
            with a file staged it sends the file (plus the typed words as hints
            for the reader); without one it asks the assistant. §0-3 (102): the
            paperclip lives IN the composer, Claude-style.

            🔴 §8 (104): IT STAYS PUT. J: 「輸入框永遠在同一個位置，不用捲頁
            去找」.

            The way it stays put is the PANE ABOVE IT being a fixed size, not
            this bar floating over the page. Both were tried; floating loses.
            A `position: sticky` bar can only travel inside its own parent,
            and there is nothing below the composer for it to travel through —
            so on a phone it simply did not stick, and on a desktop it MOVED
            (measured: top 483 → 724) at the moment the page became long
            enough to scroll. Worse, a floating bar has to be told the height
            of the phone tab bar to avoid hiding behind it. A fixed pane plus a
            bar underneath it needs none of that and cannot drift.

            The negative margins let the bar's background reach the card's own
            edges, so it reads as the floor of the conversation. */}
        <div
          data-probe="composer"
          // §1 (109): the floor of the screen. It is the LAST child of a
          // column that is exactly one viewport tall, so its y is a fact of
          // the layout rather than something that has to be defended — no
          // sticky, no fixed, no z-index, nothing to know about the phone's
          // tab bar. shrink-0 keeps the pane above it giving way, never this.
          className="flex shrink-0 scroll-mb-24 flex-col gap-1.5 pt-1"
        >
        {/* ONE BOX (§1, J: 「把 CHATBOX 弄大」): the typing area, the
            paperclip and Send read as a single control the way Claude's and
            GPT's do, instead of three boxes in a row. On a phone the old row
            wrapped into a 380px-tall stack — nearly half the screen spent on
            the furniture around an empty text box. */}
        <form
          className="flex flex-col gap-1 rounded-md border-2 border-input bg-white p-2 transition-colors focus-within:border-[color:var(--v2-primary)]/70 dark:bg-white/5"
          onSubmit={(e) => {
            e.preventDefault();
            if (staged.length > 0) {
              // ④: with the price gate open, Send IS consent — going through
              // the classifier again would charge a second classify for a
              // question already answered.
              if (constitutionGate)
                void sendFiles(
                  staged.map((s) => s.file),
                  question.trim() || constitutionGate.context,
                  "constitution",
                  true,
                );
              // §1 (113): a card said what this paper is, so the classify
              // step is skipped and one action is saved. Undefined when the
              // file simply arrived — then it is classified, as always.
              else
                void sendFiles(
                  staged.map((s) => s.file),
                  question,
                  presetKind ?? undefined,
                );
            } else void send(question);
          }}
        >
          <label className="block">
            <span className="sr-only">
              {t("Soalan anda", "您的问题", "Your question")}
            </span>
            <textarea
              // A-1 (work order 27): the "Hand it to AI" task card focuses
              // this box by id — the card is a doorway to HERE, not a page.
              id="minit-ask-input"
              ref={inputRef}
              value={question}
              rows={1}
              disabled={!hasOrg || busy !== null || outOfQuota}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (staged.length > 0)
                    void sendFiles(
                      staged.map((s) => s.file),
                      question,
                      presetKind ?? undefined,
                    );
                  else void send(question);
                }
              }}
              placeholder={
                staged.length > 0
                  ? t(
                      "Nota untuk bacaan (pilihan)",
                      "写点提示帮助读取（选填）",
                      "A hint for the reading (optional)",
                    )
                  : t(
                      "cth: Bila saya kena hantar Penyata Tahunan?",
                      "例如：年度呈报什么时候要交？",
                      "e.g. When do I have to file the Annual Return?",
                    )
              }
              className="w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-lg leading-snug outline-none disabled:opacity-60"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
          {/* §0-3 (102): the paperclip — the standing upload door, now inside
              the box like Claude's. §1 (109): the size limit moved into its
              tooltip and into the strip that appears once something IS
              attached; a standing "Photos shrink automatically · up to 12MB"
              under an empty box was one of the four things J pointed at. */}
          <button
            type="button"
            aria-label={t(
              "Lampirkan gambar, PDF atau fail Office",
              "上传照片 / PDF / Office 档",
              "Attach a photo, PDF or Office file",
            )}
            title={t(
              `Lampirkan gambar, PDF atau fail Office · gambar dikecilkan automatik · maks ${UPLOAD_LIMIT_MB}MB`,
              `上传照片 / PDF / Office 档 · 照片会自动缩小 · 最大 ${UPLOAD_LIMIT_MB}MB`,
              `Attach a photo, PDF or Office file · photos shrink automatically · up to ${UPLOAD_LIMIT_MB}MB`,
            )}
            disabled={!hasOrg || busy !== null || outOfQuota}
            onClick={() => fileInput.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[color:var(--v2-text-soft)] transition-colors hover:bg-[color:var(--v2-primary)]/10 hover:text-[color:var(--v2-primary)] disabled:opacity-50"
          >
            <AttachIcon className="h-6 w-6" />
          </button>
          {/* C-4 (work order 27): speak instead of type — free, browser-side,
              never the AI quota. Renders nothing where unsupported. */}
          {hasOrg && !outOfQuota && (
            <VoiceButton
              bare
              // §1 (113): card 4 「剛開完會 → 用講的」 has no button of its
              // own — it borrows this one's start().
              startRef={micStart}
              onText={(text) =>
                setQuestion((q) => (q.trim() ? `${q.trim()} ${text}` : text))
              }
            />
          )}
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={
              !hasOrg ||
              busy !== null ||
              outOfQuota ||
              (staged.length === 0 && !question.trim())
            }
          >
            {busy !== null ? (
              <Tri bm="Sebentar…" zh="请稍等…" en="One moment…" />
            ) : staged.length > 0 ? (
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
          </div>
        </form>

        {/* §0-5 (work order 100): the standing three-language "AI can be
            wrong" line, Anthropic-style, right under the input. §1 (109):
            IT IS THE ONLY THING LEFT UNDER THE BOX — J listed everything else
            that used to be here (two suggestion buttons, the quota sentence,
            the size limit) as clutter, and each one has a better home above.
            This one stays because it is a safety notice, and it is three
            languages at once because the person reading over the treasurer's
            shoulder may not share the treasurer's interface language. */}
        <AiMistakesNote />
        </div>


    </section>
  );
}
