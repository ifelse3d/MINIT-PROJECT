"use client";

// §1-10 (work order 69, J + tester both named it): EVERY destructive control
// confirms first — through the app's own ConfirmDialog (portal-target
// convention), never window.confirm. window.confirm is a bare browser box:
// it speaks the browser's language, not the reader's, ignores the design
// system, and on some mobile browsers can be suppressed ("prevent this page
// from creating additional dialogs") — a delete guard that can be turned off.
//
// One component, used everywhere: a button that OPENS the dialog; the real
// action runs only from the dialog's confirm.

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/modal";
import { Tri } from "@/components/language-provider";

/**
 * The same dialog for a trigger that is NOT a shadcn Button (icon chips,
 * underline links, custom-styled row buttons): `trigger` renders the control
 * and receives `open` to call from its onClick — so a site keeps its exact
 * look and only the bare window.confirm dies.
 */
export function ConfirmedAction({
  onConfirm,
  body,
  confirmLabel,
  busy = false,
  trigger,
}: {
  onConfirm: () => void;
  body?: ReactNode;
  confirmLabel?: ReactNode;
  busy?: boolean;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
        body={
          body ?? (
            <Tri
              bm="Padam? Ia tidak boleh dikembalikan."
              zh="确定删除？删了就找不回来了。"
              en="Delete? This cannot be undone."
            />
          )
        }
        confirmLabel={confirmLabel ?? <Tri bm="Padam" zh="删除" en="Delete" />}
        destructive
        busy={busy}
      />
    </>
  );
}

export function ConfirmingDeleteButton({
  onConfirm,
  body,
  confirmLabel,
  busy = false,
  disabled = false,
  size,
  variant = "ghost",
  className,
  children,
}: {
  /** Runs ONLY after the person confirms. */
  onConfirm: () => void;
  /** The dialog line; defaults to the standard cannot-be-undone sentence. */
  body?: ReactNode;
  confirmLabel?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  size?: "sm" | "lg" | "default" | "icon";
  variant?: "ghost" | "outline" | "default" | "destructive" | "secondary" | "link";
  className?: string;
  /** The button face (icon + label). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled || busy}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
        body={
          body ?? (
            <Tri
              bm="Padam? Ia tidak boleh dikembalikan."
              zh="确定删除？删了就找不回来了。"
              en="Delete? This cannot be undone."
            />
          )
        }
        confirmLabel={confirmLabel ?? <Tri bm="Padam" zh="删除" en="Delete" />}
        destructive
        busy={busy}
      />
    </>
  );
}
