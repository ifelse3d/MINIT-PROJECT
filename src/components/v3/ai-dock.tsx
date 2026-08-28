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
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AIPanel } from "./ai-panel";

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 380;
const WIDTH_KEY = "minit.ai-dock.width";
const OPEN_KEY = "minit.ai-dock.open";
/** Tailwind `md` — the breakpoint where the sidebar and page gutters appear. */
const DESKTOP_QUERY = "(min-width: 768px)";

function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));
}

export type AIDockState = ReturnType<typeof useAIDock>;

/**
 * Owns the dock's open/width state. Lives in the app shell so the shell can
 * reserve room for the rail (`push`) in the same render that opens it.
 */
export function useAIDock() {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDesktop, setIsDesktop] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Nothing is restored until after mount, so server and client first paint
  // agree. Until then the dock is closed at its default width.
  const [ready, setReady] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Track the breakpoint and restore the saved preference in one pass, so a
  // rail left open on a laptop does not spring open as a sheet on a phone.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);

    try {
      const savedWidth = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(savedWidth) && savedWidth > 0) {
        setWidth(clampWidth(savedWidth));
      }
      if (mq.matches && localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      // Private mode / storage disabled: defaults are fine.
    }
    setReady(true);

    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggle = useCallback((next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const startResize = useCallback(() => setDragging(true), []);

  // Drag listeners go on the window, not the handle, so the pointer may leave
  // the 12px gutter mid-drag without the rail sticking.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      // 16px = the rail's right gutter (`pr-4`).
      setWidth(clampWidth(window.innerWidth - e.clientX - 16));
    };
    const stop = () => {
      setDragging(false);
      try {
        localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      } catch {
        /* ignore */
      }
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
    setWidth((w) => {
      const next = clampWidth(w + delta);
      try {
        localStorage.setItem(WIDTH_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
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
  blocked,
}: {
  dock: AIDockState;
  /** null = unknown (no org yet) */
  initialRemaining: number | null;
  /** Share of the monthly free quota already spent, 0–100. null = unknown. */
  initialUsedPct: number | null;
  blocked: boolean;
}) {
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
              initial={{ x: 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 32, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
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
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md p-3"
              >
                {/* 80vh, but never up into the top bar: on a short phone
                    viewport the sheet stops 3.5rem (the bar) + a breath
                    below the top (46 §0-2 — same rule on mobile). */}
                <div className="h-[80vh] max-h-[calc(100dvh-4.5rem)]">
                  <AIPanel
                    initialRemaining={initialRemaining}
                    initialUsedPct={initialUsedPct}
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
