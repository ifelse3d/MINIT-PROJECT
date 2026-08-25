"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri, useTriText } from "@/components/language-provider";
import type { Confidence } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// Review surface for AI extractions. One extracted row = one record; every
// cell stays individually editable and confirmable.
// Colour semantics are the product law: confirmed=green, check=amber,
// missing=red.
//
// 2026-07-28 ELDERLY-USABILITY REWRITE. Three P0 findings lived in this file:
//
//   1. The source snippet — "what the AI actually read", the product's entire
//      trust mechanism — sat in a Radix HoverCard on a 10x10px dot. Radix
//      HoverCard NEVER opens from touch, so on the Android phone our users
//      actually hold, that evidence was unreachable. It is now a tap-to-open
//      panel behind a 44px button.
//   2. The reason a ledger row is not yet eligible for a receipt was also
//      hover-only, so a treasurer faced a disabled "add to register" button
//      with no reachable explanation of why. The warning is now always visible.
//   3. Six columns in a horizontally-scrolling table on a 360px screen meant
//      two-axis scrolling to review money. Below `sm` the same data now renders
//      as a stacked card per row; the table returns at `sm` and up.
//
// Do not reintroduce HoverCard here. If information matters, it must be
// reachable with a finger.
// ---------------------------------------------------------------------------

export type ExtractionCell = {
  /** Pretty value shown when NOT editing (e.g. "RM50.00"). */
  display: string;
  /** Raw string pre-filled into the input when editing starts. */
  editText: string;
  confidence: Confidence;
  sourceRef: { location: string; snippet: string } | null;
  kind?: "text" | "date" | "amount";
  /** Absent = the cell is READ-ONLY (Stage 0-1: sample rows). The value is
   *  plain text, there is no confirm button, and tapping it does nothing —
   *  the source snippet stays reachable. */
  onConfirm?: () => void;
  /** Apply the typed value. Return an error message to keep editing, or null
   *  on success. Absent = read-only, same as onConfirm. */
  onSave?: (raw: string) => string | null;
};

export type ExtractionRow = {
  cells: ExtractionCell[];
  /** Row-level status chip (worst of the fields). */
  status: Confidence;
  /** Optional row warning (e.g. "not eligible for a receipt yet"). */
  warning?: ReactNode;
};

const DOT_CLASS: Record<Confidence, string> = {
  confirmed: "bg-green-600",
  check: "bg-amber-500",
  missing: "bg-red-600",
};

function EditableCell({ cell, label }: { cell: ExtractionCell; label?: ReactNode }) {
  const t = useTriText();
  const [editing, setEditing] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [draft, setDraft] = useState(cell.editText);
  const [error, setError] = useState<string | null>(null);
  const kind = cell.kind ?? "text";
  const isMissing = cell.confidence === "missing";
  const readOnly = !cell.onSave;

  function startEditing() {
    setDraft(cell.editText);
    setError(null);
    setEditing(true);
  }

  function save() {
    const err = cell.onSave ? cell.onSave(draft.trim()) : null;
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex min-w-40 flex-col gap-2">
        {label && <div className="font-medium text-muted-foreground">{label}</div>}
        <input
          autoFocus
          value={draft}
          inputMode={kind === "amount" ? "decimal" : undefined}
          type={kind === "date" ? "date" : "text"}
          placeholder={kind === "amount" ? "RM 0.00" : undefined}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") save();
            if (ev.key === "Escape") setEditing(false);
          }}
          // h-12: a 26px input was not tappable or readable for our users.
          className="h-12 w-full min-w-32 rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save}>
            <Tri bm="Simpan" zh="保存" en="Save" />
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}>
            <Tri bm="Batal" zh="取消" en="Cancel" />
          </Button>
        </div>
        {error && <p className="font-semibold text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <div className="font-medium text-muted-foreground">{label}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Confidence dot — TAP (not hover) for the source snippet.
            The button is 44px so a finger can hit it; the coloured dot inside
            stays small so the table does not become a row of traffic lights. */}
        <button
          type="button"
          aria-expanded={showSource}
          aria-label={t(
            "Apa yang AI baca di sini",
            "查看 AI 在这里读到什么",
            "What the AI read here"
          )}
          onClick={() => setShowSource((v) => !v)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted/60"
        >
          <span
            className={`size-3.5 rounded-full ring-2 ring-white ${DOT_CLASS[cell.confidence]}`}
          />
        </button>

        {/* Value — tap to edit; plain text when the row is read-only.
            min-h-11 so the tap target is real. */}
        {readOnly ? (
          <span
            className={`min-h-11 px-2 py-1 text-left text-base ${
              isMissing ? "font-medium text-red-700 italic" : ""
            }`}
          >
            {isMissing ? (
              <Tri bm="— tiada —" zh="— 没有 —" en="— not found —" />
            ) : (
              cell.display
            )}
          </span>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={`min-h-11 rounded-lg px-2 py-1 text-left text-base underline decoration-dotted decoration-1 underline-offset-4 hover:bg-muted/60 ${
              isMissing ? "font-medium text-red-700 italic" : ""
            }`}
          >
            {isMissing ? (
              <Tri bm="— tiada —" zh="— 没有 —" en="— not found —" />
            ) : (
              cell.display
            )}
          </button>
        )}

        {/* Quick confirm for amber fields, right in the cell. */}
        {cell.confidence === "check" && cell.onConfirm && (
          <Button variant="outline" onClick={cell.onConfirm}>
            ✓&nbsp;<Tri bm="Betul" zh="没错" en="Correct" />
          </Button>
        )}
      </div>

      {showSource && (
        <div className="mt-1 rounded-lg border border-input bg-white/80 p-3 dark:bg-white/5">
          <div className="mb-2">
            <ConfidenceBadge level={cell.confidence} />
          </div>
          {cell.sourceRef ? (
            <p className="text-base">
              <span className="font-medium">
                <Tri bm="AI baca di" zh="AI 读到的位置" en="The AI read this at" />
              </span>{" "}
              {cell.sourceRef.location}
              <br />
              <span className="font-mono">&ldquo;{cell.sourceRef.snippet}&rdquo;</span>
            </p>
          ) : (
            <p className="text-base">
              {isMissing
                ? t(
                    "Tiada dalam gambar / nota anda. AI tidak akan mengarang.",
                    "您的照片／笔记里没有这一项。AI 不会自己编。",
                    "Not in your photo or notes. The AI will not invent it."
                  )
                : t("Diisi oleh anda", "由您填写", "Entered by you")}
            </p>
          )}
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => setShowSource(false)}
          >
            <Tri bm="Tutup" zh="关闭" en="Close" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ExtractionTable({
  headers,
  rows,
}: {
  /** Column headers, one per cell (the # and Status columns are added automatically). */
  headers: { bm: string; zh: string; en: string }[];
  rows: ExtractionRow[];
}) {
  return (
    <>
      {/* PHONE: one card per row, no sideways scrolling. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 ${
              row.warning ? "border-amber-400 bg-amber-50 dark:bg-amber-400/10" : "bg-white/70 dark:bg-white/5"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                <Tri bm="Baris" zh="第" en="Row" /> {i + 1}
              </span>
              <ConfidenceBadge level={row.status} />
            </div>
            <div className="flex flex-col gap-3">
              {row.cells.map((cell, j) => (
                <EditableCell
                  key={j}
                  cell={cell}
                  label={
                    headers[j] ? (
                      <Tri bm={headers[j].bm} zh={headers[j].zh} en={headers[j].en} />
                    ) : undefined
                  }
                />
              ))}
            </div>
            {/* Always visible, never a hover card. */}
            {row.warning && (
              <p className="mt-3 rounded-lg bg-amber-100 p-2.5 font-medium text-amber-900">
                ⚠ {row.warning}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* TABLET / DESKTOP: the compact table. */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              {headers.map((h, i) => (
                <TableHead key={i}>
                  <Tri bm={h.bm} zh={h.zh} en={h.en} />
                </TableHead>
              ))}
              <TableHead>
                <Tri bm="Status" zh="状态" en="Status" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow
                key={i}
                className={row.warning ? "bg-amber-50 dark:bg-amber-400/10" : undefined}
              >
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                {row.cells.map((cell, j) => (
                  <TableCell key={j} className="align-top">
                    <EditableCell cell={cell} />
                  </TableCell>
                ))}
                <TableCell className="align-top">
                  <ConfidenceBadge level={row.status} />
                  {/* The reason a row is blocked is printed, not hidden behind
                      a hover card that touch devices cannot open. */}
                  {row.warning && (
                    <p className="mt-1 max-w-56 font-medium text-amber-900 dark:text-amber-200">
                      ⚠ {row.warning}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
