"use client";

// ---------------------------------------------------------------------------
// The "changed: old → new" card (work order 100 §0-4, tier-1 changes).
//
// The agent changed a reversible detail on the person's instruction; this
// card is the receipt AND the way back: old value struck through, new value
// bold, one undo button. The undo calls /api/agent-undo (zero AI, zero
// charge), which restores the old value from the agent_changes trace.
// Rendered by both chat surfaces (workbench + floating panel) — one copy.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

export type AgentChangeInfo = {
  changeId: number;
  memberName: string;
  position: string;
  field: string;
  oldValue: string;
  newValue: string;
  /** Set client-side after a successful undo — persisted with the turn. */
  undone?: boolean;
};

/** Field label the treasurer recognises, not the column name. */
function fieldLabel(field: string, t: (bm: string, zh: string, en: string) => string): string {
  switch (field) {
    case "phone":
      return t("telefon", "电话", "phone");
    case "email":
      return t("e-mel", "电邮", "email");
    case "state":
      return t("negeri", "州属", "state");
    case "honorific":
      return t("gelaran", "敬称", "honorific");
    case "note":
      return t("nota", "备注", "note");
    default:
      return field;
  }
}

export function AgentChangeCard({
  change,
  onUndone,
}: {
  change: AgentChangeInfo;
  /** Persist the undone flag wherever the turn lives. */
  onUndone: () => void;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    if (busy || change.undone) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId: change.changeId }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(
          body?.error ??
            t(
              "Tidak dapat memulihkan. Cuba sekali lagi.",
              "没能还原。请再试一次。",
              "Could not undo. Please try again.",
            ),
        );
        return;
      }
      onUndone();
    } catch {
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The connection dropped. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-3">
      <p className="text-sm font-semibold">
        {change.undone ? "↩ " : "✏️ "}
        {change.undone ? (
          <Tri bm="Dikembalikan" zh="已还原" en="Undone" />
        ) : (
          <Tri bm="Sudah diubah" zh="已改" en="Changed" />
        )}
        {" — "}
        {change.memberName}
        {change.position ? ` (${change.position})` : ""} ·{" "}
        {fieldLabel(change.field, t)}
      </p>
      <p className={`mt-1 text-base ${change.undone ? "opacity-60" : ""}`}>
        <span className="text-[color:var(--v2-text-soft)] line-through">
          {change.oldValue || t("(kosong)", "（空）", "(empty)")}
        </span>{" "}
        → <span className="font-semibold">{change.newValue}</span>
      </p>
      {error && (
        <p className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
          {localizeError(error)}
        </p>
      )}
      {!change.undone && (
        <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={undo}>
          <Undo2 className="h-4 w-4" strokeWidth={2.2} />
          {busy ? (
            <Tri bm="Memulihkan…" zh="还原中…" en="Undoing…" />
          ) : (
            <Tri bm="Asal semula" zh="还原" en="Undo" />
          )}
        </Button>
      )}
    </div>
  );
}
