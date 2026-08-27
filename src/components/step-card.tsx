"use client";

// ---------------------------------------------------------------------------
// STEP CARD — the one layout primitive for Minit's task pages.
//
// WHY (user feedback, 2026-07-28: "太多太乱… 我也不懂要如何下手，哪里看这些东西")
//
// /minutes and /money were single pages ~4000px tall: twenty-odd expanded field
// rows, then a document preview, then an eROSES pack, then a manual-entry form,
// then cash custody, then a tax file. Everything was open at once and everything
// looked equally important, so the page answered no question at all — least of
// all "what do I do now?".
//
// The fix is not more explanation. It is showing LESS:
//
//   * One card per step, numbered, with a one-line plain-language summary.
//   * A STATUS on every card: done ✓ / needs you (N) / not yet possible / example.
//   * Collapsed by default. Exactly ONE card opens itself — the first one that
//     needs the person. Everything else is one tap away, never in the way.
//   * A locked step says WHY it is locked and links to the step that unlocks it,
//     instead of a disabled control with no explanation.
//
// Use <StepGroup> for a sub-section inside a step (e.g. "Attendees — 3 to check")
// when one step legitimately holds many rows.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, Check, ChevronDown, Lock } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// STEP FLOW (2026-07-28, user feedback: "太多东西要一个个滑下去才看得到")
//
// The cards were right; the NAVIGATION between them was missing. A person had
// to scroll, guess which card was theirs, and tap it open. Tabs were considered
// and rejected: these steps are ORDERED and DEPENDENT (no photo → nothing to
// check → no document), and tabs hide both the order and the progress, on a
// phone especially. So: keep the cards, add a way to move between them.
//
// StepFlow is that: one piece of shared state naming the card the page wants
// the person to be looking at. The sticky StepProgress rail sets it (tap step 3
// → step 3 opens and scrolls into view); StepNextButton sets it at the end of a
// card; StepCard listens and opens itself.
// ---------------------------------------------------------------------------

type StepFlowTarget = { id: string; nonce: number };

/** `nonce` so asking for the SAME card again still re-opens and re-scrolls. */
const StepFlowContext = createContext<{
  target: StepFlowTarget | null;
  goToStep: (id: string) => void;
}>({ target: null, goToStep: () => {} });

export function StepFlow({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<StepFlowTarget | null>(null);
  const goToStep = useCallback((id: string) => {
    setTarget((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const value = useMemo(() => ({ target, goToStep }), [target, goToStep]);
  return (
    <StepFlowContext.Provider value={value}>{children}</StepFlowContext.Provider>
  );
}

export function useStepFlow() {
  return useContext(StepFlowContext);
}

export type StepStatus =
  /** Nothing left to do here. */
  | "done"
  /** The person has to look at something. `count` says how many. */
  | "needs-you"
  /** Cannot be done yet — `lockedReason` must explain what unlocks it. */
  | "locked"
  /** Working, but on example data, so it must not be treated as real. */
  | "example"
  /** Informational card with no state of its own. */
  | "neutral";

const STATUS_STYLE: Record<StepStatus, { chip: string; edge: string }> = {
  done: {
    chip: "bg-green-100 text-green-900 border-green-400",
    edge: "border-green-300",
  },
  "needs-you": {
    chip: "bg-amber-100 text-amber-900 border-amber-400",
    edge: "border-amber-400",
  },
  locked: {
    chip: "bg-slate-100 text-slate-700 border-slate-300",
    edge: "border-slate-300",
  },
  example: {
    chip: "bg-violet-100 text-violet-900 border-violet-400",
    edge: "border-violet-300",
  },
  neutral: { chip: "bg-slate-100 text-slate-700 border-slate-300", edge: "" },
};

function StatusChip({ status, count }: { status: StepStatus; count?: number }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-center rounded-full border-2 px-3 text-base font-semibold ${s.chip}`}
    >
      {status === "done" && <Tri bm="✓ Siap" zh="✓ 完成" en="✓ Done" />}
      {status === "needs-you" && (
        <>
          {typeof count === "number" && count > 0 ? `${count} ` : ""}
          <Tri bm="perlu anda" zh="项要你看" en="need you" />
        </>
      )}
      {status === "locked" && (
        <Tri bm="Belum boleh" zh="还不能做" en="Not yet" />
      )}
      {status === "example" && <Tri bm="Contoh" zh="示范" en="Example" />}
    </span>
  );
}

export function StepCard({
  /**
   * Stable id so the progress rail and "next step" buttons can open this card.
   * Also the DOM id, so /#minutes-check style links work.
   */
  id,
  /** Shown in the big round number badge. Omit for a non-numbered card. */
  step,
  titleBm,
  titleZh,
  titleEn,
  /** One line, plain words: what this step is FOR. Not instructions. */
  summary,
  status = "neutral",
  count,
  /** Required when status is "locked": what has to happen first. */
  lockedReason,
  /**
   * Open on first render. Pass true for exactly ONE card per page — the first
   * one that needs the person. Callers usually compute this once.
   */
  defaultOpen = false,
  children,
}: {
  id?: string;
  step?: number;
  titleBm: string;
  titleZh: string;
  titleEn: string;
  summary?: ReactNode;
  status?: StepStatus;
  count?: number;
  lockedReason?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const t = useTriText();
  const [open, setOpen] = useState(defaultOpen);
  const s = STATUS_STYLE[status];
  const sectionRef = useRef<HTMLElement | null>(null);
  const { target } = useStepFlow();

  // A finished step still took a full card's height — five of those and the one
  // card that needed the person was below the fold. Done + closed collapses to a
  // single line: no summary, smaller badge, less padding.
  const compact = status === "done" && !open;

  const reveal = useCallback(() => {
    // Let the panel expand first, otherwise we measure the collapsed height.
    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  // `useState(defaultOpen)` reads the prop ONCE, at mount — and every page here
  // restores its state in an effect AFTER mount (saved work from localStorage, a
  // hand-off from the home page, the register hydrating). So without this, a
  // returning user always got step 1 auto-opened — the one step already finished —
  // and confirming the last field in step 2 left step 3 shut.
  //
  // Opens a card that becomes relevant; never force-closes one the person opened
  // themselves, because taking a panel away under someone's finger is worse than
  // leaving it open.
  //
  // 2026-07-28: it also SCROLLS now. Auto-opening a card the person cannot see
  // is the same as not opening it — they finished step 2, step 3 quietly
  // unlocked 800px further down, and the page looked like nothing happened.
  // Only when it becomes relevant AFTER mount: never yank the page on load.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!defaultOpen) return;
    setOpen(true);
    if (mountedRef.current) reveal();
  }, [defaultOpen, reveal]);

  // Declared after the effect above on purpose — so on the first commit that
  // effect still sees `false` and leaves the scroll position alone.
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  // The progress rail / a "next step" button asked for this card.
  useEffect(() => {
    if (!id || target?.id !== id) return;
    setOpen(true);
    reveal();
  }, [id, target?.id, target?.nonce, reveal]);

  return (
    <section
      id={id}
      ref={sectionRef}
      // scroll-mt keeps the card clear of the sticky progress rail.
      className={`v2-glass scroll-mt-28 overflow-hidden rounded-3xl border-2 ${
        s.edge || "border-transparent"
      }`}
    >
      {/* The whole header is the toggle — a big, obvious tap target, not a
          12px chevron in the corner. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-4 text-left hover:bg-white/50 dark:hover:bg-white/5 ${
          compact ? "p-3 sm:p-3.5" : "p-4 sm:p-5"
        }`}
      >
        {typeof step === "number" && (
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${
              compact
                ? "size-9 bg-green-600 text-base"
                : "size-11 bg-[color:var(--v2-primary-fill)] text-lg"
            }`}
          >
            {compact ? <Check className="size-5" strokeWidth={3} /> : step}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`font-heading font-semibold leading-snug ${
                compact ? "text-base" : "text-lg"
              }`}
            >
              <Tri bm={titleBm} zh={titleZh} en={titleEn} />
            </span>
            <StatusChip status={status} count={count} />
          </span>
          {/* Hidden once the step is done: it is instructions for work already
              finished, and it was the bulk of the scrolling. */}
          {summary && !compact && (
            <span className="mt-1 block text-base text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-full text-muted-foreground ${
            compact ? "size-9" : "size-11"
          }`}
        >
          <ChevronDown
            className={`transition-transform duration-200 ${
              compact ? "h-5 w-5" : "h-6 w-6"
            } ${open ? "rotate-180" : ""}`}
            strokeWidth={2.2}
          />
        </span>
        <span className="sr-only">
          {open
            ? t("Tutup bahagian ini", "收起这一段", "Collapse this section")
            : t("Buka bahagian ini", "展开这一段", "Expand this section")}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-[color:var(--v2-border)] p-4 sm:p-5">
          {status === "locked" && lockedReason ? (
            // A locked step explains itself instead of showing dead controls.
            <p className="rounded-xl border-2 border-slate-300 bg-slate-50 p-4 text-base font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
              {lockedReason}
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A collapsible sub-section INSIDE a step. Used where one step really does hold
 * many rows — /minutes has ~20 reviewable fields, which as a flat list was the
 * single worst wall of text in the app. Grouped, each group says how many rows
 * still need attention, and only the first unfinished group opens itself.
 */
export function StepGroup({
  titleBm,
  titleZh,
  titleEn,
  /** How many rows inside still need the person. 0 renders as done. */
  outstanding,
  total,
  defaultOpen = false,
  children,
}: {
  titleBm: string;
  titleZh: string;
  titleEn: string;
  outstanding: number;
  total: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = outstanding === 0;

  // Same reason as StepCard: the group that needs attention may only become
  // knowable after the page has restored its data.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <div
      className={`overflow-hidden rounded-2xl border-2 ${
        done ? "border-green-300" : "border-amber-400"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 p-3.5 text-left ${
          done
            ? "bg-green-50 dark:bg-green-400/10"
            : "bg-amber-50 dark:bg-amber-400/10"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold leading-snug">
            <Tri bm={titleBm} zh={titleZh} en={titleEn} />
          </span>
          <span className="mt-0.5 block text-base font-medium">
            {done ? (
              <span className="text-green-900 dark:text-green-100">
                ✓ <Tri bm="Semua disemak" zh="全部核对好了" en="All checked" /> ({total})
              </span>
            ) : (
              <span className="text-amber-900 dark:text-amber-100">
                {outstanding}{" "}
                <Tri
                  bm={`daripada ${total} perlu anda semak`}
                  zh={`项（共 ${total} 项）要你核对`}
                  en={`of ${total} still need your check`}
                />
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-6 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.2}
        />
      </button>
      {open && <div className="bg-white/60 p-3.5 dark:bg-white/5">{children}</div>}
    </div>
  );
}

export type StepProgressItem = {
  labelBm: string;
  labelZh: string;
  labelEn: string;
  status: StepStatus;
  /** How many things need the person in that step (shown on the chip). */
  count?: number;
  /** The StepCard `id` to open when this chip is tapped. */
  targetId?: string;
};

/**
 * The "where am I?" strip above the step cards — sticky, and every chip is a
 * button that opens its step and scrolls to it.
 *
 * 2026-07-28: this used to be a plain non-sticky row of chips. It told you where
 * you were only while you were at the top of the page, which is the one moment
 * you already knew, and it could not take you anywhere. Sticky + tappable is
 * what people wanted tabs FOR, without throwing away the order or the progress.
 * Scrolls sideways on a phone rather than wrapping into two rows of chrome.
 */
export function StepProgress({ steps }: { steps: StepProgressItem[] }) {
  const t = useTriText();
  const { goToStep } = useStepFlow();

  // Only the FIRST step that needs the person is marked as current — otherwise
  // "you are here" points at three places at once.
  const currentIndex = steps.findIndex((s) => s.status === "needs-you");

  return (
    <nav
      aria-label={t("Kemajuan", "进度", "Progress")}
      className="sticky top-0 z-20 py-2"
    >
      <ol className="v2-glass v2-scroll flex items-center gap-1 overflow-x-auto rounded-full px-2 py-2">
        {steps.map((s, i) => {
          const tone =
            s.status === "done"
              ? "border-green-400 bg-green-100 text-green-900"
              : s.status === "needs-you"
                ? "border-amber-400 bg-amber-100 text-amber-900"
                : s.status === "example"
                  ? "border-violet-400 bg-violet-100 text-violet-900"
                  : "border-slate-300 bg-slate-100 text-slate-600";
          const inner = (
            <>
              <span className="font-bold">{i + 1}</span>
              <Tri bm={s.labelBm} zh={s.labelZh} en={s.labelEn} />
              {s.status === "done" && (
                <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} />
              )}
              {s.status === "locked" && (
                <Lock aria-hidden className="size-4 shrink-0" strokeWidth={2.4} />
              )}
              {s.status === "needs-you" &&
                typeof s.count === "number" &&
                s.count > 0 && (
                  <span className="rounded-full bg-amber-900/10 px-2 text-sm font-bold">
                    {s.count}
                  </span>
                )}
            </>
          );
          const shape = `inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3 text-base font-medium ${tone}`;
          const targetId = s.targetId;
          return (
            <li key={i} className="flex shrink-0 items-center gap-1">
              {i > 0 && (
                <span
                  aria-hidden
                  className="h-0.5 w-2 shrink-0 rounded-full bg-slate-300"
                />
              )}
              {targetId ? (
                <button
                  type="button"
                  onClick={() => goToStep(targetId)}
                  aria-current={i === currentIndex ? "step" : undefined}
                  className={`${shape} hover:brightness-95 active:scale-95`}
                >
                  {inner}
                </button>
              ) : (
                <span
                  className={shape}
                  aria-current={i === currentIndex ? "step" : undefined}
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The button at the FOOT of a step that finishes it and moves the person on.
 * Without this, "what now?" was answered by scrolling and guessing.
 */
export function StepNextButton({
  targetId,
  labelBm,
  labelZh,
  labelEn,
  onClick,
}: {
  targetId: string;
  labelBm: string;
  labelZh: string;
  labelEn: string;
  /** Runs before the jump — e.g. save something. */
  onClick?: () => void;
}) {
  const { goToStep } = useStepFlow();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        goToStep(targetId);
      }}
      className="v2-pill inline-flex min-h-12 items-center gap-2 self-start rounded-full bg-[color:var(--v2-primary-fill)] px-5 py-3 text-base font-semibold text-white shadow-[0_10px_26px_-10px_rgba(21,128,61,0.5)]"
    >
      <Tri bm={labelBm} zh={labelZh} en={labelEn} />
      <ArrowRight aria-hidden className="size-5" strokeWidth={2.4} />
    </button>
  );
}

/**
 * The single sentence at the top of a task page answering "what do I do now?".
 * Every task page gets exactly one, and it changes as the person progresses.
 */
export function NextAction({
  children,
  tone = "action",
}: {
  children: ReactNode;
  tone?: "action" | "done" | "warning";
}) {
  const cls =
    tone === "done"
      ? "border-green-400 bg-green-50 text-green-900 dark:bg-green-400/10 dark:text-green-100"
      : tone === "warning"
        ? "border-red-400 bg-red-50 text-red-900 dark:bg-red-400/10 dark:text-red-100"
        : "border-[#7c6cf5]/50 bg-white/70 text-[color:var(--v2-text)] dark:bg-white/10";
  return (
    <p className={`rounded-2xl border-2 p-4 text-lg font-medium ${cls}`}>
      {children}
    </p>
  );
}
