"use client";

// ---------------------------------------------------------------------------
// AI DOCK — "Tanya Minit" as a docked rail, not a modal.
//
// 2026-08-08, PRODUCT DECISION. The assistant used to open as a modal drawer
// over a dimmed, blurred page. That was wrong for the way it is actually used:
// the answer almost always ends with "go to this page", and the member then had
// to close the assistant, do the thing, and re-open it — losing the transcript
// (it lives in component state only, see ai-panel.tsx) and their place in the
// conversation. A member who has never used a computer should be able to read
// the answer WHILE doing the thing it describes.
//
// So on tablet/desktop the panel is now a docked rail: no backdrop, nothing
// blurred, the page keeps working and keeps scrolling, links navigate underneath
// while the conversation stays put. The main column is given right padding equal
// to the rail's width, so nothing is ever hidden behind it.
//
// The rail is resizable (drag its left edge) and collapsible (the X in its
// header, back to the floating button). Width and open state persist in
// localStorage — no server round-trip, no PDPA surface: it is a layout
// preference, not a record.
//
// On phones there is no room to sit side by side, so it stays a bottom sheet.
// Even there the backdrop is transparent — it exists only to catch a tap
// outside — because "the screen went grey" reads as an error to our members.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AIPanel } from "./ai-panel";
import {
  notifyStorageChanged,
  useHydrated,
  useMediaQuery,
  useStoredString,
} from "@/lib/browser-store";

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 380;
const WIDTH_KEY = "minit.ai-dock.width";
const OPEN_KEY = "minit.ai-dock.open";
/** Tailwind `md` — the breakpoint where the sidebar and page gutters appear. */
const DESKTOP_QUERY = "(min-width: 768px)";

function clampWidth(w: number): number {
  // The fixed 640 ceiling let a tablet (768px, isDesktop) drag the rail out
  // until the page kept 128px — a column no layout survives. The ceiling now
  // also answers to the window: the page keeps at least ~380px beside the
  // rail (plus the 248px nav rail where it exists, ≥1024). Client-only
  // callers everywhere (restore effect, drag, nudge), so window is safe.
  let max = MAX_WIDTH;
  if (typeof window !== "undefined") {
    const vw = window.innerWidth;
    const room = vw >= 1024 ? vw - 248 - 380 : vw - 380;
    max = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, room));
  }
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(w)));
}

export type AIDockState = ReturnType<typeof useAIDock>;

/**
 * Owns the dock's open/width state. Lives in the app shell so the shell can
 * reserve room for the rail (`push`) in the same render that opens it.
 */
export function useAIDock() {
  // 130 §5: the breakpoint and the saved preferences are read as external
  // stores (false / null on the server, the browser's answer after
  // hydration) and the dock's state is DERIVED from them plus the person's
  // choices this visit — no effect copies them into state.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const ready = useHydrated();
  const savedWidth = useStoredString("local", WIDTH_KEY);
  const savedOpen = useStoredString("local", OPEN_KEY);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const [widthChoice, setWidthChoice] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const restoredWidth = (() => {
    const n = Number(savedWidth);
    return Number.isFinite(n) && n > 0 ? clampWidth(n) : DEFAULT_WIDTH;
  })();
  const width = widthChoice ?? restoredWidth;
  // A rail left open on a laptop does not spring open as a sheet on a phone:
  // the saved "open" only counts on a desktop-width viewport.
  const open = openChoice ?? (ready && isDesktop && savedOpen === "1");

  // The width at the moment a drag ends, for the write-back — kept in an
  // effect, never assigned during render.
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const toggle = useCallback((next: boolean) => {
    setOpenChoice(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    notifyStorageChanged();
  }, []);

  const startResize = useCallback(() => setDragging(true), []);

  // Drag listeners go on the window, not the handle, so the pointer may leave
  // the 12px gutter mid-drag without the rail sticking.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      // 16px = the rail's right gutter (`pr-4`).
      setWidthChoice(clampWidth(window.innerWidth - e.clientX - 16));
    };
    const stop = () => {
      setDragging(false);
      try {
        localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      } catch {
        /* ignore */
      }
      notifyStorageChanged();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging]);

  const nudgeWidth = useCallback((delta: number) => {
    const next = clampWidth(widthRef.current + delta);
    setWidthChoice(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      /* ignore */
    }
    notifyStorageChanged();
  }, []);

  return {
    open,
    setOpen: toggle,
    width,
    isDesktop,
    dragging,
    startResize,
    nudgeWidth,
    /** Horizontal room the page must give up. Phone sheets float, so 0. */
    push: ready && open && isDesktop ? width : 0,
  };
}

/** Floating launcher + the panel itself: docked rail on md+, sheet on phones. */
export function AIDock({
  dock,
  initialRemaining,
  initialUsedPct,
  initialQuota = null,
  blocked,
}: {
  dock: AIDockState;
  /** null = unknown (no org yet) */
  initialRemaining: number | null;
  /** Share of the monthly free quota already spent, 0–100. null = unknown. */
  initialUsedPct: number | null;
  /** The monthly pool (actions) — display-layer % conversion only (102). */
  initialQuota?: number | null;
  blocked: boolean;
}) {
  // 🔴 §4 (work order 109): a person who has asked their system for less
  // motion still gets the panel — it just APPEARS instead of sliding in from
  // the edge. Reduced motion means fewer and gentler, not none: the fade
  // stays, because it is what says something opened. globals.css already
  // does this for the Radix sheets and the rail; the assistant was the one
  // moving thing in the app that ignored the setting.
  const reduceMotion = useReducedMotion();

  const { open, setOpen, width, isDesktop, dragging, startResize, nudgeWidth } =
    dock;

  // Escape closes the phone sheet, which covers the page. The desktop rail is
  // not modal, so Escape belongs to whatever the member is actually typing in.
  useEffect(() => {
    if (!open || isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isDesktop, setOpen]);

  return (
    <div>
      {/* The launcher hides while the panel is up — the panel's own X closes it,
          and a button that re-opens what is already open only confuses. */}
      {!open && (
        <button
          type="button"
          aria-label="MinitAI"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          // bottom-20 on phones: the v3 tab bar owns the bottom edge (Stage R),
          // and a launcher sitting ON the 更多 tab is a mis-tap machine.
          // #5 (J review 27-evening): circular, with the logo's brand
          // gradient — not a flat fill.
          // NOT .v2-pill: that class sets a border-radius from plain CSS,
          // which outranks the rounded-full utility and had been squaring
          // this button off. It is one of the three things allowed a full
          // pill radius (avatars, this button, status dots).
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-[background,box-shadow,filter] duration-150 md:bottom-5 md:right-5"
          style={{
            marginBottom: "env(safe-area-inset-bottom)",
            background: "var(--v2-grad-brand)",
          }}
        >
          <Sparkles className="h-6 w-6" strokeWidth={1.8} />
        </button>
      )}

      <AnimatePresence>
        {open &&
          (isDesktop ? (
            <motion.aside
              key="ai-rail"
              initial={{ x: reduceMotion ? 0 : 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduceMotion ? 0 : 32, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.12 }
                  : { type: "spring", stiffness: 320, damping: 34 }
              }
              // NO backdrop element at all: the page behind stays clickable,
              // scrollable and un-dimmed. z-30 keeps it above page cards but
              // UNDER the sticky top bar (z-40); top-14 = the bar's h-14, so
              // the rail opens from the bar's bottom edge and never covers
              // Home/search/EN/moon/avatar (46 §0-2, J's red pen). Both are
              // rem so the user's text-size setting scales them together.
              className="fixed bottom-0 right-0 top-14 z-30 pb-4 pl-3 pr-4 pt-3"
              style={{ width }}
            >
              {/* Drag the left gutter to resize; arrow keys work too. */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize assistant"
                tabIndex={0}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    nudgeWidth(24);
                  }
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    nudgeWidth(-24);
                  }
                }}
                className="group absolute bottom-4 left-0 top-3 z-10 flex w-3 cursor-col-resize items-center justify-center focus:outline-none"
              >
                <span
                  className={
                    "h-16 w-1.5 rounded-full bg-[color:var(--v2-text-soft)]/25 transition-colors group-hover:bg-[#a855f7]/70 group-focus-visible:bg-[#a855f7] " +
                    (dragging ? "bg-[#a855f7]" : "")
                  }
                />
              </div>

              <AIPanel
                initialRemaining={initialRemaining}
                initialUsedPct={initialUsedPct}
                initialQuota={initialQuota}
                blocked={blocked}
                onClose={() => setOpen(false)}
                // Docked: following the "go to this page" button navigates the
                // page behind and the conversation stays open beside it. That
                // is the whole point of the change.
              />
            </motion.aside>
          ) : (
            <div key="ai-sheet">
              {/* Transparent, un-blurred: it only catches a tap outside. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40 bg-transparent"
              />
              <motion.div
                initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                transition={
                  reduceMotion
                    ? { duration: 0.12 }
                    : { type: "spring", stiffness: 320, damping: 32 }
                }
                className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md p-3"
              >
                {/* K3 (work order 82): the sheet takes ALL the room under the
                    top bar (3.5rem + a breath, 46 §0-2 — same rule as before,
                    without the 80vh haircut that wasted ~150px of a phone
                    screen while answers fought for space). dvh, not vh, so
                    the sheet shrinks WITH the keyboard and the input stays
                    on screen while typing. */}
                <div className="h-[calc(100dvh-4.5rem)]">
                  <AIPanel
                    initialRemaining={initialRemaining}
                    initialUsedPct={initialUsedPct}
                    initialQuota={initialQuota}
                    blocked={blocked}
                    onClose={() => setOpen(false)}
                    // A phone sheet covers the page, so following a link must
                    // close it or the member lands on a page they cannot see.
                    onNavigate={() => setOpen(false)}
                  />
                </div>
              </motion.div>
            </div>
          ))}
      </AnimatePresence>
    </div>
  );
}
