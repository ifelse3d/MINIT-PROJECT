"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri, useTriText } from "@/components/language-provider";
import type { Confidence } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// The ONE shared "AI drafts → you fix → you confirm" control (CLAUDE.md rule 9
// + the eROSES design law). Every review screen uses this so the whole app
// behaves the same way:
//   • green "Disahkan" badge = AI is confident        → tap nothing
//   • amber "Semak" badge     = AI wants a human check → tap "Sahkan" or "Ubah"
//   • red   "Tiada" badge     = AI found nothing       → tap "Isi" and type it
// A human edit becomes the source of truth (confidence → confirmed). Amounts
// are validated by the caller (deterministic TS), never the AI — Hard Rule 2.
// ---------------------------------------------------------------------------

export type ReviewField = {
  value: string;
  confidence: Confidence;
  source_ref: { location: string; snippet: string } | null;
};

export function EditableField({
  labelBm,
  labelZh,
  labelEn,
  confidence,
  display,
  editText,
  sourceRef,
  kind = "text",
  onConfirm,
  onSave,
  onMarkAbsent,
}: {
  labelBm: string;
  labelZh: string;
  labelEn: string;
  confidence: Confidence;
  /** Pretty value shown when NOT editing (e.g. "RM50.00"). */
  display: string;
  /** Raw string pre-filled into the input when editing starts. */
  editText: string;
  sourceRef: { location: string; snippet: string } | null;
  /** Controls the input type + hint. "amount" expects an RM string. */
  kind?: "text" | "date" | "amount";
  onConfirm: () => void;
  /** Apply the typed value. Return an error message to keep editing, or null on success. */
  onSave: (raw: string) => string | null;
  /**
   * Escape hatch for a fact that genuinely is not in the notes.
   *
   * 2026-07-28 audit, P0: a `missing` field blocked "Save to history" forever,
   * and the only way to unblock it was to TYPE something. For a fact that was
   * never written down (e.g. nobody recorded who the treasurer was) that pushed
   * invention onto the human — the exact opposite of Hard Rule 1. Supplying
   * this callback adds a "not in the notes" button that marks the field
   * reviewed while keeping its value empty, so the generated document shows an
   * honest blank instead of a guess.
   */
  onMarkAbsent?: () => void;
}) {
  const t = useTriText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editText);
  const [error, setError] = useState<string | null>(null);

  const isMissing = confidence === "missing";

  function startEditing() {
    setDraft(editText);
    setError(null);
    setEditing(true);
  }

  function save() {
    const err = onSave(kind === "text" ? draft.trim() : draft.trim());
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-44 text-base font-semibold">
          <Tri bm={labelBm} zh={labelZh} en={labelEn} />
        </span>
        <ConfidenceBadge level={confidence} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              inputMode={kind === "amount" ? "decimal" : undefined}
              type={kind === "date" ? "date" : "text"}
              placeholder={kind === "amount" ? "RM 0.00" : undefined}
              onChange={(ev) => setDraft(ev.target.value)}
              className="h-12 w-full max-w-md rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
              aria-label={t(
                `Nilai untuk ${labelBm}`,
                `${labelZh}的内容`,
                `${labelEn} value`
              )}
            />
            <Button onClick={save}>
              <Tri bm="Simpan" zh="保存" en="Save" />
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </>
        ) : (
          <>
            <span
              className={
                isMissing
                  ? "text-base font-medium text-red-700 italic"
                  : "text-base"
              }
            >
              {isMissing ? (
                <Tri bm="— tiada —" zh="— 没有 —" en="— not found —" />
              ) : (
                display
              )}
            </span>
            {confidence === "check" && (
              <Button variant="outline" onClick={onConfirm}>
                ✓&nbsp;<Tri bm="Betul" zh="没错" en="Correct" />
              </Button>
            )}
            <Button variant="outline" onClick={startEditing}>
              {isMissing ? (
                <Tri bm="Isi sendiri" zh="自己填写" en="Fill in" />
              ) : (
                <Tri bm="Ubah" zh="修改" en="Edit" />
              )}
            </Button>
            {isMissing && onMarkAbsent && (
              <Button variant="outline" onClick={onMarkAbsent}>
                <Tri
                  bm="Tiada dalam nota"
                  zh="笔记里没写"
                  en="Not in the notes"
                />
              </Button>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="text-base font-semibold text-red-700">{error}</p>
      )}

      {sourceRef && (
        <p className="text-base text-muted-foreground">
          <Tri bm="AI baca di" zh="AI 读到的位置" en="The AI read this at" />{" "}
          {sourceRef.location} · <span className="font-mono">&ldquo;{sourceRef.snippet}&rdquo;</span>
        </p>
      )}
      {!sourceRef && !isMissing && (
        <p className="text-base text-muted-foreground">
          {t("Diisi oleh anda", "由您填写", "Entered by you")}
        </p>
      )}
      {isMissing && (
        <p className="text-base text-muted-foreground">
          {t(
            "AI tidak jumpa ini dalam nota anda — ia tidak akan mengarang.",
            "AI 在您的笔记里找不到这一项 —— 它不会自己编。",
            "The AI could not find this in your notes — it will not invent it."
          )}
        </p>
      )}
    </div>
  );
}
