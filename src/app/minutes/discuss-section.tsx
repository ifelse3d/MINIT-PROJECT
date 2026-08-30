"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useLangs, useLocalizedError, useTriText } from "@/components/language-provider";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import type { DiscussSectionKind } from "@/prompts/discuss-minutes";
import { useMinutes, type TextLikeField } from "./minutes-store";

// ---------------------------------------------------------------------------
// 「每個 PART 跟 AI 討論」 (J review 27-evening #31; billing 改一次算一次 —
// ONE AI action per exchange, and the button says so before anything is
// spent).
//
// 🔄 2026-08-31 (work order 100 §0-2) — J overturned the 8/28 "the model only
// proposes; the person applies each row by hand" posture: because a person
// always reviews the finished document anyway, the agent now APPLIES its
// edits itself. Every applied edit shows old → new with an undo button, goes
// through the same updateField path a hand edit takes, and is marked `check`
// (amber) — so the review/confirm gates downstream still make a human look
// at every row the agent touched before the formal document is written. The
// gate moved from "before each row changes" to "before the document is
// final", which is where J said it belongs.
//
// Names/amounts stay off-limits in the prompt AND in which fields this
// component exposes (descriptions and positions, never numbers, never person
// names).
// ---------------------------------------------------------------------------

type Exchange = {
  instruction: string;
  reply: string;
  proposals: {
    index: number;
    text: string;
    /** What the row said before the agent's edit — the undo restores this. */
    previous: {
      value: string;
      confidence: TextLikeField["confidence"];
      source_ref: TextLikeField["source_ref"];
    } | null;
    undone: boolean;
  }[];
};

const SECTION_LABEL: Record<
  DiscussSectionKind,
  { bm: string; zh: string; en: string }
> = {
  meeting: { bm: "butiran mesyuarat", zh: "会议基本资料", en: "the meeting details" },
  resolutions: { bm: "keputusan mesyuarat", zh: "会议决定", en: "the decisions" },
  figures: { bm: "butiran wang", zh: "款项的说明", en: "the money descriptions" },
  bearers: { bm: "nama jawatan", zh: "职位名称", en: "the position titles" },
};

export function DiscussSection({ section }: { section: DiscussSectionKind }) {
  const t = useTriText();
  // mode may be "all" — the route falls back to zh for anything that is not
  // a single language, which is the right reply language for J's committee.
  const { mode } = useLangs();
  const localizeError = useLocalizedError();
  const { extraction, isReal, updateField } = useMinutes();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);

  // Sample/empty workspaces have nothing to discuss — and must not spend.
  if (!isReal) return null;

  /** The section's editable rows — see the header for what is left OUT. */
  function rowsOf(): { index: number; label: string; text: string }[] {
    switch (section) {
      case "meeting":
        return [
          {
            index: 0,
            label: t("Tempat", "地点", "Venue"),
            text: extraction.meeting_venue.value,
          },
        ];
      case "resolutions":
        return extraction.resolutions.map((r, i) => ({
          index: i,
          label: t("Perkara", "内容", "Item"),
          text: r.text.value,
        }));
      case "figures":
        return extraction.figures.map((f, i) => ({
          index: i,
          label: t("Butiran", "说明", "Description"),
          text: f.description.value,
        }));
      case "bearers":
        return extraction.office_bearers.map((b, i) => ({
          index: i,
          label: t("Jawatan", "职位", "Position"),
          text: b.position.value,
        }));
    }
  }

  function fieldAt(e: typeof extraction, index: number): TextLikeField | null {
    switch (section) {
      case "meeting":
        return index === 0 ? (e.meeting_venue as TextLikeField) : null;
      case "resolutions":
        return (e.resolutions[index]?.text as TextLikeField) ?? null;
      case "figures":
        return (e.figures[index]?.description as TextLikeField) ?? null;
      case "bearers":
        return (e.office_bearers[index]?.position as TextLikeField) ?? null;
    }
  }

  async function send() {
    const ask = instruction.trim();
    if (ask === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discuss-minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          instruction: ask,
          rows: rowsOf(),
          uiLang: mode,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { reply?: string; proposals?: { index: number; text: string }[]; error?: string }
        | null;
      if (!res.ok || !body?.reply) {
        setError(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
        return;
      }
      // §0-2 (2026-08-31): the agent applies its own edits, NOW — old → new
      // is shown per row with an undo. Marked `check`, never `confirmed`: a
      // human has not looked yet, and the document gates downstream insist
      // one does before anything formal is written.
      const applied = (body.proposals ?? []).map((p) => {
        const before = fieldAt(extraction, p.index);
        const previous = before
          ? {
              value: before.value,
              confidence: before.confidence,
              source_ref: before.source_ref,
            }
          : null;
        if (previous) {
          updateField((e) => {
            const f = fieldAt(e, p.index);
            if (!f) return e;
            f.source_ref = {
              location: t(
                "suntingan AI atas arahan anda",
                "AI 依您的指示改写",
                "AI edit on your instruction",
              ),
              snippet: previous.value || "—",
            };
            f.value = p.text;
            f.confidence = "check";
            return e;
          });
        }
        return { index: p.index, text: p.text, previous, undone: previous === null };
      });
      setExchange({ instruction: ask, reply: body.reply, proposals: applied });
      setInstruction("");
    } catch {
      setError(joinUserError(USER_ERRORS.aiUnavailable));
    } finally {
      setBusy(false);
    }
  }

  /** Put the row back exactly as it was before the agent's edit. */
  function undoProposal(i: number) {
    if (!exchange) return;
    const p = exchange.proposals[i];
    if (!p?.previous || p.undone) return;
    const previous = p.previous;
    updateField((e) => {
      const f = fieldAt(e, p.index);
      if (!f) return e;
      f.value = previous.value;
      f.confidence = previous.confidence;
      f.source_ref = previous.source_ref;
      return e;
    });
    setExchange({
      ...exchange,
      proposals: exchange.proposals.map((x, j) =>
        j === i ? { ...x, undone: true } : x,
      ),
    });
  }

  const label = SECTION_LABEL[section];

  return (
    <div className="mt-3 border-t pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-base text-muted-foreground underline underline-offset-4"
        >
          💬{" "}
          {t(
            `Bincang ${label.bm} dengan AI (1 tindakan AI setiap hantaran)`,
            `跟 AI 讨论${label.zh}（发一次用 1 次 AI 额度）`,
            `Discuss ${label.en} with the AI (1 AI action per message)`,
          )}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium">
            💬{" "}
            {t(
              `Bincang ${label.bm} dengan AI`,
              `跟 AI 讨论${label.zh}`,
              `Discuss ${label.en} with the AI`,
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="AI terus mengubah draf ikut arahan anda — setiap ubahan tunjuk lama → baru, tekan “Asal semula” kalau tak mahu. Nama orang dan jumlah wang tidak akan diubah, dan dokumen rasmi tetap menunggu pengesahan anda."
              zh="AI 会照您的指示直接改稿 —— 每条亮出旧 → 新，不要就按「还原」。人名和金额它一律不动；正式文件仍要等您确认。"
              en="The AI edits the draft on your instruction — every change shows old → new, tap “Undo” to put one back. Names and amounts are never touched, and the formal document still waits for your confirmation."
            />
          </p>
          {exchange && (
            <div className="flex flex-col gap-2 rounded-md border bg-[color:var(--v2-card)] p-3">
              <p className="text-sm text-muted-foreground">🧑 {exchange.instruction}</p>
              <p className="whitespace-pre-line text-base">🤖 {exchange.reply}</p>
              {exchange.proposals.map((p, i) => (
                <div key={i} className="rounded-sm border p-3">
                  <p className="text-sm text-muted-foreground">
                    {p.undone ? (
                      <Tri bm="↩ Dikembalikan" zh="↩ 已还原" en="↩ Undone" />
                    ) : (
                      <Tri bm="✏️ Sudah diubah" zh="✏️ 已改" en="✏️ Changed" />
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground line-through">
                    {p.previous?.value || "—"}
                  </p>
                  <p className={`text-base font-medium ${p.undone ? "opacity-50" : ""}`}>
                    {p.text}
                  </p>
                  {!p.undone && p.previous && (
                    <div className="mt-2">
                      <Button size="sm" variant="outline" onClick={() => undoProposal(i)}>
                        <Tri bm="Asal semula" zh="还原" en="Undo" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="rounded-md border-2 border-red-300 bg-red-50 p-2 text-sm font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
              {localizeError(error)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={instruction}
              maxLength={600}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={t(
                "cth: baris 2 terlalu panjang, pendekkan",
                "例如：第 2 条太长了，帮我精简",
                "e.g. line 2 is too long — tighten it",
              )}
              className="h-11 min-w-0 flex-1 rounded-sm border-2 border-input bg-white px-3 text-base dark:bg-transparent"
              aria-label={t("Soalan anda", "您想说什么", "Your message")}
            />
            <Button onClick={send} disabled={busy || instruction.trim() === ""}>
              {busy ? (
                <Tri bm="AI berfikir…" zh="AI 思考中…" en="AI is thinking…" />
              ) : (
                <Tri
                  bm="Hantar (1 tindakan AI)"
                  zh="发送（用 1 次 AI 额度）"
                  en="Send (1 AI action)"
                />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              <Tri bm="Tutup" zh="收起" en="Close" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
