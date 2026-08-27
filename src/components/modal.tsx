"use client";

import { useEffect, useRef, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// A small confirmation modal (work order 32: the P3 hand-over dialog and the
// P5 logout confirm both need one, and the repo had none — sheet.tsx is a
// side drawer). Deliberately minimal: fixed overlay, solid card, Escape and
// overlay-click close, focus moved in on open. No portal library, no
// animation dependency.
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
  /** true = max-w-2xl (itemised lists); default max-w-md. */
  wide?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog so keyboard users are not left behind it.
    cardRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-[color:var(--v2-card)] p-5 shadow-xl outline-none ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
