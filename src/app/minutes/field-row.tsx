"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Tri, useTriText } from "@/components/language-provider";
import { VoiceButton } from "@/components/voice-input";
import { formatDateLong, isIsoDate, toIsoDate } from "@/lib/date-input";
import { useMinutes, type TextLikeField } from "./minutes-store";

// ---------------------------------------------------------------------------
// One reviewable row: label + value + badge + where the AI read it + the three
// buttons (Correct / Edit / Not in the notes).
//
// Moved out of minutes-review.tsx on 2026-08-23 when /minutes became four
// pages. Three of them render these rows, and the date-picker fallback below is
// exactly the kind of hard-won detail that gets lost in a copy-paste.
// ---------------------------------------------------------------------------

/**
 * HOW A ROW IS EDITED.
 *
 * 🔴 2026-08-20. Every row used to share one plain text <input>. That box did
 * not know whether it was editing free text, an enum or a date — so "event
 * meeting" and "2/2/2026" were both accepted on screen and both refused by the
 * schema AND the database CHECK, and what the person was shown was "Something
 * went wrong on Minit's side". Nothing was saved; History looked empty.
 *
 * A shared component saves code and pays for it in the data contract. The fix
 * is not a longer validation message: it is a box that can only produce a legal
 * value in the first place.
 */
type FieldEditor =
  | { kind: "text" }
  | { kind: "date" }
  | { kind: "choice"; choices: readonly { value: string; label: string }[] };

/** Does this browser give a real date picker, or will type="date" fall back to
 *  a plain text box? Old Android WebViews do the latter, and on those the
 *  person types the date by hand — so we must be able to read what they type. */
export function useNativeDateInput(): boolean {
  return useMemo(() => {
    if (typeof document === "undefined") return true;
    const probe = document.createElement("input");
    probe.setAttribute("type", "date");
    probe.value = "bukan-tarikh";
    return probe.value === "";
  }, []);
}

/** One reviewable row: label + value + badge + source + confirm/edit. */
export function FieldRow({
  labelBm,
  labelZh,
  labelEn,
  field,
  display,
  editor = { kind: "text" },
  onConfirm,
  onEdit,
  onMarkAbsent,
}: {
  labelBm: string;
  labelZh: string;
  labelEn: string;
  field: TextLikeField;
  /** Optional pretty value (falls back to field.value). */
  display?: string;
  /** Defaults to a plain text box — the behaviour every other row has. */
  editor?: FieldEditor;
  onConfirm: () => void;
  onEdit: (value: string) => void;
  /** See EditableField.onMarkAbsent — the escape hatch for a fact that was
   *  never written down. Without it a `missing` field blocks saving forever and
   *  the only way out is for the human to invent a value. */
  onMarkAbsent?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  /** Set when Save was pressed on something this row cannot accept. Shown
   *  right under the box, in the person's own languages. */
  const [problem, setProblem] = useState<ReactNode>(null);
  const nativeDate = useNativeDateInput();
  const t = useTriText();
  // Whether this set of minutes came from a photo or was typed from nothing
  // changes what an EMPTY field means, and therefore what to say about it: "the
  // AI could not find this in your notes" is nonsense when there are no notes
  // and no AI ran. Read from the store rather than threaded through as a prop —
  // there are a dozen call sites and none of them care. (2026-08-23.)
  // Stage 0-1: the worked example is read-only — no Correct/Edit/absent
  // buttons at all, rather than buttons that do nothing.
  const { typedByHand, isSample, photoPages } = useMinutes();
  /**
   * D-3 (work order 31, J #8): which original page sits beside the editor.
   * Set when editing starts — from the field's own source_ref where it names
   * a page — and steppable, because "page 2, line 3" is sometimes wrong and
   * the person needs to look at page 1 to know that.
   */
  const [comparePage, setComparePage] = useState(0);

  const isMissing = field.confidence === "missing";

  /** What the row would store, or null when it cannot read the draft. */
  const commitValue = (): string | null => {
    if (editor.kind === "date") return toIsoDate(draft);
    if (editor.kind === "choice") return draft === "" ? null : draft;
    return draft.trim();
  };

  const startEditing = () => {
    setDraft(field.value);
    setProblem(null);
    // D-3: open the compare panel on the page the AI says it read from.
    const m = field.source_ref?.location.match(
      /(?:halaman|page)\s*(\d+)|第\s*(\d+)\s*页/i,
    );
    const n = m ? Number(m[1] ?? m[2]) : NaN;
    setComparePage(
      Number.isFinite(n) && n >= 1 && n <= photoPages.length ? n - 1 : 0,
    );
    setEditing(true);
  };

  return (
    <div className="flex flex-col gap-1.5 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-44 text-base font-semibold">
          <Tri bm={labelBm} zh={labelZh} en={labelEn} />
        </span>
        <ConfidenceBadge level={field.confidence} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            {editor.kind === "choice" ? (
              <select
                autoFocus
                value={draft}
                onChange={(ev) => {
                  setDraft(ev.target.value);
                  setProblem(null);
                }}
                className="h-12 w-full max-w-md rounded-sm border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label={labelEn}
              >
                <option value="">
                  {t("— Pilih satu —", "— 请选一个 —", "— Choose one —")}
                </option>
                {editor.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : editor.kind === "date" && nativeDate ? (
              <input
                autoFocus
                type="date"
                // A native picker can only ever hand back YYYY-MM-DD. An older
                // value that is not a real date starts the box empty rather
                // than being silently rewritten.
                value={isIsoDate(draft) ? draft : ""}
                onChange={(ev) => {
                  setDraft(ev.target.value);
                  setProblem(null);
                }}
                className="h-12 w-full max-w-md rounded-sm border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label={labelEn}
              />
            ) : (
              <>
                <input
                  autoFocus
                  value={draft}
                  inputMode={editor.kind === "date" ? "numeric" : undefined}
                  placeholder={
                    editor.kind === "date"
                      ? t(
                          "hari/bulan/tahun — 2/2/2026",
                          "日/月/年 —— 2/2/2026",
                          "day/month/year — 2/2/2026",
                        )
                      : undefined
                  }
                  onChange={(ev) => {
                    setDraft(ev.target.value);
                    setProblem(null);
                  }}
                  className="h-12 w-full max-w-md rounded-sm border border-input bg-white px-3 text-base dark:bg-transparent"
                  aria-label={labelEn}
                />
                {/* F-3: speak instead of type. Free-text rows only — an enum
                    or a date box cannot accept dictation. Renders nothing in
                    browsers without speech support. */}
                {editor.kind === "text" && (
                  <VoiceButton
                    onText={(spoken) => {
                      setDraft((prev) =>
                        prev.trim() === "" ? spoken : `${prev} ${spoken}`,
                      );
                      setProblem(null);
                    }}
                  />
                )}
              </>
            )}
            <Button
              onClick={() => {
                const value = commitValue();
                if (value === null) {
                  // Refuse HERE, saying which box and how — not three screens
                  // later as "something went wrong on Minit's side".
                  setProblem(
                    editor.kind === "date" ? (
                      <Tri
                        bm="Minit tidak faham tarikh itu. Tulis hari/bulan/tahun — contohnya 2/2/2026 untuk 2 Februari 2026."
                        zh="Minit 看不懂这个日期。请写「日/月/年」—— 例如 2/2/2026 就是 2026 年 2 月 2 日。"
                        en="Minit could not read that date. Write day/month/year — 2/2/2026 means 2 February 2026."
                      />
                    ) : (
                      <Tri
                        bm="Pilih satu daripada senarai dahulu."
                        zh="请先从清单里选一个。"
                        en="Choose one from the list first."
                      />
                    ),
                  );
                  return;
                }
                onEdit(value);
                setProblem(null);
                setEditing(false);
              }}
            >
              <Tri bm="Simpan" zh="保存" en="Save" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setProblem(null);
                setEditing(false);
              }}
            >
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
                typedByHand ? (
                  <Tri bm="— belum diisi —" zh="— 还没填 —" en="— not filled in yet —" />
                ) : (
                  <Tri
                    bm="— tiada dalam nota —"
                    zh="— 记录中没有 —"
                    en="— not in the notes —"
                  />
                )
              ) : (
                display ?? field.value
              )}
            </span>
            {!isSample && field.confidence === "check" && (
              <Button variant="outline" onClick={onConfirm}>
                ✓&nbsp;<Tri bm="Betul" zh="没错" en="Correct" />
              </Button>
            )}
            {!isSample && (
              <Button variant="outline" onClick={startEditing}>
                {isMissing ? (
                  editor.kind === "choice" ? (
                    <Tri bm="Pilih" zh="选一个" en="Choose" />
                  ) : (
                    <Tri bm="Isi sendiri" zh="自己填写" en="Fill in" />
                  )
                ) : (
                  <Tri bm="Ubah" zh="修改" en="Edit" />
                )}
              </Button>
            )}
            {!isSample && isMissing && onMarkAbsent && (
              <Button variant="outline" onClick={onMarkAbsent}>
                {typedByHand ? (
                  <Tri bm="Tiada / tidak berkenaan" zh="没有这一项" en="Leave this out" />
                ) : (
                  <Tri bm="Tiada dalam nota" zh="笔记里没写" en="Not in the notes" />
                )}
              </Button>
            )}
          </>
        )}
      </div>

      {/* D-3 (work order 31, J #8): the ORIGINAL page, beside the editor —
          inline above the keyboard on a phone, a floating card on the right on
          md+ (fixed, so it stays in view while the list scrolls). Only for
          photographed minutes: a typed sheet has no original to compare. */}
      {editing && !typedByHand && photoPages.length > 0 && photoPages[comparePage] && (
        <figure className="mt-1 flex flex-col gap-2 rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-3 md:fixed md:right-6 md:top-24 md:z-30 md:w-80 md:shadow-xl">
          <figcaption className="flex flex-wrap items-center gap-2 text-sm font-medium">
            🖼️{" "}
            <Tri bm="Gambar asal" zh="原照对照" en="The original page" />
            {photoPages.length > 1 && (
              <span className="ml-auto inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setComparePage((p) => (p + photoPages.length - 1) % photoPages.length)
                  }
                  className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm border border-[color:var(--v2-outline-border)] hover:bg-accent"
                  aria-label={t("Halaman sebelum", "上一页", "Previous page")}
                >
                  ‹
                </button>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {comparePage + 1}/{photoPages.length}
                </span>
                <button
                  type="button"
                  onClick={() => setComparePage((p) => (p + 1) % photoPages.length)}
                  className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm border border-[color:var(--v2-outline-border)] hover:bg-accent"
                  aria-label={t("Halaman seterusnya", "下一页", "Next page")}
                >
                  ›
                </button>
              </span>
            )}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPages[comparePage].dataUrl}
            alt={t(
              `Gambar asal halaman ${comparePage + 1}`,
              `第 ${comparePage + 1} 页原始照片`,
              `Original photo, page ${comparePage + 1}`,
            )}
            className="max-h-72 w-full rounded-sm bg-black/5 object-contain"
          />
          {field.source_ref && (
            <p className="text-xs text-muted-foreground">
              <Tri bm="AI baca di" zh="AI 读到的位置" en="The AI read this at" />{" "}
              {field.source_ref.location}
            </p>
          )}
        </figure>
      )}

      {/* What Minit understood, in words, BEFORE it is saved. 2/2/2026 and
          3/12/2026 are both day-first here (the Malaysian convention) and no
          parser can prove that is what was meant — so the month is spelled out
          where a wrong reading is still one tap from being fixed. */}
      {editing && editor.kind === "date" && toIsoDate(draft) && (
        <p className="text-base text-muted-foreground">
          →{" "}
          <span className="font-medium text-foreground">
            <Tri
              bm={formatDateLong(toIsoDate(draft) as string, "bm")}
              zh={formatDateLong(toIsoDate(draft) as string, "zh")}
              en={formatDateLong(toIsoDate(draft) as string, "en")}
            />
          </span>
        </p>
      )}

      {problem && (
        <p className="text-base font-medium text-red-700" role="alert">
          {problem}
        </p>
      )}

      {field.source_ref && (
        <p className="text-base text-muted-foreground">
          <Tri bm="AI baca di" zh="AI 读到的位置" en="The AI read this at" />{" "}
          {field.source_ref.location} ·{" "}
          <span className="font-mono">&ldquo;{field.source_ref.snippet}&rdquo;</span>
        </p>
      )}
      {isMissing && (
        <p className="text-base text-muted-foreground">
          {typedByHand ? (
            <Tri
              bm="Taip apa yang berlaku, atau tandakan tiada kalau memang tidak berkenaan."
              zh="把实际情况打进去；如果本来就没有这一项，就标示没有。"
              en="Type what happened, or mark it as not applicable if there genuinely was none."
            />
          ) : (
            <Tri
              bm="AI tidak jumpa ini dalam nota anda. Isi sendiri, atau tandakan tiada dalam nota."
              zh="AI 在您的笔记里找不到这一项。可以自己填写，或标示笔记里没写。"
              en="The AI could not find this in your notes. Fill it in yourself, or mark it as not written down."
            />
          )}
        </p>
      )}
    </div>
  );
}
