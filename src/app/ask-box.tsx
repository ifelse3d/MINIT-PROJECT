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
  Sparkles,
  X,
} from "lucide-react";
import { AiMistakesNote } from "@/components/ai-disclaimer";
import { ConfirmedAction } from "@/components/confirm-delete";
import {
  matchPreparedAnswer,
  preparedButtonFor,
  PREPARED_FREE_NOTE,
  suggestedQuestionsFor,
} from "@/lib/prepared-answers";
import { useEinvoisVisible } from "@/lib/einvois-pref";
import { AttachIcon, ChooseFileLabel, UploadLimitNote } from "@/components/attach-icon";
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
import { ConstitutionReadEstimate } from "@/components/constitution-read-estimate";
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
import { VoiceButton } from "@/components/voice-input";
import { writeIntake, type IntakeKind } from "@/lib/intake-handoff";
import { compressPhoto } from "@/app/minutes/minutes-storage";
import { tidyReply } from "@/lib/tidy-reply";
import {
  AnswerSources,
  type AnswerSource,
} from "@/components/v3/answer-sources";
import { isTurnArray } from "@/components/v3/ai-panel";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";

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
      disabled={disabled}
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/35 bg-white/85 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-[color:var(--v2-primary)]/70 hover:shadow-[var(--v2-shadow-soft)] disabled:opacity-60 dark:bg-white/10"
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
  unfinishedDrafts = null,
  howItWorks,
}: {
  hasOrg: boolean;
  /** AI actions left this month; null when there is no organisation yet. */
  initialRemaining: number | null;
  /** Share of the monthly free quota spent, 0–100; null when unknown. */
  initialUsedPct: number | null;
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
  /** §3: the agent's work, visible step by step while a file is being read. */
  const [steps, setSteps] = useState<AgentStep[]>([]);
  /** Drag-and-drop highlight for the whole workbench (photos/PDF/Office). */
  const [dragActive, setDragActive] = useState(false);
  // Set when Minit could not place the page: it ASKS instead of giving up.
  // Holds the text that accompanied the failed attempt so the retry carries it.
  const [askKind, setAskKind] = useState<{ context: string } | null>(null);
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
   * I1 (work order 81): where a partly-read LONG constitution PDF can pick up
   * again — a failed segment keeps everything read so far here, and pressing
   * Send on the same staged file continues from that segment on the same
   * paid action instead of charging a fresh read.
   */
  const constitutionResumeRef = useRef<ConstitutionReadResume | null>(null);

  // K5 (work order 82): after a send, bring the newest bubble AND the input
  // (they are adjacent now) into view. A ref, not state: nothing re-renders,
  // and hydrating an old conversation on page load must NOT yank the page.
  const flowEndRef = useRef<HTMLDivElement | null>(null);
  const scrollPending = useRef(false);
  useEffect(() => {
    if (!scrollPending.current) return;
    flowEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (busy === null) scrollPending.current = false;
  }, [turns, busy]);

  const outOfQuota = remaining !== null && remaining <= 0;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy || outOfQuota) return;
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
  ) {
    if (busy || files.length === 0) return;
    setError(null);
    setAskKind(null);
    setConstitutionGate(null);
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
            setQuestion("");
            router.push("/constitution");
            return;
          }
          // Not a constitution: the classify is paid; the loop below reads
          // the WHOLE file with the answer as its forced kind, so nothing is
          // classified (or charged for classifying) twice.
        }
      }

      let merged: unknown = null;
      let page: string | null = null;
      let label: string | null = null;
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

      const mainParcel: ProductParcel = {
        kind,
        page,
        fileName: label ?? files[0].name,
        extraction: merged,
        storagePath: pages[0]?.storagePath ?? null,
        photoDataUrl: pages[0]?.photoDataUrl ?? null,
        pages,
      };

      // A constitution is a whole-book read with its own review flow — it
      // still goes straight to /constitution (same contract as the long-PDF
      // segmented path above).
      if (kind === "constitution") {
        writeIntake(mainParcel);
        setStaged([]);
        setQuestion("");
        router.push(page);
        return;
      }

      // §3: the work stays HERE, as cards — the person opens each finished
      // piece when they are ready, instead of being teleported mid-thought.
      pushStep(
        t("Susun hasilnya…", "整理成品…", "Putting the pieces together…"),
      );

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
              page_title: {
                value: "",
                confidence: "missing",
                source_ref: null,
              },
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

      // §4-⑨: the agent reports what it did, in plain words — what came
      // out, what to look at, and roughly what it cost. The classify (when
      // it ran) and each page's read are the metered actions.
      const actionsUsed = (forcedKind ? 0 : 1) + files.length;
      const m = kind === "meeting_notes" ? (merged as MeetingNotesExtraction) : null;
      const dateBit = m?.meeting_date.value ? ` (${m.meeting_date.value})` : "";
      const reportText =
        kind === "meeting_notes"
          ? t(
              `Siap. Saya baca nota itu dan sediakan minit mesyuarat${dateBit} — ${m!.resolutions.length} perkara.${moneyRows > 0 ? ` Saya juga ternampak ${moneyRows} baris wang — kad kedua di bawah kalau mahu rekod sekali.` : ""} Guna ${actionsUsed} tindakan AI. Buka kad untuk semak; apa-apa nak ubah, beritahu saya di halaman itu.`,
              `做好了。笔记读完，会议记录${dateBit ? `（${m!.meeting_date.value}）` : ""}整理出 ${m!.resolutions.length} 条内容。${moneyRows > 0 ? `我还看到 ${moneyRows} 笔钱 —— 想一起记账就点第二张卡。` : ""}这次用了 ${actionsUsed} 个 AI 动作。点卡片进去核对；要改哪里，进去后直接跟我说。`,
              `Done. I read the notes and prepared the meeting minutes${dateBit} — ${m!.resolutions.length} items.${moneyRows > 0 ? ` I also spotted ${moneyRows} money line(s) — the second card records them if you want.` : ""} Used ${actionsUsed} AI action(s). Open the card to check; tell me there if anything needs changing.`,
            )
          : t(
              `Siap. Halaman lejar itu sudah dibaca — buka kad di bawah untuk semak setiap baris. Guna ${actionsUsed} tindakan AI.`,
              `做好了。账页读完了 —— 点下面的卡片逐行核对。这次用了 ${actionsUsed} 个 AI 动作。`,
              `Done. The ledger page is read — open the card below to check each row. Used ${actionsUsed} AI action(s).`,
            );

      scrollPending.current = true;
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: reportText, products, free: false },
      ]);
      setSteps([]);
      setStaged([]);
      setQuestion("");
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

  return (
    <section
      className={`v2-glass-strong rounded-md border-2 p-4 transition-colors sm:p-6 ${
        dragActive
          ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary)]/5"
          : "border-[#a855f7]/40"
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-2xl font-semibold leading-snug">
          <Sparkles
            className="mr-1.5 inline h-6 w-6 align-[-3px] text-[color:var(--v2-primary)]"
            strokeWidth={2}
          />
          <Tri
            bm="Serahkan kepada MinitAI"
            zh="交给 MinitAI 帮你做"
            en="Hand it to MinitAI"
          />
        </h2>
        {howItWorks}
      </div>

      {/* G3-3: the unfinished-drafts reminder, moved off the deleted task
          card. Only when the count is KNOWN and non-zero — a failed query
          must never read like "you have none". */}
      {hasOrg && unfinishedDrafts !== null && unfinishedDrafts > 0 && (
        <p className="mt-2 text-base text-[color:var(--v2-text-soft)]">
          ✍️{" "}
          <Tri
            bm={`Ada ${unfinishedDrafts} draf minit yang belum siap.`}
            zh={`您有 ${unfinishedDrafts} 份还没做完的会议记录草稿。`}
            en={`You have ${unfinishedDrafts} unfinished minutes draft(s).`}
          />{" "}
          <Link href="/minutes/drafts" className="underline underline-offset-4">
            <Tri bm="Sambung" zh="继续做" en="Continue" /> →
          </Link>
        </p>
      )}
      {/* 2026-07-28 — the long paragraph that used to sit here ("send a photo of
          it here and MinitAI will work out what it is…") is gone. It explained in
          words what the two buttons and the question box below it already say,
          and it read like notes to ourselves rather than something a user needs. */}

      {!hasOrg && (
        <p className="mt-4 rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
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

      {/* --- the one way in (#8, J review 27-evening: photo and file are ONE
          button; a phone's picker offers the camera when `capture` is off) --- */}
      <div className="mt-4 flex flex-col gap-3">
        {turns.length === 0 && staged.length === 0 && busy === null && hasOrg ? (
          /* EMPTY-STATE HERO (§3): the whole door, big enough to be the
             point of the page. Click = the same picker; drop works on the
             whole workbench. */
          <button
            type="button"
            disabled={outOfQuota}
            onClick={() => fileInput.current?.click()}
            className="group flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[color:var(--v2-primary)]/45 bg-white/50 px-6 py-8 text-center transition-colors hover:border-[color:var(--v2-primary)] hover:bg-[color:var(--v2-primary)]/5 disabled:opacity-50 dark:bg-white/5"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--v2-primary)]/10 text-[color:var(--v2-primary)] transition-transform group-hover:scale-110">
              <AttachIcon className="h-7 w-7" />
            </span>
            <span className="text-xl font-semibold">
              <Tri
                bm="Letak kertas anda di sini"
                zh="把手上的纸丢进来"
                en="Drop your paper here"
              />
            </span>
            <span className="max-w-md text-base text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Gambar / PDF / fail Office. MinitAI kenal sendiri — nota mesyuarat, lejar derma atau perlembagaan — baca, dan siapkan dokumennya."
                zh="照片 / PDF / Office 档。MinitAI 自己认得出是会议笔记、捐款账页还是章程 —— 读完直接帮你做成文件。"
                en="Photo / PDF / Office file. MinitAI works out what it is — meeting notes, a donation ledger or the constitution — reads it, and prepares the documents."
              />
            </span>
            <span className="text-sm text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Tekan untuk pilih fail, atau seret masuk. Soalan? Taip di bawah."
                zh="点击选档，或直接拖进来。有问题？在下面打字问。"
                en="Tap to choose a file, or drag one in. Got a question? Type below."
              />
            </span>
            {/* D0-3 (拍板 4): the size limit stays at the door, in writing. */}
            <UploadLimitNote office />
          </button>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={!hasOrg || busy !== null || outOfQuota}
              onClick={() => fileInput.current?.click()}
            >
              <AttachIcon className="h-5 w-5" />
              {/* Brackets differ from the standard label on purpose: this one
                  also takes Word, Excel and PowerPoint (拍板 3). */}
              {/* C-3: the full list ("Word, Excel or PowerPoint…") made the
                  button two lines on a phone — "Office" covers all three. */}
              <ChooseFileLabel
                bm="gambar, PDF atau fail Office"
                zh="照片 / PDF / Office"
                en="photo, PDF or Office file"
              />
            </Button>
            {/* D0-3 (拍板 4): the remaining size limit, at the door, in writing. */}
            <UploadLimitNote office />
          </div>
        )}

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

        {/* A-2: the staged files, visible and removable BEFORE anything is
            sent or charged. A-5: several photos stage together, each with a
            thumbnail, and "+ add another page" keeps the same picker open. */}
        {staged.length > 0 && (
          <div className="flex flex-col gap-3 rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-3 dark:bg-white/10">
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
                      setStaged((prev) => prev.filter((_, j) => j !== i));
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
            <span className="text-sm text-muted-foreground">
              {staged.length > 1 ? (
                <Tri
                  bm={`${staged.length} gambar akan dibaca sebagai SATU dokumen (muka surat demi muka surat). Belum dihantar — tekan Hantar bila siap.`}
                  zh={`这 ${staged.length} 张会当成同一份文件、一页一页读。还没送出 —— 准备好按送出。`}
                  en={`These ${staged.length} photos will be read as ONE document, page by page. Not sent yet — press Send when ready.`}
                />
              ) : (
                <Tri
                  bm="Belum dihantar — boleh taip beberapa patah dahulu, kemudian tekan Hantar."
                  zh="还没送出 —— 可以先打几句说明，再按送出。"
                  en="Not sent yet — you can type a few words first, then press Send."
                />
              )}
            </span>
          </div>
        )}

        {/* MinitAI could not place the page → it asks, with one-tap answers.
            Only the read is charged after the person answers. */}
        {askKind && staged.length > 0 && (
          <div className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/80 p-4 dark:bg-white/10">
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
          <div className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/80 p-4 dark:bg-white/10">
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
                </div>
              ),
            )}

            {/* Waiting has to have a place to happen. Without this the only
                sign that anything is coming was the small word on the send
                button. */}
            {busy === "chat" && (
              <div className="self-start rounded-md rounded-bl-md border-2 border-[color:var(--v2-border)] bg-white/80 px-4 py-3 sm:max-w-[85%] dark:bg-white/10">
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
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-4 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {localizeError(error)}
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
              else void sendFiles(staged.map((s) => s.file), question);
            } else void send(question);
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
                  if (staged.length > 0)
                    void sendFiles(staged.map((s) => s.file), question);
                  else void send(question);
                }
              }}
              placeholder={
                staged.length > 0
                  ? t(
                      "Apa-apa yang membantu bacaan — ejaan nama, singkatan, tarikh (pilihan).",
                      "写点帮助读取的话 —— 名字的写法、缩写、日期（选填）。",
                      "Anything that helps the reading — name spellings, abbreviations, dates (optional).",
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
        </form>

        {/* §0-5 (work order 100): the standing three-language "AI can be
            wrong" line, Anthropic-style, right under the input. */}
        <AiMistakesNote />

        {/* K5: the newest answer sits right above this anchor and the input —
            scrolled into view together after every send. */}
        <div ref={flowEndRef} aria-hidden />

        {turns.length === 0 && hasOrg && (
          <div className="flex flex-wrap gap-2">
            {suggestedQuestionsFor(einvoisVisible).map((ex) => (
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
            }${remaining === null ? "" : ` Baki ${remaining} tindakan.`}`}
            zh={`在这里提问或上传照片会用本月的 AI 用量。${
              usedPct === null ? "" : `本月已用 ${usedPct}%。`
            }${remaining === null ? "" : `还剩 ${remaining} 次。`}`}
            en={`Questions and photos here use the monthly AI allowance.${
              usedPct === null ? "" : ` ${usedPct}% used this month.`
            }${remaining === null ? "" : ` ${remaining} actions left.`}`}
          />
        )}
      </p>
    </section>
  );
}
