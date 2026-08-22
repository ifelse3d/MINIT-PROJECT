"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The two controls that were missing from every list in Minit: add a line, and
// take one away.
//
// J's UX list, root cause A (2026-08-07): "没有任何地方可以自己打字、自己加一行."
// A meeting reaches a decision after the note-taker has stopped writing; the AI
// reads a name off a smudge that was never a name. Neither could be dealt with,
// because data only ever flowed photo → AI → confirm → save.
//
// Deliberately plain: no model, no credit, no network. The pure part is
// lib/extraction-rows.ts.
// ---------------------------------------------------------------------------

/**
 * Wraps a row (which may be two or three FieldRows — a figure is a description
 * AND an amount) and puts a delete control on it.
 *
 * `hasContent` decides whether the tap asks first. A blank row somebody just
 * added by mistake should go on one tap; a row with a name in it should not.
 */
export function DeletableRow({
  children,
  onDelete,
  hasContent,
  /** What the confirmation calls this row, e.g. "Keputusan 3". */
  what,
}: {
  children: ReactNode;
  onDelete: () => void;
  hasContent: boolean;
  what: string;
}) {
  const t = useTriText();
  return (
    <div className="group/row relative">
      {children}
      <button
        type="button"
        onClick={() => {
          if (
            hasContent &&
            !window.confirm(
              t(
                `Buang "${what}"? Apa yang ditaip di dalamnya akan hilang.`,
                `要删掉「${what}」吗？里面填的东西会跟着不见。`,
                `Delete “${what}”? What was typed into it will be lost.`,
              ),
            )
          ) {
            return;
          }
          onDelete();
        }}
        // Always visible, never hover-only: on a phone there is no hover, and
        // this is the control somebody is hunting for when they are annoyed.
        className="absolute right-0 top-3 inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-400/10"
        aria-label={t(`Buang ${what}`, `删掉${what}`, `Delete ${what}`)}
        title={t(`Buang ${what}`, `删掉${what}`, `Delete ${what}`)}
      >
        <Trash2 aria-hidden className="size-5" strokeWidth={2} />
      </button>
    </div>
  );
}

/** "Add one myself" at the foot of a list. */
export function AddRowButton({
  onClick,
  labelBm,
  labelZh,
  labelEn,
}: {
  onClick: () => void;
  labelBm: string;
  labelZh: string;
  labelEn: string;
}) {
  return (
    <Button variant="outline" size="lg" className="mt-2 self-start text-base" onClick={onClick}>
      <Plus aria-hidden className="size-5" strokeWidth={2.4} />
      <Tri bm={labelBm} zh={labelZh} en={labelEn} />
    </Button>
  );
}
