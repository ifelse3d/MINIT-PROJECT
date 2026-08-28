"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { portalTarget } from "@/lib/portal-target";

// ---------------------------------------------------------------------------
// The confirmation modal (violet redesign spec §8) — ONE reusable pattern:
// logout, discard-unsaved-changes, danger-zone deletes, the hand-over
// dialog. 420px default (wide for itemised lists), 12px radius, backdrop
// rgba(21,18,31,.45) + 2px blur, Escape / backdrop / Cancel all dismiss.
// §8 behaviour: initial focus goes to the SAFE control — callers put
// `autoFocus` on their cancel button; the card itself is the fallback.
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the heading element inside, for aria-labelledby. */
  labelledBy: string;
  children: ReactNode;
  /** true = max-w-2xl (itemised lists); default 420px per §8. */
  wide?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus INTO the dialog. A caller's autoFocus (on its safe button)
    // wins because the browser applies it on mount, before this runs on an
    // element that is no longer document.activeElement's owner.
    if (!cardRef.current?.contains(document.activeElement)) {
      cardRef.current?.focus();
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portalled OUT of the caller's ancestors (a glass top bar's
  // backdrop-filter would become the containing block and cut the card off —
  // work order 46 §0-1) but INTO .v2-root, never <body>: the --v2-* tokens
  // live on .v2-root, and from <body> this card rendered as a bare
  // transparent rectangle (work order 51 C-1). See src/lib/portal-target.ts.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(21,18,31,0.45)] p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`max-h-full w-full overflow-y-auto rounded-lg border border-[color:var(--v2-border)] bg-[color:var(--v2-card-raised)] p-6 shadow-[var(--v2-shadow-lg)] outline-none ${
          wide ? "max-w-2xl" : "max-w-[420px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    portalTarget(),
  );
}

// ---------------------------------------------------------------------------
// §8: the one confirm dialog. `confirmPhrase` (danger zone, §7.5) keeps the
// confirm button disabled until the typed value matches exactly.
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  body,
  confirmLabel,
  destructive,
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** One line of copy — §8 has no separate title bar. */
  body: ReactNode;
  confirmLabel: ReactNode;
  destructive?: boolean;
  /** While the action is in flight both buttons disable. */
  busy?: boolean;
  /** Optional extra content (e.g. the confirmPhrase input) above the buttons. */
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="confirm-body">
      <div className="flex flex-col gap-4">
        <p id="confirm-body" className="text-base">
          {body}
        </p>
        {children}
        <div className="flex flex-wrap justify-end gap-2.5">
          {/* §8: initial focus on the SAFE option — Enter never destroys. */}
          <Button variant="outline" onClick={onClose} disabled={busy} autoFocus>
            <Tri bm="Batal" zh="取消" en="Cancel" />
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className={
              destructive
                ? "bg-[#dc2626] text-white shadow-none hover:bg-[#b91c1c]"
                : undefined
            }
          >
            {busy ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
